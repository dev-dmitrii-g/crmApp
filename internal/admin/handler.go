package admin

import (
	"crmProject/internal/db"
	"encoding/json"
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
	rows, err := db.DB.Query(
		"SELECT id, name, email, role, is_active, created_at FROM users ORDER BY id ASC")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch managers"})
		return
	}
	defer rows.Close()

	managers := []gin.H{}
	for rows.Next() {
		var id int
		var name, email, role, createdAt string
		var isActive bool
		if err := rows.Scan(&id, &name, &email, &role, &isActive, &createdAt); err == nil {
			managers = append(managers, gin.H{
				"id":         id,
				"name":       name,
				"email":      email,
				"role":       role,
				"is_active":  isActive,
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
	hashed, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}
	res, err := db.DB.Exec(
		"INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'manager')",
		input.Name, input.Email, string(hashed),
	)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Пользователь с таким email уже существует"})
		return
	}
	id, _ := res.LastInsertId()
	adminID, _ := c.Get("user_id")
	db.LogAction(adminID.(uint), "CREATE_USER", "Создан пользователь: "+input.Email)
	c.JSON(http.StatusOK, gin.H{"id": id, "name": input.Name, "email": input.Email, "role": "manager", "is_active": true})
}

// SetRole changes a user's role and invalidates their existing tokens.
func SetRole(c *gin.Context) {
	id := c.Param("id")
	var input struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Verify role exists
	var exists int
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM roles WHERE code=?", input.Role).Scan(&exists)
	if exists == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Роль не найдена"})
		return
	}
	_, _ = db.DB.Exec(
		"UPDATE users SET role=?, token_version=token_version+1 WHERE id=?",
		input.Role, id)
	adminID, _ := c.Get("user_id")
	db.LogAction(adminID.(uint), "SET_ROLE", "Роль пользователя id="+id+" изменена на "+input.Role)
	c.JSON(http.StatusOK, gin.H{"message": "Роль обновлена"})
}

// ToggleActive activates or deactivates a user account.
func ToggleActive(c *gin.Context) {
	id := c.Param("id")
	var input struct {
		IsActive bool `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Cannot deactivate user id=1 (system admin)
	if id == "1" && !input.IsActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Нельзя заблокировать главного администратора"})
		return
	}
	v := 0
	if input.IsActive {
		v = 1
	}
	// Deactivating also invalidates tokens
	_, _ = db.DB.Exec(
		"UPDATE users SET is_active=?, token_version=token_version+1 WHERE id=?", v, id)
	adminID, _ := c.Get("user_id")
	action := "DEACTIVATE_USER"
	if input.IsActive {
		action = "ACTIVATE_USER"
	}
	db.LogAction(adminID.(uint), action, "Пользователь id="+id)
	c.JSON(http.StatusOK, gin.H{"message": "Статус обновлён"})
}

// RevokeTokens forces a user to re-login by incrementing token_version.
func RevokeTokens(c *gin.Context) {
	id := c.Param("id")
	_, _ = db.DB.Exec("UPDATE users SET token_version=token_version+1 WHERE id=?", id)
	adminID, _ := c.Get("user_id")
	db.LogAction(adminID.(uint), "REVOKE_TOKENS", "Сессии отозваны для пользователя id="+id)
	c.JSON(http.StatusOK, gin.H{"message": "Сессии отозваны"})
}

// ── Roles ─────────────────────────────────────────────────────────────────────

type Role struct {
	Code        string                 `json:"code"`
	Name        string                 `json:"name"`
	Permissions map[string]interface{} `json:"permissions"`
}

func GetRoles(c *gin.Context) {
	rows, err := db.DB.Query("SELECT code, name, permissions FROM roles")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	defer rows.Close()
	out := []Role{}
	for rows.Next() {
		var r Role
		var permStr string
		if err := rows.Scan(&r.Code, &r.Name, &permStr); err != nil {
			continue
		}
		_ = json.Unmarshal([]byte(permStr), &r.Permissions)
		out = append(out, r)
	}
	c.JSON(http.StatusOK, out)
}

func UpdateRolePermissions(c *gin.Context) {
	code := c.Param("code")
	var input struct {
		Permissions map[string]interface{} `json:"permissions" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Protect admin role from losing settings permission
	if code == "admin" {
		input.Permissions["settings"] = 1
		input.Permissions["view_all"] = 1
	}
	permBytes, _ := json.Marshal(input.Permissions)
	_, err := db.DB.Exec("UPDATE roles SET permissions=? WHERE code=?", string(permBytes), code)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update"})
		return
	}
	// Invalidate all tokens for users with this role (they need to re-login to get new perms)
	_, _ = db.DB.Exec("UPDATE users SET token_version=token_version+1 WHERE role=?", code)
	adminID, _ := c.Get("user_id")
	db.LogAction(adminID.(uint), "UPDATE_ROLE_PERMS", "Обновлены права роли: "+code)
	c.JSON(http.StatusOK, gin.H{"message": "Права обновлены"})
}

// ── Analytics ─────────────────────────────────────────────────────────────────

func GetAnalytics(c *gin.Context) {
	var totalClients, newClients, inProgressClients, doneClients int
	var totalMessages, outgoingMessages int

	_ = db.DB.QueryRow("SELECT COUNT(*) FROM clients").Scan(&totalClients)
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM clients WHERE status='new'").Scan(&newClients)
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM clients WHERE status='in_progress'").Scan(&inProgressClients)
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM clients WHERE status='done'").Scan(&doneClients)
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM messages").Scan(&totalMessages)
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM messages WHERE is_outgoing=TRUE").Scan(&outgoingMessages)

	logs := make([]gin.H, 0)
	rows, err := db.DB.Query(`
		SELECT a.id, COALESCE(u.name,'Система'), a.action, a.details,
		       COALESCE(a.old_value,''), COALESCE(a.new_value,''), a.timestamp
		FROM audit_logs a
		LEFT JOIN users u ON a.user_id = u.id
		ORDER BY a.timestamp DESC LIMIT 50`)
	if err == nil && rows != nil {
		defer rows.Close()
		for rows.Next() {
			var id int
			var userName, action, details, old, new_, ts string
			if rows.Scan(&id, &userName, &action, &details, &old, &new_, &ts) == nil {
				logs = append(logs, gin.H{
					"id":        id,
					"user_name": userName,
					"action":    action,
					"details":   details,
					"old_value": old,
					"new_value": new_,
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
