package db

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/mattn/go-sqlite3"
)

var DB *sql.DB

func InitDB(dbPath string) (*sql.DB, error) {
	database, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := database.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	if _, err := database.Exec("PRAGMA foreign_keys = ON;"); err != nil {
		return nil, fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	if _, err := database.Exec(SchemaSQL); err != nil {
		return nil, fmt.Errorf("failed to execute schema: %w", err)
	}

	// Safe migrations for existing databases
	_, _ = database.Exec("ALTER TABLE pipeline_stages ADD COLUMN is_success BOOLEAN DEFAULT FALSE")
	_, _ = database.Exec("ALTER TABLE clients ADD COLUMN custom_fields TEXT DEFAULT '{}'")
	_, _ = database.Exec("ALTER TABLE clients ADD COLUMN stage_changed_at TIMESTAMP DEFAULT NULL")
	_, _ = database.Exec("ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1")
	_, _ = database.Exec("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0")
	_, _ = database.Exec("ALTER TABLE audit_logs ADD COLUMN old_value TEXT NOT NULL DEFAULT ''")
	_, _ = database.Exec("ALTER TABLE audit_logs ADD COLUMN new_value TEXT NOT NULL DEFAULT ''")

	_, _ = database.Exec(`
		INSERT OR IGNORE INTO pipeline_stages (name, code, color, sort_order, is_system, is_fail) VALUES 
		('Новые', 'new', '#3b82f6', 1, TRUE, FALSE),
		('В работе', 'in_progress', '#f59e0b', 2, FALSE, FALSE),
		('Успешно', 'done', '#10b981', 3, TRUE, FALSE),
		('Отказ', 'rejected', '#ef4444', 4, TRUE, TRUE);
		`)

	_, _ = database.Exec(`
		INSERT OR IGNORE INTO loss_reasons (name) VALUES 
		('Высокая цена'),
		('Ушел к конкурентам'),
		('Не дозвонились'),
		('Другое');
		`)

	_, _ = database.Exec("UPDATE users SET role = 'admin' WHERE id = 1")
	_, _ = database.Exec("UPDATE pipeline_stages SET is_success = TRUE WHERE code = 'done'")

	// Seed built-in roles (idempotent)
	_, _ = database.Exec(`INSERT OR IGNORE INTO roles (code, name, permissions) VALUES
		('admin',      'Администратор',       '{"view_all":1,"edit":1,"delete":1,"export":1,"settings":1,"chat":1}'),
		('head',       'Руководитель отдела', '{"view_all":1,"edit":1,"delete":1,"export":1,"settings":0,"chat":1}'),
		('manager',    'Менеджер',            '{"view_all":0,"edit":1,"delete":0,"export":0,"settings":0,"chat":1}'),
		('accountant', 'Бухгалтер',           '{"view_all":1,"edit":0,"delete":0,"export":1,"settings":0,"chat":0}'),
		('observer',   'Наблюдатель',         '{"view_all":1,"edit":0,"delete":0,"export":0,"settings":0,"chat":0}')
	`)

	DB = database
	fmt.Println("Database initialized successfully at:", dbPath)
	return database, nil
}

// LogAction writes an audit record. Optional oldNew[0]=oldValue, oldNew[1]=newValue.
func LogAction(userID uint, action, details string, oldNew ...string) {
	if DB == nil {
		return
	}
	old, new_ := "", ""
	if len(oldNew) >= 2 {
		old, new_ = oldNew[0], oldNew[1]
	}
	_, err := DB.Exec(
		"INSERT INTO audit_logs (user_id, action, details, old_value, new_value) VALUES (?,?,?,?,?)",
		userID, action, details, old, new_)
	if err != nil {
		log.Printf("[AUDIT-ERROR] %v", err)
	}
}
