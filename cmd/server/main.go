package main

import (
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

	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	api := r.Group("/api")
	{
		api.POST("/auth/register", auth.Register)
		api.POST("/auth/login", auth.Login)
	}

	protected := api.Group("/")
	protected.Use(auth.AuthMiddleware())
	{
		protected.GET("/auth/me", func(c *gin.Context) {
			userID, _ := c.Get("user_id")
			email, _ := c.Get("email")
			c.JSON(http.StatusOK, gin.H{"user_id": userID, "email": email})
		})
	}

	log.Println("Server starts on http://localhost:8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
