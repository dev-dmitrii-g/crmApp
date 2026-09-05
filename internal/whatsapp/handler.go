package whatsapp

import (
	"context"
	"crmProject/internal/auth"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func HandleQRWebSocket(c *gin.Context) {
	tokenStr := c.Query("token")
	if tokenStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Token query param required"})
		return
	}

	claims, err := auth.ValidateToken(tokenStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
		return
	}

	userID := claims.UserID

	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer ws.Close()

	ctx := context.Background()
	client, err := WAManager.GetClient(ctx, userID)
	if err != nil {
		_ = ws.WriteJSON(gin.H{"type": "error", "message": "Failed to get WA client"})
		return
	}

	if client.IsConnected() && client.IsLoggedIn() {
		_ = ws.WriteJSON(gin.H{"type": "status", "status": "connected"})
		return
	}

	qrChan, err := client.GetQRChannel(ctx)
	if err != nil {
		if client.IsConnected() {
			_ = ws.WriteJSON(gin.H{"type": "status", "status": "connected"})
		} else {
			_ = ws.WriteJSON(gin.H{"type": "error", "message": "Failed to get QR channel"})
		}
		return
	}

	err = client.Connect()
	if err != nil {
		_ = ws.WriteJSON(gin.H{"type": "error", "message": "Failed to connect to WhatsApp"})
		return
	}

	for evt := range qrChan {
		if evt.Event == "code" {
			_ = ws.WriteJSON(gin.H{"type": "qr", "code": evt.Code})
		} else if evt.Event == "success" {
			_ = ws.WriteJSON(gin.H{"type": "status", "status": "connected"})
			break
		}
	}
}
