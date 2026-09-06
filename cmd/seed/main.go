package main

import (
	"crmProject/internal/db"
	"log"
	"os"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./crm.db"
	}

	database, err := db.InitDB(dbPath)
	if err != nil {
		log.Fatalf("Database error: %v", err)
	}
	defer database.Close()

	adminEmail := os.Getenv("ADMIN_EMAIL")
	if adminEmail == "" {
		adminEmail = "test@mail.com"
	}

	adminPassword := os.Getenv("ADMIN_PASSWORD")
	if adminPassword == "" {
		adminPassword = "securepassword"
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(adminPassword), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("Failed to hash admin password: %v", err)
	}

	query := `
		INSERT INTO users (email, password, role) 
		VALUES (?, ?, 'admin') 
		ON CONFLICT(email) DO NOTHING;
	`
	_, err = database.Exec(query, adminEmail, string(hashedPassword))
	if err != nil {
		log.Printf("Admin creation warning: %v", err)
	} else {
		log.Println("Admin user checked/created successfully!")
	}

	log.Println("Seed data processed successfully!")
}
