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

func GetStages(c *gin.Context) {
	rows, err := db.DB.Query("SELECT id, name, code, color, sort_order, wip_limit, is_system FROM pipeline_stages ORDER BY sort_order ASC")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch stages"})
		return
	}
	defer rows.Close()

	stages := make([]gin.H, 0)
	for rows.Next() {
		var id, sortOrder, wipLimit int
		var name, code, color string
		var isSystem bool
		if err := rows.Scan(&id, &name, &code, &color, &sortOrder, &wipLimit, &isSystem); err == nil {
			stages = append(stages, gin.H{
				"id":         id,
				"name":       name,
				"code":       code,
				"color":      color,
				"sort_order": sortOrder,
				"wip_limit":  wipLimit,
				"is_system":  isSystem,
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

	res, err := db.DB.Exec("INSERT INTO pipeline_stages (name, code, color, sort_order, wip_limit) VALUES (?, ?, ?, ?, ?)",
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
