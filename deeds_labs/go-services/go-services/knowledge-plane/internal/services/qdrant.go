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

type QdrantService struct {
	cfg    *config.Config
	client *http.Client
}

type QdrantSearchRequest struct {
	Vector          []float32 `json:"vector"`
	Limit           int       `json:"limit"`
	WithPayload     bool      `json:"with_payload"`
	ScoreThreshold  *float64  `json:"score_threshold,omitempty"`
}

type QdrantSearchResponse struct {
	Result []QdrantHit `json:"result"`
}

type QdrantHit struct {
	ID      string                 `json:"id"`
	Score   float64                `json:"score"`
	Payload map[string]interface{} `json:"payload,omitempty"`
}

type Hit struct {
	ID     string                 `json:"id"`
	Score  float64                `json:"score"`
	Kind   string                 `json:"kind"`
	Tags   []string               `json:"tags,omitempty"`
	Source string                 `json:"source,omitempty"`
	Chunk  string                 `json:"chunk,omitempty"`
	Meta   map[string]interface{} `json:"meta,omitempty"`
}

func NewQdrantService(ctx context.Context, cfg *config.Config) (*QdrantService, error) {
	svc := &QdrantService{
		cfg: cfg,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}

	// Test connection
	if err := svc.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping Qdrant: %w", err)
	}

	return svc, nil
}

// Close releases Qdrant resources
func (s *QdrantService) Close() error {
	s.client.CloseIdleConnections()
	return nil
}

// Ping checks Qdrant connectivity
func (s *QdrantService) Ping(ctx context.Context) error {
	url := fmt.Sprintf("%s/collections/%s", s.cfg.QdrantURL, s.cfg.QdrantCollection)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return err
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("qdrant returned status %d", resp.StatusCode)
	}

	return nil
}

// Search performs vector similarity search in Qdrant
func (s *QdrantService) Search(ctx context.Context, vector []float32, topK int, threshold *float64) ([]Hit, error) {
	req := QdrantSearchRequest{
		Vector:         vector,
		Limit:          topK,
		WithPayload:    true,
		ScoreThreshold: threshold,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("%s/collections/%s/points/search", s.cfg.QdrantURL, s.cfg.QdrantCollection)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Qdrant API error %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var searchResp QdrantSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchResp); err != nil {
		return nil, err
	}

	// Convert Qdrant hits to our format
	hits := make([]Hit, 0, len(searchResp.Result))
	for _, qHit := range searchResp.Result {
		hit := Hit{
			ID:    fmt.Sprintf("%v", qHit.ID),
			Score: qHit.Score,
			Meta:  qHit.Payload,
		}

		// Extract common fields from payload
		if kind, ok := qHit.Payload["kind"].(string); ok {
			hit.Kind = kind
		}
		if source, ok := qHit.Payload["source"].(string); ok {
			hit.Source = source
		}
		if text, ok := qHit.Payload["text"].(string); ok {
			hit.Chunk = text
		}
		if tags, ok := qHit.Payload["tags"].([]interface{}); ok {
			hit.Tags = make([]string, 0, len(tags))
			for _, tag := range tags {
				if tagStr, ok := tag.(string); ok {
					hit.Tags = append(hit.Tags, tagStr)
				}
			}
		}

		hits = append(hits, hit)
	}

	return hits, nil
}

// GetCollection retrieves collection info (for health checks)
func (s *QdrantService) GetCollection(ctx context.Context) (map[string]interface{}, error) {
	url := fmt.Sprintf("%s/collections/%s", s.cfg.QdrantURL, s.cfg.QdrantCollection)
	httpReq, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Qdrant API error %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result, nil
}
