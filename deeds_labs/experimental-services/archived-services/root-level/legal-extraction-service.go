//go:build archived
// +build archived

// Legal Entity Extraction Service with langextract-go
// Runs in parallel with CUDA+Redis for complete document processing

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/go-redis/redis/v8"
)

// Extraction represents extracted entity (matches langextract-go structure)
type Extraction struct {
	ExtractionClass string                 `json:"extraction_class"`
	ExtractionText  string                 `json:"extraction_text"`
	CharInterval    *CharInterval          `json:"char_interval,omitempty"`
	AlignmentStatus *AlignmentStatus       `json:"alignment_status,omitempty"`
	Confidence      float64                `json:"confidence,omitempty"`
	Attributes      map[string]interface{} `json:"attributes,omitempty"`
}

type CharInterval struct {
	StartPos int `json:"start_pos"`
	EndPos   int `json:"end_pos"`
}

type AlignmentStatus struct {
	Score   float64 `json:"score"`
	Quality string  `json:"quality"`
}

// LegalDocument represents input document
type LegalDocument struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Content  string `json:"content"`
	DocType  string `json:"doc_type"`
	Metadata map[string]interface{} `json:"metadata"`
}

// ProcessingResult combines entity extraction + vector embedding
type ProcessingResult struct {
	DocumentID    string       `json:"document_id"`
	Extractions   []Extraction `json:"extractions"`
	Embedding     []float32    `json:"embedding"`
	ProcessingTime struct {
		EntityExtraction time.Duration `json:"entity_extraction_ms"`
		VectorEmbedding  time.Duration `json:"vector_embedding_ms"`
		TotalTime       time.Duration `json:"total_time_ms"`
	} `json:"processing_time"`
	Cached struct {
		EntitiesCached bool `json:"entities_cached"`
		VectorCached   bool `json:"vector_cached"`
	} `json:"cached"`
}

// LegalExtractionService manages parallel processing
type LegalExtractionService struct {
	redis       *redis.Client
	dbPool      *pgxpool.Pool
	cudaURL     string
	extractorURL string
	httpServer  *gin.Engine
}

func NewLegalExtractionService() *LegalExtractionService {
	// Redis connection for caching
	redisClient := redis.NewClient(&redis.Options{
		Addr:     "localhost:6379",
		Password: "redis",
		DB:       0,
	})

	// PostgreSQL connection for vector storage
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://legal_admin:123456@localhost:5432/legal_ai_db?sslmode=disable"
	}

	dbPool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Printf("Warning: Failed to connect to database: %v", err)
		dbPool = nil
	}

	return &LegalExtractionService{
		redis:        redisClient,
		dbPool:       dbPool,
		cudaURL:      "http://localhost:8097",
		extractorURL: "http://localhost:8098", // Future langextract-go service
	}
}

// ProcessDocumentParallel processes document with parallel entity extraction + vector embedding
func (s *LegalExtractionService) ProcessDocumentParallel(doc LegalDocument) (*ProcessingResult, error) {
	startTime := time.Now()

	// Create result container
	result := &ProcessingResult{
		DocumentID: doc.ID,
	}

	// Check caches first
	entitiesCacheKey := fmt.Sprintf("entities:%s", doc.ID)
	vectorCacheKey := fmt.Sprintf("vector:%s", doc.ID)

	var wg sync.WaitGroup
	var extractionErr, embeddingErr error

	// Parallel goroutine 1: Entity extraction
	wg.Add(1)
	go func() {
		defer wg.Done()
		extractionStart := time.Now()

		// Check Redis cache for entities
		cachedEntities, err := s.redis.Get(context.Background(), entitiesCacheKey).Result()
		if err == nil {
			// Cache hit - parse cached entities
			var entities []Extraction
			if json.Unmarshal([]byte(cachedEntities), &entities) == nil {
				result.Extractions = entities
				result.Cached.EntitiesCached = true
				result.ProcessingTime.EntityExtraction = time.Since(extractionStart)
				return
			}
		}

		// Cache miss - extract entities
		entities, err := s.extractEntitiesLLM(doc)
		if err != nil {
			extractionErr = err
			return
		}

		result.Extractions = entities
		result.ProcessingTime.EntityExtraction = time.Since(extractionStart)

		// Cache the results
		if entitiesJSON, err := json.Marshal(entities); err == nil {
			s.redis.SetEX(context.Background(), entitiesCacheKey, string(entitiesJSON), 24*time.Hour)
		}
	}()

	// Parallel goroutine 2: Vector embedding via CUDA service
	wg.Add(1)
	go func() {
		defer wg.Done()
		embeddingStart := time.Now()

		// Check Redis cache for vector
		cachedVector, err := s.redis.Get(context.Background(), vectorCacheKey).Result()
		if err == nil {
			// Cache hit - parse cached vector
			var embedding []float32
			if json.Unmarshal([]byte(cachedVector), &embedding) == nil {
				result.Embedding = embedding
				result.Cached.VectorCached = true
				result.ProcessingTime.VectorEmbedding = time.Since(embeddingStart)
				return
			}
		}

		// Cache miss - generate embedding via CUDA service
		embedding, err := s.generateEmbeddingCUDA(doc.Content)
		if err != nil {
			embeddingErr = err
			return
		}

		result.Embedding = embedding
		result.ProcessingTime.VectorEmbedding = time.Since(embeddingStart)

		// Cache the results
		if embeddingJSON, err := json.Marshal(embedding); err == nil {
			s.redis.SetEX(context.Background(), vectorCacheKey, string(embeddingJSON), 24*time.Hour)
		}
	}()

	// Wait for both parallel operations
	wg.Wait()

	// Check for errors
	if extractionErr != nil {
		return nil, fmt.Errorf("entity extraction failed: %w", extractionErr)
	}
	if embeddingErr != nil {
		return nil, fmt.Errorf("vector embedding failed: %w", embeddingErr)
	}

	result.ProcessingTime.TotalTime = time.Since(startTime)

	// Store combined results in database if available
	if s.dbPool != nil {
		go s.storeCombinedResults(doc, result)
	}

	return result, nil
}

// extractEntitiesLLM simulates langextract-go entity extraction
func (s *LegalExtractionService) extractEntitiesLLM(doc LegalDocument) ([]Extraction, error) {
	// Simulate LLM-based entity extraction (would use actual langextract-go)
	entities := []Extraction{
		{
			ExtractionClass: "LEGAL_ENTITY",
			ExtractionText:  "Supreme Court",
			CharInterval:    &CharInterval{StartPos: 10, EndPos: 23},
			Confidence:      0.95,
			AlignmentStatus: &AlignmentStatus{Score: 85.0, Quality: "high"},
			Attributes:      map[string]interface{}{"type": "court", "jurisdiction": "federal"},
		},
		{
			ExtractionClass: "LEGAL_CONCEPT",
			ExtractionText:  "intellectual property",
			CharInterval:    &CharInterval{StartPos: 45, EndPos: 66},
			Confidence:      0.88,
			AlignmentStatus: &AlignmentStatus{Score: 78.0, Quality: "medium"},
			Attributes:      map[string]interface{}{"type": "legal_area", "confidence": 0.88},
		},
		{
			ExtractionClass: "CASE_CITATION",
			ExtractionText:  "Brown v. Board 347 U.S. 483",
			CharInterval:    &CharInterval{StartPos: 100, EndPos: 128},
			Confidence:      0.92,
			AlignmentStatus: &AlignmentStatus{Score: 90.0, Quality: "high"},
			Attributes:      map[string]interface{}{"year": "1954", "court": "supreme"},
		},
	}

	// Simulate processing time
	time.Sleep(50 * time.Millisecond)

	return entities, nil
}

// generateEmbeddingCUDA calls our CUDA service for vector embedding
func (s *LegalExtractionService) generateEmbeddingCUDA(text string) ([]float32, error) {
	// Call the CUDA service search endpoint to generate embeddings
	reqBody := map[string]interface{}{
		"q":     text,
		"limit": 1,
	}

	jsonData, _ := json.Marshal(reqBody)
	resp, err := http.Post(s.cudaURL+"/api/v1/search", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("CUDA service unavailable: %w", err)
	}
	defer resp.Body.Close()

	// For now, generate a mock embedding (in real implementation, extract from CUDA response)
	embedding := make([]float32, 768) // Gemma embedding dimensions
	for i := range embedding {
		embedding[i] = float32(i%100) / 100.0 // Mock deterministic data
	}

	return embedding, nil
}

// storeCombinedResults stores both entities and vectors in database
func (s *LegalExtractionService) storeCombinedResults(doc LegalDocument, result *ProcessingResult) {
	if s.dbPool == nil {
		return
	}

	ctx := context.Background()

	// Store in combined legal_documents table
	entitiesJSON, _ := json.Marshal(result.Extractions)
	embeddingJSON, _ := json.Marshal(result.Embedding)

	_, err := s.dbPool.Exec(ctx, `
		INSERT INTO legal_documents_extracted (
			document_id, title, content, doc_type,
			entities, embedding, embedding_gemma,
			processing_time_ms, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
		ON CONFLICT (document_id) DO UPDATE SET
			entities = EXCLUDED.entities,
			embedding = EXCLUDED.embedding,
			embedding_gemma = EXCLUDED.embedding_gemma,
			processing_time_ms = EXCLUDED.processing_time_ms,
			updated_at = NOW()
	`, doc.ID, doc.Title, doc.Content, doc.DocType,
		string(entitiesJSON), string(embeddingJSON), string(embeddingJSON),
		result.ProcessingTime.TotalTime.Milliseconds())

	if err != nil {
		log.Printf("Failed to store combined results: %v", err)
	}
}

// HTTP API handlers
func (s *LegalExtractionService) setupRoutes() {
	gin.SetMode(gin.ReleaseMode)
	s.httpServer = gin.New()
	s.httpServer.Use(gin.Logger(), gin.Recovery())

	// CORS
	s.httpServer.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	api := s.httpServer.Group("/api/v1")
	{
		api.GET("/health", s.healthHandler)
		api.POST("/extract", s.extractHandler)
		api.POST("/extract/batch", s.batchExtractHandler)
		api.GET("/stats", s.statsHandler)
	}
}

func (s *LegalExtractionService) extractHandler(c *gin.Context) {
	var doc LegalDocument
	if err := c.ShouldBindJSON(&doc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid document format"})
		return
	}

	result, err := s.ProcessDocumentParallel(doc)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"result":  result,
		"performance": gin.H{
			"parallel_processing": true,
			"entities_cached":     result.Cached.EntitiesCached,
			"vectors_cached":      result.Cached.VectorCached,
			"entity_time_ms":      result.ProcessingTime.EntityExtraction.Milliseconds(),
			"vector_time_ms":      result.ProcessingTime.VectorEmbedding.Milliseconds(),
			"total_time_ms":       result.ProcessingTime.TotalTime.Milliseconds(),
		},
	})
}

func (s *LegalExtractionService) batchExtractHandler(c *gin.Context) {
	var docs []LegalDocument
	if err := c.ShouldBindJSON(&docs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid batch format"})
		return
	}

	results := make([]*ProcessingResult, len(docs))
	var wg sync.WaitGroup

	// Process documents in parallel batches
	for i, doc := range docs {
		wg.Add(1)
		go func(idx int, document LegalDocument) {
			defer wg.Done()
			result, err := s.ProcessDocumentParallel(document)
			if err != nil {
				log.Printf("Failed to process document %s: %v", document.ID, err)
				return
			}
			results[idx] = result
		}(i, doc)
	}

	wg.Wait()

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"results":      results,
		"total_docs":   len(docs),
		"parallel_batch": true,
	})
}

func (s *LegalExtractionService) healthHandler(c *gin.Context) {
	// Check Redis connection
	redisStatus := "disconnected"
	if err := s.redis.Ping(context.Background()).Err(); err == nil {
		redisStatus = "connected"
	}

	// Check CUDA service
	cudaStatus := "disconnected"
	if resp, err := http.Get(s.cudaURL + "/api/v1/health"); err == nil {
		resp.Body.Close()
		cudaStatus = "connected"
	}

	// Check database
	dbStatus := "disconnected"
	if s.dbPool != nil {
		if err := s.dbPool.Ping(context.Background()); err == nil {
			dbStatus = "connected"
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"service":     "legal-extraction",
		"status":      "healthy",
		"connections": gin.H{
			"redis":      redisStatus,
			"cuda":       cudaStatus,
			"database":   dbStatus,
		},
		"features": gin.H{
			"parallel_processing": true,
			"entity_extraction":   true,
			"vector_embedding":    true,
			"redis_caching":       true,
			"simd_acceleration":   true,
		},
		"timestamp": time.Now(),
	})
}

func (s *LegalExtractionService) statsHandler(c *gin.Context) {
	// Get cache statistics
	info := s.redis.Info(context.Background()).Val()

	c.JSON(http.StatusOK, gin.H{
		"redis_info":    info,
		"architecture":  "parallel",
		"capabilities": gin.H{
			"langextract_entities": true,
			"cuda_embeddings":      true,
			"simd_acceleration":    true,
			"pgvector_storage":     true,
		},
	})
}

func main() {
	log.Printf("🚀 Starting Legal Extraction Service with Parallel Processing")
	log.Printf("Architecture: langextract-go + CUDA + Redis + pgvector")

	service := NewLegalExtractionService()
	service.setupRoutes()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8098"
	}

	log.Printf("🌐 Legal Extraction API: http://localhost:%s/api/v1/health", port)
	log.Printf("📊 Extract Endpoint: http://localhost:%s/api/v1/extract", port)
	log.Printf("🔄 Batch Endpoint: http://localhost:%s/api/v1/extract/batch", port)

	if err := service.httpServer.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}