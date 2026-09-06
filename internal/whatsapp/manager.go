package whatsapp

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unicode"

	"crmProject/internal/db"

	_ "github.com/mattn/go-sqlite3"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store/sqlstore"
	watypes "go.mau.fi/whatsmeow/types"
	waEvents "go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
)

// normalizePhone strips everything that is not a digit.
// WhatsApp Sender.User is already digits-only; this handles manually-entered phones with +, spaces, dashes.
func normalizePhone(p string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsDigit(r) {
			return r
		}
		return -1
	}, p)
}

type Manager struct {
	container     *sqlstore.Container
	clients       map[uint]*whatsmeow.Client
	clientsMu     sync.RWMutex
	OnMessageRecv func(msg map[string]interface{})
}

var WAManager *Manager

func InitWAManager(ctx context.Context, dbPath string) (*Manager, error) {
	dbLog := waLog.Stdout("Database", "WARN", true)
	container, err := sqlstore.New(ctx, "sqlite3", "file:"+dbPath+"?_foreign_keys=on", dbLog)
	if err != nil {
		return nil, fmt.Errorf("failed to init sqlstore: %w", err)
	}

	mgr := &Manager{
		container: container,
		clients:   make(map[uint]*whatsmeow.Client),
	}
	WAManager = mgr
	return mgr, nil
}

// ResetSession disconnects the client and wipes its stored device credentials
// so that a fresh QR pairing can be started. Safe to call even if no session exists.
func (m *Manager) ResetSession(userID uint) {
	m.clientsMu.Lock()
	client := m.clients[userID]
	delete(m.clients, userID)
	// Also remove from any other userID alias pointing to the same client.
	for k, v := range m.clients {
		if v == client {
			delete(m.clients, k)
		}
	}
	m.clientsMu.Unlock()

	if client == nil {
		return
	}
	if client.IsConnected() {
		client.Disconnect()
	}
	if client.Store != nil {
		if err := client.Store.Delete(context.Background()); err != nil {
			log.Printf("[WA] ResetSession store.Delete: %v", err)
		}
	}
	log.Printf("[WA] Session reset for user %d", userID)
}

// IsConnected returns true when any WhatsApp session is live.
func (m *Manager) IsConnected() bool {
	m.clientsMu.RLock()
	defer m.clientsMu.RUnlock()
	for _, cl := range m.clients {
		if cl.IsConnected() && cl.IsLoggedIn() {
			return true
		}
	}
	return false
}

func (m *Manager) GetClient(ctx context.Context, userID uint) (*whatsmeow.Client, error) {
	m.clientsMu.Lock()
	defer m.clientsMu.Unlock()

	// Return the existing client for this user.
	if client, exists := m.clients[userID]; exists {
		return client, nil
	}

	// For a single-account CRM: reuse any already-connected client instead of
	// creating a second whatsmeow.Client for the same device store, which
	// would cause duplicate event handlers and double-store writes.
	for _, client := range m.clients {
		if client.IsConnected() {
			m.clients[userID] = client
			return client, nil
		}
	}

	deviceStore, err := m.container.GetFirstDevice(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get device: %w", err)
	}

	clientLog := waLog.Stdout("WA-User", "WARN", true)
	client := whatsmeow.NewClient(deviceStore, clientLog)
	client.EnableAutoReconnect = true
	client.AutoTrustIdentity = true

	m.setupEventHandler(client, userID)
	m.clients[userID] = client

	// If credentials are already stored (device has a JID), reconnect without QR.
	if deviceStore.ID != nil && !client.IsConnected() {
		if err := client.Connect(); err != nil {
			log.Printf("[WA] Auto-reconnect failed for user %d: %v", userID, err)
		} else {
			log.Printf("[WA] Session restored from store for user %d", userID)
		}
	}

	return client, nil
}

func (m *Manager) setupEventHandler(client *whatsmeow.Client, userID uint) {
	client.AddEventHandler(func(evt interface{}) {
		switch v := evt.(type) {
		case *waEvents.Message:
			if v.Info.IsGroup {
				return
			}

			var text string
			var fileURL string

			if v.Message != nil {
				if v.Message.GetConversation() != "" {
					text = v.Message.GetConversation()
				} else if v.Message.GetExtendedTextMessage() != nil {
					text = v.Message.GetExtendedTextMessage().GetText()
				}
			}

			if img := v.Message.GetImageMessage(); img != nil {
				data, err := client.Download(context.Background(), img)
				if err == nil {
					fileName := fmt.Sprintf("%d_%s.jpg", v.Info.Timestamp.Unix(), v.Info.ID)
					filePath := filepath.Join("uploads", fileName)
					if err := os.WriteFile(filePath, data, 0644); err == nil {
						fileURL = "http://localhost:8080/uploads/" + fileName
						caption := img.GetCaption()
						if caption != "" {
							text = fmt.Sprintf("📷 [Картинка: %s] %s", fileURL, caption)
						} else {
							text = "📷 Картинка: " + fileURL
						}
					}
				}
			}

			if audio := v.Message.GetAudioMessage(); audio != nil {
				data, err := client.Download(context.Background(), audio)
				if err == nil {
					fileName := fmt.Sprintf("%d_%s.ogg", v.Info.Timestamp.Unix(), v.Info.ID)
					filePath := filepath.Join("uploads", fileName)
					if err := os.WriteFile(filePath, data, 0644); err == nil {
						fileURL = "http://localhost:8080/uploads/" + fileName
						text = "🎤 Голосовое сообщение: " + fileURL
					}
				}
			}

			if doc := v.Message.GetDocumentMessage(); doc != nil {
				data, err := client.Download(context.Background(), doc)
				if err == nil {
					fileName := fmt.Sprintf("%d_%s", v.Info.Timestamp.Unix(), doc.GetFileName())
					filePath := filepath.Join("uploads", fileName)
					if err := os.WriteFile(filePath, data, 0644); err == nil {
						fileURL = "http://localhost:8080/uploads/" + fileName
						text = "📄 Документ: " + fileURL
					}
				}
			}

			if vid := v.Message.GetVideoMessage(); vid != nil {
				data, err := client.Download(context.Background(), vid)
				if err == nil {
					fileName := fmt.Sprintf("%d_%s.mp4", v.Info.Timestamp.Unix(), v.Info.ID)
					filePath := filepath.Join("uploads", fileName)
					if err := os.WriteFile(filePath, data, 0644); err == nil {
						fileURL = "http://localhost:8080/uploads/" + fileName
						caption := vid.GetCaption()
						if caption != "" {
							text = fmt.Sprintf("🎥 Видео: %s [%s]", fileURL, caption)
						} else {
							text = "🎥 Видео: " + fileURL
						}
					}
				}
			}

			if sticker := v.Message.GetStickerMessage(); sticker != nil {
				data, err := client.Download(context.Background(), sticker)
				if err == nil {
					fileName := fmt.Sprintf("%d_%s.webp", v.Info.Timestamp.Unix(), v.Info.ID)
					filePath := filepath.Join("uploads", fileName)
					if err := os.WriteFile(filePath, data, 0644); err == nil {
						fileURL = "http://localhost:8080/uploads/" + fileName
						text = "🖼️ Стикер: " + fileURL
					}
				}
			}

			if text == "" {
				return
			}

			// Resolve the sender's phone number.
			// For LID-addressed messages, WhatsApp provides the actual phone JID in SenderAlt.
			// If SenderAlt is absent, fall back to the local LID↔PN cache maintained by whatsmeow.
			// Only use the lid_ prefix when we truly cannot resolve the phone.
			senderIsLID := v.Info.Sender.Server == watypes.HiddenUserServer
			var phone string

			if senderIsLID {
				resolved := false
				// 1. SenderAlt — WhatsApp fills this from "sender_pn" in the message envelope.
				if !v.Info.SenderAlt.IsEmpty() && v.Info.SenderAlt.Server == watypes.DefaultUserServer {
					phone = normalizePhone(v.Info.SenderAlt.User)
					resolved = phone != ""
					if resolved {
						log.Printf("[WA-INCOMING] LID %s → phone %s (SenderAlt)", v.Info.Sender.User, phone)
					}
				}
				// 2. Local LID store (cached from previous exchanges).
				if !resolved {
					if pnJID, err2 := client.Store.LIDs.GetPNForLID(context.Background(), v.Info.Sender); err2 == nil && !pnJID.IsEmpty() {
						phone = normalizePhone(pnJID.User)
						resolved = phone != ""
						if resolved {
							log.Printf("[WA-INCOMING] LID %s → phone %s (LIDStore)", v.Info.Sender.User, phone)
						}
					}
				}
				// 3. Fallback — keep lid_ prefix so SendMessage still knows to use HiddenUserServer.
				if !resolved {
					phone = "lid_" + v.Info.Sender.User
					log.Printf("[WA-INCOMING] LID %s unresolved, keeping lid_ prefix", v.Info.Sender.User)
				}
			} else {
				phone = v.Info.Sender.User
				if phone == "" {
					phone = v.Info.Sender.ToNonAD().User
				}
				phone = normalizePhone(phone)
			}
			log.Printf("[WA-INCOMING] sender=%s → phone=%q", v.Info.Sender.String(), phone)

			senderName := v.Info.PushName
			if senderName == "" {
				senderName = "Лид (" + phone + ")"
			}

			// Look up the client, also checking the old lid_ key for migration.
			var clientID int
			var storedPhone string
			var lookupErr error

			if senderIsLID && !strings.HasPrefix(phone, "lid_") {
				// Resolved to a real phone — also check old lid_ entry to migrate it.
				lidKey := "lid_" + v.Info.Sender.User
				lookupErr = db.DB.QueryRow(
					"SELECT id, phone FROM clients WHERE phone = ? OR phone = ? OR phone = ?",
					phone, "+"+phone, lidKey,
				).Scan(&clientID, &storedPhone)
				// Migrate: update stored lid_ to real phone number.
				if lookupErr == nil && strings.HasPrefix(storedPhone, "lid_") {
					_, _ = db.DB.Exec("UPDATE clients SET phone = ? WHERE id = ?", phone, clientID)
					log.Printf("[WA-INCOMING] Migrated client %d: %s → %s", clientID, storedPhone, phone)
				}
			} else if strings.HasPrefix(phone, "lid_") {
				lookupErr = db.DB.QueryRow(
					"SELECT id, phone FROM clients WHERE phone = ?", phone,
				).Scan(&clientID, &storedPhone)
			} else {
				lookupErr = db.DB.QueryRow(
					"SELECT id, phone FROM clients WHERE phone = ? OR phone = ?",
					phone, "+"+phone,
				).Scan(&clientID, &storedPhone)
			}

			err := lookupErr
			if err != nil {
				res, err := db.DB.Exec("INSERT INTO clients (phone, name, status, manager_id) VALUES (?, ?, 'new', ?)",
					phone, senderName, userID)
				if err == nil {
					id, _ := res.LastInsertId()
					clientID = int(id)
				}
			}

			if clientID > 0 {
				res, err := db.DB.Exec("INSERT INTO messages (client_id, sender_phone, text, is_outgoing) VALUES (?, ?, ?, ?)",
					clientID, phone, text, v.Info.IsFromMe)
				if err == nil {
					msgID, _ := res.LastInsertId()

					if m.OnMessageRecv != nil {
						m.OnMessageRecv(map[string]interface{}{
							"type":        "new_message",
							"id":          msgID,
							"client_id":   clientID,
							"text":        text,
							"is_outgoing": v.Info.IsFromMe,
						})
					}
				}
			}
		}
	})
}

func (m *Manager) AutoConnectSessions(ctx context.Context) {
	devices, err := m.container.GetAllDevices(ctx)
	if err != nil {
		log.Printf("[WA-INIT] Ошибка получения устройств: %v", err)
		return
	}

	for _, device := range devices {
		clientLog := waLog.Stdout("WA-AutoConnect", "WARN", true)
		client := whatsmeow.NewClient(device, clientLog)
		client.EnableAutoReconnect = true
		client.AutoTrustIdentity = true

		m.setupEventHandler(client, 1)

		m.clientsMu.Lock()
		m.clients[1] = client
		m.clientsMu.Unlock()

		if !client.IsConnected() {
			err := client.Connect()
			if err != nil {
				log.Printf("[WA-INIT] Не удалось подключить устройство %s: %v", device.ID.String(), err)
			} else {
				log.Printf("[WA-INIT] Успешно восстановлена сессия WhatsApp для %s", device.ID.String())
			}
		}
	}
}
