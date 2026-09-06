package whatsapp

import (
	"context"
	"log"
	"net/http"

	"crmProject/internal/auth"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func GetStatus(c *gin.Context) {
	connected := WAManager != nil && WAManager.IsConnected()
	c.JSON(http.StatusOK, gin.H{"connected": connected})
}

func HandleQRWebSocket(c *gin.Context) {
	tokenStr := c.Query("token")
	if tokenStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Token required"})
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

	// Already live — nothing to do.
	if client.IsConnected() && client.IsLoggedIn() {
		_ = ws.WriteJSON(gin.H{"type": "status", "status": "connected"})
		return
	}

	// Try to get a QR channel. This fails when the client still holds a stale
	// device ID from a previous (now-expired) session.
	qrChan, err := client.GetQRChannel(ctx)
	if err != nil {
		log.Printf("[WA-QR] GetQRChannel failed (%v) — resetting stale session", err)
		// Wipe the old session so whatsmeow treats this as a fresh device.
		WAManager.ResetSession(userID)
		// Get a brand-new client (no stored credentials).
		client, err = WAManager.GetClient(ctx, userID)
		if err != nil {
			_ = ws.WriteJSON(gin.H{"type": "error", "message": "Failed to create WA client"})
			return
		}
		qrChan, err = client.GetQRChannel(ctx)
		if err != nil {
			_ = ws.WriteJSON(gin.H{"type": "error", "message": "QR unavailable: " + err.Error()})
			return
		}
	}

	if !client.IsConnected() {
		if err = client.Connect(); err != nil {
			_ = ws.WriteJSON(gin.H{"type": "error", "message": "Failed to connect: " + err.Error()})
			return
		}
	}

	for evt := range qrChan {
		switch evt.Event {
		case "code":
			_ = ws.WriteJSON(gin.H{"type": "qr", "code": evt.Code})
		case "success":
			_ = ws.WriteJSON(gin.H{"type": "status", "status": "connected"})
			return
		case "timeout":
			_ = ws.WriteJSON(gin.H{"type": "error", "message": "QR timed out — попробуйте снова"})
			return
		}
	}
}
