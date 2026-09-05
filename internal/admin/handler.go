package admin

import (
	"crmProject/internal/db"
	"net/http"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type CreateManagerInput struct {
	Name     string `json:"name" binding:"required"`
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func GetManagers(c *gin.Context) {
	rows, err := db.DB.Query("SELECT id, name, email, role, created_at FROM users ORDER BY id ASC")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch managers"})
		return
	}
	defer rows.Close()

	var managers []gin.H
	for rows.Next() {
		var id int
		var name, email, role, createdAt string
		if err := rows.Scan(&id, &name, &email, &role, &createdAt); err == nil {
			managers = append(managers, gin.H{
				"id":         id,
				"name":       name,
				"email":      email,
				"role":       role,
				"created_at": createdAt,
			})
		}
	}

	c.JSON(http.StatusOK, managers)
}

func CreateManager(c *gin.Context) {
	var input CreateManagerInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	res, err := db.DB.Exec("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'manager')",
		input.Name, input.Email, string(hashedPassword))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User with this email already exists"})
		return
	}

	id, _ := res.LastInsertId()

	adminIDRaw, _ := c.Get("user_id")
	db.LogAction(adminIDRaw.(uint), "CREATE_MANAGER", "Создан менеджер: "+input.Email)

	c.JSON(http.StatusOK, gin.H{"id": id, "name": input.Name, "email": input.Email, "role": "manager"})
}

func GetAnalytics(c *gin.Context) {
	var totalClients, newClients, inProgressClients, doneClients int
	var totalMessages, outgoingMessages int

	_ = db.DB.QueryRow("SELECT COUNT(*) FROM clients").Scan(&totalClients)
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM clients WHERE status = 'new'").Scan(&newClients)
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM clients WHERE status = 'in_progress'").Scan(&inProgressClients)
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM clients WHERE status = 'done'").Scan(&doneClients)

	_ = db.DB.QueryRow("SELECT COUNT(*) FROM messages").Scan(&totalMessages)
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM messages WHERE is_outgoing = TRUE").Scan(&outgoingMessages)

	// Инициализируем пустой слайс (не nil), чтобы в JSON гарантированно уходил []
	logs := make([]gin.H, 0)

	rows, err := db.DB.Query(`
		SELECT a.id, COALESCE(u.name, 'Система'), a.action, a.details, a.timestamp 
		FROM audit_logs a 
		LEFT JOIN users u ON a.user_id = u.id 
		ORDER BY a.timestamp DESC LIMIT 15`)

	if err == nil && rows != nil {
		defer rows.Close()
		for rows.Next() {
			var id int
			var userName, action, details, ts string
			if err := rows.Scan(&id, &userName, &action, &details, &ts); err == nil {
				logs = append(logs, gin.H{
					"id":        id,
					"user_name": userName,
					"action":    action,
					"details":   details,
					"timestamp": ts,
				})
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"metrics": gin.H{
			"total_clients":       totalClients,
			"new_clients":         newClients,
			"in_progress_clients": inProgressClients,
			"done_clients":        doneClients,
			"total_messages":      totalMessages,
			"outgoing_messages":   outgoingMessages,
			"incoming_messages":   totalMessages - outgoingMessages,
		},
		"recent_activity": logs,
	})
}
