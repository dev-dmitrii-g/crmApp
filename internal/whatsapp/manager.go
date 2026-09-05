package whatsapp

import (
	"context"
	"fmt"
	"sync"

	_ "github.com/mattn/go-sqlite3"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waLog "go.mau.fi/whatsmeow/util/log"
)

type Manager struct {
	container *sqlstore.Container
	clients   map[uint]*whatsmeow.Client
	mu        sync.RWMutex
}

var WAManager *Manager

func InitWAManager(ctx context.Context, dbPath string) (*Manager, error) {
	dbLog := waLog.Stdout("Database", "WARN", true)
	container, err := sqlstore.New(ctx, "sqlite3", fmt.Sprintf("file:%s?_foreign_keys=on", dbPath), dbLog)
	if err != nil {
		return nil, fmt.Errorf("failed to connect wa sqlstore: %w", err)
	}

	mgr := &Manager{
		container: container,
		clients:   make(map[uint]*whatsmeow.Client),
	}
	WAManager = mgr
	return mgr, nil
}

func (m *Manager) GetClient(ctx context.Context, userID uint) (*whatsmeow.Client, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if client, exists := m.clients[userID]; exists {
		return client, nil
	}

	deviceStore, err := m.container.GetFirstDevice(ctx)
	if err != nil {
		return nil, err
	}

	clientLog := waLog.Stdout(fmt.Sprintf("WA-User-%d", userID), "WARN", true)
	client := whatsmeow.NewClient(deviceStore, clientLog)

	m.clients[userID] = client
	return client, nil
}
