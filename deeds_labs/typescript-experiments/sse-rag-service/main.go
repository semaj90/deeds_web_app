package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
	"go.uber.org/zap"
)

// SSE-First Streaming RAG Service
// Architecture: nomic-embed-text (embeddings) + gemma3-legal (generation) + PostgreSQL + SSE streaming

const (
	ServicePort       = ":9003"
	PostgreSQLURL     = "postgres://legal_admin:123456@localhost:5433/legal_ai_db"
	OllamaBaseURL     = "http://localhost:11434"
	EmbeddingModel    = "nomic-embed-text"
	GenerationModel   = "gemma3-legal:latest"
	EmbeddingDimension = 768
)

// Event types for SSE streaming
const (
	EventTypeJobStarted       = "job_started"
	EventTypeEmbeddingCreated = "embedding_created"
	EventTypeSummaryCreated   = "summary_created"
	EventTypeGenerationUpdate = "generation_update"
	EventTypeJobComplete      = "job_complete"
	EventTypeError           = "error"
)

// SSEEvent represents a server-sent event
type SSEEvent struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	Timestamp time.Time              `json:"timestamp"`
	Data      map[string]interface{} `json:"data"`
}

// RAGRequest represents a RAG query request
type RAGRequest struct {
	Query       string   `json:"query" binding:"required"`
	CaseID      *int     `json:"case_id,omitempty"`
	MaxResults  int      `json:"max_results,omitempty"`
	Stream      bool     `json:"stream,omitempty"`
	Context     []string `json:"context,omitempty"`
}

// Message represents a chat message with embeddings
type Message struct {
	ID        int                    `json:"id"`
	CaseID    *int                   `json:"case_id"`
	Sender    string                 `json:"sender"`
	Content   string                 `json:"content"`
	Embedding pgvector.Vector        `json:"embedding,omitempty"`
	CreatedAt time.Time              `json:"created_at"`
	Metadata  map[string]interface{} `json:"metadata"`
}

// Summary represents a case summary
type Summary struct {
	ID        int       `json:"id"`
	CaseID    int       `json:"case_id"`
	Summary   string    `json:"summary"`
	CreatedAt time.Time `json:"created_at"`
}

// StreamingRAGService handles SSE-based RAG operations
type StreamingRAGService struct {
	db         *pgxpool.Pool
	logger     *zap.Logger
	clients    map[string]chan SSEEvent
	clientsMux sync.RWMutex
	
	// Worker channels
	embeddingQueue chan *EmbeddingJob
	generationQueue chan *GenerationJob
}

// EmbeddingJob represents an embedding generation job
type EmbeddingJob struct {
	ID      string
	Text    string
	CaseID  *int
	Type    string // "query", "message", "document"
}

// GenerationJob represents a text generation job
type GenerationJob struct {
	ID           string
	Prompt       string
	CaseID       *int
	ClientID     string
	MaxTokens    int
	Temperature  float32
}

// NewStreamingRAGService creates a new SSE-first RAG service
func NewStreamingRAGService() (*StreamingRAGService, error) {
	logger, _ := zap.NewProduction()
	
	// PostgreSQL connection
	db, err := pgxpool.New(context.Background(), PostgreSQLURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to PostgreSQL: %w", err)
	}
	
	service := &StreamingRAGService{
		db:              db,
		logger:          logger,
		clients:         make(map[string]chan SSEEvent),
		embeddingQueue:  make(chan *EmbeddingJob, 500),
		generationQueue: make(chan *GenerationJob, 100),
	}
	
	// Initialize database schema
	if err := service.initializeSchema(); err != nil {
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}
	
	// Start worker pools
	service.startWorkers()
	
	logger.Info("SSE Streaming RAG Service initialized",
		zap.String("embedding_model", EmbeddingModel),
		zap.String("generation_model", GenerationModel))
	
	return service, nil
}

// initializeSchema creates the database schema
func (s *StreamingRAGService) initializeSchema() error {
	ctx := context.Background()
	
	schema := `
		-- Enable pgvector extension
		CREATE EXTENSION IF NOT EXISTS vector;
		
		-- Messages table with embeddings
		CREATE TABLE IF NOT EXISTS messages (
			id SERIAL PRIMARY KEY,
			case_id INTEGER,
			sender TEXT NOT NULL,
			content TEXT NOT NULL,
			embedding vector(768),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			metadata JSONB DEFAULT '{}'
		);
		
		-- Summaries table
		CREATE TABLE IF NOT EXISTS summaries (
			id SERIAL PRIMARY KEY,
			case_id INTEGER NOT NULL,
			summary TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
		
		-- Indexes for performance
		CREATE INDEX IF NOT EXISTS idx_messages_case_id ON messages(case_id);
		CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_summaries_case_id ON summaries(case_id);
		
		-- HNSW index for vector similarity search
		CREATE INDEX IF NOT EXISTS idx_messages_embeddings_hnsw ON messages 
		USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
	`
	
	_, err := s.db.Exec(ctx, schema)
	return err
}

// startWorkers starts the background worker pools
func (s *StreamingRAGService) startWorkers() {
	// Start embedding workers
	for i := 0; i < 4; i++ {
		go s.embeddingWorker()
	}
	
	// Start generation workers
	for i := 0; i < 2; i++ {
		go s.generationWorker()
	}
	
	s.logger.Info("Worker pools started")
}

// embeddingWorker processes embedding generation jobs
func (s *StreamingRAGService) embeddingWorker() {
	for job := range s.embeddingQueue {
		embedding, err := s.generateEmbedding(context.Background(), job.Text)
		if err != nil {
			s.logger.Error("Embedding generation failed",
				zap.String("job_id", job.ID),
				zap.Error(err))
			
			s.broadcastEvent(SSEEvent{
				ID:        job.ID,
				Type:      EventTypeError,
				Timestamp: time.Now(),
				Data: map[string]interface{}{
					"error": err.Error(),
					"stage": "embedding_generation",
				},
			})
			continue
		}
		
		// Store message with embedding if it's a message
		if job.Type == "message" {
			messageID, err := s.storeMessage(context.Background(), &Message{
				CaseID:    job.CaseID,
				Sender:    "user",
				Content:   job.Text,
				Embedding: embedding,
				CreatedAt: time.Now(),
			})
			if err != nil {
				s.logger.Error("Failed to store message", zap.Error(err))
			} else {
				s.logger.Info("Message stored", zap.Int("message_id", messageID))
			}
		}
		
		// Broadcast embedding created event
		s.broadcastEvent(SSEEvent{
			ID:        job.ID,
			Type:      EventTypeEmbeddingCreated,
			Timestamp: time.Now(),
			Data: map[string]interface{}{
				"job_id":     job.ID,
				"case_id":    job.CaseID,
				"dimensions": len(embedding.Slice()),
				"type":       job.Type,
			},
		})
	}
}

// generationWorker processes text generation jobs
func (s *StreamingRAGService) generationWorker() {
	for job := range s.generationQueue {
		// Stream generation to client
		if err := s.streamGeneration(job); err != nil {
			s.logger.Error("Generation failed",
				zap.String("job_id", job.ID),
				zap.Error(err))
		}
	}
}

// generateEmbedding generates an embedding using nomic-embed-text
func (s *StreamingRAGService) generateEmbedding(ctx context.Context, text string) (pgvector.Vector, error) {
	reqBody, _ := json.Marshal(map[string]interface{}{
		"model":  EmbeddingModel,
		"prompt": text,
	})
	
	resp, err := http.Post(
		fmt.Sprintf("%s/api/embeddings", OllamaBaseURL),
		"application/json",
		bytes.NewBuffer(reqBody),
	)
	if err != nil {
		return pgvector.Vector{}, err
	}
	defer resp.Body.Close()
	
	var result struct {
		Embedding []float32 `json:"embedding"`
	}
	
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return pgvector.Vector{}, err
	}
	
	return pgvector.NewVector(result.Embedding), nil
}

// streamGeneration streams text generation using gemma3-legal
func (s *StreamingRAGService) streamGeneration(job *GenerationJob) error {
	reqBody, _ := json.Marshal(map[string]interface{}{
		"model":       GenerationModel,
		"prompt":      job.Prompt,
		"stream":      true,
		"temperature": job.Temperature,
		"options": map[string]interface{}{
			"num_predict": job.MaxTokens,
		},
	})
	
	resp, err := http.Post(
		fmt.Sprintf("%s/api/generate", OllamaBaseURL),
		"application/json",
		bytes.NewBuffer(reqBody),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	decoder := json.NewDecoder(resp.Body)
	fullResponse := strings.Builder{}
	
	for {
		var chunk struct {
			Response string `json:"response"`
			Done     bool   `json:"done"`
		}
		
		if err := decoder.Decode(&chunk); err != nil {
			if err == io.EOF {
				break
			}
			return err
		}
		
		if chunk.Response != "" {
			fullResponse.WriteString(chunk.Response)
			
			// Send streaming update
			s.sendToClient(job.ClientID, SSEEvent{
				ID:        job.ID,
				Type:      EventTypeGenerationUpdate,
				Timestamp: time.Now(),
				Data: map[string]interface{}{
					"token": chunk.Response,
					"done":  chunk.Done,
				},
			})
		}
		
		if chunk.Done {
			break
		}
	}
	
	// Store complete response
	if job.CaseID != nil {
		_, err := s.storeMessage(context.Background(), &Message{
			CaseID:    job.CaseID,
			Sender:    "assistant",
			Content:   fullResponse.String(),
			CreatedAt: time.Now(),
			Metadata: map[string]interface{}{
				"model":       GenerationModel,
				"temperature": job.Temperature,
			},
		})
		if err != nil {
			s.logger.Error("Failed to store assistant response", zap.Error(err))
		}
	}
	
	// Send completion event
	s.sendToClient(job.ClientID, SSEEvent{
		ID:        job.ID,
		Type:      EventTypeJobComplete,
		Timestamp: time.Now(),
		Data: map[string]interface{}{
			"response": fullResponse.String(),
			"case_id":  job.CaseID,
		},
	})
	
	return nil
}

// retrieveSimilarMessages finds similar messages using vector search
func (s *StreamingRAGService) retrieveSimilarMessages(ctx context.Context, queryEmbedding pgvector.Vector, caseID *int, limit int) ([]Message, error) {
	query := `
		SELECT id, case_id, sender, content, created_at, metadata,
			   embedding <=> $1 as similarity
		FROM messages 
		WHERE embedding IS NOT NULL
	`
	
	args := []interface{}{queryEmbedding}
	argIndex := 2
	
	if caseID != nil {
		query += fmt.Sprintf(" AND case_id = $%d", argIndex)
		args = append(args, *caseID)
		argIndex++
	}
	
	query += fmt.Sprintf(" ORDER BY embedding <=> $1 LIMIT $%d", argIndex)
	args = append(args, limit)
	
	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var messages []Message
	for rows.Next() {
		var msg Message
		var similarity float64
		
		err := rows.Scan(&msg.ID, &msg.CaseID, &msg.Sender, &msg.Content,
			&msg.CreatedAt, &msg.Metadata, &similarity)
		if err != nil {
			continue
		}
		
		if msg.Metadata == nil {
			msg.Metadata = make(map[string]interface{})
		}
		msg.Metadata["similarity"] = similarity
		
		messages = append(messages, msg)
	}
	
	return messages, nil
}

// storeMessage stores a message in the database
func (s *StreamingRAGService) storeMessage(ctx context.Context, msg *Message) (int, error) {
	query := `
		INSERT INTO messages (case_id, sender, content, embedding, created_at, metadata)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`
	
	var id int
	err := s.db.QueryRow(ctx, query, msg.CaseID, msg.Sender, msg.Content,
		msg.Embedding, msg.CreatedAt, msg.Metadata).Scan(&id)
	
	return id, err
}

// HTTP Handlers

// sseHandler handles SSE connections
func (s *StreamingRAGService) sseHandler(c *gin.Context) {
	clientID := c.Query("client_id")
	if clientID == "" {
		clientID = fmt.Sprintf("client_%d", time.Now().UnixNano())
	}
	
	// Set SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Access-Control-Allow-Headers", "Content-Type")
	
	// Create client channel
	clientChan := make(chan SSEEvent, 100)
	
	s.clientsMux.Lock()
	s.clients[clientID] = clientChan
	s.clientsMux.Unlock()
	
	// Send initial connection event
	event := SSEEvent{
		ID:        fmt.Sprintf("conn_%d", time.Now().UnixNano()),
		Type:      "connection",
		Timestamp: time.Now(),
		Data: map[string]interface{}{
			"client_id": clientID,
			"message":   "Connected to SSE stream",
		},
	}
	
	s.sendSSEEvent(c, event)
	c.Writer.Flush()
	
	// Keep connection alive and send events
	done := make(chan bool)
	go func() {
		for {
			select {
			case event := <-clientChan:
				s.sendSSEEvent(c, event)
				c.Writer.Flush()
			case <-done:
				return
			}
		}
	}()
	
	// Wait for client disconnect
	<-c.Request.Context().Done()
	done <- true
	
	// Clean up client
	s.clientsMux.Lock()
	delete(s.clients, clientID)
	close(clientChan)
	s.clientsMux.Unlock()
}

// ragHandler handles RAG queries
func (s *StreamingRAGService) ragHandler(c *gin.Context) {
	var req RAGRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Invalid request: %v", err),
		})
		return
	}
	
	clientID := c.Query("client_id")
	jobID := fmt.Sprintf("rag_%d", time.Now().UnixNano())
	
	// Generate query embedding
	queryEmbedding, err := s.generateEmbedding(context.Background(), req.Query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to generate query embedding",
		})
		return
	}
	
	// Find similar messages
	maxResults := req.MaxResults
	if maxResults == 0 {
		maxResults = 5
	}
	
	similarMessages, err := s.retrieveSimilarMessages(
		context.Background(), queryEmbedding, req.CaseID, maxResults)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to retrieve similar messages",
		})
		return
	}
	
	// Build context from similar messages
	context := s.buildContext(similarMessages)
	
	// Create generation prompt
	prompt := s.buildRAGPrompt(req.Query, context)
	
	if req.Stream && clientID != "" {
		// Queue streaming generation
		s.generationQueue <- &GenerationJob{
			ID:          jobID,
			Prompt:      prompt,
			CaseID:      req.CaseID,
			ClientID:    clientID,
			MaxTokens:   512,
			Temperature: 0.1,
		}
		
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"job_id":  jobID,
			"message": "Streaming generation started",
		})
	} else {
		// Non-streaming response (TODO: implement)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Non-streaming RAG not yet implemented",
		})
	}
}

// Utility functions

func (s *StreamingRAGService) buildContext(messages []Message) string {
	var contextBuilder strings.Builder
	
	for _, msg := range messages {
		contextBuilder.WriteString(fmt.Sprintf("[%s]: %s\n", msg.Sender, msg.Content))
	}
	
	return contextBuilder.String()
}

func (s *StreamingRAGService) buildRAGPrompt(query, context string) string {
	return fmt.Sprintf(`Based on the following conversation context, answer the user's question:

Context:
%s

Question: %s

Answer:`, context, query)
}

func (s *StreamingRAGService) sendSSEEvent(c *gin.Context, event SSEEvent) {
	data, _ := json.Marshal(event)
	fmt.Fprintf(c.Writer, "id: %s\n", event.ID)
	fmt.Fprintf(c.Writer, "event: %s\n", event.Type)
	fmt.Fprintf(c.Writer, "data: %s\n\n", data)
}

func (s *StreamingRAGService) sendToClient(clientID string, event SSEEvent) {
	s.clientsMux.RLock()
	clientChan, exists := s.clients[clientID]
	s.clientsMux.RUnlock()
	
	if exists {
		select {
		case clientChan <- event:
			// Event sent successfully
		default:
			// Channel full, skip event
			s.logger.Warn("Client channel full, dropping event",
				zap.String("client_id", clientID))
		}
	}
}

func (s *StreamingRAGService) broadcastEvent(event SSEEvent) {
	s.clientsMux.RLock()
	defer s.clientsMux.RUnlock()
	
	for clientID, clientChan := range s.clients {
		select {
		case clientChan <- event:
			// Event sent successfully
		default:
			// Channel full, skip event
			s.logger.Warn("Client channel full, dropping broadcast",
				zap.String("client_id", clientID))
		}
	}
}

// eventsHandler receives events from LangChain service and forwards to SSE clients
func (s *StreamingRAGService) eventsHandler(c *gin.Context) {
	var eventData struct {
		ClientID string `json:"client_id" binding:"required"`
		Event    SSEEvent `json:"event" binding:"required"`
	}

	if err := c.ShouldBindJSON(&eventData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Invalid request: %v", err),
		})
		return
	}

	// Send event to the specified client
	s.sendToClient(eventData.ClientID, eventData.Event)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Event forwarded to SSE client",
	})
}

func (s *StreamingRAGService) healthHandler(c *gin.Context) {
	s.clientsMux.RLock()
	clientCount := len(s.clients)
	s.clientsMux.RUnlock()
	
	c.JSON(http.StatusOK, gin.H{
		"service":       "sse-rag-service",
		"status":        "healthy",
		"clients":       clientCount,
		"embedding_model": EmbeddingModel,
		"generation_model": GenerationModel,
		"features": []string{
			"sse_streaming",
			"vector_search",
			"rag_generation",
			"real_time_updates",
		},
	})
}

func main() {
	service, err := NewStreamingRAGService()
	if err != nil {
		log.Fatalf("Failed to initialize SSE RAG service: %v", err)
	}
	defer service.db.Close()
	
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	
	// CORS middleware
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})
	
	// API routes
	api := r.Group("/api/v1")
	{
		api.GET("/sse", service.sseHandler)           // SSE endpoint
		api.POST("/rag", service.ragHandler)          // RAG queries
		api.POST("/events", service.eventsHandler)    // LangChain integration events
		api.GET("/health", service.healthHandler)     // Health check
	}
	
	service.logger.Info("Starting SSE Streaming RAG Service",
		zap.String("port", ServicePort))
	
	log.Fatal(http.ListenAndServe(ServicePort, r))
}