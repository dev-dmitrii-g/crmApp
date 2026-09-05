package fields

import (
	"crmProject/internal/db"
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
)

type CreateFieldInput struct {
	Name      string   `json:"name" binding:"required"`
	Key       string   `json:"key" binding:"required"`
	Type      string   `json:"type" binding:"required"`
	Options   []string `json:"options"`
	Formula   string   `json:"formula"`
	SortOrder int      `json:"sort_order"`
}

type UpdateFieldInput struct {
	Name      string   `json:"name"`
	Options   []string `json:"options"`
	Formula   string   `json:"formula"`
	SortOrder *int     `json:"sort_order"`
}

type SetVisibilityInput struct {
	FieldKey  string `json:"field_key" binding:"required"`
	StageCode string `json:"stage_code" binding:"required"`
	Mode      string `json:"mode" binding:"required"`
}

func GetFieldDefinitions(c *gin.Context) {
	rows, err := db.DB.Query(`
		SELECT id, name, key, type, COALESCE(options,'[]'), COALESCE(formula,''), sort_order
		FROM field_definitions ORDER BY sort_order ASC, id ASC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch field definitions"})
		return
	}
	defer rows.Close()

	defs := make([]gin.H, 0)
	for rows.Next() {
		var id, sortOrder int
		var name, key, fieldType, optionsJSON, formula string
		if rows.Scan(&id, &name, &key, &fieldType, &optionsJSON, &formula, &sortOrder) == nil {
			var options []string
			_ = json.Unmarshal([]byte(optionsJSON), &options)
			if options == nil {
				options = []string{}
			}
			defs = append(defs, gin.H{
				"id":         id,
				"name":       name,
				"key":        key,
				"type":       fieldType,
				"options":    options,
				"formula":    formula,
				"sort_order": sortOrder,
			})
		}
	}
	c.JSON(http.StatusOK, defs)
}

func CreateFieldDefinition(c *gin.Context) {
	var input CreateFieldInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	validTypes := map[string]bool{"text": true, "number": true, "list": true, "date": true, "file": true, "formula": true}
	if !validTypes[input.Type] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid field type"})
		return
	}

	optionsJSON, _ := json.Marshal(input.Options)

	res, err := db.DB.Exec(`INSERT INTO field_definitions (name, key, type, options, formula, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
		input.Name, input.Key, input.Type, string(optionsJSON), input.Formula, input.SortOrder)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Field with this key already exists"})
		return
	}

	id, _ := res.LastInsertId()
	userIDRaw, _ := c.Get("user_id")
	db.LogAction(userIDRaw.(uint), "CREATE_FIELD", "Создано поле: "+input.Name+" ("+input.Key+")")

	c.JSON(http.StatusOK, gin.H{"id": id, "name": input.Name, "key": input.Key, "type": input.Type})
}

func UpdateFieldDefinition(c *gin.Context) {
	id := c.Param("id")
	var input UpdateFieldInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var name, optionsJSON, formula string
	var sortOrder int
	err := db.DB.QueryRow(`SELECT name, COALESCE(options,'[]'), COALESCE(formula,''), sort_order FROM field_definitions WHERE id = ?`, id).
		Scan(&name, &optionsJSON, &formula, &sortOrder)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Field not found"})
		return
	}

	if input.Name != "" {
		name = input.Name
	}
	if input.Formula != "" {
		formula = input.Formula
	}
	if input.SortOrder != nil {
		sortOrder = *input.SortOrder
	}
	if input.Options != nil {
		b, _ := json.Marshal(input.Options)
		optionsJSON = string(b)
	}

	_, err = db.DB.Exec(`UPDATE field_definitions SET name=?, options=?, formula=?, sort_order=? WHERE id=?`,
		name, optionsJSON, formula, sortOrder, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update field"})
		return
	}

	userIDRaw, _ := c.Get("user_id")
	db.LogAction(userIDRaw.(uint), "UPDATE_FIELD", "Обновлено поле ID: "+id)
	c.JSON(http.StatusOK, gin.H{"message": "Field updated"})
}

func DeleteFieldDefinition(c *gin.Context) {
	id := c.Param("id")
	_, err := db.DB.Exec("DELETE FROM field_definitions WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete field"})
		return
	}
	userIDRaw, _ := c.Get("user_id")
	db.LogAction(userIDRaw.(uint), "DELETE_FIELD", "Удалено поле ID: "+id)
	c.JSON(http.StatusOK, gin.H{"message": "Field deleted"})
}

func GetFieldVisibility(c *gin.Context) {
	rows, err := db.DB.Query("SELECT id, field_key, stage_code, mode FROM field_stage_visibility ORDER BY id ASC")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch visibility"})
		return
	}
	defer rows.Close()

	vis := make([]gin.H, 0)
	for rows.Next() {
		var id int
		var fieldKey, stageCode, mode string
		if rows.Scan(&id, &fieldKey, &stageCode, &mode) == nil {
			vis = append(vis, gin.H{"id": id, "field_key": fieldKey, "stage_code": stageCode, "mode": mode})
		}
	}
	c.JSON(http.StatusOK, vis)
}

func SetFieldVisibility(c *gin.Context) {
	var input SetVisibilityInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if input.Mode == "normal" {
		_, _ = db.DB.Exec("DELETE FROM field_stage_visibility WHERE field_key = ? AND stage_code = ?",
			input.FieldKey, input.StageCode)
	} else {
		_, _ = db.DB.Exec(`INSERT OR REPLACE INTO field_stage_visibility (field_key, stage_code, mode) VALUES (?, ?, ?)`,
			input.FieldKey, input.StageCode, input.Mode)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Visibility updated"})
}
