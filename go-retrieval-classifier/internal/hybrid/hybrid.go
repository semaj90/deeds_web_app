package hybrid

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

// SearchResult represents a single search result
type SearchResult struct {
	PacketKey  string  `json:"packet_key"`
	SourceRef  string  `json:"source_ref"`
	Title      string  `json:"title"`
	Lane       string  `json:"lane"`
	Score      float32 `json:"score"`
	DenseScore float32 `json:"dense_score,omitempty"`
	SparseScore float32 `json:"sparse_score,omitempty"`
	RRFRank    int     `json:"rrf_rank,omitempty"`
}

// SearchRequest represents a search query
type SearchRequest struct {
	QueryText    string
	Mode         string // "dense", "sparse", "hybrid"
	Lane         string // Predicted lane from classifier
	TopK         int
	IncludeTrace bool
}

// HybridSearcher orchestrates retrieval across Qdrant and PostgreSQL
type HybridSearcher struct {
	qdrantURL string
	postgresURL string
	pgconn    *pgx.Conn
	httpClient *http.Client
	logLevel  string
}

// NewHybridSearcher creates a new hybrid searcher
func NewHybridSearcher(qdrantURL, postgresURL, logLevel string) (*HybridSearcher, error) {
	// Connect to Postgres
	conn, err := pgx.Connect(context.Background(), postgresURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Postgres: %w", err)
	}

	// Test connection
	if err := conn.Ping(context.Background()); err != nil {
		return nil, fmt.Errorf("Postgres ping failed: %w", err)
	}

	return &HybridSearcher{
		qdrantURL:   qdrantURL,
		postgresURL: postgresURL,
		pgconn:      conn,
		httpClient:  &http.Client{},
		logLevel:    logLevel,
	}, nil
}

// Search executes hybrid retrieval
func (hs *HybridSearcher) Search(req *SearchRequest) ([]SearchResult, error) {
	ctx := context.Background()

	switch strings.ToLower(req.Mode) {
	case "dense":
		return hs.denseSearch(ctx, req)
	case "sparse":
		return hs.sparseSearch(ctx, req)
	case "hybrid":
		fallthrough
	default:
		return hs.hybridSearch(ctx, req)
	}
}

// denseSearch uses Qdrant ANN only
func (hs *HybridSearcher) denseSearch(ctx context.Context, req *SearchRequest) ([]SearchResult, error) {
	// Embed query
	embedding, err := hs.embedText(ctx, req.QueryText)
	if err != nil {
		return nil, fmt.Errorf("embedding failed: %w", err)
	}

	// Search Qdrant
	qdrantResults, err := hs.qdrantSearch(ctx, embedding, req.TopK)
	if err != nil {
		log.Printf("Qdrant search error: %v", err)
		return nil, err
	}

	return qdrantResults, nil
}

// sparseSearch uses PostgreSQL BM25 FTS only
func (hs *HybridSearcher) sparseSearch(ctx context.Context, req *SearchRequest) ([]SearchResult, error) {
	query := `
		SELECT
			ap.packet_key,
			ap.source_ref,
			ap.title,
			ap.domain_class,
			ts_rank(to_tsvector('english', ap.summary),
			        plainto_tsquery('english', $1)) as score
		FROM atlas_packets ap
		WHERE to_tsvector('english', ap.summary) @@ plainto_tsquery('english', $1)
		ORDER BY score DESC
		LIMIT $2
	`

	rows, err := hs.pgconn.Query(ctx, query, req.QueryText, req.TopK)
	if err != nil {
		return nil, fmt.Errorf("Postgres query failed: %w", err)
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var pk, sr, title, domain string
		var score float32
		if err := rows.Scan(&pk, &sr, &title, &domain, &score); err != nil {
			log.Printf("Scan error: %v", err)
			continue
		}

		results = append(results, SearchResult{
			PacketKey:   pk,
			SourceRef:   sr,
			Title:       title,
			Lane:        domain,
			SparseScore: score,
			Score:       score,
		})
	}

	return results, rows.Err()
}

// hybridSearch uses RRF to blend Qdrant dense + PostgreSQL sparse
func (hs *HybridSearcher) hybridSearch(ctx context.Context, req *SearchRequest) ([]SearchResult, error) {
	// Parallel search
	denseChan := make(chan []SearchResult, 1)
	sparseChan := make(chan []SearchResult, 1)
	errChan := make(chan error, 2)

	// Dense search (Qdrant)
	go func() {
		embedding, err := hs.embedText(ctx, req.QueryText)
		if err != nil {
			errChan <- fmt.Errorf("embedding failed: %w", err)
			return
		}

		results, err := hs.qdrantSearch(ctx, embedding, req.TopK*2)
		if err != nil {
			errChan <- fmt.Errorf("Qdrant search failed: %w", err)
			return
		}
		denseChan <- results
	}()

	// Sparse search (PostgreSQL)
	go func() {
		results, err := hs.sparseSearch(ctx, req)
		if err != nil {
			errChan <- fmt.Errorf("PostgreSQL search failed: %w", err)
			return
		}
		sparseChan <- results
	}()

	// Collect results
	var denseResults, sparseResults []SearchResult

	for i := 0; i < 2; i++ {
		select {
		case dense := <-denseChan:
			denseResults = dense
		case sparse := <-sparseChan:
			sparseResults = sparse
		case err := <-errChan:
			log.Printf("Search lane error: %v", err)
			// Continue with available results
		}
	}

	// RRF fusion
	return hs.rrfFuse(denseResults, sparseResults, req.TopK), nil
}

// rrfFuse blends results using Reciprocal Rank Fusion
func (hs *HybridSearcher) rrfFuse(denseResults, sparseResults []SearchResult, topK int) []SearchResult {
	// Build rank maps
	scores := make(map[string]float32)
	resultMap := make(map[string]*SearchResult)

	const rrfK = 60.0

	// Dense results: 0.6 weight
	for i, r := range denseResults {
		key := r.PacketKey
		if _, exists := resultMap[key]; !exists {
			r := r
			resultMap[key] = &r
		} else {
			resultMap[key].DenseScore = r.Score
		}
		scores[key] += 0.6 * float32(1.0/(rrfK+float32(i+1)))
	}

	// Sparse results: 0.4 weight
	for i, r := range sparseResults {
		key := r.PacketKey
		if _, exists := resultMap[key]; !exists {
			r := r
			resultMap[key] = &r
		} else {
			resultMap[key].SparseScore = r.Score
		}
		scores[key] += 0.4 * float32(1.0/(rrfK+float32(i+1)))
	}

	// Sort by fused score
	var fused []SearchResult
	for key, score := range scores {
		r := *resultMap[key]
		r.Score = score
		fused = append(fused, r)
	}

	sort.Slice(fused, func(i, j int) bool {
		return fused[i].Score > fused[j].Score
	})

	// Truncate to topK
	if len(fused) > topK {
		fused = fused[:topK]
	}

	// Add RRF ranks
	for i := range fused {
		fused[i].RRFRank = i + 1
	}

	return fused
}

// qdrantSearch searches using Qdrant ANN
func (hs *HybridSearcher) qdrantSearch(ctx context.Context, embedding []float32, topK int) ([]SearchResult, error) {
	// Build Qdrant search request
	req := map[string]interface{}{
		"vector": embedding,
		"limit":  topK,
		"with_payload": true,
	}

	payload, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Query Qdrant
	url := fmt.Sprintf("%s/collections/codebase_chunks_768/points/search", hs.qdrantURL)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := hs.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("Qdrant request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Qdrant returned %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var qdrantResp struct {
		Result []struct {
			ID      string `json:"id"`
			Score   float32 `json:"score"`
			Payload map[string]interface{} `json:"payload"`
		} `json:"result"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&qdrantResp); err != nil {
		return nil, fmt.Errorf("failed to parse Qdrant response: %w", err)
	}

	// Convert to SearchResult
	var results []SearchResult
	for _, hit := range qdrantResp.Result {
		packet := SearchResult{
			PacketKey:  hit.ID,
			DenseScore: hit.Score,
			Score:      hit.Score,
		}

		// Extract payload fields
		if sr, ok := hit.Payload["source_ref"].(string); ok {
			packet.SourceRef = sr
		}
		if title, ok := hit.Payload["title"].(string); ok {
			packet.Title = title
		}
		if lane, ok := hit.Payload["domain_class"].(string); ok {
			packet.Lane = lane
		}

		results = append(results, packet)
	}

	return results, nil
}

// embedText embeds query text using the embedding service
func (hs *HybridSearcher) embedText(ctx context.Context, text string) ([]float32, error) {
	// Call /api/embed endpoint
	reqBody := map[string]interface{}{
		"text": text,
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", "http://127.0.0.1:5173/api/embed", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := hs.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var embedResp struct {
		Embedding []float32 `json:"embedding"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&embedResp); err != nil {
		return nil, err
	}

	return embedResp.Embedding, nil
}

// Close closes the database connection
func (hs *HybridSearcher) Close() error {
	if hs.pgconn != nil {
		return hs.pgconn.Close(context.Background())
	}
	return nil
}