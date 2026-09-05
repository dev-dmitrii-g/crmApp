package main

import (
	"crmProject/internal/db"
	"log"
)

func main() {
	database, err := db.InitDB("./crm.db")
	if err != nil {
		log.Fatalf("Database error: %v", err)
	}
	defer database.Close()

	_, _ = database.Exec(`
		INSERT INTO clients (phone, name, status) VALUES 
		('79991112233', 'Иван Иванов (Лид)', 'new'),
		('79992223344', 'Алексей Смирнов', 'in_progress'),
		('79993334455', 'Елена Петрова', 'done');
	`)

	log.Println("Seed data inserted successfully!")
}
