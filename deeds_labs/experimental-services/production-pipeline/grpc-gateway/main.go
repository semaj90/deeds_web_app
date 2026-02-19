package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/streadway/amqp"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

// LegalAIGateway represents the main gateway service
type LegalAIGateway struct {
	redis       *redis.Client
	rabbit      *amqp.Connection
	rabbitCh    *amqp.Channel
	grpcServer  *grpc.Server
	httpServer  *http.Server
	config      *Config
}

// Config holds all configuration for the gateway
type Config struct {
	HTTPPort     int    `json:"http_port"`
	GRPCPort     int    `json:"grpc_port"`
	RedisAddr    string `json:"redis_addr"`
	RabbitURL    string `json:"rabbit_url"`
	PostgresURL  string `json:"postgres_url"`
	Environment  string `json:"environment"`
	LogLevel     string `json:"log_level"`
}

// Document represents a legal document in the system
type Document struct {
	ID          string                 `json:"id"`
	Title       string                 `json:"title"`
	Content     string                 `json:"content"`
	ContentType string                 `json:"content_type"`
	Metadata    map[string]interface{} `json:"metadata"`
	Embeddings  []float32              `json:"embeddings,omitempty"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
}

// SearchRequest represents a search query
type SearchRequest struct {
	Query       string                 `json:"query"`
	Filters     map[string]interface{} `json:"filters,omitempty"`
	Limit       int                    `json:"limit,omitempty"`
	Offset      int                    `json:"offset,omitempty"`
	SearchType  string                 `json:"search_type,omitempty"` // vector, fulltext, hybrid
}

// SearchResponse represents search results
type SearchResponse struct {
	Results     []SearchResult `json:"results"`
	TotalCount  int            `json:"total_count"`
	ProcessTime int            `json:"process_time_ms"`
	SearchType  string         `json:"search_type"`
}

// SearchResult represents a single search result
type SearchResult struct {
	Document   Document `json:"document"`
	Score      float32  `json:"score"`
	Highlights []string `json:"highlights,omitempty"`
}

// ProcessingJob represents a document processing job
type ProcessingJob struct {
	ID          string                 `json:"id"`
	Type        string                 `json:"type"` // crawl, ocr, embed, index
	Status      string                 `json:"status"`
	Data        map[string]interface{} `json:"data"`
	Metadata    map[string]interface{} `json:"metadata"`
	CreatedAt   time.Time              `json:"created_at"`
	CompletedAt *time.Time             `json:"completed_at,omitempty"`
	Error       string                 `json:"error,omitempty"`
}

// NewLegalAIGateway creates a new gateway instance
func NewLegalAIGateway(config *Config) *LegalAIGateway {
	return &LegalAIGateway{
		config: config,
	}
}

// Initialize sets up all gateway connections and services
func (g *LegalAIGateway) Initialize() error {
	log.Println("🚀 Initializing Legal AI gRPC Gateway...")

	// Initialize Redis
	if err := g.initRedis(); err != nil {
		return fmt.Errorf("failed to initialize Redis: %w", err)
	}

	// Initialize RabbitMQ
	if err := g.initRabbitMQ(); err != nil {
		return fmt.Errorf("failed to initialize RabbitMQ: %w", err)
	}

	// Initialize HTTP server
	if err := g.initHTTPServer(); err != nil {
		return fmt.Errorf("failed to initialize HTTP server: %w", err)
	}

	log.Println("✅ Legal AI Gateway initialized successfully")
	return nil
}

// initRedis sets up Redis connection
func (g *LegalAIGateway) initRedis() error {
	g.redis = redis.NewClient(&redis.Options{
		Addr:     g.config.RedisAddr,
		Password: "",
		DB:       0,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := g.redis.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("Redis connection failed: %w", err)
	}

	log.Println("✅ Redis connection established")
	return nil
}

// initRabbitMQ sets up RabbitMQ connection
func (g *LegalAIGateway) initRabbitMQ() error {
	var err error
	g.rabbit, err = amqp.Dial(g.config.RabbitURL)
	if err != nil {
		return fmt.Errorf("RabbitMQ connection failed: %w", err)
	}

	g.rabbitCh, err = g.rabbit.Channel()
	if err != nil {
		return fmt.Errorf("RabbitMQ channel creation failed: %w", err)
	}

	// Declare exchanges and queues
	if err := g.setupRabbitMQTopology(); err != nil {
		return fmt.Errorf("RabbitMQ topology setup failed: %w", err)
	}

	log.Println("✅ RabbitMQ connection established")
	return nil
}

// setupRabbitMQTopology creates necessary exchanges and queues
func (g *LegalAIGateway) setupRabbitMQTopology() error {
	// Declare pipeline exchange
	if err := g.rabbitCh.ExchangeDeclare(
		"pipeline_exchange",
		"topic",
		true,  // durable
		false, // auto-deleted
		false, // internal
		false, // no-wait
		nil,   // arguments
	); err != nil {
		return err
	}

	// Declare queues
	queues := []string{"crawl_queue", "ocr_queue", "embed_queue", "index_queue"}
	for _, queue := range queues {
		if _, err := g.rabbitCh.QueueDeclare(
			queue,
			true,  // durable
			false, // delete when unused
			false, // exclusive
			false, // no-wait
			nil,   // arguments
		); err != nil {
			return err
		}
	}

	return nil
}

// initHTTPServer sets up the HTTP/REST API server
func (g *LegalAIGateway) initHTTPServer() error {
	// Set Gin mode based on environment
	if g.config.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Logger())
	router.Use(gin.Recovery())

	// CORS configuration
	corsConfig := cors.Config{
		AllowOrigins:     []string{"*"}, // Configure based on environment
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length", "X-Request-ID", "X-Processing-Time"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	router.Use(cors.New(corsConfig))

	// Middleware for request ID and timing
	router.Use(func(c *gin.Context) {
		start := time.Now()
		requestID := fmt.Sprintf("req_%d_%d", time.Now().UnixNano(), start.Nanosecond())
		
		c.Header("X-Request-ID", requestID)
		c.Set("request_id", requestID)
		c.Set("start_time", start)
		
		c.Next()
		
		duration := time.Since(start)
		c.Header("X-Processing-Time", fmt.Sprintf("%dms", duration.Milliseconds()))
	})

	// Health check endpoint
	router.GET("/health", g.handleHealth)
	
	// API routes
	api := router.Group("/api")
	{
		// Document processing
		api.POST("/documents", g.handleDocumentUpload)
		api.GET("/documents/:id", g.handleDocumentGet)
		api.PUT("/documents/:id", g.handleDocumentUpdate)
		api.DELETE("/documents/:id", g.handleDocumentDelete)
		
		// Search endpoints
		api.POST("/search", g.handleSearch)
		api.GET("/search/suggestions", g.handleSearchSuggestions)
		
		// Embedding endpoints
		api.POST("/embeddings/generate", g.handleEmbeddingGeneration)
		api.POST("/embeddings/search", g.handleEmbeddingSearch)
		
		// Job management
		api.POST("/jobs", g.handleJobSubmission)
		api.GET("/jobs/:id", g.handleJobStatus)
		api.GET("/jobs", g.handleJobList)
		
		// Cache management
		api.DELETE("/cache", g.handleCacheInvalidation)
		api.GET("/cache/stats", g.handleCacheStats)
		
		// System endpoints
		api.GET("/stats", g.handleSystemStats)
		api.GET("/metrics", g.handleMetrics)
	}

	// Create HTTP server
	g.httpServer = &http.Server{
		Addr:         fmt.Sprintf(":%d", g.config.HTTPPort),
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	return nil
}

// HTTP Handlers

func (g *LegalAIGateway) handleHealth(c *gin.Context) {
	ctx := context.Background()
	
	// Check Redis
	redisStatus := "healthy"
	if err := g.redis.Ping(ctx).Err(); err != nil {
		redisStatus = "unhealthy: " + err.Error()
	}
	
	// Check RabbitMQ
	rabbitStatus := "healthy"
	if g.rabbit.IsClosed() {
		rabbitStatus = "unhealthy: connection closed"
	}
	
	status := gin.H{
		"status":    "healthy",
		"timestamp": time.Now().ISO8601(),
		"services": gin.H{
			"redis":    redisStatus,
			"rabbitmq": rabbitStatus,
		},
		"version": "1.0.0",
	}
	
	httpStatus := http.StatusOK
	if redisStatus != "healthy" || rabbitStatus != "healthy" {
		status["status"] = "degraded"
		httpStatus = http.StatusServiceUnavailable
	}
	
	c.JSON(httpStatus, status)
}

func (g *LegalAIGateway) handleDocumentUpload(c *gin.Context) {
	requestID := c.GetString("request_id")
	
	// Parse multipart form
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":      "Invalid multipart form",
			"request_id": requestID,
		})
		return
	}
	
	files := form.File["documents"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":      "No documents provided",
			"request_id": requestID,
		})
		return
	}
	
	var jobIDs []string
	
	// Process each uploaded file
	for _, file := range files {
		// Create processing job
		job := ProcessingJob{
			ID:   fmt.Sprintf("job_%d_%s", time.Now().UnixNano(), requestID),
			Type: "crawl",
			Status: "queued",
			Data: map[string]interface{}{
				"filename":     file.Filename,
				"content_type": file.Header.Get("Content-Type"),
				"size":        file.Size,
			},
			Metadata: map[string]interface{}{
				"request_id": requestID,
				"user_agent": c.GetHeader("User-Agent"),
			},
			CreatedAt: time.Now(),
		}
		
		// Save file temporarily (in production, upload to MinIO)
		if err := c.SaveUploadedFile(file, fmt.Sprintf("./temp/%s", file.Filename)); err != nil {
			log.Printf("Failed to save file %s: %v", file.Filename, err)
			continue
		}
		
		// Queue job for processing
		if err := g.queueJob(job); err != nil {
			log.Printf("Failed to queue job for %s: %v", file.Filename, err)
			continue
		}
		
		jobIDs = append(jobIDs, job.ID)
	}
	
	c.JSON(http.StatusAccepted, gin.H{
		"message":    "Documents queued for processing",
		"job_ids":    jobIDs,
		"request_id": requestID,
	})
}

func (g *LegalAIGateway) handleDocumentGet(c *gin.Context) {
	documentID := c.Param("id")
	requestID := c.GetString("request_id")
	
	// Try cache first
	cacheKey := fmt.Sprintf("doc:%s", documentID)
	cached, err := g.redis.Get(context.Background(), cacheKey).Result()
	
	if err == nil {
		var doc Document
		if json.Unmarshal([]byte(cached), &doc) == nil {
			c.Header("X-Cache", "hit")
			c.JSON(http.StatusOK, doc)
			return
		}
	}
	
	// Cache miss - would fetch from database in production
	c.Header("X-Cache", "miss")
	c.JSON(http.StatusNotFound, gin.H{
		"error":      "Document not found",
		"document_id": documentID,
		"request_id": requestID,
	})
}

func (g *LegalAIGateway) handleDocumentUpdate(c *gin.Context) {
	documentID := c.Param("id")
	requestID := c.GetString("request_id")
	
	var updateData map[string]interface{}
	if err := c.ShouldBindJSON(&updateData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":      "Invalid JSON",
			"request_id": requestID,
		})
		return
	}
	
	// In production, update database and invalidate cache
	cacheKey := fmt.Sprintf("doc:%s", documentID)
	g.redis.Del(context.Background(), cacheKey)
	
	c.JSON(http.StatusOK, gin.H{
		"message":     "Document updated",
		"document_id": documentID,
		"request_id":  requestID,
	})
}

func (g *LegalAIGateway) handleDocumentDelete(c *gin.Context) {
	documentID := c.Param("id")
	requestID := c.GetString("request_id")
	
	// In production, delete from database and cache
	cacheKey := fmt.Sprintf("doc:%s", documentID)
	g.redis.Del(context.Background(), cacheKey)
	
	c.JSON(http.StatusOK, gin.H{
		"message":     "Document deleted",
		"document_id": documentID,
		"request_id":  requestID,
	})
}

func (g *LegalAIGateway) handleSearch(c *gin.Context) {
	requestID := c.GetString("request_id")
	startTime := time.Now()
	
	var searchReq SearchRequest
	if err := c.ShouldBindJSON(&searchReq); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":      "Invalid search request",
			"request_id": requestID,
		})
		return
	}
	
	// Set defaults
	if searchReq.Limit == 0 {
		searchReq.Limit = 10
	}
	if searchReq.SearchType == "" {
		searchReq.SearchType = "hybrid"
	}
	
	// Check cache
	cacheKey := g.generateSearchCacheKey(searchReq)
	cached, err := g.redis.Get(context.Background(), cacheKey).Result()
	
	if err == nil {
		var response SearchResponse
		if json.Unmarshal([]byte(cached), &response) == nil {
			c.Header("X-Cache", "hit")
			c.JSON(http.StatusOK, response)
			return
		}
	}
	
	// Mock search results (in production, query database/vector store)
	response := SearchResponse{
		Results: []SearchResult{
			{
				Document: Document{
					ID:    "doc_1",
					Title: "Sample Legal Document",
					Content: "This is a sample legal document for testing purposes...",
					Metadata: map[string]interface{}{
						"document_type": "contract",
						"jurisdiction": "federal",
					},
				},
				Score: 0.95,
				Highlights: []string{"legal document", "contract"},
			},
		},
		TotalCount:  1,
		ProcessTime: int(time.Since(startTime).Milliseconds()),
		SearchType:  searchReq.SearchType,
	}
	
	// Cache results
	responseJSON, _ := json.Marshal(response)
	g.redis.SetEX(context.Background(), cacheKey, string(responseJSON), 15*time.Minute)
	
	c.Header("X-Cache", "miss")
	c.JSON(http.StatusOK, response)
}

func (g *LegalAIGateway) handleSearchSuggestions(c *gin.Context) {
	query := c.Query("q")
	limit := 5
	
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil {
			limit = parsed
		}
	}
	
	// Mock suggestions (in production, query suggestion database)
	suggestions := []string{
		query + " contract",
		query + " agreement",
		query + " legal precedent",
		query + " case law",
		query + " statute",
	}
	
	if limit < len(suggestions) {
		suggestions = suggestions[:limit]
	}
	
	c.JSON(http.StatusOK, gin.H{
		"suggestions": suggestions,
		"query":      query,
	})
}

func (g *LegalAIGateway) handleEmbeddingGeneration(c *gin.Context) {
	requestID := c.GetString("request_id")
	
	var request struct {
		Texts    []string               `json:"texts"`
		Metadata map[string]interface{} `json:"metadata,omitempty"`
	}
	
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":      "Invalid embedding request",
			"request_id": requestID,
		})
		return
	}
	
	// Queue embedding generation job
	job := ProcessingJob{
		ID:   fmt.Sprintf("embed_%d_%s", time.Now().UnixNano(), requestID),
		Type: "embed",
		Status: "queued",
		Data: map[string]interface{}{
			"texts":      request.Texts,
			"text_count": len(request.Texts),
		},
		Metadata:  request.Metadata,
		CreatedAt: time.Now(),
	}
	
	if err := g.queueJob(job); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":      "Failed to queue embedding job",
			"request_id": requestID,
		})
		return
	}
	
	c.JSON(http.StatusAccepted, gin.H{
		"message":    "Embedding generation queued",
		"job_id":     job.ID,
		"request_id": requestID,
	})
}

func (g *LegalAIGateway) handleEmbeddingSearch(c *gin.Context) {
	requestID := c.GetString("request_id")
	
	var request struct {
		Vector      []float32              `json:"vector"`
		Limit       int                    `json:"limit,omitempty"`
		Threshold   float32                `json:"threshold,omitempty"`
		Filters     map[string]interface{} `json:"filters,omitempty"`
	}
	
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":      "Invalid vector search request",
			"request_id": requestID,
		})
		return
	}
	
	// Set defaults
	if request.Limit == 0 {
		request.Limit = 10
	}
	if request.Threshold == 0 {
		request.Threshold = 0.7
	}
	
	// Mock vector search results
	results := []SearchResult{
		{
			Document: Document{
				ID:    "doc_vector_1",
				Title: "Similar Legal Document",
				Content: "This document has similar semantic content...",
			},
			Score: 0.92,
		},
	}
	
	c.JSON(http.StatusOK, gin.H{
		"results":    results,
		"total":      len(results),
		"threshold":  request.Threshold,
		"request_id": requestID,
	})
}

func (g *LegalAIGateway) handleJobSubmission(c *gin.Context) {
	requestID := c.GetString("request_id")
	
	var jobData map[string]interface{}
	if err := c.ShouldBindJSON(&jobData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":      "Invalid job data",
			"request_id": requestID,
		})
		return
	}
	
	jobType, _ := jobData["type"].(string)
	if jobType == "" {
		jobType = "generic"
	}
	
	job := ProcessingJob{
		ID:        fmt.Sprintf("job_%s_%d", jobType, time.Now().UnixNano()),
		Type:      jobType,
		Status:    "queued",
		Data:      jobData,
		CreatedAt: time.Now(),
	}
	
	if err := g.queueJob(job); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":      "Failed to queue job",
			"request_id": requestID,
		})
		return
	}
	
	c.JSON(http.StatusAccepted, gin.H{
		"job_id":     job.ID,
		"status":     job.Status,
		"request_id": requestID,
	})
}

func (g *LegalAIGateway) handleJobStatus(c *gin.Context) {
	jobID := c.Param("id")
	requestID := c.GetString("request_id")
	
	// In production, query job status from database
	status := gin.H{
		"job_id":     jobID,
		"status":     "processing", // Mock status
		"progress":   75,            // Mock progress
		"request_id": requestID,
	}
	
	c.JSON(http.StatusOK, status)
}

func (g *LegalAIGateway) handleJobList(c *gin.Context) {
	// Parse query parameters
	limit := 20
	offset := 0
	status := c.Query("status")
	
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil {
			limit = parsed
		}
	}
	
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if parsed, err := strconv.Atoi(offsetStr); err == nil {
			offset = parsed
		}
	}
	
	// Mock job list
	jobs := []ProcessingJob{
		{
			ID:        "job_1",
			Type:      "crawl",
			Status:    "completed",
			CreatedAt: time.Now().Add(-1 * time.Hour),
		},
		{
			ID:        "job_2",
			Type:      "embed",
			Status:    "processing",
			CreatedAt: time.Now().Add(-30 * time.Minute),
		},
	}
	
	// Filter by status if provided
	if status != "" {
		var filtered []ProcessingJob
		for _, job := range jobs {
			if job.Status == status {
				filtered = append(filtered, job)
			}
		}
		jobs = filtered
	}
	
	c.JSON(http.StatusOK, gin.H{
		"jobs":   jobs,
		"total":  len(jobs),
		"limit":  limit,
		"offset": offset,
	})
}

func (g *LegalAIGateway) handleCacheInvalidation(c *gin.Context) {
	pattern := c.Query("pattern")
	if pattern == "" {
		pattern = "*"
	}
	
	// Invalidate cache pattern
	ctx := context.Background()
	keys, err := g.redis.Keys(ctx, pattern).Result()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to get cache keys",
		})
		return
	}
	
	if len(keys) > 0 {
		deleted, err := g.redis.Del(ctx, keys...).Result()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to delete cache keys",
			})
			return
		}
		
		c.JSON(http.StatusOK, gin.H{
			"message": "Cache invalidated",
			"deleted": deleted,
			"pattern": pattern,
		})
	} else {
		c.JSON(http.StatusOK, gin.H{
			"message": "No cache keys found",
			"pattern": pattern,
		})
	}
}

func (g *LegalAIGateway) handleCacheStats(c *gin.Context) {
	ctx := context.Background()
	
	info, err := g.redis.Info(ctx, "memory").Result()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to get cache stats",
		})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"cache_info": info,
		"timestamp":  time.Now(),
	})
}

func (g *LegalAIGateway) handleSystemStats(c *gin.Context) {
	stats := gin.H{
		"uptime":    time.Since(time.Now()),
		"timestamp": time.Now(),
		"version":   "1.0.0",
		"environment": g.config.Environment,
	}
	
	c.JSON(http.StatusOK, stats)
}

func (g *LegalAIGateway) handleMetrics(c *gin.Context) {
	// Prometheus-compatible metrics
	metrics := `# HELP legal_ai_requests_total Total number of requests
# TYPE legal_ai_requests_total counter
legal_ai_requests_total 0

# HELP legal_ai_request_duration_seconds Request duration in seconds
# TYPE legal_ai_request_duration_seconds histogram
legal_ai_request_duration_seconds_bucket{le="0.1"} 0
legal_ai_request_duration_seconds_bucket{le="0.5"} 0
legal_ai_request_duration_seconds_bucket{le="1.0"} 0
legal_ai_request_duration_seconds_bucket{le="+Inf"} 0

# HELP legal_ai_documents_processed_total Total number of documents processed
# TYPE legal_ai_documents_processed_total counter
legal_ai_documents_processed_total 0
`
	
	c.Header("Content-Type", "text/plain")
	c.String(http.StatusOK, metrics)
}

// Helper methods

func (g *LegalAIGateway) queueJob(job ProcessingJob) error {
	jobData, err := json.Marshal(job)
	if err != nil {
		return err
	}
	
	routingKey := fmt.Sprintf("pipeline.%s", job.Type)
	
	return g.rabbitCh.Publish(
		"pipeline_exchange",
		routingKey,
		false, // mandatory
		false, // immediate
		amqp.Publishing{
			ContentType:  "application/json",
			Body:         jobData,
			DeliveryMode: amqp.Persistent,
			Timestamp:    time.Now(),
			MessageId:    job.ID,
		},
	)
}

func (g *LegalAIGateway) generateSearchCacheKey(req SearchRequest) string {
	hash := fmt.Sprintf("search:%s:%d:%d", req.Query, req.Limit, req.Offset)
	if len(req.Filters) > 0 {
		filtersJSON, _ := json.Marshal(req.Filters)
		hash = fmt.Sprintf("%s:%x", hash, filtersJSON)
	}
	return hash
}

// Start starts the gateway server
func (g *LegalAIGateway) Start() error {
	log.Printf("🚀 Starting Legal AI Gateway on port %d", g.config.HTTPPort)
	
	// Start HTTP server
	go func() {
		if err := g.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server failed to start: %v", err)
		}
	}()
	
	log.Printf("✅ Legal AI Gateway running on http://localhost:%d", g.config.HTTPPort)
	return nil
}

// Stop gracefully stops the gateway
func (g *LegalAIGateway) Stop() error {
	log.Println("🛑 Stopping Legal AI Gateway...")
	
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	// Stop HTTP server
	if err := g.httpServer.Shutdown(ctx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}
	
	// Close RabbitMQ
	if g.rabbitCh != nil {
		g.rabbitCh.Close()
	}
	if g.rabbit != nil {
		g.rabbit.Close()
	}
	
	// Close Redis
	if g.redis != nil {
		g.redis.Close()
	}
	
	log.Println("✅ Legal AI Gateway stopped")
	return nil
}

// loadConfig loads configuration from environment or defaults
func loadConfig() *Config {
	config := &Config{
		HTTPPort:    8090,
		GRPCPort:    8091,
		RedisAddr:   "localhost:4005",
		RabbitURL:   "amqp://guest:guest@localhost:5672/",
		PostgresURL: "postgresql://postgres:123456@localhost:5432/legal_ai_db",
		Environment: "development",
		LogLevel:    "info",
	}
	
	// Override from environment variables
	if port := os.Getenv("HTTP_PORT"); port != "" {
		if parsed, err := strconv.Atoi(port); err == nil {
			config.HTTPPort = parsed
		}
	}
	
	if addr := os.Getenv("REDIS_ADDR"); addr != "" {
		config.RedisAddr = addr
	}
	
	if url := os.Getenv("RABBIT_URL"); url != "" {
		config.RabbitURL = url
	}
	
	if url := os.Getenv("POSTGRES_URL"); url != "" {
		config.PostgresURL = url
	}
	
	if env := os.Getenv("ENVIRONMENT"); env != "" {
		config.Environment = env
	}
	
	return config
}

// main function
func main() {
	// Load configuration
	config := loadConfig()
	
	// Create gateway
	gateway := NewLegalAIGateway(config)
	
	// Initialize
	if err := gateway.Initialize(); err != nil {
		log.Fatalf("Failed to initialize gateway: %v", err)
	}
	
	// Start server
	if err := gateway.Start(); err != nil {
		log.Fatalf("Failed to start gateway: %v", err)
	}
	
	// Wait for interrupt signal
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c
	
	// Graceful shutdown
	if err := gateway.Stop(); err != nil {
		log.Printf("Gateway shutdown error: %v", err)
	}
}