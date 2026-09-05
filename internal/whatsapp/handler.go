package whatsapp

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func HandleQRWebSocket(c *gin.Context) {
	userIDRaw, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDRaw.(uint)

	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer ws.Close()

	ctx := context.Background()
	client, err := WAManager.GetClient(ctx, userID)
	if err != nil {
		ws.WriteJSON(gin.H{"type": "error", "message": "Failed to get WA client"})
		return
	}

	if client.IsConnected() && client.IsLoggedIn() {
		ws.WriteJSON(gin.H{"type": "status", "status": "connected"})
		return
	}

	qrChan, err := client.GetQRChannel(ctx)
	if err != nil {
		if client.IsConnected() {
			ws.WriteJSON(gin.H{"type": "status", "status": "connected"})
		} else {
			ws.WriteJSON(gin.H{"type": "error", "message": "Failed to get QR channel"})
		}
		return
	}

	err = client.Connect()
	if err != nil {
		ws.WriteJSON(gin.H{"type": "error", "message": "Failed to connect to WhatsApp"})
		return
	}

	for evt := range qrChan {
		if evt.Event == "code" {
			ws.WriteJSON(gin.H{"type": "qr", "code": evt.Code})
		} else if evt.Event == "success" {
			ws.WriteJSON(gin.H{"type": "status", "status": "connected"})
			break
		}
	}
}
