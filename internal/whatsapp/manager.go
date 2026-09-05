package whatsapp

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"

	"crmProject/internal/db"

	_ "github.com/mattn/go-sqlite3"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waEvents "go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
)

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

func (m *Manager) GetClient(ctx context.Context, userID uint) (*whatsmeow.Client, error) {
	m.clientsMu.Lock()
	defer m.clientsMu.Unlock()

	if client, exists := m.clients[userID]; exists {
		return client, nil
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

			if text == "" {
				return
			}

			phone := v.Info.Sender.User
			if phone == "" {
				phone = v.Info.Sender.ToNonAD().User
			}

			senderName := v.Info.PushName
			if senderName == "" {
				senderName = "Лид (" + phone + ")"
			}

			log.Printf("[WA-INCOMING] Сообщение от %s (%s): %s", senderName, phone, text)

			var clientID int
			err := db.DB.QueryRow("SELECT id FROM clients WHERE phone = ?", phone).Scan(&clientID)
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
