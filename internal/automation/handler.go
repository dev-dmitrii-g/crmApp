package automation

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode"

	"crmProject/internal/chat"
	"crmProject/internal/db"
	"crmProject/internal/whatsapp"

	"github.com/gin-gonic/gin"
	"go.mau.fi/whatsmeow/proto/waE2E"
	watypes "go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
)

var waManager *whatsapp.Manager

func SetWAManager(m *whatsapp.Manager) { waManager = m }

// ── Domain types ─────────────────────────────────────────────────────────────

type Rule struct {
	ID               int             `json:"id"`
	Name             string          `json:"name"`
	IsActive         bool            `json:"is_active"`
	TriggerStageCode string          `json:"trigger_stage_code"`
	ActionType       string          `json:"action_type"`
	ActionData       json.RawMessage `json:"action_data"`
	SortOrder        int             `json:"sort_order"`
	CreatedAt        string          `json:"created_at"`
}

type Task struct {
	ID           int     `json:"id"`
	ClientID     int     `json:"client_id"`
	Title        string  `json:"title"`
	DueAt        *string `json:"due_at"`
	Completed    bool    `json:"completed"`
	CompletedAt  *string `json:"completed_at,omitempty"`
	AutomationID *int    `json:"automation_id,omitempty"`
	CreatedAt    string  `json:"created_at"`
}

type SLASetting struct {
	StageCode string `json:"stage_code"`
	WarnHours int    `json:"warn_hours"`
	CritHours int    `json:"crit_hours"`
}

// ── Rule CRUD (admin) ─────────────────────────────────────────────────────────

func GetRules(c *gin.Context) {
	rows, err := db.DB.Query(`
		SELECT id, name, is_active, trigger_stage_code, action_type, action_data, sort_order, created_at
		FROM stage_automations ORDER BY sort_order, id`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	defer rows.Close()
	out := []Rule{}
	for rows.Next() {
		var r Rule
		var ad string
		if err := rows.Scan(&r.ID, &r.Name, &r.IsActive, &r.TriggerStageCode, &r.ActionType, &ad, &r.SortOrder, &r.CreatedAt); err != nil {
			continue
		}
		r.ActionData = json.RawMessage(ad)
		out = append(out, r)
	}
	c.JSON(http.StatusOK, out)
}

func CreateRule(c *gin.Context) {
	var input struct {
		Name             string          `json:"name" binding:"required"`
		TriggerStageCode string          `json:"trigger_stage_code" binding:"required"`
		ActionType       string          `json:"action_type" binding:"required"`
		ActionData       json.RawMessage `json:"action_data"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(input.ActionData) == 0 {
		input.ActionData = json.RawMessage("{}")
	}
	var maxOrder int
	_ = db.DB.QueryRow("SELECT COALESCE(MAX(sort_order),0)+1 FROM stage_automations").Scan(&maxOrder)
	res, err := db.DB.Exec(
		`INSERT INTO stage_automations (name, is_active, trigger_stage_code, action_type, action_data, sort_order) VALUES (?,1,?,?,?,?)`,
		input.Name, input.TriggerStageCode, input.ActionType, string(input.ActionData), maxOrder,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create rule"})
		return
	}
	id, _ := res.LastInsertId()
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func UpdateRule(c *gin.Context) {
	id := c.Param("id")
	var input struct {
		Name       string          `json:"name"`
		IsActive   *bool           `json:"is_active"`
		ActionData json.RawMessage `json:"action_data"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.Name != "" {
		_, _ = db.DB.Exec("UPDATE stage_automations SET name=? WHERE id=?", input.Name, id)
	}
	if input.IsActive != nil {
		v := 0
		if *input.IsActive {
			v = 1
		}
		_, _ = db.DB.Exec("UPDATE stage_automations SET is_active=? WHERE id=?", v, id)
	}
	if len(input.ActionData) > 0 {
		_, _ = db.DB.Exec("UPDATE stage_automations SET action_data=? WHERE id=?", string(input.ActionData), id)
	}
	c.JSON(http.StatusOK, gin.H{"message": "Updated"})
}

func DeleteRule(c *gin.Context) {
	id := c.Param("id")
	if _, err := db.DB.Exec("DELETE FROM stage_automations WHERE id=?", id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Deleted"})
}

// ── Task CRUD (all managers) ──────────────────────────────────────────────────

func GetTasks(c *gin.Context) {
	clientID := c.Query("client_id")
	if clientID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "client_id required"})
		return
	}
	rows, err := db.DB.Query(`
		SELECT id, client_id, title, due_at, completed, completed_at, automation_id, created_at
		FROM tasks WHERE client_id=? ORDER BY completed ASC, created_at ASC`, clientID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	defer rows.Close()
	out := []Task{}
	for rows.Next() {
		var t Task
		var dueAt, completedAt sql.NullString
		var autoID sql.NullInt64
		if err := rows.Scan(&t.ID, &t.ClientID, &t.Title, &dueAt, &t.Completed, &completedAt, &autoID, &t.CreatedAt); err != nil {
			continue
		}
		if dueAt.Valid {
			t.DueAt = &dueAt.String
		}
		if completedAt.Valid {
			t.CompletedAt = &completedAt.String
		}
		if autoID.Valid {
			v := int(autoID.Int64)
			t.AutomationID = &v
		}
		out = append(out, t)
	}
	c.JSON(http.StatusOK, out)
}

func CreateTask(c *gin.Context) {
	var input struct {
		ClientID int    `json:"client_id" binding:"required"`
		Title    string `json:"title" binding:"required"`
		DueAt    string `json:"due_at"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var dueAt interface{}
	if input.DueAt != "" {
		dueAt = input.DueAt
	}
	res, err := db.DB.Exec("INSERT INTO tasks (client_id, title, due_at) VALUES (?,?,?)", input.ClientID, input.Title, dueAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create task"})
		return
	}
	id, _ := res.LastInsertId()
	c.JSON(http.StatusCreated, gin.H{"id": id, "client_id": input.ClientID, "title": input.Title, "completed": false, "due_at": input.DueAt, "created_at": time.Now().UTC().Format(time.RFC3339)})
}

func UpdateTask(c *gin.Context) {
	id := c.Param("id")
	var input struct {
		Completed *bool  `json:"completed"`
		Title     string `json:"title"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.Completed != nil {
		if *input.Completed {
			_, _ = db.DB.Exec("UPDATE tasks SET completed=1, completed_at=CURRENT_TIMESTAMP WHERE id=?", id)
		} else {
			_, _ = db.DB.Exec("UPDATE tasks SET completed=0, completed_at=NULL WHERE id=?", id)
		}
	}
	if input.Title != "" {
		_, _ = db.DB.Exec("UPDATE tasks SET title=? WHERE id=?", input.Title, id)
	}
	c.JSON(http.StatusOK, gin.H{"message": "Updated"})
}

func DeleteTask(c *gin.Context) {
	id := c.Param("id")
	_, _ = db.DB.Exec("DELETE FROM tasks WHERE id=?", id)
	c.JSON(http.StatusOK, gin.H{"message": "Deleted"})
}

// ── SLA CRUD ──────────────────────────────────────────────────────────────────

func GetSLA(c *gin.Context) {
	rows, err := db.DB.Query("SELECT stage_code, warn_hours, crit_hours FROM sla_settings")
	if err != nil {
		c.JSON(http.StatusOK, []SLASetting{})
		return
	}
	defer rows.Close()
	out := []SLASetting{}
	for rows.Next() {
		var s SLASetting
		if err := rows.Scan(&s.StageCode, &s.WarnHours, &s.CritHours); err != nil {
			continue
		}
		out = append(out, s)
	}
	c.JSON(http.StatusOK, out)
}

func UpsertSLA(c *gin.Context) {
	var input SLASetting
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_, err := db.DB.Exec(`
		INSERT INTO sla_settings (stage_code, warn_hours, crit_hours) VALUES (?,?,?)
		ON CONFLICT(stage_code) DO UPDATE SET warn_hours=excluded.warn_hours, crit_hours=excluded.crit_hours`,
		input.StageCode, input.WarnHours, input.CritHours)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save SLA"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Saved"})
}

// ── Automation engine ─────────────────────────────────────────────────────────

// RunRulesAsync fetches active rules for the given stage and executes them in a goroutine.
func RunRulesAsync(clientID int, stageCode, phone, name string) {
	go func() {
		ctx := context.Background()
		rows, err := db.DB.Query(`
			SELECT id, action_type, action_data
			FROM stage_automations WHERE trigger_stage_code=? AND is_active=1
			ORDER BY sort_order, id`, stageCode)
		if err != nil {
			log.Printf("[AUTO] fetch rules: %v", err)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var ruleID int
			var actionType, actionDataStr string
			if err := rows.Scan(&ruleID, &actionType, &actionDataStr); err != nil {
				continue
			}
			executeAction(ctx, ruleID, actionType, actionDataStr, clientID, phone, name)
		}
	}()
}

func executeAction(ctx context.Context, ruleID int, actionType, actionDataStr string, clientID int, phone, name string) {
	var data map[string]interface{}
	_ = json.Unmarshal([]byte(actionDataStr), &data)
	log.Printf("[AUTO] rule=%d type=%s client=%d", ruleID, actionType, clientID)

	switch actionType {
	case "send_whatsapp":
		sendWA(ctx, ruleID, data, clientID, phone, name)
	case "assign_manager":
		assignManager(ruleID, data, clientID)
	case "create_task":
		createTask(ruleID, data, clientID, name)
	default:
		log.Printf("[AUTO] unknown action_type=%s", actionType)
	}
}

func sendWA(ctx context.Context, ruleID int, data map[string]interface{}, clientID int, phone, name string) {
	if waManager == nil || !waManager.IsConnected() {
		log.Printf("[AUTO] WA not connected — skipping rule %d", ruleID)
		return
	}
	msgTpl, _ := data["message"].(string)
	if msgTpl == "" {
		return
	}
	msg := strings.ReplaceAll(strings.ReplaceAll(msgTpl, "{name}", name), "{phone}", phone)

	waClient, err := waManager.GetClient(ctx, 1)
	if err != nil || waClient == nil || !waClient.IsConnected() {
		return
	}

	// Always send automation messages to the phone number JID.
	// LID JIDs (@lid) are for receiving only; sending to them returns error 479.
	cleaned := strings.Map(func(r rune) rune {
		if unicode.IsDigit(r) {
			return r
		}
		return -1
	}, phone)
	if strings.HasPrefix(phone, "lid_") {
		// Resolve lid → phone number via the reverse store
		lid := watypes.NewJID(phone[4:], watypes.HiddenUserServer)
		pnJID, err2 := waClient.Store.LIDs.GetPNForLID(ctx, lid)
		if err2 != nil || pnJID.IsEmpty() {
			log.Printf("[AUTO] cannot resolve lid %s to phone: %v — skipping rule %d", phone, err2, ruleID)
			return
		}
		cleaned = pnJID.User
	}
	if cleaned == "" {
		log.Printf("[AUTO] empty phone for client %d — skipping rule %d", clientID, ruleID)
		return
	}
	jid := watypes.NewJID(cleaned, watypes.DefaultUserServer)

	if _, err := waClient.SendMessage(ctx, jid, &waE2E.Message{Conversation: proto.String(msg)}); err != nil {
		log.Printf("[AUTO] WA send error rule %d: %v", ruleID, err)
		return
	}
	res, _ := db.DB.Exec(
		"INSERT INTO messages (client_id, sender_phone, text, is_outgoing) VALUES (?,?,?,1)",
		clientID, "auto", msg)
	msgID, _ := res.LastInsertId()
	chat.BroadcastMessage(map[string]interface{}{
		"type":        "new_message",
		"id":          msgID,
		"client_id":   clientID,
		"text":        msg,
		"is_outgoing": true,
	})
	log.Printf("[AUTO] WA sent rule=%d client=%d", ruleID, clientID)
}

func assignManager(ruleID int, data map[string]interface{}, clientID int) {
	mgrIDf, _ := data["manager_id"].(float64)
	if mgrIDf == 0 {
		return
	}
	_, _ = db.DB.Exec("UPDATE clients SET manager_id=? WHERE id=?", int(mgrIDf), clientID)
	log.Printf("[AUTO] assigned manager=%d client=%d rule=%d", int(mgrIDf), clientID, ruleID)
}

func createTask(ruleID int, data map[string]interface{}, clientID int, name string) {
	title, _ := data["title"].(string)
	if title == "" {
		return
	}
	title = strings.ReplaceAll(title, "{name}", name)
	dueInH, _ := data["due_in_hours"].(float64)
	var dueAt interface{}
	if dueInH > 0 {
		dueAt = time.Now().Add(time.Duration(dueInH) * time.Hour).UTC().Format("2006-01-02T15:04:05Z")
	}
	if _, err := db.DB.Exec("INSERT INTO tasks (client_id, title, due_at, automation_id) VALUES (?,?,?,?)",
		clientID, title, dueAt, ruleID); err != nil {
		log.Printf("[AUTO] create_task error rule=%d: %v", ruleID, err)
	}
}

// ── SLA background checker ────────────────────────────────────────────────────

// RunSLAChecker runs hourly and logs SLA breaches to audit_logs.
func RunSLAChecker(ctx context.Context) {
	check := func() {
		rows, err := db.DB.Query(`
			SELECT c.id, c.name, c.status,
			       CAST((julianday('now') - julianday(COALESCE(c.stage_changed_at, c.created_at))) * 24 AS INTEGER)
			FROM clients c
			WHERE c.status NOT IN (SELECT code FROM pipeline_stages WHERE is_success=1 OR is_fail=1)`)
		if err != nil {
			return
		}
		defer rows.Close()
		for rows.Next() {
			var cid, hours int
			var cname, status string
			if err := rows.Scan(&cid, &cname, &status, &hours); err != nil {
				continue
			}
			var critH int
			_ = db.DB.QueryRow("SELECT crit_hours FROM sla_settings WHERE stage_code=?", status).Scan(&critH)
			if critH <= 0 || hours < critH {
				continue
			}
			var recent int
			_ = db.DB.QueryRow(`
				SELECT COUNT(*) FROM audit_logs
				WHERE action='SLA_BREACH' AND details LIKE ? AND timestamp > datetime('now','-23 hours')`,
				fmt.Sprintf("%%ID=%d%%", cid)).Scan(&recent)
			if recent == 0 {
				db.LogAction(0, "SLA_BREACH", fmt.Sprintf(
					"Клиент «%s» (ID=%d) в этапе «%s» уже %d ч (лимит: %d ч)",
					cname, cid, status, hours, critH,
				))
				log.Printf("[SLA] breach: client %d (%s) stage=%s hours=%d limit=%d", cid, cname, status, hours, critH)
			}
		}
	}

	check()
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			check()
		}
	}
}
