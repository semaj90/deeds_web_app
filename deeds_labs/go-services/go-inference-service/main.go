package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
	"go.uber.org/zap"
)

// RTX 3060 Ti optimized configuration
const (
	MaxGPULayers       = 35    // RTX 3060 Ti can handle 35-40 layers
	MaxContextSize     = 4096  // 4K context
	MaxConcurrentJobs  = 16    // Optimal for RTX 3060 Ti
	MemoryBudget       = 12288 // 12GB VRAM limit
	TensorCoreCount    = 112   // RTX 3060 Ti tensor cores
	MemoryBandwidthGBs = 448   // RTX 3060 Ti memory bandwidth
	OllamaBaseURL      = "http://localhost:11434"  // Ollama API endpoint
	PostgreSQLURL      = "postgres://legal_admin:123456@localhost:5433/legal_ai_db"
	EmbeddingModel     = "embeddinggemma:latest"  // Embedding model for pgvector
	EmbeddingDimension = 768                 // Embedding vector dimension
)

// InferenceRequest represents a chat inference request
type InferenceRequest struct {
	Prompt      string  `json:"prompt" binding:"required"`
	MaxTokens   int     `json:"max_tokens,omitempty"`
	Temperature float32 `json:"temperature,omitempty"`
	TopP        float32 `json:"top_p,omitempty"`
	Model       string  `json:"model,omitempty"`
	Stream      bool    `json:"stream,omitempty"`
	StopTokens  []string `json:"stop_tokens,omitempty"`
	UseGPU      bool    `json:"use_gpu,omitempty"`
}

// InferenceResponse represents the response from inference
type InferenceResponse struct {
	ID                string              `json:"id,omitempty"`
	Text              string              `json:"text"`
	Tokens            int                 `json:"tokens"`
	ProcessingTimeMs  int64               `json:"processing_time_ms"`
	TokensPerSecond   float64             `json:"tokens_per_second"`
	GPUUtilization    float32             `json:"gpu_utilization"`
	MemoryUsageMB     int64               `json:"memory_usage_mb"`
	Embedding         pgvector.Vector     `json:"embedding,omitempty"`
	Confidence        float32             `json:"confidence,omitempty"`
	LegalDomain       string              `json:"legal_domain,omitempty"`
	Success           bool                `json:"success"`
	Error             string              `json:"error,omitempty"`
	SimilarQueries    []SimilarQuery      `json:"similar_queries,omitempty"`
}

// SimilarQuery represents a semantically similar query from pgvector search
type SimilarQuery struct {
	ID         string  `json:"id"`
	Query      string  `json:"query"`
	Response   string  `json:"response"`
	Similarity float64 `json:"similarity"`
	Domain     string  `json:"legal_domain"`
}

// GPUMetrics tracks RTX 3060 Ti performance
type GPUMetrics struct {
	UtilizationPercent float32   `json:"utilization_percent"`
	MemoryUsageMB      int64     `json:"memory_usage_mb"`
	TensorCoreLoad     int       `json:"tensor_core_load"`
	ThermalStatus      string    `json:"thermal_status"`
	Bandwidth          int       `json:"bandwidth_gbs"`
	LastUpdated        time.Time `json:"last_updated"`
}

// OllamaGenerateRequest represents request to Ollama API
type OllamaGenerateRequest struct {
	Model       string  `json:"model"`
	Prompt      string  `json:"prompt"`
	Temperature float32 `json:"temperature,omitempty"`
	TopP        float32 `json:"top_p,omitempty"`
	MaxTokens   int     `json:"num_predict,omitempty"`
	Stream      bool    `json:"stream"`
}

// OllamaGenerateResponse represents response from Ollama API
type OllamaGenerateResponse struct {
	Response string `json:"response"`
	Done     bool   `json:"done"`
}

// InferenceService manages GPU-accelerated Ollama proxy with PostgreSQL + pgvector
type InferenceService struct {
	httpClient     *http.Client
	jobQueue       chan *InferenceJob
	workers        []*InferenceWorker
	gpuMetrics     GPUMetrics
	logger         *zap.Logger
	db             *pgxpool.Pool
	totalJobs      int64
	successfulJobs int64
	modelsMutex    sync.RWMutex
}

// InferenceJob represents a single inference task
type InferenceJob struct {
	ID       string
	Request  InferenceRequest
	Response chan InferenceResponse
	StartTime time.Time
}

// InferenceWorker handles concurrent inference jobs
type InferenceWorker struct {
	ID      int
	service *InferenceService
	busy    bool
	mutex   sync.Mutex
}

// NewInferenceService creates a new inference service with PostgreSQL + pgvector
func NewInferenceService() *InferenceService {
	logger, _ := zap.NewProduction()

	// Create HTTP client with optimized settings for Ollama
	httpClient := &http.Client{
		Timeout: 60 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 10,
			IdleConnTimeout:     30 * time.Second,
		},
	}

	// Initialize PostgreSQL connection pool
	db, err := pgxpool.New(context.Background(), PostgreSQLURL)
	if err != nil {
		log.Fatalf("Failed to connect to PostgreSQL: %v", err)
	}

	// Test database connection
	if err := db.Ping(context.Background()); err != nil {
		log.Fatalf("Failed to ping PostgreSQL: %v", err)
	}

	logger.Info("Connected to PostgreSQL with pgvector",
		zap.String("database", "legal_ai_db"))

	service := &InferenceService{
		httpClient: httpClient,
		jobQueue:   make(chan *InferenceJob, 100),
		logger:     logger,
		db:         db,
		gpuMetrics: GPUMetrics{
			Bandwidth: MemoryBandwidthGBs,
		},
	}

	// Initialize database schema
	if err := service.initializeDatabase(); err != nil {
		logger.Warn("Database initialization warning", zap.Error(err))
	}

	// Initialize worker pool for concurrent inference
	service.initializeWorkers()

	// Start GPU metrics monitoring
	go service.monitorGPUMetrics()

	return service
}

// initializeDatabase sets up required database schema for inference caching
func (s *InferenceService) initializeDatabase() error {
	ctx := context.Background()

	schema := `
		-- Ensure pgvector extension is enabled
		CREATE EXTENSION IF NOT EXISTS vector;

		-- Inference cache table with pgvector support
		CREATE TABLE IF NOT EXISTS inference_cache (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			prompt TEXT NOT NULL,
			response TEXT NOT NULL,
			model VARCHAR(100) NOT NULL,
			embedding vector(768),
			tokens INTEGER DEFAULT 0,
			processing_time_ms BIGINT DEFAULT 0,
			tokens_per_second REAL DEFAULT 0,
			gpu_utilization REAL DEFAULT 0,
			confidence REAL DEFAULT 0,
			legal_domain VARCHAR(100),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);

		-- Indexes for performance
		CREATE INDEX IF NOT EXISTS idx_inference_cache_prompt ON inference_cache(prompt);
		CREATE INDEX IF NOT EXISTS idx_inference_cache_model ON inference_cache(model);
		CREATE INDEX IF NOT EXISTS idx_inference_cache_created ON inference_cache(created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_inference_cache_domain ON inference_cache(legal_domain);

		-- HNSW index for vector similarity search (pgvector)
		CREATE INDEX IF NOT EXISTS idx_inference_embeddings_hnsw ON inference_cache
		USING hnsw (embedding vector_cosine_ops);
	`

	_, err := s.db.Exec(ctx, schema)
	if err != nil {
		return fmt.Errorf("failed to initialize database schema: %w", err)
	}

	s.logger.Info("Database schema initialized with pgvector support")
	return nil
}

// generateEmbedding creates a vector embedding for text using Ollama
func (s *InferenceService) generateEmbedding(ctx context.Context, text string) (pgvector.Vector, error) {
	embedReq := map[string]interface{}{
		"model": EmbeddingModel,
		"prompt": text,
	}

	reqBody, _ := json.Marshal(embedReq)
	resp, err := s.httpClient.Post(
		fmt.Sprintf("%s/api/embeddings", OllamaBaseURL),
		"application/json",
		bytes.NewBuffer(reqBody),
	)
	if err != nil {
		return pgvector.Vector{}, fmt.Errorf("failed to generate embedding: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Embedding []float32 `json:"embedding"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return pgvector.Vector{}, fmt.Errorf("failed to decode embedding: %w", err)
	}

	return pgvector.NewVector(result.Embedding), nil
}

// storeInferenceResult saves the inference result with embedding to PostgreSQL
func (s *InferenceService) storeInferenceResult(ctx context.Context, req InferenceRequest, resp InferenceResponse) error {
	// Generate embedding for the prompt
	embedding, err := s.generateEmbedding(ctx, req.Prompt)
	if err != nil {
		s.logger.Warn("Failed to generate embedding", zap.Error(err))
		embedding = pgvector.Vector{} // Store without embedding if generation fails
	}

	// Classify legal domain (simple keyword-based classification)
	legalDomain := classifyLegalDomain(req.Prompt)

	query := `
		INSERT INTO inference_cache
		(prompt, response, model, embedding, tokens, processing_time_ms, tokens_per_second,
		 gpu_utilization, confidence, legal_domain)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id
	`

	var id string
	err = s.db.QueryRow(ctx, query,
		req.Prompt, resp.Text, req.Model, embedding, resp.Tokens,
		resp.ProcessingTimeMs, resp.TokensPerSecond, resp.GPUUtilization,
		resp.Confidence, legalDomain,
	).Scan(&id)

	if err != nil {
		return fmt.Errorf("failed to store inference result: %w", err)
	}

	s.logger.Debug("Stored inference result",
		zap.String("id", id),
		zap.String("domain", legalDomain))

	return nil
}

// findSimilarQueries uses pgvector to find semantically similar queries
func (s *InferenceService) findSimilarQueries(ctx context.Context, prompt string, limit int) ([]SimilarQuery, error) {
	// Generate embedding for the query
	queryEmbedding, err := s.generateEmbedding(ctx, prompt)
	if err != nil {
		return nil, fmt.Errorf("failed to generate query embedding: %w", err)
	}

	query := `
		SELECT id, prompt, response, legal_domain,
			   embedding <=> $1 AS similarity
		FROM inference_cache
		WHERE embedding IS NOT NULL
		ORDER BY embedding <=> $1
		LIMIT $2
	`

	rows, err := s.db.Query(ctx, query, queryEmbedding, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to search similar queries: %w", err)
	}
	defer rows.Close()

	var similar []SimilarQuery
	for rows.Next() {
		var sq SimilarQuery
		if err := rows.Scan(&sq.ID, &sq.Query, &sq.Response, &sq.Domain, &sq.Similarity); err != nil {
			continue // Skip errors
		}
		similar = append(similar, sq)
	}

	return similar, nil
}

// classifyLegalDomain performs simple keyword-based legal domain classification
func classifyLegalDomain(text string) string {
	text = strings.ToLower(text)

	switch {
	case strings.Contains(text, "contract") || strings.Contains(text, "agreement"):
		return "contract"
	case strings.Contains(text, "criminal") || strings.Contains(text, "crime"):
		return "criminal"
	case strings.Contains(text, "property") || strings.Contains(text, "real estate"):
		return "property"
	case strings.Contains(text, "tort") || strings.Contains(text, "negligence"):
		return "tort"
	case strings.Contains(text, "constitutional") || strings.Contains(text, "amendment"):
		return "constitutional"
	case strings.Contains(text, "corporate") || strings.Contains(text, "business"):
		return "corporate"
	case strings.Contains(text, "family") || strings.Contains(text, "divorce"):
		return "family"
	default:
		return "general"
	}
}

// calculateConfidence estimates response quality based on multiple factors
func calculateConfidence(prompt, response string, processingTime time.Duration) float32 {
	// Base confidence
	confidence := float32(0.5)

	// Response length factor (longer responses generally indicate more thoughtful answers)
	responseLen := len(response)
	if responseLen > 100 {
		confidence += 0.2
	}
	if responseLen > 300 {
		confidence += 0.1
	}

	// Processing time factor (reasonable processing time indicates good GPU utilization)
	processingSeconds := processingTime.Seconds()
	if processingSeconds > 0.5 && processingSeconds < 10 {
		confidence += 0.1
	}

	// Legal terminology factor
	legalTerms := []string{"legal", "law", "court", "contract", "statute", "regulation", "jurisdiction"}
	for _, term := range legalTerms {
		if strings.Contains(strings.ToLower(response), term) {
			confidence += 0.05
			break
		}
	}

	// Cap at 1.0
	if confidence > 1.0 {
		confidence = 1.0
	}

	return confidence
}

// initializeWorkers creates a pool of inference workers
func (s *InferenceService) initializeWorkers() {
	cpuCount := runtime.NumCPU()
	workerCount := min(MaxConcurrentJobs, cpuCount*2)

	s.workers = make([]*InferenceWorker, workerCount)

	for i := 0; i < workerCount; i++ {
		worker := &InferenceWorker{
			ID:      i,
			service: s,
		}

		s.workers[i] = worker
		go worker.run()
	}

	s.logger.Info("Initialized inference workers",
		zap.Int("worker_count", workerCount),
		zap.Int("max_concurrent", MaxConcurrentJobs))
}

// VerifyOllamaModel verifies model is available in Ollama
func (s *InferenceService) VerifyOllamaModel(modelName string) error {
	resp, err := http.Get(fmt.Sprintf("%s/api/tags", OllamaBaseURL))
	if err != nil {
		return fmt.Errorf("failed to connect to Ollama: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to decode Ollama response: %w", err)
	}

	for _, model := range result.Models {
		if model.Name == modelName {
			s.logger.Info("Model verified in Ollama",
				zap.String("model_name", modelName))
			return nil
		}
	}

	return fmt.Errorf("model %s not found in Ollama", modelName)
}

// ProcessInference handles inference requests with GPU acceleration and pgvector storage
func (s *InferenceService) ProcessInference(req InferenceRequest) InferenceResponse {
	startTime := time.Now()

	// Set defaults
	if req.MaxTokens == 0 {
		req.MaxTokens = 256
	}
	if req.Temperature == 0 {
		req.Temperature = 0.1
	}
	if req.TopP == 0 {
		req.TopP = 0.9
	}
	if req.Model == "" {
		req.Model = "legal:latest"
	}

	// Create inference job
	job := &InferenceJob{
		ID:        fmt.Sprintf("job_%d", time.Now().UnixNano()),
		Request:   req,
		Response:  make(chan InferenceResponse, 1),
		StartTime: startTime,
	}

	// Submit to worker queue
	select {
	case s.jobQueue <- job:
		// Wait for response with timeout
		select {
		case response := <-job.Response:
			s.totalJobs++
			if response.Success {
				s.successfulJobs++
			}
			return response
		case <-time.After(60 * time.Second):
			return InferenceResponse{
				Success: false,
				Error:   "Inference timeout after 60 seconds",
			}
		}
	default:
		return InferenceResponse{
			Success: false,
			Error:   "Inference queue full, try again later",
		}
	}
}

// InferenceWorker.run processes jobs from the queue
func (w *InferenceWorker) run() {
	for job := range w.service.jobQueue {
		w.mutex.Lock()
		w.busy = true
		w.mutex.Unlock()

		response := w.processJob(job)
		job.Response <- response

		w.mutex.Lock()
		w.busy = false
		w.mutex.Unlock()
	}
}

// processJob runs actual inference via Ollama API with GPU acceleration
func (w *InferenceWorker) processJob(job *InferenceJob) InferenceResponse {
	startTime := time.Now()
	req := job.Request

	// Create Ollama API request
	ollamaReq := OllamaGenerateRequest{
		Model:       req.Model,
		Prompt:      req.Prompt,
		Temperature: req.Temperature,
		TopP:        req.TopP,
		MaxTokens:   req.MaxTokens,
		Stream:      false,
	}

	// Marshal request
	requestBody, err := json.Marshal(ollamaReq)
	if err != nil {
		return InferenceResponse{
			Success: false,
			Error:   fmt.Sprintf("Failed to marshal request: %v", err),
		}
	}

	// Make API call to Ollama
	resp, err := w.service.httpClient.Post(
		fmt.Sprintf("%s/api/generate", OllamaBaseURL),
		"application/json",
		bytes.NewBuffer(requestBody),
	)
	if err != nil {
		return InferenceResponse{
			Success: false,
			Error:   fmt.Sprintf("Failed to call Ollama API: %v", err),
		}
	}
	defer resp.Body.Close()

	// Read response
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return InferenceResponse{
			Success: false,
			Error:   fmt.Sprintf("Failed to read response: %v", err),
		}
	}

	// Parse Ollama response
	var ollamaResp OllamaGenerateResponse
	if err := json.Unmarshal(responseBody, &ollamaResp); err != nil {
		return InferenceResponse{
			Success: false,
			Error:   fmt.Sprintf("Failed to parse response: %v", err),
		}
	}

	processingTime := time.Since(startTime)

	// Estimate tokens (rough approximation: 1 token ≈ 4 characters)
	outputTokens := len(ollamaResp.Response) / 4
	tokensPerSecond := float64(outputTokens) / processingTime.Seconds()

	// Calculate confidence based on response length and processing time
	confidence := calculateConfidence(req.Prompt, ollamaResp.Response, processingTime)

	return InferenceResponse{
		Text:              ollamaResp.Response,
		Tokens:            outputTokens,
		ProcessingTimeMs:  processingTime.Milliseconds(),
		TokensPerSecond:   tokensPerSecond,
		GPUUtilization:    w.service.gpuMetrics.UtilizationPercent,
		MemoryUsageMB:     w.service.gpuMetrics.MemoryUsageMB,
		Confidence:        confidence,
		LegalDomain:       classifyLegalDomain(req.Prompt),
		Success:           true,
	}
}

// monitorGPUMetrics updates RTX 3060 Ti performance metrics
func (s *InferenceService) monitorGPUMetrics() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		// Simulate RTX 3060 Ti metrics (in production, use nvidia-ml-go)
		activeWorkers := 0
		for _, worker := range s.workers {
			worker.mutex.Lock()
			if worker.busy {
				activeWorkers++
			}
			worker.mutex.Unlock()
		}

		utilizationPercent := float32(activeWorkers) / float32(len(s.workers)) * 100

		s.gpuMetrics = GPUMetrics{
			UtilizationPercent: utilizationPercent,
			MemoryUsageMB:      int64(4096 + activeWorkers*512), // Estimate
			TensorCoreLoad:     int(utilizationPercent * TensorCoreCount / 100),
			ThermalStatus:      getThermalStatus(utilizationPercent),
			Bandwidth:          MemoryBandwidthGBs,
			LastUpdated:        time.Now(),
		}
	}
}

// getThermalStatus estimates thermal status based on utilization
func getThermalStatus(utilization float32) string {
	switch {
	case utilization > 85:
		return "hot"
	case utilization > 60:
		return "warm"
	default:
		return "cool"
	}
}

// HTTP Handlers

func (s *InferenceService) healthHandler(c *gin.Context) {
	// Test Ollama connection
	ollamaHealthy := true
	if err := s.VerifyOllamaModel("legal:latest"); err != nil {
		ollamaHealthy = false
	}

	stats := gin.H{
		"service":         "go-inference-ollama-proxy",
		"status":          "healthy",
		"ollama_healthy":  ollamaHealthy,
		"ollama_url":      OllamaBaseURL,
		"default_model":   "legal:latest",
		"active_workers":  len(s.workers),
		"total_jobs":      s.totalJobs,
		"successful_jobs": s.successfulJobs,
		"success_rate":    float64(s.successfulJobs) / max(float64(s.totalJobs), 1) * 100,
		"gpu_metrics":     s.gpuMetrics,
		"rtx_specs": gin.H{
			"tensor_cores":    TensorCoreCount,
			"memory_gb":       12,
			"bandwidth_gbs":   MemoryBandwidthGBs,
			"max_gpu_layers":  MaxGPULayers,
			"max_context":     MaxContextSize,
		},
		"timestamp": time.Now(),
	}

	if ollamaHealthy {
		c.JSON(http.StatusOK, stats)
	} else {
		c.JSON(http.StatusServiceUnavailable, stats)
	}
}

func (s *InferenceService) inferenceHandler(c *gin.Context) {
	var req InferenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Invalid request: %v", err),
		})
		return
	}

	// Process inference with database integration
	response := s.ProcessInference(req)

	// Store result in database if successful
	if response.Success {
		if err := s.storeInferenceResult(c.Request.Context(), req, response); err != nil {
			s.logger.Warn("Failed to store inference result", zap.Error(err))
		}

		// Find similar queries for context
		if similar, err := s.findSimilarQueries(c.Request.Context(), req.Prompt, 3); err == nil {
			response.SimilarQueries = similar
		}

		c.JSON(http.StatusOK, response)
	} else {
		c.JSON(http.StatusInternalServerError, response)
	}
}

func (s *InferenceService) metricsHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"gpu_metrics": s.gpuMetrics,
		"service_metrics": gin.H{
			"total_jobs":      s.totalJobs,
			"successful_jobs": s.successfulJobs,
			"active_workers":  len(s.workers),
			"queue_length":    len(s.jobQueue),
		},
		"timestamp": time.Now(),
	})
}

func (s *InferenceService) searchHandler(c *gin.Context) {
	query := c.Query("q")
	limitStr := c.DefaultQuery("limit", "5")

	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Query parameter 'q' is required",
		})
		return
	}

	limit := 5
	if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 && parsed <= 20 {
		limit = parsed
	}

	similar, err := s.findSimilarQueries(c.Request.Context(), query, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Search failed: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"query":   query,
		"results": similar,
		"count":   len(similar),
	})
}

// Utility functions
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func main() {
	// Initialize inference service
	service := NewInferenceService()
	defer service.logger.Sync()
	defer service.db.Close()

	// Verify Ollama connection and legal:latest model
	if err := service.VerifyOllamaModel("legal:latest"); err != nil {
		service.logger.Warn("Failed to verify Ollama model",
			zap.String("model", "legal:latest"),
			zap.Error(err))
	}

	// Setup Gin router
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Logger())
	r.Use(gin.Recovery())

	// CORS middleware
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	})

	// API routes
	api := r.Group("/api/v1")
	{
		api.GET("/health", service.healthHandler)
		api.GET("/metrics", service.metricsHandler)
		// JSON parse micro-benchmark: compare std json vs simdjson (if built with -tags simdjson)
	api.POST("/bench/json", func(c *gin.Context) {
			ctx := c.Request.Context()
			iterStr := c.DefaultQuery("n", "500")
			iters, _ := strconv.Atoi(iterStr)
			if iters <= 0 {
				iters = 500
			}
			// Read raw body once
			b, err := io.ReadAll(c.Request.Body)
			if err != nil || len(b) == 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "provide JSON payload in body"})
				return
			}
			// Baseline stdlib
			start1 := time.Now()
			for i := 0; i < iters; i++ {
				var v any
				if err := jsonUnmarshal(b, &v); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json", "details": err.Error()})
					return
				}
			}
			stdMs := time.Since(start1).Milliseconds()

			// simdjson path via parseJSONSIMD by reconstructing a Request with same body each iter
			start2 := time.Now()
			for i := 0; i < iters; i++ {
				req, _ := http.NewRequestWithContext(ctx, "POST", "/bench/json", bytes.NewReader(b))
				var v any
				if err := parseJSONSIMD(ctx, req, &v); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "simd parse failed", "details": err.Error()})
					return
				}
			}
			simdMs := time.Since(start2).Milliseconds()

			enabled := false
			// build tag presence can't be checked at runtime easily; infer by speed or env
			if simdMs > 0 && simdMs <= stdMs {
				enabled = true
			}

			c.JSON(http.StatusOK, gin.H{
				"iterations": iters,
				"bytes": len(b),
				"stdlib_ms": stdMs,
				"simd_ms": simdMs,
				"speedup": fmt.Sprintf("%.2fx", float64(stdMs)/max(1.0, float64(simdMs))),
				"simdjson_build": enabled,
			})
		})
		api.POST("/inference", service.inferenceHandler)
		api.GET("/search", service.searchHandler)
	}

	// Start server
	port := ":8080"
	service.logger.Info("Starting Go inference service",
		zap.String("port", port),
		zap.Int("workers", len(service.workers)))

	log.Fatal(http.ListenAndServe(port, r))
}