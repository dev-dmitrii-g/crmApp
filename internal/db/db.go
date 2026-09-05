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

	DB = database
	fmt.Println("Database initialized successfully at:", dbPath)
	return database, nil
}

func LogAction(userID uint, action string, details string) {
	if DB == nil {
		return
	}
	_, err := DB.Exec("INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)", userID, action, details)
	if err != nil {
		log.Printf("[AUDIT-ERROR] Не удалось записать лог: %v", err)
	}
}
