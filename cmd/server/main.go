package main

import (
	"context"
	"crmProject/internal/admin"
	"crmProject/internal/chat"
	"crmProject/internal/crm"
	"crmProject/internal/pipeline"
	"crmProject/internal/whatsapp"
	"log"
	"net/http"

	"crmProject/internal/auth"
	"crmProject/internal/db"

	"github.com/gin-gonic/gin"
)

func main() {
	database, err := db.InitDB("./crm.db")
	if err != nil {
		log.Fatalf("Database initialization error: %v", err)
	}
	defer database.Close()

	waMgr, err := whatsapp.InitWAManager(context.Background(), "./crm.db")
	if err != nil {
		log.Fatalf("WhatsApp Manager init error: %v", err)
	}

	waMgr.OnMessageRecv = chat.BroadcastMessage
	waMgr.AutoConnectSessions(context.Background())

	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, PATCH, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}

		c.Next()
	})

	r.POST("/api/auth/register", auth.Register)
	r.POST("/api/auth/login", auth.Login)
	r.GET("/api/ws/whatsapp/qr", whatsapp.HandleQRWebSocket)
	r.GET("/api/ws/chat", chat.HandleChatWS)

	api := r.Group("/api")
	api.Use(auth.AuthMiddleware())
	{
		api.GET("/auth/me", func(c *gin.Context) {
			userID, _ := c.Get("user_id")
			email, _ := c.Get("email")
			c.JSON(http.StatusOK, gin.H{"user_id": userID, "email": email})
		})

		api.GET("/clients", crm.GetClients)
		api.POST("/clients", crm.CreateClient)
		api.PATCH("/clients/:id/status", crm.UpdateClientStatus)

		api.GET("/messages", chat.GetMessages)
		api.POST("/messages/send", chat.SendMessage)

		api.GET("/pipeline/stages", auth.JWTAuthMiddleware(), pipeline.GetStages)
		api.GET("/pipeline/transition-rules", auth.JWTAuthMiddleware(), pipeline.GetTransitionRules)
		api.GET("/pipeline/stage-fields", auth.JWTAuthMiddleware(), pipeline.GetStageRequiredFields)

		api.GET("/crm/loss-reasons", crm.GetLossReasons)

		adminGroup := api.Group("/admin")
		adminGroup.Use(auth.JWTAuthMiddleware(), auth.AdminOnly())
		{
			adminGroup.GET("/managers", admin.GetManagers)
			adminGroup.POST("/managers", admin.CreateManager)
			adminGroup.GET("/analytics", admin.GetAnalytics)

			adminGroup.POST("/pipeline/stages", pipeline.CreateStage)
			adminGroup.PATCH("/pipeline/stages/:id", pipeline.UpdateStage)
			adminGroup.PUT("/pipeline/stages/reorder", pipeline.ReorderStages)
			adminGroup.DELETE("/pipeline/stages/:id", pipeline.DeleteStage)

			adminGroup.POST("/pipeline/transition-rules", pipeline.CreateTransitionRule)
			adminGroup.DELETE("/pipeline/transition-rules/:id", pipeline.DeleteTransitionRule)

			adminGroup.POST("/pipeline/stage-fields", pipeline.CreateStageRequiredField)
			adminGroup.DELETE("/pipeline/stage-fields/:id", pipeline.DeleteStageRequiredField)

			adminGroup.POST("/crm/loss-reasons", crm.CreateLossReason)
			adminGroup.DELETE("/crm/loss-reasons/:id", crm.DeleteLossReason)
		}
	}

	r.Static("/uploads", "./uploads")

	log.Println("Server running on http://localhost:8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
