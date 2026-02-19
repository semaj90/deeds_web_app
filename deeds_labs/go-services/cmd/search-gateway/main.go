package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SearchRequest - incoming search query
type SearchRequest struct {
	Query     string    `json:"query"`
	Embedding []float32 `json:"embedding"`
	TopK      int       `json:"top_k"`
}

// SearchResult - unified search result
type SearchResult struct {
	ChunkID       string  `json:"chunk_id"`
	DocumentID    string  `json:"document_id"`
	CaseID        string  `json:"case_id"`
	Title         string  `json:"title"`
	Chunk         string  `json:"chunk"`
	SemanticScore float32 `json:"semantic_score"`
	KeywordScore  float32 `json:"keyword_score"`
	RerankScore   float32 `json:"rerank_score"`
	AuthorityScore float32 `json:"authority_score"`
	FinalScore    float32 `json:"final_score"`
	Holdings      []string `json:"holdings,omitempty"`
}

// SearchOrchestrator - coordinates search across all services
type SearchOrchestrator struct {
	pgvectorURL    string
	elasticsearchURL string
	rerankerURL    string
	autoencoderURL string
	neo4jURL       string
	pgPool         *pgxpool.Pool
}

// NewSearchOrchestrator - create orchestrator
func NewSearchOrchestrator(pgConnStr string) (*SearchOrchestrator, error) {
	pool, err := pgxpool.New(context.Background(), pgConnStr)
	if err != nil {
		return nil, err
	}

	return &SearchOrchestrator{
		pgvectorURL:      os.Getenv("PGVECTOR_URL"),
		elasticsearchURL: os.Getenv("ELASTICSEARCH_URL"),
		rerankerURL:      os.Getenv("RERANKER_URL"),
		autoencoderURL:   os.Getenv("AUTOENCODER_URL"),
		neo4jURL:         os.Getenv("NEO4J_URL"),
		pgPool:           pool,
	}, nil
}

// PGVectorResult - result from pgvector
type PGVectorResult struct {
	ChunkID    string  `json:"chunk_id"`
	DocumentID string  `json:"document_id"`
	CaseID     string  `json:"case_id"`
	Title      string  `json:"title"`
	Chunk      string  `json:"chunk"`
	Similarity float32 `json:"similarity"`
}

// ElasticsearchResult - result from Elasticsearch
type ElasticsearchResult struct {
	ChunkID    string  `json:"chunk_id"`
	DocumentID string  `json:"document_id"`
	CaseID     string  `json:"case_id"`
	Title      string  `json:"title"`
	Chunk      string  `json:"chunk"`
	Score      float32 `json:"score"`
}

// RerankerResult - result from MiniLM reranker
type RerankerResult struct {
	Document string  `json:"document"`
	Score    float32 `json:"score"`
	Rank     int     `json:"rank"`
}

// Search - execute agentic search
func (so *SearchOrchestrator) Search(ctx context.Context, req SearchRequest) ([]SearchResult, error) {
	startTime := time.Now()

	// Phase 1: Parallel semantic + keyword search
	semanticChan := make(chan []PGVectorResult, 1)
	keywordChan := make(chan []ElasticsearchResult, 1)
	errChan := make(chan error, 2)

	go func() {
		results, err := so.semanticSearch(ctx, req.Embedding, 50)
		if err != nil {
			errChan <- err
		} else {
			semanticChan <- results
		}
	}()

	go func() {
		results, err := so.keywordSearch(ctx, req.Query, 50)
		if err != nil {
			errChan <- err
		} else {
			keywordChan <- results
		}
	}()

	// Collect results
	var semanticResults []PGVectorResult
	var keywordResults []ElasticsearchResult

	for i := 0; i < 2; i++ {
		select {
		case err := <-errChan:
			log.Printf("Search error: %v", err)
		case sr := <-semanticChan:
			semanticResults = sr
		case kr := <-keywordChan:
			keywordResults = kr
		}
	}

	// Phase 2: Merge and deduplicate
	merged := so.mergeResults(semanticResults, keywordResults)

	// Phase 3: Rerank with MiniLM
	reranked, err := so.rerank(ctx, req.Query, merged, req.TopK)
	if err != nil {
		log.Printf("Reranking error: %v", err)
		// Fallback: return top-k without reranking
		reranked = merged[:req.TopK]
	}

	// Phase 4: Fetch authority scores from Neo4j
	for i := range reranked {
		authority, err := so.getAuthorityScore(ctx, reranked[i].CaseID)
		if err == nil {
			reranked[i].AuthorityScore = authority
		}
	}

	// Phase 5: Calculate final scores
	for i := range reranked {
		reranked[i].FinalScore = so.calculateFinalScore(reranked[i])
	}

	// Sort by final score
	sort.Slice(reranked, func(i, j int) bool {
		return reranked[i].FinalScore > reranked[j].FinalScore
	})

	elapsed := time.Since(startTime)
	log.Printf("Search completed in %v", elapsed)

	return reranked, nil
}

// semanticSearch - query pgvector
func (so *SearchOrchestrator) semanticSearch(ctx context.Context, embedding []float32, limit int) ([]PGVectorResult, error) {
	// Call pgvector service
	// For now, return empty - would call HTTP endpoint
	return []PGVectorResult{}, nil
}

// keywordSearch - query Elasticsearch
func (so *SearchOrchestrator) keywordSearch(ctx context.Context, query string, limit int) ([]ElasticsearchResult, error) {
	// Call Elasticsearch service
	// For now, return empty - would call HTTP endpoint
	return []ElasticsearchResult{}, nil
}

// mergeResults - combine semantic + keyword results
func (so *SearchOrchestrator) mergeResults(semantic []PGVectorResult, keyword []ElasticsearchResult) []SearchResult {
	seen := make(map[string]bool)
	var merged []SearchResult

	// Add semantic results first
	for _, s := range semantic {
		if !seen[s.Chunk] {
			merged = append(merged, SearchResult{
				ChunkID:        s.ChunkID,
				DocumentID:     s.DocumentID,
				CaseID:         s.CaseID,
				Title:          s.Title,
				Chunk:          s.Chunk,
				SemanticScore:  s.Similarity,
			})
			seen[s.Chunk] = true
		}
	}

	// Add keyword results
	for _, k := range keyword {
		if !seen[k.Chunk] {
			merged = append(merged, SearchResult{
				ChunkID:       k.ChunkID,
				DocumentID:    k.DocumentID,
				CaseID:        k.CaseID,
				Title:         k.Title,
				Chunk:         k.Chunk,
				KeywordScore:  k.Score,
			})
			seen[k.Chunk] = true
		}
	}

	return merged
}

// rerank - call MiniLM reranker
func (so *SearchOrchestrator) rerank(ctx context.Context, query string, results []SearchResult, topK int) ([]SearchResult, error) {
	// Extract chunks for reranking
	chunks := make([]string, len(results))
	for i, r := range results {
		chunks[i] = r.Chunk
	}

	// Call reranker service
	reqBody := map[string]interface{}{
		"query":     query,
		"documents": chunks,
		"top_k":     topK,
	}

	body, _ := json.Marshal(reqBody)
	resp, err := http.Post(
		so.rerankerURL+"/rerank",
		"application/json",
		nil, // would use body
	)
	if err != nil {
		return results[:topK], err
	}
	defer resp.Body.Close()

	var rerankerResp struct {
		Results []RerankerResult `json:"results"`
	}
	json.NewDecoder(resp.Body).Decode(&rerankerResp)

	// Map reranker scores back to results
	scoreMap := make(map[string]float32)
	for _, r := range rerankerResp.Results {
		scoreMap[r.Document] = r.Score
	}

	for i := range results {
		if score, ok := scoreMap[results[i].Chunk]; ok {
			results[i].RerankScore = score
		}
	}

	return results[:topK], nil
}

// getAuthorityScore - fetch from Neo4j
func (so *SearchOrchestrator) getAuthorityScore(ctx context.Context, caseID string) (float32, error) {
	// Query Neo4j for PageRank authority score
	// For now, return default
	return 0.5, nil
}

// calculateFinalScore - weighted combination
func (so *SearchOrchestrator) calculateFinalScore(result SearchResult) float32 {
	// Weights: semantic (0.3) + keyword (0.2) + rerank (0.4) + authority (0.1)
	return (result.SemanticScore * 0.3) +
		(result.KeywordScore * 0.2) +
		(result.RerankScore * 0.4) +
		(result.AuthorityScore * 0.1)
}

// HTTP Handlers
func (so *SearchOrchestrator) handleSearch(w http.ResponseWriter, r *http.Request) {
	var req SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if req.TopK == 0 {
		req.TopK = 7
	}

	results, err := so.Search(r.Context(), req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func (so *SearchOrchestrator) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
}

func main() {
	pgConnStr := os.Getenv("DATABASE_URL")
	if pgConnStr == "" {
		pgConnStr = "postgres://legal_admin:123456@localhost:5432/legal_ai_db?sslmode=disable"
	}

	orchestrator, err := NewSearchOrchestrator(pgConnStr)
	if err != nil {
		log.Fatalf("Failed to create orchestrator: %v", err)
	}

	http.HandleFunc("/search", orchestrator.handleSearch)
	http.HandleFunc("/health", orchestrator.handleHealth)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Search gateway listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
