package chat

import (
	"context"
	"net/http"
	"sync"

	"crmProject/internal/db"
	"crmProject/internal/whatsapp"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
)

type SendMessageInput struct {
	ClientID int    `json:"client_id" binding:"required"`
	Text     string `json:"text" binding:"required"`
}

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	clientsWS   = make(map[*websocket.Conn]bool)
	clientsWSMu sync.Mutex
)

func HandleChatWS(c *gin.Context) {
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer func() {
		clientsWSMu.Lock()
		delete(clientsWS, ws)
		clientsWSMu.Unlock()
		ws.Close()
	}()

	clientsWSMu.Lock()
	clientsWS[ws] = true
	clientsWSMu.Unlock()

	for {
		_, _, err := ws.ReadMessage()
		if err != nil {
			break
		}
	}
}

func BroadcastMessage(msg map[string]interface{}) {
	clientsWSMu.Lock()
	defer clientsWSMu.Unlock()
	for conn := range clientsWS {
		_ = conn.WriteJSON(msg)
	}
}

func GetMessages(c *gin.Context) {
	clientID := c.Query("client_id")
	if clientID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "client_id is required"})
		return
	}

	rows, err := db.DB.Query("SELECT id, client_id, sender_phone, text, is_outgoing, timestamp FROM messages WHERE client_id = ? ORDER BY timestamp ASC", clientID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch messages"})
		return
	}
	defer rows.Close()

	var msgs []gin.H
	for rows.Next() {
		var id, cID int
		var sender, text, ts string
		var isOutgoing bool
		if err := rows.Scan(&id, &cID, &sender, &text, &isOutgoing, &ts); err == nil {
			msgs = append(msgs, gin.H{
				"id":          id,
				"client_id":   cID,
				"sender":      sender,
				"text":        text,
				"is_outgoing": isOutgoing,
				"timestamp":   ts,
			})
		}
	}

	c.JSON(http.StatusOK, msgs)
}

func SendMessage(c *gin.Context) {
	userIDRaw, _ := c.Get("user_id")
	userID := userIDRaw.(uint)

	var input SendMessageInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var phone string
	err := db.DB.QueryRow("SELECT phone FROM clients WHERE id = ?", input.ClientID).Scan(&phone)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Client not found"})
		return
	}

	ctx := context.Background()
	client, err := whatsapp.WAManager.GetClient(ctx, userID)
	if err != nil || !client.IsConnected() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "WhatsApp is not connected for this user"})
		return
	}

	jid := types.NewJID(phone, types.DefaultUserServer)

	waMsg := &waE2E.Message{
		Conversation: proto.String(input.Text),
	}

	_, err = client.SendMessage(ctx, jid, waMsg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send WA message: " + err.Error()})
		return
	}

	res, _ := db.DB.Exec("INSERT INTO messages (client_id, sender_phone, text, is_outgoing) VALUES (?, 'me', ?, TRUE)",
		input.ClientID, input.Text)
	msgID, _ := res.LastInsertId()

	msgPayload := gin.H{
		"id":          msgID,
		"client_id":   input.ClientID,
		"text":        input.Text,
		"is_outgoing": true,
	}

	BroadcastMessage(msgPayload)

	c.JSON(http.StatusOK, msgPayload)
}
