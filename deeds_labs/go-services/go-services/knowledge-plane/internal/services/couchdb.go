package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/config"
)

type CouchDBService struct {
	cfg    *config.Config
	client *http.Client
}

func NewCouchDBService(cfg *config.Config) *CouchDBService {
	return &CouchDBService{
		cfg: cfg,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (s *CouchDBService) Close() error {
	s.client.CloseIdleConnections()
	return nil
}

// Ping checks CouchDB connectivity
func (s *CouchDBService) Ping(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, "GET", s.cfg.CouchDBURL, nil)
	if err != nil {
		return err
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("couchdb returned status %d", resp.StatusCode)
	}

	return nil
}

// CreateDocument creates a new document in a database
func (s *CouchDBService) CreateDocument(ctx context.Context, db string, doc map[string]interface{}) (string, error) {
	body, err := json.Marshal(doc)
	if err != nil {
		return "", err
	}

	url := fmt.Sprintf("%s/%s", s.cfg.CouchDBURL, db)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("couchdb create failed %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var result struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return result.ID, nil
}

// GetDocument retrieves a document by ID
func (s *CouchDBService) GetDocument(ctx context.Context, db, id string) (map[string]interface{}, error) {
	url := fmt.Sprintf("%s/%s/%s", s.cfg.CouchDBURL, db, id)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("couchdb get failed %d", resp.StatusCode)
	}

	var doc map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&doc); err != nil {
		return nil, err
	}

	return doc, nil
}
