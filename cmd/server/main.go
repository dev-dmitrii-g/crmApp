package main

import (
	"crmProject/internal/db"
	"log"
)

func main() {
	database, err := db.InitDB("./crm.db")
	if err != nil {
		log.Fatalf("Database initialization error: %v", err)
	}
	defer database.Close()

	log.Println("Server is running...")
}
