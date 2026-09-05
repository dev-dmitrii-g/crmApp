package pipeline

import (
	"crmProject/internal/db"
	"net/http"

	"github.com/gin-gonic/gin"
)

type StageInput struct {
	Name      string `json:"name" binding:"required"`
	Code      string `json:"code" binding:"required"`
	Color     string `json:"color"`
	SortOrder int    `json:"sort_order"`
	WipLimit  int    `json:"wip_limit"`
}

type UpdateStageInput struct {
	Name      string `json:"name"`
	Color     string `json:"color"`
	WipLimit  *int   `json:"wip_limit"`
	IsFail    *bool  `json:"is_fail"`
	IsSuccess *bool  `json:"is_success"`
	SortOrder *int   `json:"sort_order"`
}

type ReorderInput struct {
	IDs []int `json:"ids" binding:"required"`
}

type TransitionRuleInput struct {
	FromStageCode string `json:"from_stage_code" binding:"required"`
	ToStageCode   string `json:"to_stage_code" binding:"required"`
}

type StageRequiredFieldInput struct {
	StageCode  string `json:"stage_code" binding:"required"`
	FieldName  string `json:"field_name" binding:"required"`
	FieldLabel string `json:"field_label" binding:"required"`
}

func GetStages(c *gin.Context) {
	rows, err := db.DB.Query(`
		SELECT id, name, code, color, sort_order, wip_limit, is_system,
		       COALESCE(is_fail, FALSE), COALESCE(is_success, FALSE)
		FROM pipeline_stages ORDER BY sort_order ASC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch stages"})
		return
	}
	defer rows.Close()

	stages := make([]gin.H, 0)
	for rows.Next() {
		var id, sortOrder, wipLimit int
		var name, code, color string
		var isSystem, isFail, isSuccess bool
		if err := rows.Scan(&id, &name, &code, &color, &sortOrder, &wipLimit, &isSystem, &isFail, &isSuccess); err == nil {
			stages = append(stages, gin.H{
				"id":         id,
				"name":       name,
				"code":       code,
				"color":      color,
				"sort_order": sortOrder,
				"wip_limit":  wipLimit,
				"is_system":  isSystem,
				"is_fail":    isFail,
				"is_success": isSuccess,
			})
		}
	}

	c.JSON(http.StatusOK, stages)
}

func CreateStage(c *gin.Context) {
	var input StageInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := db.DB.Exec(`INSERT INTO pipeline_stages (name, code, color, sort_order, wip_limit) VALUES (?, ?, ?, ?, ?)`,
		input.Name, input.Code, input.Color, input.SortOrder, input.WipLimit)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Stage with this code already exists"})
		return
	}

	id, _ := res.LastInsertId()
	userIDRaw, _ := c.Get("user_id")
	db.LogAction(userIDRaw.(uint), "CREATE_STAGE", "Создан этап воронки: "+input.Name)

	c.JSON(http.StatusOK, gin.H{"id": id, "name": input.Name, "code": input.Code})
}

func UpdateStage(c *gin.Context) {
	id := c.Param("id")
	var input UpdateStageInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var name, code, color string
	var wipLimit, sortOrder int
	var isSystem, isFail, isSuccess bool
	err := db.DB.QueryRow(`
		SELECT name, code, color, wip_limit, sort_order, is_system,
		       COALESCE(is_fail, FALSE), COALESCE(is_success, FALSE)
		FROM pipeline_stages WHERE id = ?`, id).
		Scan(&name, &code, &color, &wipLimit, &sortOrder, &isSystem, &isFail, &isSuccess)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Stage not found"})
		return
	}

	if input.Name != "" {
		name = input.Name
	}
	if input.Color != "" {
		color = input.Color
	}
	if input.WipLimit != nil {
		wipLimit = *input.WipLimit
	}
	if input.IsFail != nil {
		isFail = *input.IsFail
	}
	if input.IsSuccess != nil {
		isSuccess = *input.IsSuccess
	}
	if input.SortOrder != nil {
		sortOrder = *input.SortOrder
	}

	_, err = db.DB.Exec(`
		UPDATE pipeline_stages SET name=?, color=?, wip_limit=?, sort_order=?, is_fail=?, is_success=?
		WHERE id=?`, name, color, wipLimit, sortOrder, isFail, isSuccess, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update stage"})
		return
	}

	userIDRaw, _ := c.Get("user_id")
	db.LogAction(userIDRaw.(uint), "UPDATE_STAGE", "Обновлен этап ID: "+id)

	c.JSON(http.StatusOK, gin.H{"message": "Stage updated"})
}

func ReorderStages(c *gin.Context) {
	var input ReorderInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	for i, stageID := range input.IDs {
		_, _ = db.DB.Exec("UPDATE pipeline_stages SET sort_order = ? WHERE id = ?", i+1, stageID)
	}

	userIDRaw, _ := c.Get("user_id")
	db.LogAction(userIDRaw.(uint), "REORDER_STAGES", "Изменен порядок этапов воронки")

	c.JSON(http.StatusOK, gin.H{"message": "Stages reordered"})
}

func DeleteStage(c *gin.Context) {
	id := c.Param("id")

	var isSystem bool
	_ = db.DB.QueryRow("SELECT is_system FROM pipeline_stages WHERE id = ?", id).Scan(&isSystem)
	if isSystem {
		c.JSON(http.StatusBadRequest, gin.H{"error": "System stages cannot be deleted"})
		return
	}

	_, err := db.DB.Exec("DELETE FROM pipeline_stages WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete stage"})
		return
	}

	userIDRaw, _ := c.Get("user_id")
	db.LogAction(userIDRaw.(uint), "DELETE_STAGE", "Удален этап ID: "+id)

	c.JSON(http.StatusOK, gin.H{"message": "Stage deleted"})
}

func GetTransitionRules(c *gin.Context) {
	rows, err := db.DB.Query("SELECT id, from_stage_code, to_stage_code FROM stage_transition_rules ORDER BY id ASC")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch transition rules"})
		return
	}
	defer rows.Close()

	rules := make([]gin.H, 0)
	for rows.Next() {
		var id int
		var fromCode, toCode string
		if err := rows.Scan(&id, &fromCode, &toCode); err == nil {
			rules = append(rules, gin.H{"id": id, "from_stage_code": fromCode, "to_stage_code": toCode})
		}
	}
	c.JSON(http.StatusOK, rules)
}

func CreateTransitionRule(c *gin.Context) {
	var input TransitionRuleInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := db.DB.Exec("INSERT OR IGNORE INTO stage_transition_rules (from_stage_code, to_stage_code) VALUES (?, ?)",
		input.FromStageCode, input.ToStageCode)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rule already exists"})
		return
	}
	id, _ := res.LastInsertId()

	userIDRaw, _ := c.Get("user_id")
	db.LogAction(userIDRaw.(uint), "CREATE_TRANSITION_RULE", input.FromStageCode+" → "+input.ToStageCode+" заблокирован")

	c.JSON(http.StatusOK, gin.H{"id": id, "from_stage_code": input.FromStageCode, "to_stage_code": input.ToStageCode})
}

func DeleteTransitionRule(c *gin.Context) {
	id := c.Param("id")
	_, err := db.DB.Exec("DELETE FROM stage_transition_rules WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete rule"})
		return
	}
	userIDRaw, _ := c.Get("user_id")
	db.LogAction(userIDRaw.(uint), "DELETE_TRANSITION_RULE", "Удалено правило переходов ID: "+id)
	c.JSON(http.StatusOK, gin.H{"message": "Rule deleted"})
}

func GetStageRequiredFields(c *gin.Context) {
	rows, err := db.DB.Query("SELECT id, stage_code, field_name, field_label FROM stage_required_fields ORDER BY stage_code, id ASC")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch required fields"})
		return
	}
	defer rows.Close()

	fields := make([]gin.H, 0)
	for rows.Next() {
		var id int
		var stageCode, fieldName, fieldLabel string
		if err := rows.Scan(&id, &stageCode, &fieldName, &fieldLabel); err == nil {
			fields = append(fields, gin.H{"id": id, "stage_code": stageCode, "field_name": fieldName, "field_label": fieldLabel})
		}
	}
	c.JSON(http.StatusOK, fields)
}

func CreateStageRequiredField(c *gin.Context) {
	var input StageRequiredFieldInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := db.DB.Exec("INSERT OR IGNORE INTO stage_required_fields (stage_code, field_name, field_label) VALUES (?, ?, ?)",
		input.StageCode, input.FieldName, input.FieldLabel)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Field already exists for this stage"})
		return
	}
	id, _ := res.LastInsertId()

	userIDRaw, _ := c.Get("user_id")
	db.LogAction(userIDRaw.(uint), "CREATE_REQUIRED_FIELD", "Добавлено обязательное поле '"+input.FieldLabel+"' для этапа "+input.StageCode)

	c.JSON(http.StatusOK, gin.H{"id": id, "stage_code": input.StageCode, "field_name": input.FieldName, "field_label": input.FieldLabel})
}

func DeleteStageRequiredField(c *gin.Context) {
	id := c.Param("id")
	_, err := db.DB.Exec("DELETE FROM stage_required_fields WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete required field"})
		return
	}
	userIDRaw, _ := c.Get("user_id")
	db.LogAction(userIDRaw.(uint), "DELETE_REQUIRED_FIELD", "Удалено обязательное поле ID: "+id)
	c.JSON(http.StatusOK, gin.H{"message": "Field deleted"})
}
