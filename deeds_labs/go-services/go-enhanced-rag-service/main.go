package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"github.com/redis/go-redis/v9"
	"github.com/streadway/amqp"

	"enhanced-rag-service/pkg/cache"
)

// Enhanced RAG Go Microservice with CUDA Processing
// Provides: Document embedding, semantic search, contextual retrieval, memory integration

type Config struct {
	Port           string
	DatabaseURL    string
	RedisURL       string
	RabbitMQURL    string
	OllamaURL      string
	CudaEnabled    bool
	EmbeddingModel string
	ChatModel      string
}

type EnhancedRAGService struct {
	config      *Config
	db          *gorm.DB
	redis       *redis.Client
	rabbitmq    *amqp.Connection
	channel     *amqp.Channel
	cudaWorker  *CudaWorker
	embedder    *EmbeddingService
	vectorStore *VectorStore
	memory      *MemoryEngine
	pyTorchCache *cache.PyTorchStyleCache
	cacheAdapter *cache.MultiLevelAdapter
}

// Document represents a legal document with vector embeddings
type Document struct {
	ID          string    `json:"id" gorm:"primaryKey"`
	CaseID      string    `json:"case_id" gorm:"index"`
	Title       string    `json:"title"`
	Content     string    `json:"content"`
	ContentType string    `json:"content_type"`
	Metadata    JSON      `json:"metadata" gorm:"type:jsonb"`
	Embedding   []float32 `json:"embedding" gorm:"type:vector(1536)"`
	Summary     string    `json:"summary"`
	Keywords    []string  `json:"keywords" gorm:"type:text[]"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Enhanced RAG Request with context and memory
type RAGRequest struct {
	Query          string                 `json:"query"`
	CaseID         string                 `json:"case_id,omitempty"`
	UserID         string                 `json:"user_id"`
	SessionID      string                 `json:"session_id,omitempty"`
	ContextNeeded  bool                   `json:"context_needed"`
	UseMemory      bool                   `json:"use_memory"`
	MaxResults     int                    `json:"max_results,omitempty"`
	Threshold      float32                `json:"threshold,omitempty"`
	Options        map[string]interface{} `json:"options,omitempty"`
}

// Enhanced RAG Response with context and reasoning
type RAGResponse struct {
	Response        string                 `json:"response"`
	Context         []DocumentMatch        `json:"context"`
	MemoryContext   []MemoryItem          `json:"memory_context,omitempty"`
	Sources         []string              `json:"sources"`
	Confidence      float32               `json:"confidence"`
	ProcessingTime  time.Duration         `json:"processing_time"`
	CudaAccelerated bool                  `json:"cuda_accelerated"`
	Metadata        map[string]interface{} `json:"metadata"`
}

type DocumentMatch struct {
	Document   Document `json:"document"`
	Similarity float32  `json:"similarity"`
	Relevance  float32  `json:"relevance"`
	Reasoning  string   `json:"reasoning"`
}

type MemoryItem struct {
	Content    string                 `json:"content"`
	Timestamp  time.Time             `json:"timestamp"`
	Type       string                `json:"type"`
	Relevance  float32               `json:"relevance"`
	Metadata   map[string]interface{} `json:"metadata"`
}

type JSON map[string]interface{}

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	config := &Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://legal_admin:123456@localhost:5433/legal_ai_db?sslmode=disable"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379/0"),
		RabbitMQURL:    getEnv("RABBITMQ_URL", "amqp://localhost"),
		OllamaURL:      getEnv("OLLAMA_URL", "http://localhost:11434"),
		CudaEnabled:    getEnv("CUDA_ENABLED", "true") == "true",
		EmbeddingModel: getEnv("EMBEDDING_MODEL", "embeddinggemma:latest"),
		ChatModel:      getEnv("CHAT_MODEL", "gemma3-legal:latest"),
	}

	// Initialize service
	service, err := NewEnhancedRAGService(config)
	if err != nil {
		log.Fatal("Failed to initialize service:", err)
	}

	// Setup HTTP routes
	router := setupRoutes(service)

	// Start background workers
	go service.startBackgroundWorkers()

	log.Printf("🚀 Enhanced RAG Service starting on port %s", config.Port)
	log.Printf("📊 CUDA Enabled: %v", config.CudaEnabled)
	log.Printf("🧠 Embedding Model: %s", config.EmbeddingModel)
	log.Printf("💬 Chat Model: %s", config.ChatModel)

	if err := router.Run(":" + config.Port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func NewEnhancedRAGService(config *Config) (*EnhancedRAGService, error) {
	service := &EnhancedRAGService{config: config}

	// Initialize database
	db, err := gorm.Open(postgres.Open(config.DatabaseURL), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}
	service.db = db

	// Auto-migrate schemas
	if err := db.AutoMigrate(&Document{}); err != nil {
		return nil, fmt.Errorf("failed to migrate database: %w", err)
	}

	// Initialize Redis
	opt, err := redis.ParseURL(config.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Redis URL: %w", err)
	}
	service.redis = redis.NewClient(opt)

	// Test Redis connection
	ctx := context.Background()
	if _, err := service.redis.Ping(ctx).Result(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	// Initialize PyTorch-style cache system
	cacheConfig := &cache.CacheConfig{
		MemorySize: 10000,
		MemoryTTL:  15 * time.Minute,
		RedisAddr:  config.RedisURL, // Use the same Redis URL from config
		RedisTTL:   1 * time.Hour,
		DiskPath:   "./cache",
		DiskSize:   10 * 1024 * 1024 * 1024, // 10GB
		DiskTTL:    24 * time.Hour,
		EnableCompression: true,
		EnableMetrics:     true,
	}
	
	pyTorchCache, err := cache.NewPyTorchStyleCache(cacheConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize PyTorch cache: %w", err)
	}
	service.pyTorchCache = pyTorchCache
	service.cacheAdapter = &cache.MultiLevelAdapter{C: pyTorchCache}
	
	log.Println("🧠 PyTorch-style cache system initialized")

	// Initialize RabbitMQ
	conn, err := amqp.Dial(config.RabbitMQURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}
	service.rabbitmq = conn

	ch, err := conn.Channel()
	if err != nil {
		return nil, fmt.Errorf("failed to open RabbitMQ channel: %w", err)
	}
	service.channel = ch

	// Initialize CUDA worker if enabled
	if config.CudaEnabled {
		service.cudaWorker = NewCudaWorker()
		if err := service.cudaWorker.Initialize(context.Background()); err != nil {
			log.Printf("⚠️ CUDA initialization failed, falling back to CPU: %v", err)
			config.CudaEnabled = false
		} else {
			log.Println("✅ CUDA worker initialized successfully")
		}
	}

	// Initialize embedding service
	service.embedder = NewEmbeddingService(config.OllamaURL, config.EmbeddingModel, service.cudaWorker)

	// Initialize vector store
	service.vectorStore = NewVectorStore(service.db, service.redis, service.embedder)

	// Initialize memory engine
	service.memory = NewMemoryEngine(service.db, service.redis, service.embedder)

	return service, nil
}

func setupRoutes(service *EnhancedRAGService) *gin.Engine {
	router := gin.Default()

	// Add CORS middleware
	router.Use(func(c *gin.Context) {
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
	router.GET("/health", service.healthCheck)

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Enhanced RAG endpoints
		v1.POST("/rag/query", service.handleRAGQuery)
		v1.POST("/rag/ingest", service.handleDocumentIngest)
		v1.GET("/rag/documents/:case_id", service.getDocuments)
		
		// Memory endpoints
		v1.GET("/memory/:user_id/:case_id", service.getMemoryContext)
		v1.POST("/memory/update", service.updateMemory)
		
		// Vector operations
		v1.POST("/vectors/similarity", service.computeSimilarity)
		v1.POST("/vectors/search", service.vectorSearch)
		
		// CUDA operations
		v1.GET("/cuda/status", service.getCudaStatus)
		v1.POST("/cuda/benchmark", service.runCudaBenchmark)
	}

	return router
}

// Main RAG query handler with enhanced context and memory
func (s *EnhancedRAGService) handleRAGQuery(c *gin.Context) {
	startTime := time.Now()
	
	var req RAGRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format", "details": err.Error()})
		return
	}

	// Validate required fields
	if req.Query == "" || req.UserID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query and user_id are required"})
		return
	}

	// Set defaults
	if req.MaxResults == 0 {
		req.MaxResults = 5
	}
	if req.Threshold == 0 {
		req.Threshold = 0.7
	}

	ctx := c.Request.Context()

	// Generate query embedding (with cache support)
	var queryEmbedding []float32
	if cachedEmbedding, found := s.pyTorchCache.GetEmbedding(ctx, req.Query); found {
		queryEmbedding = cachedEmbedding
		log.Printf("🎯 Query embedding cache hit for: %s", req.Query[:50])
	} else {
		var err error
		queryEmbedding, err = s.embedder.GenerateEmbedding(ctx, req.Query)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate query embedding", "details": err.Error()})
			return
		}
		// Cache the embedding for future use
		if err := s.pyTorchCache.SetEmbedding(ctx, req.Query, queryEmbedding); err != nil {
			log.Printf("Warning: Failed to cache query embedding: %v", err)
		}
		log.Printf("📚 Generated and cached new query embedding")
	}

	// Retrieve relevant documents
	documents, err := s.vectorStore.SimilaritySearch(ctx, queryEmbedding, req.CaseID, req.MaxResults, req.Threshold)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to search documents", "details": err.Error()})
		return
	}

	// Get memory context if requested
	var memoryContext []MemoryItem
	if req.UseMemory {
		memoryContext, err = s.memory.GetRelevantMemory(ctx, req.UserID, req.CaseID, req.Query, queryEmbedding)
		if err != nil {
			log.Printf("Warning: Failed to retrieve memory context: %v", err)
		}
	}

	// Build context for LLM
	contextStr := s.buildContextString(documents, memoryContext)

	// Generate response using LLM
	response, confidence, err := s.generateResponse(ctx, req.Query, contextStr, req.Options)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate response", "details": err.Error()})
		return
	}

	// Update memory with this interaction
	if req.UseMemory {
		go s.memory.UpdateMemory(context.Background(), req.UserID, req.CaseID, req.SessionID, req.Query, response, memoryContext)
	}

	// Build response
	ragResponse := RAGResponse{
		Response:        response,
		Context:         documents,
		MemoryContext:   memoryContext,
		Sources:         extractSources(documents),
		Confidence:      confidence,
		ProcessingTime:  time.Since(startTime),
		CudaAccelerated: s.config.CudaEnabled && s.cudaWorker != nil,
		Metadata: map[string]interface{}{
			"query_embedding_dims": len(queryEmbedding),
			"documents_found":      len(documents),
			"memory_items":         len(memoryContext),
			"model_used":          s.config.ChatModel,
		},
	}

	c.JSON(http.StatusOK, ragResponse)
}

// Document ingestion with CUDA-accelerated embedding
func (s *EnhancedRAGService) handleDocumentIngest(c *gin.Context) {
	var doc Document
	if err := c.ShouldBindJSON(&doc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid document format", "details": err.Error()})
		return
	}

	ctx := c.Request.Context()
	startTime := time.Now()

	// Generate embedding for document content
	embedding, err := s.embedder.GenerateEmbedding(ctx, doc.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate embedding", "details": err.Error()})
		return
	}

	doc.Embedding = embedding
	doc.CreatedAt = time.Now()
	doc.UpdatedAt = time.Now()

	// Extract keywords and summary
	doc.Keywords = s.extractKeywords(doc.Content)
	doc.Summary = s.generateSummary(ctx, doc.Content)

	// Store in database
	if err := s.db.Create(&doc).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store document", "details": err.Error()})
		return
	}

	// Publish to RabbitMQ for background processing
	s.publishDocumentEvent("document.ingested", doc)

	c.JSON(http.StatusOK, gin.H{
		"document_id":      doc.ID,
		"embedding_dims":   len(embedding),
		"processing_time":  time.Since(startTime),
		"cuda_accelerated": s.config.CudaEnabled,
	})
}

func (s *EnhancedRAGService) healthCheck(c *gin.Context) {
	status := gin.H{
		"status":     "healthy",
		"timestamp":  time.Now(),
		"service":    "enhanced-rag",
		"version":    "1.0.0",
		"cuda":       s.config.CudaEnabled,
		"components": gin.H{
			"database": s.checkDatabase(),
			"redis":    s.checkRedis(),
			"rabbitmq": s.checkRabbitMQ(),
			"ollama":   s.checkOllama(),
		},
	}

	if s.config.CudaEnabled && s.cudaWorker != nil {
		status["cuda_info"] = s.cudaWorker.GetDeviceInfo()
	}

	c.JSON(http.StatusOK, status)
}

// Background workers for async processing
func (s *EnhancedRAGService) startBackgroundWorkers() {
	// Document processing worker
	go s.documentProcessingWorker()
	
	// Memory consolidation worker
	go s.memoryConsolidationWorker()
	
	// Cache warming worker
	go s.cacheWarmingWorker()
}

func (s *EnhancedRAGService) documentProcessingWorker() {
	for {
		// Process document queue
		time.Sleep(5 * time.Second)
	}
}

func (s *EnhancedRAGService) memoryConsolidationWorker() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		// Consolidate memory items
		log.Println("🧠 Running memory consolidation...")
		if err := s.memory.ConsolidateMemory(context.Background()); err != nil {
			log.Printf("Memory consolidation error: %v", err)
		}
	}
}

func (s *EnhancedRAGService) cacheWarmingWorker() {
	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		// Warm frequently accessed embeddings
		log.Println("🔥 Warming embedding cache...")
		if err := s.embedder.WarmCache(context.Background()); err != nil {
			log.Printf("Cache warming error: %v", err)
		}
	}
}

// Helper functions
func (s *EnhancedRAGService) buildContextString(documents []DocumentMatch, memory []MemoryItem) string {
	context := "RELEVANT DOCUMENTS:\n"
	for i, doc := range documents {
		context += fmt.Sprintf("%d. %s (Similarity: %.3f)\n%s\n\n", 
			i+1, doc.Document.Title, doc.Similarity, doc.Document.Summary)
	}

	if len(memory) > 0 {
		context += "\nRELEVANT MEMORY:\n"
		for i, mem := range memory {
			context += fmt.Sprintf("%d. %s (Relevance: %.3f)\n\n", 
				i+1, mem.Content, mem.Relevance)
		}
	}

	return context
}

func (s *EnhancedRAGService) generateResponse(ctx context.Context, query, context string, options map[string]interface{}) (string, float32, error) {
	// Implementation for LLM response generation
	// This would call Ollama with the enhanced context
	return "Enhanced RAG response based on context and memory", 0.85, nil
}

func (s *EnhancedRAGService) extractKeywords(content string) []string {
	// Simple keyword extraction - would use more sophisticated NLP
	return []string{"contract", "legal", "analysis"}
}

func (s *EnhancedRAGService) generateSummary(ctx context.Context, content string) string {
	// Generate summary using LLM
	return "Document summary generated by LLM"
}

func (s *EnhancedRAGService) publishDocumentEvent(event string, doc Document) {
	// Publish to RabbitMQ
	body, _ := json.Marshal(map[string]interface{}{
		"event":     event,
		"document":  doc,
		"timestamp": time.Now(),
	})

	s.channel.Publish("", "document.events", false, false, amqp.Publishing{
		ContentType: "application/json",
		Body:        body,
	})
}

func extractSources(documents []DocumentMatch) []string {
	sources := make([]string, len(documents))
	for i, doc := range documents {
		sources[i] = doc.Document.Title
	}
	return sources
}

// Health check helpers
func (s *EnhancedRAGService) checkDatabase() string {
	sqlDB, err := s.db.DB()
	if err != nil {
		return "error"
	}
	if err := sqlDB.Ping(); err != nil {
		return "disconnected"
	}
	return "connected"
}

func (s *EnhancedRAGService) checkRedis() string {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	
	if _, err := s.redis.Ping(ctx).Result(); err != nil {
		return "disconnected"
	}
	return "connected"
}

func (s *EnhancedRAGService) checkRabbitMQ() string {
	if s.rabbitmq.IsClosed() {
		return "disconnected"
	}
	return "connected"
}

func (s *EnhancedRAGService) checkOllama() string {
	// Simple HTTP check to Ollama
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(s.config.OllamaURL + "/api/tags")
	if err != nil {
		return "disconnected"
	}
	defer resp.Body.Close()
	
	if resp.StatusCode == 200 {
		return "connected"
	}
	return "error"
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getBoolEnv(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return defaultValue
		}
		return parsed
	}
	return defaultValue
}

// Missing handler methods
func (s *EnhancedRAGService) getDocuments(c *gin.Context) {
	caseID := c.Param("case_id")
	
	var documents []Document
	if err := s.db.Where("case_id = ?", caseID).Find(&documents).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"documents": documents})
}

func (s *EnhancedRAGService) getMemoryContext(c *gin.Context) {
	userID := c.Param("user_id")
	caseID := c.Param("case_id")
	
	if s.memory == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Memory engine not available"})
		return
	}
	
	context, err := s.memory.GetRelevantMemory(context.Background(), userID, caseID, "", nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"context": context})
}

func (s *EnhancedRAGService) updateMemory(c *gin.Context) {
	var req struct {
		UserID    string `json:"user_id"`
		CaseID    string `json:"case_id"`
		Query     string `json:"query"`
		Response  string `json:"response"`
		Important bool   `json:"important"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	if s.memory == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Memory engine not available"})
		return
	}
	
	err := s.memory.UpdateMemory(context.Background(), req.UserID, req.CaseID, "session", req.Query, req.Response, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"status": "memory updated"})
}

func (s *EnhancedRAGService) computeSimilarity(c *gin.Context) {
	var req VectorSimilarityRequest
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	if s.cudaWorker == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "CUDA worker not available"})
		return
	}
	
	similarities, err := s.cudaWorker.ComputeVectorSimilarity(context.Background(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"similarities": similarities})
}

func (s *EnhancedRAGService) vectorSearch(c *gin.Context) {
	var req struct {
		Query      string  `json:"query"`
		CaseID     string  `json:"case_id"`
		MaxResults int     `json:"max_results"`
		Threshold  float32 `json:"threshold"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	if s.vectorStore == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Vector store not available"})
		return
	}
	
	// Generate embedding for query
	embedding, err := s.embedder.GenerateEmbedding(context.Background(), req.Query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	// Search similar documents
	documents, err := s.vectorStore.SimilaritySearch(context.Background(), embedding, req.CaseID, req.MaxResults, req.Threshold)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"documents": documents})
}

func (s *EnhancedRAGService) getCudaStatus(c *gin.Context) {
	if s.cudaWorker == nil {
		c.JSON(http.StatusOK, gin.H{
			"available": false,
			"message": "CUDA worker not initialized",
		})
		return
	}
	
	info := s.cudaWorker.GetDeviceInfo()
	c.JSON(http.StatusOK, gin.H{
		"available": s.cudaWorker.IsAvailable(),
		"devices": info,
	})
}

func (s *EnhancedRAGService) runCudaBenchmark(c *gin.Context) {
	if s.cudaWorker == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "CUDA worker not available"})
		return
	}
	
	results, err := s.cudaWorker.RunBenchmark(context.Background())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"benchmark_results": results})
}