package analytics

import (
	"crmProject/internal/db"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"

	"github.com/gin-gonic/gin"
)

// ── Funnel ────────────────────────────────────────────────────────────────────

type FunnelStage struct {
	Name         string  `json:"name"`
	Code         string  `json:"code"`
	Color        string  `json:"color"`
	Count        int     `json:"count"`
	Amount       float64 `json:"amount"`
	PctOfTotal   float64 `json:"pct_of_total"`
	AvgHours     float64 `json:"avg_hours"`
	IsSuccess    bool    `json:"is_success"`
	IsFail       bool    `json:"is_fail"`
}

type LossBreakdown struct {
	Reason string `json:"reason"`
	Count  int    `json:"count"`
}

type FunnelResponse struct {
	Stages       []FunnelStage   `json:"stages"`
	LossReasons  []LossBreakdown `json:"loss_reasons"`
	TotalClients int             `json:"total_clients"`
	WonClients   int             `json:"won_clients"`
	LostClients  int             `json:"lost_clients"`
}

func GetFunnel(c *gin.Context) {
	rows, err := db.DB.Query(`
		SELECT ps.name, ps.code, ps.color, ps.is_success, ps.is_fail,
		       COUNT(cl.id),
		       COALESCE(SUM(CAST(json_extract(cl.custom_fields,'$.amount') AS REAL)), 0),
		       COALESCE(AVG(
		           CASE WHEN cl.id IS NOT NULL
		           THEN (julianday('now') - julianday(COALESCE(cl.stage_changed_at, cl.created_at))) * 24
		           ELSE NULL END
		       ), 0)
		FROM pipeline_stages ps
		LEFT JOIN clients cl ON cl.status = ps.code
		GROUP BY ps.code
		ORDER BY ps.sort_order`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	defer rows.Close()

	var stages []FunnelStage
	total := 0
	won := 0
	lost := 0
	for rows.Next() {
		var s FunnelStage
		if err := rows.Scan(&s.Name, &s.Code, &s.Color, &s.IsSuccess, &s.IsFail,
			&s.Count, &s.Amount, &s.AvgHours); err != nil {
			continue
		}
		total += s.Count
		if s.IsSuccess {
			won += s.Count
		}
		if s.IsFail {
			lost += s.Count
		}
		stages = append(stages, s)
	}
	// Calculate % of total
	for i := range stages {
		if total > 0 {
			stages[i].PctOfTotal = float64(stages[i].Count) / float64(total) * 100
		}
	}

	// Loss reasons
	var lossReasons []LossBreakdown
	lRows, _ := db.DB.Query(`
		SELECT COALESCE(NULLIF(cl.loss_reason,''), 'Не указана') as reason, COUNT(*) as cnt
		FROM clients cl
		JOIN pipeline_stages ps ON cl.status = ps.code
		WHERE ps.is_fail = 1
		GROUP BY reason ORDER BY cnt DESC LIMIT 10`)
	if lRows != nil {
		defer lRows.Close()
		for lRows.Next() {
			var l LossBreakdown
			if lRows.Scan(&l.Reason, &l.Count) == nil {
				lossReasons = append(lossReasons, l)
			}
		}
	}

	c.JSON(http.StatusOK, FunnelResponse{
		Stages:       stages,
		LossReasons:  lossReasons,
		TotalClients: total,
		WonClients:   won,
		LostClients:  lost,
	})
}

// ── Manager stats ─────────────────────────────────────────────────────────────

type ManagerStat struct {
	ID           int     `json:"id"`
	Name         string  `json:"name"`
	TotalDeals   int     `json:"total_deals"`
	WonDeals     int     `json:"won_deals"`
	LostDeals    int     `json:"lost_deals"`
	ActiveDeals  int     `json:"active_deals"`
	MessagesSent int     `json:"messages_sent"`
	OverdueTasks int     `json:"overdue_tasks"`
	WinRate      float64 `json:"win_rate"`
}

func GetManagerStats(c *gin.Context) {
	rows, err := db.DB.Query(`
		SELECT u.id, u.name,
		       COUNT(DISTINCT cl.id) as total,
		       COUNT(DISTINCT CASE WHEN ps.is_success=1 THEN cl.id END) as won,
		       COUNT(DISTINCT CASE WHEN ps.is_fail=1 THEN cl.id END) as lost,
		       COUNT(DISTINCT CASE WHEN ps.is_success=0 AND ps.is_fail=0 THEN cl.id END) as active,
		       (SELECT COUNT(*) FROM messages m JOIN clients c2 ON m.client_id=c2.id
		        WHERE c2.manager_id=u.id AND m.is_outgoing=1) as msgs,
		       (SELECT COUNT(*) FROM tasks t JOIN clients c2 ON t.client_id=c2.id
		        WHERE c2.manager_id=u.id AND t.completed=0
		        AND t.due_at IS NOT NULL AND t.due_at < datetime('now')) as overdue
		FROM users u
		LEFT JOIN clients cl ON cl.manager_id = u.id
		LEFT JOIN pipeline_stages ps ON cl.status = ps.code
		WHERE u.is_active = 1
		GROUP BY u.id
		ORDER BY won DESC, total DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	defer rows.Close()

	out := []ManagerStat{}
	for rows.Next() {
		var s ManagerStat
		if err := rows.Scan(&s.ID, &s.Name, &s.TotalDeals, &s.WonDeals, &s.LostDeals,
			&s.ActiveDeals, &s.MessagesSent, &s.OverdueTasks); err != nil {
			continue
		}
		closed := s.WonDeals + s.LostDeals
		if closed > 0 {
			s.WinRate = float64(s.WonDeals) / float64(closed) * 100
		}
		out = append(out, s)
	}
	c.JSON(http.StatusOK, out)
}

// ── Financial ─────────────────────────────────────────────────────────────────

type FinancialResponse struct {
	PipelineValue  float64 `json:"pipeline_value"`
	WonValue       float64 `json:"won_value"`
	AvgDeal        float64 `json:"avg_deal"`
	TotalDeals     int     `json:"total_deals"`
	WonDeals       int     `json:"won_deals"`
	LostDeals      int     `json:"lost_deals"`
	ConversionRate float64 `json:"conversion_rate"`
	AmountField    string  `json:"amount_field"`
}

var safeKey = regexp.MustCompile(`[^a-zA-Z0-9_]`)

func GetFinancials(c *gin.Context) {
	var amountKey string
	_ = db.DB.QueryRow("SELECT key FROM field_definitions WHERE type='number' ORDER BY sort_order LIMIT 1").Scan(&amountKey)
	if amountKey == "" {
		amountKey = "amount"
	}
	amountKey = safeKey.ReplaceAllString(amountKey, "")

	amtExpr := fmt.Sprintf("COALESCE(CAST(json_extract(cl.custom_fields,'$.%s') AS REAL),0)", amountKey)

	var resp FinancialResponse
	resp.AmountField = amountKey

	_ = db.DB.QueryRow(fmt.Sprintf(`
		SELECT
		    COUNT(cl.id),
		    SUM(CASE WHEN ps.is_fail=0 THEN %s ELSE 0 END),
		    SUM(CASE WHEN ps.is_success=1 THEN %s ELSE 0 END),
		    COUNT(DISTINCT CASE WHEN ps.is_success=1 THEN cl.id END),
		    COUNT(DISTINCT CASE WHEN ps.is_fail=1 THEN cl.id END)
		FROM clients cl
		JOIN pipeline_stages ps ON cl.status=ps.code`, amtExpr, amtExpr),
	).Scan(&resp.TotalDeals, &resp.PipelineValue, &resp.WonValue, &resp.WonDeals, &resp.LostDeals)

	if resp.TotalDeals > 0 {
		resp.AvgDeal = resp.PipelineValue / float64(resp.TotalDeals)
	}
	closed := resp.WonDeals + resp.LostDeals
	if closed > 0 {
		resp.ConversionRate = float64(resp.WonDeals) / float64(closed) * 100
	}

	c.JSON(http.StatusOK, resp)
}

// ── Saved filters ─────────────────────────────────────────────────────────────

type SavedFilter struct {
	ID        int               `json:"id"`
	Name      string            `json:"name"`
	Params    map[string]string `json:"params"`
	CreatedAt string            `json:"created_at"`
}

func GetSavedFilters(c *gin.Context) {
	rows, err := db.DB.Query(`SELECT id, name, params, created_at FROM saved_filters ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(http.StatusOK, []SavedFilter{})
		return
	}
	defer rows.Close()
	out := []SavedFilter{}
	for rows.Next() {
		var f SavedFilter
		var paramsStr string
		if rows.Scan(&f.ID, &f.Name, &paramsStr, &f.CreatedAt) == nil {
			f.Params = map[string]string{}
			_ = json.Unmarshal([]byte(paramsStr), &f.Params)
			out = append(out, f)
		}
	}
	c.JSON(http.StatusOK, out)
}

func CreateSavedFilter(c *gin.Context) {
	var input struct {
		Name   string            `json:"name" binding:"required"`
		Params map[string]string `json:"params"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	paramsBytes, _ := json.Marshal(input.Params)
	userIDRaw, _ := c.Get("user_id")
	res, err := db.DB.Exec(`INSERT INTO saved_filters (name, params, created_by) VALUES (?,?,?)`,
		input.Name, string(paramsBytes), userIDRaw.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save"})
		return
	}
	id, _ := res.LastInsertId()
	c.JSON(http.StatusCreated, gin.H{"id": id, "name": input.Name, "params": input.Params})
}

func DeleteSavedFilter(c *gin.Context) {
	_, _ = db.DB.Exec("DELETE FROM saved_filters WHERE id=?", c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"message": "Deleted"})
}
