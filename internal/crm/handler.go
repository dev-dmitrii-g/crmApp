package crm

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"unicode"

	"crmProject/internal/db"

	"github.com/gin-gonic/gin"
)

func normalizePhone(p string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsDigit(r) {
			return r
		}
		return -1
	}, p)
}

type Client struct {
	ID           int               `json:"id"`
	Phone        string            `json:"phone"`
	Name         string            `json:"name"`
	Status       string            `json:"status"`
	LossReason   string            `json:"loss_reason"`
	CustomFields map[string]string `json:"custom_fields"`
	ManagerID    *int              `json:"manager_id"`
	CreatedAt    string            `json:"created_at"`
}

type CreateClientInput struct {
	Phone string `json:"phone" binding:"required"`
	Name  string `json:"name" binding:"required"`
}

type UpdateStatusInput struct {
	Status       string            `json:"status" binding:"required"`
	LossReason   string            `json:"loss_reason"`
	CustomFields map[string]string `json:"custom_fields"`
}

type LossReasonInput struct {
	Name string `json:"name" binding:"required"`
}

func GetClients(c *gin.Context) {
	rows, err := db.DB.Query(`
		SELECT id, phone, name, status, COALESCE(loss_reason,''), COALESCE(custom_fields,'{}'), manager_id, created_at
		FROM clients ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch clients"})
		return
	}
	defer rows.Close()

	clients := []Client{}
	for rows.Next() {
		var cli Client
		var customFieldsJSON string
		var managerID sql.NullInt32
		if err := rows.Scan(&cli.ID, &cli.Phone, &cli.Name, &cli.Status, &cli.LossReason, &customFieldsJSON, &managerID, &cli.CreatedAt); err != nil {
			continue
		}
		if managerID.Valid {
			mID := int(managerID.Int32)
			cli.ManagerID = &mID
		}
		cli.CustomFields = make(map[string]string)
		_ = json.Unmarshal([]byte(customFieldsJSON), &cli.CustomFields)
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

	phone := normalizePhone(input.Phone)
	res, err := db.DB.Exec("INSERT INTO clients (phone, name, status, manager_id) VALUES (?, ?, 'new', ?)",
		phone, input.Name, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create client"})
		return
	}

	id, _ := res.LastInsertId()
	c.JSON(http.StatusCreated, gin.H{"id": id, "phone": phone, "name": input.Name, "status": "new", "manager_id": userID})
}

func UpdateClientStatus(c *gin.Context) {
	clientID := c.Param("id")
	var input UpdateStatusInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var currentStatus string
	_ = db.DB.QueryRow("SELECT status FROM clients WHERE id = ?", clientID).Scan(&currentStatus)

	// Check if transition is blocked
	var blockedCount int
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM stage_transition_rules WHERE from_stage_code = ? AND to_stage_code = ?",
		currentStatus, input.Status).Scan(&blockedCount)
	if blockedCount > 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "Этот переход заблокирован правилами воронки"})
		return
	}

	// Check WIP limit
	var wipLimit int
	_ = db.DB.QueryRow("SELECT wip_limit FROM pipeline_stages WHERE code = ?", input.Status).Scan(&wipLimit)
	if wipLimit > 0 {
		var currentCount int
		_ = db.DB.QueryRow("SELECT COUNT(*) FROM clients WHERE status = ? AND id != ?", input.Status, clientID).Scan(&currentCount)
		if currentCount >= wipLimit {
			c.JSON(http.StatusConflict, gin.H{
				"error": fmt.Sprintf("WIP-лимит превышен: в этапе уже %d карточек (максимум: %d)", currentCount, wipLimit),
			})
			return
		}
	}

	// Load and merge custom_fields
	var customFieldsJSON string
	_ = db.DB.QueryRow("SELECT COALESCE(custom_fields, '{}') FROM clients WHERE id = ?", clientID).Scan(&customFieldsJSON)
	existingFields := make(map[string]string)
	_ = json.Unmarshal([]byte(customFieldsJSON), &existingFields)
	for k, v := range input.CustomFields {
		existingFields[k] = v
	}

	// Collect required fields from both systems
	type ReqField struct {
		Name  string `json:"field_name"`
		Label string `json:"field_label"`
	}
	var missing []ReqField

	if rows, err1 := db.DB.Query("SELECT field_name, field_label FROM stage_required_fields WHERE stage_code = ?", input.Status); err1 == nil {
		defer rows.Close()
		for rows.Next() {
			var fn, fl string
			if rows.Scan(&fn, &fl) == nil && strings.TrimSpace(existingFields[fn]) == "" {
				missing = append(missing, ReqField{Name: fn, Label: fl})
			}
		}
	}

	if fvRows, err2 := db.DB.Query(`
		SELECT fv.field_key, fd.name
		FROM field_stage_visibility fv
		JOIN field_definitions fd ON fv.field_key = fd.key
		WHERE fv.stage_code = ? AND fv.mode = 'required'`, input.Status); err2 == nil {
		defer fvRows.Close()
		for fvRows.Next() {
			var fk, fn string
			if fvRows.Scan(&fk, &fn) == nil && strings.TrimSpace(existingFields[fk]) == "" {
				dup := false
				for _, m := range missing {
					if m.Name == fk {
						dup = true
						break
					}
				}
				if !dup {
					missing = append(missing, ReqField{Name: fk, Label: fn})
				}
			}
		}
	}

	if len(missing) > 0 {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":           "Необходимо заполнить обязательные поля",
			"required_fields": missing,
		})
		return
	}

	if len(input.CustomFields) > 0 {
		merged, _ := json.Marshal(existingFields)
		_, _ = db.DB.Exec("UPDATE clients SET custom_fields = ? WHERE id = ?", string(merged), clientID)
	}

	_, err := db.DB.Exec("UPDATE clients SET status = ?, loss_reason = ? WHERE id = ?",
		input.Status, input.LossReason, clientID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update status"})
		return
	}

	userIDRaw, _ := c.Get("user_id")
	details := "Смена статуса на " + input.Status
	if input.LossReason != "" {
		details += " (Причина: " + input.LossReason + ")"
	}
	db.LogAction(userIDRaw.(uint), "UPDATE_CLIENT_STATUS", details)

	c.JSON(http.StatusOK, gin.H{"message": "Status updated"})
}

func UpdateClientFields(c *gin.Context) {
	clientID := c.Param("id")
	var input struct {
		CustomFields map[string]string `json:"custom_fields" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var customFieldsJSON string
	_ = db.DB.QueryRow("SELECT COALESCE(custom_fields, '{}') FROM clients WHERE id = ?", clientID).Scan(&customFieldsJSON)
	existing := make(map[string]string)
	_ = json.Unmarshal([]byte(customFieldsJSON), &existing)
	for k, v := range input.CustomFields {
		existing[k] = v
	}

	merged, _ := json.Marshal(existing)
	_, err := db.DB.Exec("UPDATE clients SET custom_fields = ? WHERE id = ?", string(merged), clientID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update fields"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"custom_fields": existing})
}

func UploadClientFile(c *gin.Context) {
	clientID := c.Param("id")
	fieldKey := c.PostForm("field_key")
	if fieldKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "field_key is required"})
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}

	ext := filepath.Ext(file.Filename)
	filename := fmt.Sprintf("client_%s_%s%s", clientID, fieldKey, ext)
	if err := c.SaveUploadedFile(file, "./uploads/"+filename); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	url := "http://localhost:8080/uploads/" + filename

	var customFieldsJSON string
	_ = db.DB.QueryRow("SELECT COALESCE(custom_fields, '{}') FROM clients WHERE id = ?", clientID).Scan(&customFieldsJSON)
	existing := make(map[string]string)
	_ = json.Unmarshal([]byte(customFieldsJSON), &existing)
	existing[fieldKey] = url
	merged, _ := json.Marshal(existing)
	_, _ = db.DB.Exec("UPDATE clients SET custom_fields = ? WHERE id = ?", string(merged), clientID)

	c.JSON(http.StatusOK, gin.H{"url": url})
}

func GetLossReasons(c *gin.Context) {
	rows, err := db.DB.Query("SELECT id, name FROM loss_reasons ORDER BY id ASC")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch loss reasons"})
		return
	}
	defer rows.Close()

	reasons := make([]gin.H, 0)
	for rows.Next() {
		var id int
		var name string
		if err := rows.Scan(&id, &name); err == nil {
			reasons = append(reasons, gin.H{"id": id, "name": name})
		}
	}

	c.JSON(http.StatusOK, reasons)
}

func CreateLossReason(c *gin.Context) {
	var input LossReasonInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := db.DB.Exec("INSERT INTO loss_reasons (name) VALUES (?)", input.Name)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Reason already exists"})
		return
	}

	id, _ := res.LastInsertId()
	c.JSON(http.StatusOK, gin.H{"id": id, "name": input.Name})
}

func DeleteLossReason(c *gin.Context) {
	id := c.Param("id")
	_, err := db.DB.Exec("DELETE FROM loss_reasons WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete reason"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Reason deleted"})
}
