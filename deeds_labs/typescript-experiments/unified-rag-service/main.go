package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/pgvector/pgvector-go"
	"go.uber.org/zap"
)

// Document represents a legal document stored in MinIO and its metadata.// Unified RAG Service - Replaces 100+ microservices with one comprehensive service
// Features: Document storage (MinIO), Vector search (pgvector), Streaming RAG, Smart chunking

const (
	// Service Configuration
	ServicePort       = ":9001"
	PostgreSQLURL     = "postgres://legal_admin:123456@localhost:5432/legal_ai_db"
	OllamaBaseURL     = "http://localhost:11434"
	EmbeddingModel    = "nomic-embed-text"
	EmbeddingDimension = 768

	// MinIO Configuration
	MinIOEndpoint   = "localhost:9000"
	MinIOAccessKey  = "minio"
	MinIOSecretKey  = "minio123"
	MinIOBucketName = "legal-documents"

	// RAG Configuration
	ChunkSize           = 512   // Characters per chunk
	ChunkOverlap        = 64    // Overlap between chunks
	MaxChunksPerDoc     = 1000  // Maximum chunks per document
	MaxRetrievalResults = 10    // Max similar chunks to retrieve

	// Streaming Configuration
	StreamBufferSize = 1024
	StreamTimeout    = 30 * time.Second
)

// Document represents a legal document in the systemtype Document struct {
	ID          string                 `json:"id"`
	Title       string                 `json:"title"`
	Content     string                 `json:"content"`
	FileType    string                 `json:"file_type"`
	FileSize    int64                  `json:"file_size"`
	MinIOPath   string                 `json:"minio_path"`
	Metadata    map[string]interface{} `json:"metadata"`
	ChunkCount  int                    `json:"chunk_count"`
	UploadedAt  time.Time             `json:"uploaded_at"`
	ProcessedAt *time.Time            `json:"processed_at,omitempty"`
}

// DocumentChunk represents a chunk of a document with vector embedding
type DocumentChunk struct {
	ID           string          `json:"id"`
	DocumentID   string          `json:"document_id"`
	ChunkIndex   int             `json:"chunk_index"`
	Content      string          `json:"content"`
	Embedding    pgvector.Vector `json:"embedding,omitempty"`
	StartChar    int             `json:"start_char"`
	EndChar      int             `json:"end_char"`
	TokenCount   int             `json:"token_count"`
	LegalDomain  string          `json:"legal_domain"`
	Confidence   float32         `json:"confidence"`
	CreatedAt    time.Time       `json:"created_at"`
}

// RAGQuery represents a query for RAG retrieval
type RAGQuery struct {
	Query           string   `json:"query" binding:"required"`
	MaxResults      int      `json:"max_results,omitempty"`
	LegalDomains    []string `json:"legal_domains,omitempty"`
	MinConfidence   float32  `json:"min_confidence,omitempty"`
	ContextWindow   int      `json:"context_window,omitempty"`
	Stream          bool     `json:"stream,omitempty"`
}

// RAGResponse represents the response from RAG retrieval
type RAGResponse struct {
	Query           string                 `json:"query"`
	Answer          string                 `json:"answer"`
	SourceChunks    []DocumentChunk        `json:"source_chunks"`
	Confidence      float32                `json:"confidence"`
	ProcessingTime  int64                  `json:"processing_time_ms"`
	TokensGenerated int                    `json:"tokens_generated"`
	Metadata        map[string]interface{} `json:"metadata"`
}

// StreamingRAGResponse represents a streaming chunk of RAG response
type StreamingRAGResponse struct {
	Type     string      `json:"type"` // "chunk", "metadata", "complete"
	Content  string      `json:"content,omitempty"`
	Metadata interface{} `json:"metadata,omitempty"`
	Error    string      `json:"error,omitempty"`
}

// UnifiedRAGService consolidates all RAG functionality into one service
type UnifiedRAGService struct {
	db          *pgxpool.Pool
	minioClient *minio.Client
	logger      *zap.Logger

	// Processing pools
	chunkProcessor chan *chunkJob
	embeddingQueue chan *embeddingJob

	// Metrics
	documentsProcessed int64
	chunksGenerated    int64
	queriesHandled     int64
	mutex              sync.RWMutex
}

type chunkJob struct {
	Document *Document
	Response chan error
}

type embeddingJob struct {
	Chunk    *DocumentChunk
	Response chan error
}

// NewUnifiedRAGService creates the consolidated RAG service
func NewUnifiedRAGService() (*UnifiedRAGService, error) {
	logger, _ := zap.NewProduction()

	// PostgreSQL connection
	db, err := pgxpool.New(context.Background(), PostgreSQLURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to PostgreSQL: %w", err)
	}

	// MinIO client
	minioClient, err := minio.New(MinIOEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(MinIOAccessKey, MinIOSecretKey, ""),
		Secure: false, // Use HTTPS in production
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create MinIO client: %w", err)
	}

	service := &UnifiedRAGService{
		db:             db,
		minioClient:    minioClient,
		logger:         logger,
		chunkProcessor: make(chan *chunkJob, 100),
		embeddingQueue: make(chan *embeddingJob, 500),
	}

	// Initialize storage
	if err := service.initializeStorage(); err != nil {
		return nil, fmt.Errorf("failed to initialize storage: %w", err)
	}

	// Start background workers
	service.startWorkers()

	logger.Info("Unified RAG Service initialized",
		zap.String("minio_endpoint", MinIOEndpoint),
		zap.String("bucket", MinIOBucketName))

	return service, nil
}

// initializeStorage sets up PostgreSQL schema and MinIO bucket
func (s *UnifiedRAGService) initializeStorage() error {
	ctx := context.Background()

	// Create MinIO bucket
	exists, err := s.minioClient.BucketExists(ctx, MinIOBucketName)
	if err != nil {
		return fmt.Errorf("failed to check MinIO bucket: %w", err)
	}

	if !exists {
		if err := s.minioClient.MakeBucket(ctx, MinIOBucketName, minio.MakeBucketOptions{}); err != nil {
			return fmt.Errorf("failed to create MinIO bucket: %w", err)
		}
		s.logger.Info("Created MinIO bucket", zap.String("bucket", MinIOBucketName))
	}

	// Create PostgreSQL schema
	schema := `
		-- Ensure pgvector extension
		CREATE EXTENSION IF NOT EXISTS vector;

		-- Documents table
		CREATE TABLE IF NOT EXISTS rag_documents (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			title TEXT NOT NULL,
			file_type VARCHAR(50) NOT NULL,
			file_size BIGINT NOT NULL,
			minio_path TEXT NOT NULL UNIQUE,
			metadata JSONB DEFAULT '{}',
			chunk_count INTEGER DEFAULT 0,
			uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			processed_at TIMESTAMP
		);

		-- Document chunks with embeddings
		CREATE TABLE IF NOT EXISTS rag_document_chunks (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			document_id UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
			chunk_index INTEGER NOT NULL,
			content TEXT NOT NULL,
			embedding vector(768),
			start_char INTEGER NOT NULL,
			end_char INTEGER NOT NULL,
			token_count INTEGER DEFAULT 0,
			legal_domain VARCHAR(100),
			confidence REAL DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(document_id, chunk_index)
		);

		-- RAG query cache
		CREATE TABLE IF NOT EXISTS rag_query_cache (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			query_hash VARCHAR(64) NOT NULL UNIQUE,
			query_text TEXT NOT NULL,
			response TEXT NOT NULL,
			source_chunks JSONB DEFAULT '[]',
			confidence REAL DEFAULT 0,
			processing_time_ms BIGINT DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			expires_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP + INTERVAL '24 hours'
		);

		-- Indexes for performance
		CREATE INDEX IF NOT EXISTS idx_rag_documents_uploaded ON rag_documents(uploaded_at DESC);
		CREATE INDEX IF NOT EXISTS idx_rag_documents_type ON rag_documents(file_type);
		CREATE INDEX IF NOT EXISTS idx_rag_chunks_document ON rag_document_chunks(document_id);
		CREATE INDEX IF NOT EXISTS idx_rag_chunks_domain ON rag_document_chunks(legal_domain);
		CREATE INDEX IF NOT EXISTS idx_rag_chunks_confidence ON rag_document_chunks(confidence DESC);
		CREATE INDEX IF NOT EXISTS idx_rag_query_cache_hash ON rag_query_cache(query_hash);
		CREATE INDEX IF NOT EXISTS idx_rag_query_cache_expires ON rag_query_cache(expires_at);

		-- HNSW index for vector similarity search
		CREATE INDEX IF NOT EXISTS idx_rag_embeddings_hnsw ON rag_document_chunks
		USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

		-- Clean up expired cache entries
		DELETE FROM rag_query_cache WHERE expires_at < CURRENT_TIMESTAMP;
	`

	_, err = s.db.Exec(ctx, schema)
	if err != nil {
		return fmt.Errorf("failed to create schema: %w", err)
	}

	s.logger.Info("Database schema initialized with pgvector support")
	return nil
}

// startWorkers starts background processing workers
func (s *UnifiedRAGService) startWorkers() {
	// Document chunking workers
	for i := 0; i < 4; i++ {
		go s.chunkWorker()
	}

	// Embedding generation workers
	for i := 0; i < 8; i++ {
		go s.embeddingWorker()
	}

	// Cache cleanup worker
	go s.cacheCleanupWorker()

	s.logger.Info("Background workers started")
}

// chunkWorker processes documents into chunks
func (s *UnifiedRAGService) chunkWorker() {
	for job := range s.chunkProcessor {
		err := s.processDocumentChunks(job.Document)
		job.Response <- err

		if err == nil {
			s.mutex.Lock()
			s.documentsProcessed++
			s.mutex.Unlock()
		}
	}
}

// embeddingWorker generates embeddings for chunks
func (s *UnifiedRAGService) embeddingWorker() {
	for job := range s.embeddingQueue {
		err := s.generateChunkEmbedding(job.Chunk)
		job.Response <- err

		if err == nil {
			s.mutex.Lock()
			s.chunksGenerated++
			s.mutex.Unlock()
		}
	}
}

// cacheCleanupWorker periodically cleans expired cache entries
func (s *UnifiedRAGService) cacheCleanupWorker() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		ctx := context.Background()
		_, err := s.db.Exec(ctx, "DELETE FROM rag_query_cache WHERE expires_at < CURRENT_TIMESTAMP")
		if err != nil {
			s.logger.Error("Failed to cleanup cache", zap.Error(err))
		} else {
			s.logger.Debug("Cleaned up expired cache entries")
		}
	}
}

// uploadDocumentHandler handles document uploads to MinIO
func (s *UnifiedRAGService) uploadDocumentHandler(c *gin.Context) {
	file, header, err := c.Request.FormFile("document")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Failed to get file: %v", err),
		})
		return
	}
	defer file.Close()

	// Generate unique path
	timestamp := time.Now().Format("2006/01/02")
	minioPath := fmt.Sprintf("%s/%s_%d_%s",
		timestamp,
		strings.ReplaceAll(header.Filename, " ", "_"),
		time.Now().Unix(),
		header.Filename)

	// Upload to MinIO
	uploadInfo, err := s.minioClient.PutObject(
		context.Background(),
		MinIOBucketName,
		minioPath,
		file,
		header.Size,
		minio.PutObjectOptions{
			ContentType: header.Header.Get("Content-Type"),
		},
	)
	if err != nil {
		s.logger.Error("MinIO upload failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Upload failed: %v", err),
		})
		return
	}

	// Create document record
	doc := &Document{
		Title:     header.Filename,
		FileType:  filepath.Ext(header.Filename),
		FileSize:  header.Size,
		MinIOPath: minioPath,
		Metadata: map[string]interface{}{
			"upload_info": uploadInfo,
			"content_type": header.Header.Get("Content-Type"),
		},
		UploadedAt: time.Now(),
	}

	// Store in database
	docID, err := s.storeDocument(doc)
	if err != nil {
		s.logger.Error("Failed to store document", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Database error: %v", err),
		})
		return
	}

	doc.ID = docID

	// Start async processing
	go s.processDocumentAsync(doc)

	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"document_id": docID,
		"minio_path":  minioPath,
		"file_size":   header.Size,
		"message":     "Document uploaded, processing started",
	})
}

// ragQueryHandler handles RAG queries with optional streaming
func (s *UnifiedRAGService) ragQueryHandler(c *gin.Context) {
	var query RAGQuery
	if err := c.ShouldBindJSON(&query); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Invalid query: %v", err),
		})
		return
	}

	if query.Stream {
		s.handleStreamingRAG(c, &query)
	} else {
		s.handleBatchRAG(c, &query)
	}
}

// handleStreamingRAG processes RAG queries with streaming response
func (s *UnifiedRAGService) handleStreamingRAG(c *gin.Context, query *RAGQuery) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")

	startTime := time.Now()

	// Send initial metadata
	s.sendStreamEvent(c, &StreamingRAGResponse{
		Type: "metadata",
		Metadata: map[string]interface{}{
			"query_id":    fmt.Sprintf("rag_%d", time.Now().UnixNano()),
			"started_at":  startTime,
			"max_results": query.MaxResults,
		},
	})

	// Retrieve similar chunks
	chunks, err := s.retrieveSimilarChunks(context.Background(), query)
	if err != nil {
		s.sendStreamEvent(c, &StreamingRAGResponse{
			Type:  "error",
			Error: fmt.Sprintf("Retrieval failed: %v", err),
		})
		return
	}

	// Send context information
	s.sendStreamEvent(c, &StreamingRAGResponse{
		Type: "metadata",
		Metadata: map[string]interface{}{
			"chunks_found": len(chunks),
			"sources":      s.getSourceDocuments(chunks),
		},
	})

	// Generate streaming response
	context := s.buildRAGContext(chunks)
	prompt := fmt.Sprintf(`Based on the following legal documents, answer the question: "%s"

Context:
%s

Answer:`, query.Query, context)

	// Stream from Ollama
	if err := s.streamFromOllama(c, prompt); err != nil {
		s.sendStreamEvent(c, &StreamingRAGResponse{
			Type:  "error",
			Error: fmt.Sprintf("Generation failed: %v", err),
		})
		return
	}

	// Send completion
	s.sendStreamEvent(c, &StreamingRAGResponse{
		Type: "complete",
		Metadata: map[string]interface{}{
			"processing_time_ms": time.Since(startTime).Milliseconds(),
			"chunks_used":        len(chunks),
		},
	})

	s.mutex.Lock()
	s.queriesHandled++
	s.mutex.Unlock()
}

// Helper functions for the RAG service would continue here...
// This is the foundation of the unified service that replaces the microservice sprawl

func (s *UnifiedRAGService) sendStreamEvent(c *gin.Context, event *StreamingRAGResponse) {
	data, _ := json.Marshal(event)
	fmt.Fprintf(c.Writer, "data: %s\n\n", data)
	c.Writer.Flush()
}

func main() {
	service, err := NewUnifiedRAGService()
	if err != nil {
		log.Fatalf("Failed to initialize RAG service: %v", err)
	}
	defer service.db.Close()

	// Setup router
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())

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

	// API routes - One service handles everything!
	api := r.Group("/api/v1")
	{
		// Document management
		api.POST("/documents/upload", service.uploadDocumentHandler)
		api.GET("/documents", service.listDocumentsHandler)
		api.GET("/documents/:id", service.getDocumentHandler)
		api.DELETE("/documents/:id", service.deleteDocumentHandler)

		// RAG queries
		api.POST("/rag/query", service.ragQueryHandler)
		api.GET("/rag/search", service.semanticSearchHandler)

		// Health and metrics
		api.GET("/health", service.healthHandler)
		api.GET("/metrics", service.metricsHandler)
	}

	service.logger.Info("Starting Unified RAG Service",
		zap.String("port", ServicePort),
		zap.String("features", "MinIO + PostgreSQL + pgvector + Streaming RAG"))

	log.Fatal(http.ListenAndServe(ServicePort, r))
}