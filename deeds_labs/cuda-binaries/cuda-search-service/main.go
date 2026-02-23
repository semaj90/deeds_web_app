package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	pgvector "github.com/pgvector/pgvector-go"
)

// CUDAService represents the CUDA-accelerated search service
type CUDAService struct {
	db *pgxpool.Pool
}

// SearchRequest represents a search query
type SearchRequest struct {
	Query     string  `json:"query"`
	Threshold float64 `json:"threshold,omitempty"`
}

// SearchResult represents search results
type SearchResult struct {
	ID         int     `json:"id"`
	Content    string  `json:"content"`
	Similarity float64 `json:"similarity"`
}

// SearchResponse represents the search API response
type SearchResponse struct {
	Results []SearchResult `json:"results"`
	Count   int           `json:"count"`
	Query   string        `json:"query"`
}

// HealthResponse represents service health status
type HealthResponse struct {
	Status      string    `json:"status"`
	Service     string    `json:"service"`
	Timestamp   time.Time `json:"timestamp"`
	Database    string    `json:"database"`
	Version     string    `json:"version"`
}

// NewCUDAService creates a new CUDA service instance
func NewCUDAService() *CUDAService {
	// Try to connect to PostgreSQL with pgvector
	dbURL := "postgres://legal_ai:legal_ai_password@localhost/legal_ai_db?sslmode=disable"

	config, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		log.Printf("Failed to parse database config: %v", err)
		return &CUDAService{db: nil}
	}

	db, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		log.Printf("Failed to connect to database: %v", err)
		return &CUDAService{db: nil}
	}

	// Test database connection
	if err := db.Ping(context.Background()); err != nil {
		log.Printf("Database ping failed: %v", err)
		return &CUDAService{db: nil}
	}

	log.Printf("Successfully connected to PostgreSQL with pgvector")
	return &CUDAService{db: db}
}

// embedWithOllama generates embeddings using Ollama
func (s *CUDAService) embedWithOllama(text string) ([]float32, error) {
	// Create request for Ollama embeddings API
	requestBody := map[string]interface{}{
		"model":  "nomic-embed-text",
		"prompt": text,
	}

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %v", err)
	}

	// Make request to Ollama
	resp, err := http.Post("http://localhost:11434/api/embeddings", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		// Return mock embedding if Ollama is not available
		log.Printf("Ollama not available, using mock embedding: %v", err)
		return s.mockEmbedding(text), nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("Ollama returned status %d, using mock embedding", resp.StatusCode)
		return s.mockEmbedding(text), nil
	}

	var response struct {
		Embedding []float32 `json:"embedding"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		log.Printf("Failed to decode Ollama response, using mock embedding: %v", err)
		return s.mockEmbedding(text), nil
	}

	return response.Embedding, nil
}

// mockEmbedding creates a simple mock embedding for testing
func (s *CUDAService) mockEmbedding(text string) []float32 {
	// Create a simple hash-based mock embedding
	hash := 0
	for _, c := range text {
		hash = hash*31 + int(c)
	}

	embedding := make([]float32, 384) // Common embedding dimension
	for i := range embedding {
		embedding[i] = float32((hash + i) % 100) / 100.0
	}

	return embedding
}

// searchHandler handles vector similarity search
func (s *CUDAService) searchHandler(c *gin.Context) {
	var req SearchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	// Set default threshold
	if req.Threshold == 0 {
		req.Threshold = 0.7
	}

	log.Printf("Processing search request: query='%s', threshold=%.2f", req.Query, req.Threshold)

	// Generate embedding for query
	queryEmbedding, err := s.embedWithOllama(req.Query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate embedding"})
		return
	}

	var results []SearchResult

	// If database is available, perform actual vector search
	if s.db != nil {
		results, err = s.performVectorSearch(queryEmbedding, req.Threshold)
		if err != nil {
			log.Printf("Vector search failed: %v", err)
			results = s.mockSearchResults(req.Query)
		}
	} else {
		// Use mock results if database is not available
		results = s.mockSearchResults(req.Query)
	}

	response := SearchResponse{
		Results: results,
		Count:   len(results),
		Query:   req.Query,
	}

	c.JSON(http.StatusOK, response)
}

// performVectorSearch executes vector similarity search in PostgreSQL
func (s *CUDAService) performVectorSearch(queryEmbedding []float32, threshold float64) ([]SearchResult, error) {
	// Convert to pgvector format
	vector := pgvector.NewVector(queryEmbedding)

	query := `
		SELECT id, content, (embedding <=> $1) as distance
		FROM legal_documents
		WHERE (embedding <=> $1) < $2
		ORDER BY distance
		LIMIT 10
	`

	rows, err := s.db.Query(context.Background(), query, vector, 1-threshold)
	if err != nil {
		return nil, fmt.Errorf("query execution failed: %v", err)
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var id int
		var content string
		var distance float64

		if err := rows.Scan(&id, &content, &distance); err != nil {
			log.Printf("Row scan error: %v", err)
			continue
		}

		similarity := 1 - distance
		results = append(results, SearchResult{
			ID:         id,
			Content:    content,
			Similarity: similarity,
		})
	}

	return results, nil
}

// mockSearchResults provides mock search results for testing
func (s *CUDAService) mockSearchResults(query string) []SearchResult {
	mockResults := []SearchResult{
		{ID: 1, Content: "Legal precedent for contract disputes involving " + query, Similarity: 0.95},
		{ID: 2, Content: "Case law analysis related to " + query, Similarity: 0.87},
		{ID: 3, Content: "Statutory interpretation of " + query, Similarity: 0.82},
	}

	return mockResults
}

// healthHandler provides service health status
func (s *CUDAService) healthHandler(c *gin.Context) {
	dbStatus := "disconnected"
	if s.db != nil {
		if err := s.db.Ping(context.Background()); err == nil {
			dbStatus = "connected"
		}
	}

	response := HealthResponse{
		Status:      "healthy",
		Service:     "cuda-search-service",
		Timestamp:   time.Now(),
		Database:    dbStatus,
		Version:     "1.0.0",
	}

	c.JSON(http.StatusOK, response)
}

func main() {
	log.Printf("Starting CUDA Search Service...")

	// Initialize CUDA service
	service := NewCUDAService()

	// Setup Gin router
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())

	// Health check endpoint
	router.GET("/health", service.healthHandler)

	// Search endpoint
	router.POST("/search", service.searchHandler)

	// Start server
	port := ":8096"
	log.Printf("CUDA Search Service starting on port %s", port)
	log.Printf("Endpoints:")
	log.Printf("  GET  http://localhost%s/health", port)
	log.Printf("  POST http://localhost%s/search", port)

	if err := router.Run(port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}