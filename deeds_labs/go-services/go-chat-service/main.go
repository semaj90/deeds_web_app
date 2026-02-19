package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// Native Windows GPU-Accelerated Chat Service
// Integrates: WebGPU → CUDA Workers → Go-llama → PostgreSQL + pgvector
const (
	// GPU Services
	WebGPUServiceURL    = "http://localhost:5177/api/v4/chat-webgpu"
	GoInferenceURL      = "http://localhost:8080/api/v1/inference"
	CUDAWorkerScript    = "/cuda-worker.js"

	// Database
	PostgreSQLURL       = "postgres://legal_admin:123456@localhost:5432/legal_ai_db"

	// Cache
	RedisURL           = "redis://:redis@localhost:6379"

	// Performance
	MaxChatHistory     = 100
	EmbeddingDimension = 768
	GPUBatchSize       = 16
)

// Chat message structures
type ChatMessage struct {
	ID          int64                  `json:"id" db:"id"`
	UserID      string                 `json:"user_id" db:"user_id"`
	SessionID   string                 `json:"session_id" db:"session_id"`
	Role        string                 `json:"role" db:"role"` // "user" or "assistant"
	Content     string                 `json:"content" db:"content"`
	Embedding   []float32              `json:"embedding,omitempty" db:"embedding"`
	Metadata    map[string]interface{} `json:"metadata" db:"metadata"`
	CreatedAt   time.Time              `json:"created_at" db:"created_at"`
	ProcessedBy string                 `json:"processed_by" db:"processed_by"` // "webgpu", "go-llama", "cuda"
	TokenCount  int                    `json:"token_count" db:"token_count"`
	ProcessTime int64                  `json:"process_time_ms" db:"process_time_ms"`
}

type ChatSession struct {
	ID          string                 `json:"id" db:"id"`
	UserID      string                 `json:"user_id" db:"user_id"`
	Title       string                 `json:"title" db:"title"`
	Messages    []ChatMessage          `json:"messages"`
	Metadata    map[string]interface{} `json:"metadata" db:"metadata"`
	CreatedAt   time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at" db:"updated_at"`
	IsActive    bool                   `json:"is_active" db:"is_active"`
}

type ChatRequest struct {
	UserID      string                 `json:"user_id" binding:"required"`
	SessionID   string                 `json:"session_id,omitempty"`
	Message     string                 `json:"message" binding:"required"`
	Model       string                 `json:"model,omitempty"`
	Temperature float32                `json:"temperature,omitempty"`
	MaxTokens   int                    `json:"max_tokens,omitempty"`
	UseGPU      bool                   `json:"use_gpu,omitempty"`
	Preferences map[string]interface{} `json:"preferences,omitempty"`
}

type ChatResponse struct {
	SessionID     string                 `json:"session_id"`
	MessageID     int64                  `json:"message_id"`
	Content       string                 `json:"content"`
	ProcessedBy   string                 `json:"processed_by"`
	ProcessTimeMs int64                  `json:"process_time_ms"`
	TokenCount    int                    `json:"token_count"`
	Metadata      map[string]interface{} `json:"metadata"`
	Success       bool                   `json:"success"`
	Error         string                 `json:"error,omitempty"`
}

// PyTorch-style cache implementation for Go
type CacheConfig struct {
	MemorySize    int           `json:"memory_size"`
	MemoryTTL     time.Duration `json:"memory_ttl"`
	RedisAddr     string        `json:"redis_addr"`
	RedisTTL      time.Duration `json:"redis_ttl"`
	DiskPath      string        `json:"disk_path"`
	DiskSize      int64         `json:"disk_size"`
	DiskTTL       time.Duration `json:"disk_ttl"`
	EnableMetrics bool          `json:"enable_metrics"`
}

type CacheEntry struct {
	Key       string                 `json:"key"`
	Value     interface{}            `json:"value"`
	Metadata  map[string]interface{} `json:"metadata"`
	ExpiresAt time.Time              `json:"expires_at"`
	AccessCount int64               `json:"access_count"`
	LastAccess  time.Time            `json:"last_access"`
	Size       int64                 `json:"size"`
}

type PyTorchStyleCache struct {
	config      *CacheConfig
	memoryCache map[string]*CacheEntry
	memorySzie  int64
	mu          sync.RWMutex
	metrics     *CacheMetrics
}

type CacheMetrics struct {
	Hits        int64 `json:"hits"`
	Misses      int64 `json:"misses"`
	Evictions   int64 `json:"evictions"`
	MemoryUsage int64 `json:"memory_usage"`
	DiskUsage   int64 `json:"disk_usage"`
}

func NewPyTorchStyleCache(config *CacheConfig) (*PyTorchStyleCache, error) {
	cache := &PyTorchStyleCache{
		config:      config,
		memoryCache: make(map[string]*CacheEntry),
		memorySzie:  0,
		metrics:     &CacheMetrics{},
	}
	return cache, nil
}

func (c *PyTorchStyleCache) Get(key string) (interface{}, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, exists := c.memoryCache[key]
	if !exists || time.Now().After(entry.ExpiresAt) {
		c.metrics.Misses++
		return nil, false
	}

	entry.AccessCount++
	entry.LastAccess = time.Now()
	c.metrics.Hits++
	return entry.Value, true
}

func (c *PyTorchStyleCache) Set(key string, value interface{}, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	entry := &CacheEntry{
		Key:       key,
		Value:     value,
		Metadata:  make(map[string]interface{}),
		ExpiresAt: time.Now().Add(ttl),
		AccessCount: 0,
		LastAccess:  time.Now(),
		Size:       int64(len(fmt.Sprintf("%v", value))),
	}

	c.memoryCache[key] = entry
	c.memorySzie += entry.Size
}

func (c *PyTorchStyleCache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if entry, exists := c.memoryCache[key]; exists {
		c.memorySzie -= entry.Size
		delete(c.memoryCache, key)
	}
}

func (c *PyTorchStyleCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.memoryCache = make(map[string]*CacheEntry)
	c.memorySzie = 0
}

func (c *PyTorchStyleCache) Stats() *CacheMetrics {
	c.mu.RLock()
	defer c.mu.RUnlock()

	metrics := *c.metrics
	metrics.MemoryUsage = c.memorySzie
	return &metrics
}

// LLM-specific cache methods
func (c *PyTorchStyleCache) GetLLMResponse(ctx context.Context, key string) (*ChatResponse, bool) {
	if value, found := c.Get(key); found {
		if response, ok := value.(*ChatResponse); ok {
			return response, true
		}
	}
	return nil, false
}

func (c *PyTorchStyleCache) SetLLMResponse(ctx context.Context, key string, response *ChatResponse, metadata map[string]interface{}) {
	c.Set(key, response, c.config.MemoryTTL)
}

func (c *PyTorchStyleCache) GetMetrics() *CacheMetrics {
	return c.Stats()
}

// Smart routing logic for GPU acceleration
type RouteDecision struct {
	UseWebGPU    bool   `json:"use_webgpu"`
	UseGoService bool   `json:"use_go_service"`
	UseCUDA      bool   `json:"use_cuda"`
	Reason       string `json:"reason"`
	Priority     int    `json:"priority"`
}

// Chat service with integrated GPU acceleration
type ChatService struct {
	db        *pgxpool.Pool
	cache     *PyTorchStyleCache
	logger    *zap.Logger
	upgrader  websocket.Upgrader
	clients   map[string]*websocket.Conn
	clientsMu sync.RWMutex
}

func NewChatService() *ChatService {
	logger, _ := zap.NewProduction()

	// Database connection
	db, err := pgxpool.New(context.Background(), PostgreSQLURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Initialize cache
	cacheConfig := &CacheConfig{
		MemorySize:    10000,
		MemoryTTL:     15 * time.Minute,
		RedisAddr:     RedisURL,
		RedisTTL:      1 * time.Hour,
		DiskPath:      "./chat_cache",
		DiskSize:      5 * 1024 * 1024 * 1024, // 5GB
		DiskTTL:       24 * time.Hour,
		EnableMetrics: true,
	}

	cache, err := NewPyTorchStyleCache(cacheConfig)
	if err != nil {
		logger.Warn("Cache initialization failed", zap.Error(err))
	}

	// WebSocket upgrader
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all origins for development
		},
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}

	return &ChatService{
		db:       db,
		cache:    cache,
		logger:   logger,
		upgrader: upgrader,
		clients:  make(map[string]*websocket.Conn),
	}
}

// Smart routing: decides which GPU service to use
func (s *ChatService) routeRequest(req *ChatRequest) *RouteDecision {
	messageLen := len(req.Message)
	wordCount := len(strings.Fields(req.Message))

	decision := &RouteDecision{}

	// Simple queries → Go microservice (fastest)
	if messageLen < 100 && wordCount < 20 && !strings.Contains(strings.ToLower(req.Message), "complex") {
		decision.UseGoService = true
		decision.Reason = "Simple query, routing to Go microservice for speed"
		decision.Priority = 1
		return decision
	}

	// GPU acceleration requested or complex legal analysis
	if req.UseGPU || strings.Contains(strings.ToLower(req.Message), "legal") ||
		strings.Contains(strings.ToLower(req.Message), "analysis") || wordCount > 50 {
		decision.UseWebGPU = true
		decision.UseCUDA = true
		decision.Reason = "Complex query requiring GPU acceleration"
		decision.Priority = 2
		return decision
	}

	// Medium complexity → Go service with fallback
	decision.UseGoService = true
	decision.Reason = "Medium complexity, Go service with WebGPU fallback"
	decision.Priority = 1
	return decision
}

// Process chat message with GPU acceleration
func (s *ChatService) ProcessChat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	startTime := time.Now()

	// Check cache first
	cacheKey := fmt.Sprintf("chat:%s:%s", req.UserID, s.hashMessage(req.Message))
	if cached, found := s.cache.GetLLMResponse(ctx, cacheKey); found {
		s.logger.Info("Cache hit for chat request", zap.String("user_id", req.UserID))

		cachedResponse := *cached
		cachedResponse.ProcessedBy = "cache"
		cachedResponse.ProcessTimeMs = time.Since(startTime).Milliseconds()
		return &cachedResponse, nil
	}

	// Smart routing decision
	route := s.routeRequest(req)
	s.logger.Info("Routing decision",
		zap.String("reason", route.Reason),
		zap.Bool("webgpu", route.UseWebGPU),
		zap.Bool("go_service", route.UseGoService))

	// Get or create chat session
	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = s.generateSessionID(req.UserID)
	}

	// Save user message
	userMsg := &ChatMessage{
		UserID:    req.UserID,
		SessionID: sessionID,
		Role:      "user",
		Content:   req.Message,
		CreatedAt: time.Now(),
	}

	userMsgID, err := s.saveMessage(ctx, userMsg)
	if err != nil {
		return nil, fmt.Errorf("failed to save user message: %w", err)
	}

	s.logger.Info("Saved user message", zap.Int64("message_id", userMsgID))

	// Process with appropriate GPU service
	var response string
	var processedBy string
	var processingErr error

	if route.UseWebGPU {
		response, processingErr = s.processWithWebGPU(ctx, req, sessionID)
		processedBy = "webgpu+cuda"
	} else if route.UseGoService {
		response, processingErr = s.processWithGoService(ctx, req)
		processedBy = "go-llama"
	} else {
		// Fallback to direct Ollama
		response, processingErr = s.processWithOllama(ctx, req)
		processedBy = "ollama-cpu"
	}

	if processingErr != nil {
		// Try fallback
		s.logger.Warn("Primary processing failed, trying fallback", zap.Error(processingErr))
		response, processingErr = s.processWithGoService(ctx, req)
		processedBy = "go-llama-fallback"

		if processingErr != nil {
			return &ChatResponse{
				Success: false,
				Error:   processingErr.Error(),
			}, nil
		}
	}

	processingTime := time.Since(startTime).Milliseconds()

	// Generate embedding for semantic search
	embedding, _ := s.generateEmbedding(ctx, response)

	// Save assistant response
	assistantMsg := &ChatMessage{
		UserID:      req.UserID,
		SessionID:   sessionID,
		Role:        "assistant",
		Content:     response,
		Embedding:   embedding,
		ProcessedBy: processedBy,
		TokenCount:  s.estimateTokens(response),
		ProcessTime: processingTime,
		CreatedAt:   time.Now(),
		Metadata: map[string]interface{}{
			"model":          req.Model,
			"temperature":    req.Temperature,
			"route_decision": route,
		},
	}

	assistantMsgID, err := s.saveMessage(ctx, assistantMsg)
	if err != nil {
		s.logger.Error("Failed to save assistant message", zap.Error(err))
	}

	// Cache the response
	metadata := map[string]interface{}{
		"processed_by":    processedBy,
		"processing_time": processingTime,
		"token_count":     assistantMsg.TokenCount,
	}
	cacheResponse := &ChatResponse{
		SessionID:     sessionID,
		MessageID:     assistantMsgID,
		Content:       response,
		ProcessedBy:   processedBy,
		ProcessTimeMs: processingTime,
		TokenCount:    assistantMsg.TokenCount,
		Metadata:      metadata,
		Success:       true,
	}
	s.cache.SetLLMResponse(ctx, cacheKey, cacheResponse, metadata)

	// Update session
	s.updateSession(ctx, sessionID, req.UserID)

	return &ChatResponse{
		SessionID:     sessionID,
		MessageID:     assistantMsgID,
		Content:       response,
		ProcessedBy:   processedBy,
		ProcessTimeMs: processingTime,
		TokenCount:    assistantMsg.TokenCount,
		Metadata:      metadata,
		Success:       true,
	}, nil
}

// Process with WebGPU + CUDA workers (for complex queries)
func (s *ChatService) processWithWebGPU(ctx context.Context, req *ChatRequest, sessionID string) (string, error) {
	// Get conversation history for context
	history, _ := s.getChatHistory(ctx, sessionID, 5)

	webgpuReq := map[string]interface{}{
		"message":     req.Message,
		"model":       "legal:latest",
		"temperature": req.Temperature,
		"max_tokens":  req.MaxTokens,
		"history":     history,
		"use_cuda":    true,
		"gpu_layers":  35, // RTX 3060 Ti optimization
	}

	reqBody, _ := json.Marshal(webgpuReq)
	resp, err := http.Post(WebGPUServiceURL, "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Response string `json:"response"`
		Success  bool   `json:"success"`
		Error    string `json:"error,omitempty"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if !result.Success {
		return "", fmt.Errorf("WebGPU processing failed: %s", result.Error)
	}

	return result.Response, nil
}

// Process with Go microservice (for simple/fast queries)
func (s *ChatService) processWithGoService(ctx context.Context, req *ChatRequest) (string, error) {
	goReq := map[string]interface{}{
		"prompt":      req.Message,
		"model":       "legal:latest",
		"temperature": req.Temperature,
		"max_tokens":  req.MaxTokens,
	}

	reqBody, _ := json.Marshal(goReq)
	resp, err := http.Post(GoInferenceURL, "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Text    string `json:"text"`
		Success bool   `json:"success"`
		Error   string `json:"error,omitempty"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if !result.Success {
		return "", fmt.Errorf("Go service processing failed: %s", result.Error)
	}

	return result.Text, nil
}

// Database operations
func (s *ChatService) saveMessage(ctx context.Context, msg *ChatMessage) (int64, error) {
	query := `
		INSERT INTO chat_messages (user_id, session_id, role, content, embedding, metadata, created_at, processed_by, token_count, process_time_ms)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id`

	var id int64
	embeddingBytes, _ := json.Marshal(msg.Embedding)
	metadataBytes, _ := json.Marshal(msg.Metadata)

	err := s.db.QueryRow(ctx, query,
		msg.UserID, msg.SessionID, msg.Role, msg.Content,
		embeddingBytes, metadataBytes, msg.CreatedAt,
		msg.ProcessedBy, msg.TokenCount, msg.ProcessTime,
	).Scan(&id)

	return id, err
}

func (s *ChatService) getChatHistory(ctx context.Context, sessionID string, limit int) ([]ChatMessage, error) {
	query := `
		SELECT id, user_id, session_id, role, content, created_at, processed_by, token_count
		FROM chat_messages
		WHERE session_id = $1
		ORDER BY created_at DESC
		LIMIT $2`

	rows, err := s.db.Query(ctx, query, sessionID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []ChatMessage
	for rows.Next() {
		var msg ChatMessage
		err := rows.Scan(&msg.ID, &msg.UserID, &msg.SessionID, &msg.Role,
			&msg.Content, &msg.CreatedAt, &msg.ProcessedBy, &msg.TokenCount)
		if err != nil {
			continue
		}
		messages = append(messages, msg)
	}

	// Reverse to get chronological order
	for i := len(messages)/2 - 1; i >= 0; i-- {
		opp := len(messages) - 1 - i
		messages[i], messages[opp] = messages[opp], messages[i]
	}

	return messages, nil
}

// Semantic search using pgvector
func (s *ChatService) SearchSimilarMessages(ctx context.Context, userID, query string, limit int) ([]ChatMessage, error) {
	// Generate query embedding
	embedding, err := s.generateEmbedding(ctx, query)
	if err != nil {
		return nil, err
	}

	// Vector similarity search using pgvector
	vectorQuery := `
		SELECT id, user_id, session_id, role, content, created_at, processed_by, token_count,
			   embedding <=> $1::vector AS similarity
		FROM chat_messages
		WHERE user_id = $2 AND embedding IS NOT NULL
		ORDER BY similarity ASC
		LIMIT $3`

	embeddingBytes, _ := json.Marshal(embedding)

	rows, err := s.db.Query(ctx, vectorQuery, embeddingBytes, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []ChatMessage
	for rows.Next() {
		var msg ChatMessage
		var similarity float64

		err := rows.Scan(&msg.ID, &msg.UserID, &msg.SessionID, &msg.Role,
			&msg.Content, &msg.CreatedAt, &msg.ProcessedBy, &msg.TokenCount, &similarity)
		if err != nil {
			continue
		}

		msg.Metadata = map[string]interface{}{"similarity": similarity}
		messages = append(messages, msg)
	}

	return messages, nil
}

// WebSocket handler for real-time chat
func (s *ChatService) HandleWebSocket(c *gin.Context) {
	userID := c.Query("user_id")
	if userID == "" {
		c.JSON(400, gin.H{"error": "user_id required"})
		return
	}

	conn, err := s.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		s.logger.Error("WebSocket upgrade failed", zap.Error(err))
		return
	}
	defer conn.Close()

	s.clientsMu.Lock()
	s.clients[userID] = conn
	s.clientsMu.Unlock()

	s.logger.Info("WebSocket client connected", zap.String("user_id", userID))

	for {
		var req ChatRequest
		if err := conn.ReadJSON(&req); err != nil {
			s.logger.Error("WebSocket read error", zap.Error(err))
			break
		}

		req.UserID = userID

		// Process chat request
		response, err := s.ProcessChat(context.Background(), &req)
		if err != nil {
			conn.WriteJSON(map[string]interface{}{
				"success": false,
				"error":   err.Error(),
			})
			continue
		}

		// Send response
		if err := conn.WriteJSON(response); err != nil {
			s.logger.Error("WebSocket write error", zap.Error(err))
			break
		}
	}

	s.clientsMu.Lock()
	delete(s.clients, userID)
	s.clientsMu.Unlock()
}

// HTTP handlers
func (s *ChatService) chatHandler(c *gin.Context) {
	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	response, err := s.ProcessChat(c.Request.Context(), &req)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, response)
}

func (s *ChatService) historyHandler(c *gin.Context) {
	userID := c.Query("user_id")
	sessionID := c.Query("session_id")
	limitStr := c.DefaultQuery("limit", "50")

	if userID == "" || sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id and session_id are required"})
		return
	}

	limit, _ := strconv.Atoi(limitStr)

	messages, err := s.getChatHistory(c.Request.Context(), sessionID, limit)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{
		"session_id": sessionID,
		"messages":   messages,
	})
}

func (s *ChatService) searchHandler(c *gin.Context) {
	userID := c.Query("user_id")
	query := c.Query("q")
	limitStr := c.DefaultQuery("limit", "10")

	limit, _ := strconv.Atoi(limitStr)

	messages, err := s.SearchSimilarMessages(c.Request.Context(), userID, query, limit)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{
		"query":   query,
		"results": messages,
	})
}

func (s *ChatService) metricsHandler(c *gin.Context) {
	metrics := s.cache.GetMetrics()

	c.JSON(200, gin.H{
		"cache_metrics": metrics,
		"service_info": gin.H{
			"webgpu_url":      WebGPUServiceURL,
			"go_inference":    GoInferenceURL,
			"database_status": "connected",
			"gpu_acceleration": true,
		},
	})
}

// Utility functions
func (s *ChatService) generateSessionID(userID string) string {
	return fmt.Sprintf("%s_%d", userID, time.Now().Unix())
}

func (s *ChatService) hashMessage(message string) string {
	h := sha256.Sum256([]byte(message))
	return fmt.Sprintf("%x", h)[:16]
}

func (s *ChatService) estimateTokens(text string) int {
	// Rough approximation: 1 token ≈ 4 characters
	return len(text) / 4
}

// Missing methods that were referenced
func (s *ChatService) processWithOllama(ctx context.Context, req *ChatRequest) (string, error) {
	// Direct Ollama API call as fallback
	ollamaReq := map[string]interface{}{
		"model":       "llama2:13b",
		"prompt":      req.Message,
		"temperature": req.Temperature,
		"max_tokens":  req.MaxTokens,
		"stream":      false,
	}

	reqBody, _ := json.Marshal(ollamaReq)
	resp, err := http.Post("http://localhost:11434/api/generate", "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var ollamaResp struct {
		Response string `json:"response"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&ollamaResp); err != nil {
		return "", err
	}

	return ollamaResp.Response, nil
}

func (s *ChatService) updateSession(ctx context.Context, sessionID, userID string) error {
	query := `
		UPDATE chat_sessions
		SET updated_at = $1, is_active = true
		WHERE id = $2 AND user_id = $3`

	_, err := s.db.Exec(ctx, query, time.Now(), sessionID, userID)
	return err
}

func (s *ChatService) generateEmbedding(ctx context.Context, text string) ([]float32, error) {
	// Use embeddinggemma via existing service
	embedReq := map[string]interface{}{
		"input": text,
		"model": "embeddinggemma:latest",
	}

	reqBody, _ := json.Marshal(embedReq)
	resp, err := http.Post("http://localhost:11434/api/embeddings", "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Embedding []float32 `json:"embedding"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result.Embedding, nil
}

// Database schema initialization
func (s *ChatService) InitializeDatabase(ctx context.Context) error {
	schema := `
		-- Enable pgvector extension
		CREATE EXTENSION IF NOT EXISTS vector;

		-- Chat sessions table
		CREATE TABLE IF NOT EXISTS chat_sessions (
			id VARCHAR PRIMARY KEY,
			user_id VARCHAR NOT NULL,
			title VARCHAR NOT NULL DEFAULT 'New Chat',
			metadata JSONB DEFAULT '{}',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			is_active BOOLEAN DEFAULT true
		);

		-- Chat messages table with vector embeddings
		CREATE TABLE IF NOT EXISTS chat_messages (
			id BIGSERIAL PRIMARY KEY,
			user_id VARCHAR NOT NULL,
			session_id VARCHAR NOT NULL REFERENCES chat_sessions(id),
			role VARCHAR NOT NULL CHECK (role IN ('user', 'assistant')),
			content TEXT NOT NULL,
			embedding vector(768), -- pgvector for semantic search
			metadata JSONB DEFAULT '{}',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			processed_by VARCHAR NOT NULL DEFAULT 'unknown',
			token_count INTEGER DEFAULT 0,
			process_time_ms BIGINT DEFAULT 0
		);

		-- Indexes for performance
		CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
		CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id);
		CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);

		-- Vector similarity index (HNSW for fast similarity search)
		CREATE INDEX IF NOT EXISTS idx_chat_embeddings_hnsw ON chat_messages
		USING hnsw (embedding vector_cosine_ops);
	`

	_, err := s.db.Exec(ctx, schema)
	return err
}

func main() {
	// Initialize chat service
	service := NewChatService()
	defer service.db.Close()

	// Initialize database schema
	if err := service.InitializeDatabase(context.Background()); err != nil {
		service.logger.Warn("Database initialization warning", zap.Error(err))
	}

	// Setup Gin router
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Logger())
	r.Use(gin.Recovery())

	// CORS middleware
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

	// API routes
	api := r.Group("/api/v1")
	{
		api.POST("/chat", service.chatHandler)
		api.GET("/history", service.historyHandler)
		api.GET("/search", service.searchHandler)
		api.GET("/metrics", service.metricsHandler)
		api.GET("/ws", service.HandleWebSocket) // WebSocket endpoint
	}

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"service":          "go-chat-gpu-accelerated",
			"status":           "healthy",
			"webgpu_enabled":   true,
			"cuda_enabled":     true,
			"database":         "postgresql+pgvector",
			"cache":           "pytorch-style",
			"gpu_architecture": "RTX 3060 Ti optimized",
		})
	})

	// Start server
	port := ":9000"
	service.logger.Info("Starting GPU-accelerated chat service",
		zap.String("port", port),
		zap.String("webgpu_url", WebGPUServiceURL),
		zap.String("go_inference", GoInferenceURL))

	log.Fatal(http.ListenAndServe(port, r))
}