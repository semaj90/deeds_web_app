/**
 * Glyph Execution Engine - Go Microservice
 * Revolutionary Visual AI Programming Language for Legal Applications
 * 
 * Combines: Redis Cache + PostgreSQL pgvector + MinIO + Neural Sprite + gRPC
 */

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Core Glyph Execution Engine
type GlyphExecutionEngine struct {
	RedisClient      *redis.Client
	PostgresPool     *pgxpool.Pool
	MinIOClient      *minio.Client
	TensorCache      *TensorCacheManager
	HistoryTracker   *ComputationHistoryTracker
	GlyphGenerator   *GlyphGenerator
	AIReader         *AIReader
	ExecutionRuntime *ExecutionRuntime
	AsyncWorker      *AsyncGlyphWorker
	NeuralSprite     *NeuralSpriteProcessor
}

// Glyph represents a visual program
type Glyph struct {
	ID               string                 `json:"id"`
	Visual           []byte                 `json:"visual"`           // PNG/SVG data
	Metadata         GlyphMetadata         `json:"metadata"`
	CompressedData   []byte                `json:"compressed_data"`   // Neural Sprite compressed
	Instructions     []Instruction         `json:"instructions"`      // Compiled instructions
	PredictiveFrames [][]byte              `json:"predictive_frames"` // Animation frames
}

// Glyph metadata for legal applications
type GlyphMetadata struct {
	Version         uint32                 `json:"version"`
	LegalContext    LegalContext          `json:"legal_context"`
	ProcessingChain []ProcessingStep      `json:"processing_chain"`
	NeuralSprite    NeuralSpriteData      `json:"neural_sprite"`
	Embeddings      []float32             `json:"embeddings"`        // pgvector
	Timestamp       time.Time             `json:"timestamp"`
	UserID          string                `json:"user_id"`
}

// Legal context for evidence and case management
type LegalContext struct {
	EvidenceID      int64    `json:"evidence_id"`
	CaseID          string   `json:"case_id"`
	PracticeArea    string   `json:"practice_area"`
	DocumentType    string   `json:"document_type"`
	RiskAssessment  string   `json:"risk_assessment"`
	Classification  string   `json:"classification"`
	Tags            []string `json:"tags"`
}

// Neural Sprite compression data
type NeuralSpriteData struct {
	CompressionRatio    float64   `json:"compression_ratio"`
	OriginalSize        int64     `json:"original_size"`
	CompressedSize      int64     `json:"compressed_size"`
	PredictiveFrames    int       `json:"predictive_frames"`
	UILayoutCompressed  bool      `json:"ui_layout_compressed"`
	ProcessingTimeMs    int64     `json:"processing_time_ms"`
}

// Executable instruction for glyph runtime
type Instruction struct {
	OpCode    uint8     `json:"op_code"`    // TENSOR_ADD, MATRIX_MUL, etc.
	Args      []float32 `json:"args"`
	Indices   []int     `json:"indices"`
	Metadata  map[string]interface{} `json:"metadata"`
}

// Processing step for audit trail
type ProcessingStep struct {
	Step        string                 `json:"step"`
	Timestamp   time.Time             `json:"timestamp"`
	Duration    time.Duration         `json:"duration"`
	Input       map[string]interface{} `json:"input"`
	Output      map[string]interface{} `json:"output"`
	Error       string                `json:"error,omitempty"`
}

// Request/Response types
type GenerateGlyphRequest struct {
	EvidenceID    int64                  `json:"evidence_id"`
	Prompt        string                 `json:"prompt"`
	Style         string                 `json:"style"`
	Dimensions    [2]int                 `json:"dimensions"`
	NeuralConfig  *NeuralSpriteConfig    `json:"neural_sprite_config,omitempty"`
	UserID        string                 `json:"user_id"`
}

type NeuralSpriteConfig struct {
	EnableCompression      bool    `json:"enable_compression"`
	PredictiveFrames       int     `json:"predictive_frames"`
	UILayoutCompression    bool    `json:"ui_layout_compression"`
	TargetCompressionRatio float64 `json:"target_compression_ratio"`
}

type ExecuteGlyphRequest struct {
	GlyphID     string                 `json:"glyph_id"`
	Inputs      []map[string]interface{} `json:"inputs"`
	UserID      string                 `json:"user_id"`
}

type GlyphResponse struct {
	Success  bool      `json:"success"`
	Data     *Glyph    `json:"data,omitempty"`
	Error    string    `json:"error,omitempty"`
	Timing   TimingInfo `json:"timing"`
}

type ExecutionResult struct {
	Result     map[string]interface{} `json:"result"`
	Timing     TimingInfo            `json:"timing"`
	CacheHits  int                   `json:"cache_hits"`
	Artifacts  []string              `json:"artifacts"`
}

type TimingInfo struct {
	TotalMs         int64 `json:"total_ms"`
	CacheLookupMs   int64 `json:"cache_lookup_ms"`
	GenerationMs    int64 `json:"generation_ms"`
	CompressionMs   int64 `json:"compression_ms"`
	StorageMs       int64 `json:"storage_ms"`
}

func main() {
	// Initialize services
	engine, err := NewGlyphExecutionEngine()
	if err != nil {
		log.Fatalf("Failed to initialize Glyph Execution Engine: %v", err)
	}
	defer engine.Close()

	// Setup Gin router
	r := gin.Default()
	setupRoutes(r, engine)

	// Start server with graceful shutdown
	srv := &http.Server{
		Addr:    ":8095",
		Handler: r,
	}

	go func() {
		log.Println("🚀 Glyph Execution Engine starting on :8095")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt)
	<-quit

	log.Println("🛑 Shutting down Glyph Execution Engine...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced shutdown: %v", err)
	}

	log.Println("✅ Glyph Execution Engine stopped")
}

// Initialize the Glyph Execution Engine with all dependencies
func NewGlyphExecutionEngine() (*GlyphExecutionEngine, error) {
	// Initialize Redis client
	redisClient := redis.NewClient(&redis.Options{
		Addr:     getEnv("REDIS_ADDR", "localhost:4005"),
		Password: getEnv("REDIS_PASSWORD", ""),
		DB:       0,
	})

	// Test Redis connection
	ctx := context.Background()
	if _, err := redisClient.Ping(ctx).Result(); err != nil {
		return nil, fmt.Errorf("redis connection failed: %w", err)
	}

	// Initialize PostgreSQL connection pool
	postgresURL := getEnv("POSTGRES_URL", "postgresql://postgres:123456@localhost:5432/legal_ai_db")
	postgresPool, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		return nil, fmt.Errorf("postgres connection failed: %w", err)
	}

	// Initialize MinIO client
	minioClient, err := minio.New(getEnv("MINIO_ENDPOINT", "localhost:4002"), &minio.Options{
		Creds:  credentials.NewStaticV4(getEnv("MINIO_ACCESS_KEY", "minioadmin"), getEnv("MINIO_SECRET_KEY", "minioadmin"), ""),
		Secure: false,
	})
	if err != nil {
		return nil, fmt.Errorf("minio client failed: %w", err)
	}

	// Initialize core components
	tensorCache := NewTensorCacheManager(redisClient, postgresPool)
	historyTracker := NewComputationHistoryTracker(postgresPool)
	glyphGenerator := NewGlyphGenerator(redisClient, tensorCache)
	aiReader := NewAIReader()
	executionRuntime := NewExecutionRuntime(redisClient, tensorCache)
	neuralSprite := NewNeuralSpriteProcessor()
	
	asyncWorker := NewAsyncGlyphWorker(
		redisClient, glyphGenerator, aiReader,
		executionRuntime, tensorCache, historyTracker,
	)

	engine := &GlyphExecutionEngine{
		RedisClient:      redisClient,
		PostgresPool:     postgresPool,
		MinIOClient:      minioClient,
		TensorCache:      tensorCache,
		HistoryTracker:   historyTracker,
		GlyphGenerator:   glyphGenerator,
		AIReader:         aiReader,
		ExecutionRuntime: executionRuntime,
		AsyncWorker:      asyncWorker,
		NeuralSprite:     neuralSprite,
	}

	// Initialize database schema
	if err := engine.initializeSchema(); err != nil {
		return nil, fmt.Errorf("schema initialization failed: %w", err)
	}
	
	// Start async worker
	if err := asyncWorker.Start(ctx); err != nil {
		return nil, fmt.Errorf("failed to start async worker: %w", err)
	}

	log.Println("✅ Glyph Execution Engine initialized successfully")
	return engine, nil
}

// Setup HTTP routes
func setupRoutes(r *gin.Engine, engine *GlyphExecutionEngine) {
	// Enable CORS for SvelteKit frontend
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		
		c.Next()
	})

	// Health check
	r.GET("/health", func(c *gin.Context) {
		status := engine.HealthCheck()
		c.JSON(200, status)
	})

	// API routes
	api := r.Group("/api/v1")
	{
		// Glyph generation
		api.POST("/glyph/generate", engine.HandleGenerateGlyph)
		
		// Glyph execution
		api.POST("/glyph/execute", engine.HandleExecuteGlyph)
		
		// Glyph retrieval
		api.GET("/glyph/:id", engine.HandleGetGlyph)
		
		// Search glyphs
		api.GET("/glyph/search", engine.HandleSearchGlyphs)
		
		// Cache management
		api.DELETE("/cache/clear", engine.HandleClearCache)
		api.GET("/cache/stats", engine.HandleCacheStats)
		
		// Neural Sprite operations
		api.POST("/neural/compress", engine.HandleNeuralCompress)
		api.POST("/neural/decompress", engine.HandleNeuralDecompress)
	}
}

// Initialize database schema for glyph metadata
func (e *GlyphExecutionEngine) initializeSchema() error {
	ctx := context.Background()
	
	// Create glyphs table with JSONB and vector support
	query := `
		CREATE TABLE IF NOT EXISTS glyphs (
			id VARCHAR PRIMARY KEY,
			user_id VARCHAR NOT NULL,
			legal_context JSONB NOT NULL,
			metadata JSONB NOT NULL,
			embeddings vector(768),
			compressed_data BYTEA,
			artifact_url VARCHAR,
			created_at TIMESTAMP DEFAULT NOW(),
			updated_at TIMESTAMP DEFAULT NOW()
		);
		
		CREATE INDEX IF NOT EXISTS idx_glyphs_legal_context ON glyphs USING gin(legal_context);
		CREATE INDEX IF NOT EXISTS idx_glyphs_metadata ON glyphs USING gin(metadata);
		CREATE INDEX IF NOT EXISTS idx_glyphs_embeddings ON glyphs USING ivfflat (embeddings vector_cosine_ops);
		CREATE INDEX IF NOT EXISTS idx_glyphs_user_id ON glyphs (user_id);
		CREATE INDEX IF NOT EXISTS idx_glyphs_created_at ON glyphs (created_at);
	`
	
	_, err := e.PostgresPool.Exec(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to initialize schema: %w", err)
	}
	
	log.Println("📊 Database schema initialized successfully")
	return nil
}

// Close all connections
func (e *GlyphExecutionEngine) Close() {
	if e.RedisClient != nil {
		e.RedisClient.Close()
	}
	if e.PostgresPool != nil {
		e.PostgresPool.Close()
	}
}

// Health check for all services
func (e *GlyphExecutionEngine) HealthCheck() map[string]interface{} {
	ctx := context.Background()
	status := map[string]interface{}{
		"timestamp": time.Now(),
		"services":  map[string]string{},
	}

	// Check Redis
	if _, err := e.RedisClient.Ping(ctx).Result(); err != nil {
		status["services"].(map[string]string)["redis"] = "down"
	} else {
		status["services"].(map[string]string)["redis"] = "up"
	}

	// Check PostgreSQL
	if err := e.PostgresPool.Ping(ctx); err != nil {
		status["services"].(map[string]string)["postgresql"] = "down"
	} else {
		status["services"].(map[string]string)["postgresql"] = "up"
	}

	// Check MinIO
	if _, err := e.MinIOClient.ListBuckets(ctx); err != nil {
		status["services"].(map[string]string)["minio"] = "down"
	} else {
		status["services"].(map[string]string)["minio"] = "up"
	}

	return status
}

// HTTP Handlers

// HandleGenerateGlyph handles glyph generation requests
func (e *GlyphExecutionEngine) HandleGenerateGlyph(c *gin.Context) {
	var req GenerateGlyphRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request format", "details": err.Error()})
		return
	}

	startTime := time.Now()
	
	// Create computation graph from request
	computationGraph := map[string]interface{}{
		"operations": []map[string]interface{}{
			{
				"id":   "load_evidence",
				"type": "LOAD_FROM_CACHE",
				"parameters": map[string]interface{}{
					"cache_key": fmt.Sprintf("evidence_%d", req.EvidenceID),
				},
			},
			{
				"id":   "analyze_evidence", 
				"type": "EVIDENCE_ANALYSIS",
				"parameters": map[string]interface{}{
					"prompt": req.Prompt,
					"style":  req.Style,
				},
			},
		},
	}
	
	// Submit async job
	job := &WorkJob{
		Type:      JobTypeGenerateGlyph,
		Priority:  5,
		UserID:    req.UserID,
		SessionID: fmt.Sprintf("session_%d", time.Now().Unix()),
		Parameters: map[string]interface{}{
			"computation_graph": computationGraph,
			"dimensions":       req.Dimensions,
			"neural_config":    req.NeuralConfig,
		},
		LegalContext: map[string]interface{}{
			"evidence_id": req.EvidenceID,
			"prompt":      req.Prompt,
			"style":       req.Style,
		},
	}
	
	jobID, err := e.AsyncWorker.SubmitJob(c.Request.Context(), job)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to submit job", "details": err.Error()})
		return
	}
	
	c.JSON(202, gin.H{
		"job_id":  jobID,
		"status":  "submitted",
		"message": "Glyph generation started",
		"timing": TimingInfo{
			TotalMs: time.Since(startTime).Milliseconds(),
		},
	})
}

// HandleExecuteGlyph handles glyph execution requests
func (e *GlyphExecutionEngine) HandleExecuteGlyph(c *gin.Context) {
	var req ExecuteGlyphRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request format", "details": err.Error()})
		return
	}

	// Submit execution job
	job := &WorkJob{
		Type:     JobTypeExecuteGlyph,
		Priority: 7,
		UserID:   req.UserID,
		SessionID: fmt.Sprintf("session_%d", time.Now().Unix()),
		Parameters: map[string]interface{}{
			"glyph_id": req.GlyphID,
			"inputs":   req.Inputs,
		},
	}
	
	jobID, err := e.AsyncWorker.SubmitJob(c.Request.Context(), job)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to submit execution job", "details": err.Error()})
		return
	}
	
	c.JSON(202, gin.H{
		"job_id":  jobID,
		"status":  "submitted", 
		"message": "Glyph execution started",
	})
}

// HandleGetGlyph retrieves a glyph by ID
func (e *GlyphExecutionEngine) HandleGetGlyph(c *gin.Context) {
	glyphID := c.Param("id")
	
	// Query database for glyph
	query := `
		SELECT id, user_id, legal_context, metadata, compressed_data, 
			   artifact_url, created_at, updated_at
		FROM glyphs WHERE id = $1
	`
	
	var glyph struct {
		ID            string    `json:"id"`
		UserID        string    `json:"user_id"`
		LegalContext  string    `json:"legal_context"`
		Metadata      string    `json:"metadata"`
		CompressedData []byte   `json:"compressed_data"`
		ArtifactURL   *string   `json:"artifact_url"`
		CreatedAt     time.Time `json:"created_at"`
		UpdatedAt     time.Time `json:"updated_at"`
	}
	
	err := e.PostgresPool.QueryRow(c.Request.Context(), query, glyphID).Scan(
		&glyph.ID, &glyph.UserID, &glyph.LegalContext, &glyph.Metadata,
		&glyph.CompressedData, &glyph.ArtifactURL, &glyph.CreatedAt, &glyph.UpdatedAt,
	)
	if err != nil {
		c.JSON(404, gin.H{"error": "Glyph not found", "details": err.Error()})
		return
	}
	
	c.JSON(200, glyph)
}

// HandleSearchGlyphs searches for glyphs
func (e *GlyphExecutionEngine) HandleSearchGlyphs(c *gin.Context) {
	query := c.Query("q")
	userID := c.Query("user_id")
	
	if query == "" {
		c.JSON(400, gin.H{"error": "Query parameter 'q' is required"})
		return
	}
	
	// Simple text search - could be enhanced with vector search
	sqlQuery := `
		SELECT id, user_id, legal_context, metadata, created_at
		FROM glyphs 
		WHERE ($1 = '' OR user_id = $1)
		  AND (legal_context::text ILIKE $2 OR metadata::text ILIKE $2)
		ORDER BY created_at DESC
		LIMIT 50
	`
	
	rows, err := e.PostgresPool.Query(c.Request.Context(), sqlQuery, userID, "%"+query+"%")
	if err != nil {
		c.JSON(500, gin.H{"error": "Search failed", "details": err.Error()})
		return
	}
	defer rows.Close()
	
	var results []map[string]interface{}
	for rows.Next() {
		var result struct {
			ID           string    `json:"id"`
			UserID       string    `json:"user_id"`
			LegalContext string    `json:"legal_context"`
			Metadata     string    `json:"metadata"`
			CreatedAt    time.Time `json:"created_at"`
		}
		
		err := rows.Scan(&result.ID, &result.UserID, &result.LegalContext,
			&result.Metadata, &result.CreatedAt)
		if err != nil {
			continue
		}
		
		results = append(results, map[string]interface{}{
			"id":            result.ID,
			"user_id":       result.UserID,
			"legal_context": result.LegalContext,
			"metadata":      result.Metadata,
			"created_at":    result.CreatedAt,
		})
	}
	
	c.JSON(200, gin.H{
		"results": results,
		"count":   len(results),
		"query":   query,
	})
}

// HandleClearCache clears the tensor cache
func (e *GlyphExecutionEngine) HandleClearCache(c *gin.Context) {
	// Clear Redis cache keys
	ctx := c.Request.Context()
	pattern := "tensor:*"
	
	keys, err := e.RedisClient.Keys(ctx, pattern).Result()
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to get cache keys", "details": err.Error()})
		return
	}
	
	if len(keys) > 0 {
		_, err = e.RedisClient.Del(ctx, keys...).Result()
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to clear cache", "details": err.Error()})
			return
		}
	}
	
	c.JSON(200, gin.H{
		"message":     "Cache cleared successfully",
		"keys_cleared": len(keys),
	})
}

// HandleCacheStats returns cache statistics
func (e *GlyphExecutionEngine) HandleCacheStats(c *gin.Context) {
	stats := e.TensorCache.GetCacheStats()
	workerStats := e.AsyncWorker.GetWorkerStats()
	
	c.JSON(200, gin.H{
		"cache":   stats,
		"workers": workerStats,
	})
}

// HandleNeuralCompress handles neural sprite compression
func (e *GlyphExecutionEngine) HandleNeuralCompress(c *gin.Context) {
	// Mock compression endpoint
	c.JSON(200, gin.H{
		"message": "Neural Sprite compression",
		"status":  "available",
		"ratios":  []float64{10.0, 25.0, 50.0, 100.0},
	})
}

// HandleNeuralDecompress handles neural sprite decompression  
func (e *GlyphExecutionEngine) HandleNeuralDecompress(c *gin.Context) {
	// Mock decompression endpoint
	c.JSON(200, gin.H{
		"message": "Neural Sprite decompression",
		"status":  "available",
	})
}

// Utility function to get environment variables with defaults
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}