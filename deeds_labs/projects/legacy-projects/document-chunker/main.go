package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// Simple, focused document chunking service
// Does one thing well: takes documents and creates smart chunks

const (
	ServicePort   = ":9002"
	PostgreSQLURL = "postgres://legal_admin:123456@localhost:5432/legal_ai_db"
)

// ChunkRequest represents a document to be chunked
type ChunkRequest struct {
	DocumentID   string                 `json:"document_id" binding:"required"`
	Content      string                 `json:"content" binding:"required"`
	Title        string                 `json:"title"`
	ChunkSize    int                    `json:"chunk_size,omitempty"`    // Default 512
	OverlapSize  int                    `json:"overlap_size,omitempty"`  // Default 64
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

// ChunkResponse represents the chunking result
type ChunkResponse struct {
	DocumentID      string          `json:"document_id"`
	ChunksCreated   int             `json:"chunks_created"`
	ProcessingTime  int64           `json:"processing_time_ms"`
	Chunks          []DocumentChunk `json:"chunks,omitempty"`
	Success         bool            `json:"success"`
	Error           string          `json:"error,omitempty"`
}

// DocumentChunk represents a chunk of a document
type DocumentChunk struct {
	ID           string    `json:"id"`
	DocumentID   string    `json:"document_id"`
	ChunkIndex   int       `json:"chunk_index"`
	Content      string    `json:"content"`
	StartChar    int       `json:"start_char"`
	EndChar      int       `json:"end_char"`
	TokenCount   int       `json:"token_count"`
	LegalDomain  string    `json:"legal_domain"`
	Confidence   float32   `json:"confidence"`
	CreatedAt    time.Time `json:"created_at"`
}

// StreamingChunkResponse for streaming chunking results
type StreamingChunkResponse struct {
	Type        string      `json:"type"` // "chunk", "progress", "complete", "error"
	ChunkIndex  int         `json:"chunk_index,omitempty"`
	Content     string      `json:"content,omitempty"`
	Progress    float32     `json:"progress,omitempty"`
	Error       string      `json:"error,omitempty"`
	Metadata    interface{} `json:"metadata,omitempty"`
}

// DocumentChunker handles document chunking operations
type DocumentChunker struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

// NewDocumentChunker creates a new document chunking service
func NewDocumentChunker() (*DocumentChunker, error) {
	logger, _ := zap.NewProduction()
	
	// PostgreSQL connection
	db, err := pgxpool.New(context.Background(), PostgreSQLURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to PostgreSQL: %w", err)
	}
	
	chunker := &DocumentChunker{
		db:     db,
		logger: logger,
	}
	
	// Initialize database schema
	if err := chunker.initializeSchema(); err != nil {
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}
	
	logger.Info("Document chunker initialized")
	return chunker, nil
}

// initializeSchema creates the necessary database tables
func (c *DocumentChunker) initializeSchema() error {
	ctx := context.Background()
	
	schema := `
		-- Document chunks table
		CREATE TABLE IF NOT EXISTS document_chunks (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			document_id VARCHAR(255) NOT NULL,
			chunk_index INTEGER NOT NULL,
			content TEXT NOT NULL,
			start_char INTEGER NOT NULL,
			end_char INTEGER NOT NULL,
			token_count INTEGER DEFAULT 0,
			legal_domain VARCHAR(100),
			confidence REAL DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(document_id, chunk_index)
		);
		
		-- Indexes for performance
		CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_id ON document_chunks(document_id);
		CREATE INDEX IF NOT EXISTS idx_document_chunks_domain ON document_chunks(legal_domain);
		CREATE INDEX IF NOT EXISTS idx_document_chunks_created ON document_chunks(created_at DESC);
	`
	
	_, err := c.db.Exec(ctx, schema)
	return err
}

// chunkDocument creates smart chunks from a document
func (c *DocumentChunker) chunkDocument(ctx context.Context, req *ChunkRequest) (*ChunkResponse, error) {
	startTime := time.Now()
	
	// Set defaults
	chunkSize := req.ChunkSize
	if chunkSize == 0 {
		chunkSize = 512
	}
	
	overlapSize := req.OverlapSize
	if overlapSize == 0 {
		overlapSize = 64
	}
	
	// Create chunks using smart chunking algorithm
	chunks := c.createSmartChunks(req.Content, chunkSize, overlapSize)
	
	var storedChunks []DocumentChunk
	
	// Store chunks in database
	for i, chunk := range chunks {
		chunkObj := DocumentChunk{
			DocumentID:  req.DocumentID,
			ChunkIndex:  i,
			Content:     chunk.Content,
			StartChar:   chunk.StartChar,
			EndChar:     chunk.EndChar,
			TokenCount:  c.estimateTokens(chunk.Content),
			LegalDomain: c.classifyLegalDomain(chunk.Content),
			Confidence:  c.calculateConfidence(chunk.Content),
			CreatedAt:   time.Now(),
		}
		
		// Store in database
		chunkID, err := c.storeChunk(ctx, &chunkObj)
		if err != nil {
			c.logger.Error("Failed to store chunk", zap.Error(err), zap.Int("chunk_index", i))
			continue
		}
		
		chunkObj.ID = chunkID
		storedChunks = append(storedChunks, chunkObj)
	}
	
	c.logger.Info("Document chunked successfully",
		zap.String("document_id", req.DocumentID),
		zap.Int("chunks_created", len(storedChunks)),
		zap.Int64("processing_time_ms", time.Since(startTime).Milliseconds()))
	
	return &ChunkResponse{
		DocumentID:     req.DocumentID,
		ChunksCreated:  len(storedChunks),
		ProcessingTime: time.Since(startTime).Milliseconds(),
		Chunks:         storedChunks,
		Success:        true,
	}, nil
}

// SmartChunk represents a chunk with metadata
type SmartChunk struct {
	Content   string
	StartChar int
	EndChar   int
}

// createSmartChunks implements intelligent chunking with overlapping windows
func (c *DocumentChunker) createSmartChunks(content string, chunkSize, overlapSize int) []SmartChunk {
	var chunks []SmartChunk
	
	// Try semantic chunking first for legal documents
	if c.isLegalDocument(content) {
		semanticChunks := c.createSemanticChunks(content, chunkSize)
		if len(semanticChunks) > 0 {
			return semanticChunks
		}
	}
	
	// Fallback to sliding window chunking
	return c.createSlidingWindowChunks(content, chunkSize, overlapSize)
}

// createSemanticChunks creates chunks based on legal document structure
func (c *DocumentChunker) createSemanticChunks(content string, maxChunkSize int) []SmartChunk {
	var chunks []SmartChunk
	
	// Legal document patterns
	sectionPattern := regexp.MustCompile(`(?i)(section|§|\d+\.|article|chapter|part)\s*[\d\w]+[^\n]*`)
	_ = regexp.MustCompile(`\n\s*\n+`) // paragraphPattern - will be used for paragraph splitting
	
	// Split by sections first  
	sectionMatches := sectionPattern.FindAllStringIndex(content, -1)
	
	if len(sectionMatches) > 0 {
		// Process each section
		for i, match := range sectionMatches {
			startPos := match[0]
			endPos := len(content)
			if i < len(sectionMatches)-1 {
				endPos = sectionMatches[i+1][0]
			}
			
			sectionContent := content[startPos:endPos]
			
			// If section is too large, split by paragraphs
			if len(sectionContent) > maxChunkSize {
				paraChunks := c.splitByParagraphs(sectionContent, maxChunkSize, startPos)
				chunks = append(chunks, paraChunks...)
			} else {
				chunks = append(chunks, SmartChunk{
					Content:   sectionContent,
					StartChar: startPos,
					EndChar:   endPos,
				})
			}
		}
	}
	
	return chunks
}

// splitByParagraphs splits content by paragraphs with size limits
func (c *DocumentChunker) splitByParagraphs(content string, maxSize, offset int) []SmartChunk {
	var chunks []SmartChunk
	paragraphs := regexp.MustCompile(`\n\s*\n+`).Split(content, -1)
	
	currentChunk := ""
	currentStart := offset
	
	for i, para := range paragraphs {
		if len(currentChunk)+len(para) > maxSize && currentChunk != "" {
			// Finalize current chunk
			chunks = append(chunks, SmartChunk{
				Content:   currentChunk,
				StartChar: currentStart,
				EndChar:   currentStart + len(currentChunk),
			})
			
			// Start new chunk
			currentChunk = para
			currentStart = offset + strings.Index(content, para)
		} else {
			if currentChunk != "" && i > 0 {
				currentChunk += "\n\n"
			}
			currentChunk += para
		}
	}
	
	// Add final chunk
	if currentChunk != "" {
		chunks = append(chunks, SmartChunk{
			Content:   currentChunk,
			StartChar: currentStart,
			EndChar:   currentStart + len(currentChunk),
		})
	}
	
	return chunks
}

// createSlidingWindowChunks creates overlapping chunks
func (c *DocumentChunker) createSlidingWindowChunks(content string, chunkSize, overlapSize int) []SmartChunk {
	var chunks []SmartChunk
	runes := []rune(content)
	
	for i := 0; i < len(runes); i += (chunkSize - overlapSize) {
		end := i + chunkSize
		if end > len(runes) {
			end = len(runes)
		}
		
		chunkContent := string(runes[i:end])
		
		// Try to end at sentence boundary
		if end < len(runes) {
			lastSentence := strings.LastIndex(chunkContent, ".")
			if lastSentence > chunkSize/2 {
				end = i + lastSentence + 1
				chunkContent = string(runes[i:end])
			}
		}
		
		chunks = append(chunks, SmartChunk{
			Content:   chunkContent,
			StartChar: i,
			EndChar:   end,
		})
		
		if end >= len(runes) {
			break
		}
	}
	
	return chunks
}

// Helper methods

func (c *DocumentChunker) isLegalDocument(content string) bool {
	legalTerms := []string{"section", "article", "chapter", "statute", "law", "court", "plaintiff", "defendant", "contract", "agreement"}
	lowerContent := strings.ToLower(content)
	
	count := 0
	for _, term := range legalTerms {
		if strings.Contains(lowerContent, term) {
			count++
		}
	}
	
	return count >= 2 // If 2+ legal terms found, treat as legal document
}

func (c *DocumentChunker) estimateTokens(text string) int {
	return len(text) / 4 // Rough approximation
}

func (c *DocumentChunker) classifyLegalDomain(text string) string {
	lower := strings.ToLower(text)
	
	switch {
	case strings.Contains(lower, "contract") || strings.Contains(lower, "agreement"):
		return "contract"
	case strings.Contains(lower, "criminal") || strings.Contains(lower, "crime"):
		return "criminal"
	case strings.Contains(lower, "tort") || strings.Contains(lower, "negligence"):
		return "tort"
	case strings.Contains(lower, "property"):
		return "property"
	case strings.Contains(lower, "corporate"):
		return "corporate"
	case strings.Contains(lower, "family"):
		return "family"
	default:
		return "general"
	}
}

func (c *DocumentChunker) calculateConfidence(content string) float32 {
	confidence := float32(0.5)
	
	// Legal terminology increases confidence
	legalTerms := []string{"law", "legal", "court", "statute", "regulation"}
	for _, term := range legalTerms {
		if strings.Contains(strings.ToLower(content), term) {
			confidence += 0.1
			if confidence > 1.0 {
				confidence = 1.0
				break
			}
		}
	}
	
	return confidence
}

func (c *DocumentChunker) storeChunk(ctx context.Context, chunk *DocumentChunk) (string, error) {
	query := `
		INSERT INTO document_chunks 
		(document_id, chunk_index, content, start_char, end_char, token_count, legal_domain, confidence, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id
	`
	
	var id string
	err := c.db.QueryRow(ctx, query,
		chunk.DocumentID, chunk.ChunkIndex, chunk.Content, chunk.StartChar,
		chunk.EndChar, chunk.TokenCount, chunk.LegalDomain, chunk.Confidence, chunk.CreatedAt,
	).Scan(&id)
	
	return id, err
}

// HTTP Handlers

// chunkHandler handles synchronous document chunking
func (c *DocumentChunker) chunkHandler(ctx *gin.Context) {
	var req ChunkRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Invalid request: %v", err),
		})
		return
	}
	
	response, err := c.chunkDocument(context.Background(), &req)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}
	
	ctx.JSON(http.StatusOK, response)
}

// streamChunkHandler handles streaming document chunking
func (c *DocumentChunker) streamChunkHandler(ctx *gin.Context) {
	var req ChunkRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Invalid request: %v", err),
		})
		return
	}
	
	ctx.Header("Content-Type", "text/event-stream")
	ctx.Header("Cache-Control", "no-cache")
	ctx.Header("Connection", "keep-alive")
	
	// Stream chunking progress
	c.streamChunking(ctx, &req)
}

func (c *DocumentChunker) streamChunking(ctx *gin.Context, req *ChunkRequest) {
	chunkSize := req.ChunkSize
	if chunkSize == 0 {
		chunkSize = 512
	}
	
	overlapSize := req.OverlapSize
	if overlapSize == 0 {
		overlapSize = 64
	}
	
	// Send initial metadata
	c.sendStreamEvent(ctx, &StreamingChunkResponse{
		Type: "progress",
		Metadata: map[string]interface{}{
			"document_id": req.DocumentID,
			"chunk_size":  chunkSize,
			"overlap_size": overlapSize,
		},
	})
	
	chunks := c.createSmartChunks(req.Content, chunkSize, overlapSize)
	
	// Stream each chunk as it's processed
	for i, chunk := range chunks {
		chunkObj := DocumentChunk{
			DocumentID:  req.DocumentID,
			ChunkIndex:  i,
			Content:     chunk.Content,
			StartChar:   chunk.StartChar,
			EndChar:     chunk.EndChar,
			TokenCount:  c.estimateTokens(chunk.Content),
			LegalDomain: c.classifyLegalDomain(chunk.Content),
			Confidence:  c.calculateConfidence(chunk.Content),
			CreatedAt:   time.Now(),
		}
		
		// Store chunk
		chunkID, err := c.storeChunk(context.Background(), &chunkObj)
		if err != nil {
			c.sendStreamEvent(ctx, &StreamingChunkResponse{
				Type:  "error",
				Error: fmt.Sprintf("Failed to store chunk %d: %v", i, err),
			})
			continue
		}
		
		chunkObj.ID = chunkID
		
		// Send chunk created event
		c.sendStreamEvent(ctx, &StreamingChunkResponse{
			Type:       "chunk",
			ChunkIndex: i,
			Content:    chunk.Content[:min(100, len(chunk.Content))] + "...", // Preview
			Progress:   float32(i+1) / float32(len(chunks)),
		})
		
		ctx.Writer.Flush()
	}
	
	// Send completion
	c.sendStreamEvent(ctx, &StreamingChunkResponse{
		Type: "complete",
		Metadata: map[string]interface{}{
			"chunks_created": len(chunks),
			"document_id":    req.DocumentID,
		},
	})
}

func (c *DocumentChunker) sendStreamEvent(ctx *gin.Context, event *StreamingChunkResponse) {
	data, _ := json.Marshal(event)
	fmt.Fprintf(ctx.Writer, "data: %s\n\n", data)
}

func (c *DocumentChunker) healthHandler(ctx *gin.Context) {
	ctx.JSON(http.StatusOK, gin.H{
		"service": "document-chunker",
		"status":  "healthy",
		"features": []string{
			"smart_chunking",
			"semantic_chunking", 
			"streaming_chunking",
			"legal_document_detection",
			"postgresql_storage",
		},
	})
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func main() {
	chunker, err := NewDocumentChunker()
	if err != nil {
		log.Fatalf("Failed to initialize document chunker: %v", err)
	}
	defer chunker.db.Close()
	
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
		api.POST("/chunk", chunker.chunkHandler)
		api.POST("/chunk/stream", chunker.streamChunkHandler)
		api.GET("/health", chunker.healthHandler)
	}
	
	chunker.logger.Info("Starting Document Chunker Service", 
		zap.String("port", ServicePort))
	
	log.Fatal(http.ListenAndServe(ServicePort, r))
}