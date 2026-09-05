package crm

import (
	"database/sql"
	"net/http"

	"crmProject/internal/db"

	"github.com/gin-gonic/gin"
)

type Client struct {
	ID        int    `json:"id"`
	Phone     string `json:"phone"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	ManagerID *int   `json:"manager_id"`
	CreatedAt string `json:"created_at"`
}

type CreateClientInput struct {
	Phone string `json:"phone" binding:"required"`
	Name  string `json:"name" binding:"required"`
}

type UpdateStatusInput struct {
	Status string `json:"status" binding:"required"`
}

func GetClients(c *gin.Context) {
	rows, err := db.DB.Query("SELECT id, phone, name, status, manager_id, created_at FROM clients ORDER BY created_at DESC")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch clients"})
		return
	}
	defer rows.Close()

	clients := []Client{}
	for rows.Next() {
		var cli Client
		var managerID sql.NullInt32
		if err := rows.Scan(&cli.ID, &cli.Phone, &cli.Name, &cli.Status, &managerID, &cli.CreatedAt); err != nil {
			continue
		}
		if managerID.Valid {
			mID := int(managerID.Int32)
			cli.ManagerID = &mID
		}
		clients = append(clients, cli)
	}

	c.JSON(http.StatusOK, clients)
}

func CreateClient(c *gin.Context) {
	var input CreateClientInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userIDRaw, _ := c.Get("user_id")
	userID := int(userIDRaw.(uint))

	res, err := db.DB.Exec("INSERT INTO clients (phone, name, status, manager_id) VALUES (?, ?, 'new', ?)",
		input.Phone, input.Name, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create client"})
		return
	}

	id, _ := res.LastInsertId()
	c.JSON(http.StatusCreated, gin.H{"id": id, "phone": input.Phone, "name": input.Name, "status": "new", "manager_id": userID})
}

func UpdateClientStatus(c *gin.Context) {
	clientID := c.Param("id")
	var input UpdateStatusInput

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := db.DB.Exec("UPDATE clients SET status = ? WHERE id = ?", input.Status, clientID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Status updated successfully"})
}
