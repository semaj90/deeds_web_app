package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	minio "github.com/minio/minio-go/v7"
	pgvector "github.com/pgvector/pgvector-go"
	"go.uber.org/zap"
)

// =============================================================================
// DOCUMENT CHUNKING WITH SMART OVERLAPPING WINDOWS
// =============================================================================

// ChunkingStrategy defines different document chunking approaches
type ChunkingStrategy struct {
	Name            string `json:"name"`
	ChunkSize       int    `json:"chunk_size"`
	OverlapSize     int    `json:"overlap_size"`
	PreserveSentences bool  `json:"preserve_sentences"`
	UseSemanticBreaks bool  `json:"use_semantic_breaks"`
}

var DefaultChunkingStrategies = map[string]ChunkingStrategy{
	"legal_contracts": {
		Name:              "legal_contracts",
		ChunkSize:         768,
		OverlapSize:       128,
		PreserveSentences: true,
		UseSemanticBreaks: true,
	},
	"case_law": {
		Name:              "case_law",
		ChunkSize:         1024,
		OverlapSize:       256,
		PreserveSentences: true,
		UseSemanticBreaks: true,
	},
	"statutes": {
		Name:              "statutes",
		ChunkSize:         512,
		OverlapSize:       64,
		PreserveSentences: false,
		UseSemanticBreaks: true,
	},
}

// processDocumentChunks handles intelligent document chunking
func (s *UnifiedRAGService) processDocumentChunks(doc *Document) error {
	ctx := context.Background()

	// Download document from MinIO
	content, err := s.getDocumentContent(ctx, doc.MinIOPath)
	if err != nil {
		return fmt.Errorf("failed to get document content: %w", err)
	}

	// Determine chunking strategy based on document type
	strategy := s.selectChunkingStrategy(doc, content)

	// Create smart chunks with overlapping windows
	chunks := s.createSmartChunks(content, strategy)

	s.logger.Info("Created document chunks",
		zap.String("document_id", doc.ID),
		zap.Int("chunk_count", len(chunks)),
		zap.String("strategy", strategy.Name))

	// Store chunks in database and queue for embedding generation
	for i, chunk := range chunks {
		chunkObj := &DocumentChunk{
			DocumentID:  doc.ID,
			ChunkIndex:  i,
			Content:     chunk.Content,
			StartChar:   chunk.StartChar,
			EndChar:     chunk.EndChar,
			TokenCount:  s.estimateTokenCount(chunk.Content),
			LegalDomain: s.classifyLegalDomain(chunk.Content),
			Confidence:  s.calculateChunkConfidence(chunk.Content),
			CreatedAt:   time.Now(),
		}

		// Store chunk
		if err := s.storeDocumentChunk(ctx, chunkObj); err != nil {
			s.logger.Error("Failed to store chunk", zap.Error(err))
			continue
		}

		// Queue for embedding generation
		embeddingJob := &embeddingJob{
			Chunk:    chunkObj,
			Response: make(chan error, 1),
		}

		select {
		case s.embeddingQueue <- embeddingJob:
			// Queued successfully
		default:
			s.logger.Warn("Embedding queue full, skipping chunk")
		}
	}

	// Update document with chunk count
	_, err = s.db.Exec(ctx,
		"UPDATE rag_documents SET chunk_count = $1, processed_at = CURRENT_TIMESTAMP WHERE id = $2",
		len(chunks), doc.ID)

	return err
}

// SmartChunk represents a chunk with metadata
type SmartChunk struct {
	Content   string
	StartChar int
	EndChar   int
	Metadata  map[string]interface{}
}

// createSmartChunks implements advanced chunking with semantic boundaries
func (s *UnifiedRAGService) createSmartChunks(content string, strategy ChunkingStrategy) []SmartChunk {
	if strategy.UseSemanticBreaks {
		// Use legal document structure markers
		return s.createSemanticChunks(content, strategy)
	}

	// Fallback to overlapping window chunking
	return s.createOverlappingChunks(content, strategy)
}

// createSemanticChunks creates chunks based on legal document structure
func (s *UnifiedRAGService) createSemanticChunks(content string, strategy ChunkingStrategy) []SmartChunk {
	var chunks []SmartChunk

	// Legal document patterns
	sectionPattern := regexp.MustCompile(`(?i)(section|§|\d+\.|article|chapter|part)\s*[\d\w]+`)
	paragraphPattern := regexp.MustCompile(`\n\n+`)

	sections := sectionPattern.Split(content, -1)

	for i, section := range sections {
		if len(section) <= 50 { // Skip tiny sections
			continue
		}

		// Split large sections into paragraphs
		if len(section) > strategy.ChunkSize*2 {
			paragraphs := paragraphPattern.Split(section, -1)
			currentChunk := ""
			startPos := strings.Index(content, section)
			currentStart := startPos

			for _, para := range paragraphs {
				if len(currentChunk)+len(para) > strategy.ChunkSize {
					if currentChunk != "" {
						chunks = append(chunks, SmartChunk{
							Content:   currentChunk,
							StartChar: currentStart,
							EndChar:   currentStart + len(currentChunk),
							Metadata: map[string]interface{}{
								"section_index": i,
								"chunk_type":   "semantic_paragraph",
							},
						})
					}
					currentChunk = para
					currentStart = startPos + strings.Index(section, para)
				} else {
					if currentChunk != "" {
						currentChunk += "\n\n"
					}
					currentChunk += para
				}
			}

			if currentChunk != "" {
				chunks = append(chunks, SmartChunk{
					Content:   currentChunk,
					StartChar: currentStart,
					EndChar:   currentStart + len(currentChunk),
					Metadata: map[string]interface{}{
						"section_index": i,
						"chunk_type":   "semantic_paragraph",
					},
				})
			}
		} else {
			// Section fits in one chunk
			startPos := strings.Index(content, section)
			chunks = append(chunks, SmartChunk{
				Content:   section,
				StartChar: startPos,
				EndChar:   startPos + len(section),
				Metadata: map[string]interface{}{
					"section_index": i,
					"chunk_type":   "semantic_section",
				},
			})
		}
	}

	return chunks
}

// createOverlappingChunks creates chunks with overlapping windows
func (s *UnifiedRAGService) createOverlappingChunks(content string, strategy ChunkingStrategy) []SmartChunk {
	var chunks []SmartChunk
	runes := []rune(content)

	for i := 0; i < len(runes); i += (strategy.ChunkSize - strategy.OverlapSize) {
		end := i + strategy.ChunkSize
		if end > len(runes) {
			end = len(runes)
		}

		chunkContent := string(runes[i:end])

		// Preserve sentence boundaries if requested
		if strategy.PreserveSentences && end < len(runes) {
			lastSentence := strings.LastIndex(chunkContent, ".")
			if lastSentence > strategy.ChunkSize/2 { // Don't break if sentence is too early
				end = i + lastSentence + 1
				chunkContent = string(runes[i:end])
			}
		}

		chunks = append(chunks, SmartChunk{
			Content:   chunkContent,
			StartChar: i,
			EndChar:   end,
			Metadata: map[string]interface{}{
				"chunk_type": "overlapping_window",
				"overlap_size": strategy.OverlapSize,
			},
		})

		if end >= len(runes) {
			break
		}
	}

	return chunks
}

// =============================================================================
// STREAMING EMBEDDING GENERATION WITH GPU ACCELERATION
// =============================================================================

// generateChunkEmbedding generates vector embedding for a chunk with caching
func (s *UnifiedRAGService) generateChunkEmbedding(chunk *DocumentChunk) error {
	ctx := context.Background()
func (s *UnifiedRAGService) generateChunkEmbedding(chunk *DocumentChunk) error {
	ctx := context.Background()

	// Check if an embedding already exists (avoid scanning a pgvector type)
	var exists bool
	err := s.db.QueryRow(ctx,
		"SELECT EXISTS (SELECT 1 FROM rag_document_chunks WHERE id = $1 AND embedding IS NOT NULL)",
		chunk.ID).Scan(&exists)

	if err == nil && exists {
		// Embedding already exists
		return nil
	}

	// Generate new embedding via Ollama
	embedding, err := s.generateEmbeddingViaOllama(ctx, chunk.Content)
	if err != nil {
		return fmt.Errorf("failed to generate embedding: %w", err)
	}

	// Store embedding in database (pass the pgvector value)
	_, err = s.db.Exec(ctx,
		"UPDATE rag_document_chunks SET embedding = $1 WHERE id = $2",
		embedding, chunk.ID)

	if err != nil {
		return fmt.Errorf("failed to store embedding: %w", err)
	}

	s.logger.Debug("Generated embedding for chunk",
		zap.String("chunk_id", chunk.ID),
		zap.Int("embedding_dim", len(embedding.Slice())))

	return nil
}
func (s *UnifiedRAGService) generateEmbeddingViaOllama(ctx context.Context, text string) (pgvector.Vector, error) {
	embedReq := map[string]interface{}{
		"model":  EmbeddingModel,
		"prompt": text,
	}

	reqBody, _ := json.Marshal(embedReq)

	req, err := http.NewRequestWithContext(ctx, "POST",
		fmt.Sprintf("%s/api/embeddings", OllamaBaseURL),
		strings.NewReader(string(reqBody)))
	if err != nil {
		return pgvector.Vector{}, err
	}

	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
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

// =============================================================================
// ADVANCED VECTOR SEARCH WITH HYBRID SCORING
// =============================================================================

// retrieveSimilarChunks performs hybrid vector + keyword search
func (s *UnifiedRAGService) retrieveSimilarChunks(ctx context.Context, query *RAGQuery) ([]DocumentChunk, error) {
	// Generate query embedding
	queryEmbedding, err := s.generateEmbeddingViaOllama(ctx, query.Query)
	if err != nil {
		return nil, fmt.Errorf("failed to generate query embedding: %w", err)
	}

	// Build search query with filters
	searchQuery := `
		SELECT
			c.id, c.document_id, c.chunk_index, c.content, c.embedding,
			c.start_char, c.end_char, c.token_count, c.legal_domain, c.confidence,
			c.created_at,
			(c.embedding <=> $1) as vector_distance,
			ts_rank(to_tsvector('english', c.content), plainto_tsquery('english', $2)) as keyword_score
		FROM rag_document_chunks c
		WHERE c.embedding IS NOT NULL
	`

	args := []interface{}{queryEmbedding, query.Query}
	argIndex := 3

	// Add legal domain filter
	if len(query.LegalDomains) > 0 {
		placeholders := make([]string, len(query.LegalDomains))
		for i, domain := range query.LegalDomains {
			placeholders[i] = fmt.Sprintf("$%d", argIndex)
			args = append(args, domain)
			argIndex++
		}
		searchQuery += fmt.Sprintf(" AND c.legal_domain = ANY(ARRAY[%s])", strings.Join(placeholders, ","))
	}

	// Add confidence filter
	if query.MinConfidence > 0 {
		searchQuery += fmt.Sprintf(" AND c.confidence >= $%d", argIndex)
		args = append(args, query.MinConfidence)
		argIndex++
	}

	// Hybrid scoring: combine vector similarity and keyword relevance
	searchQuery += `
		ORDER BY (
			0.7 * (1 - (c.embedding <=> $1)) +
			0.3 * ts_rank(to_tsvector('english', c.content), plainto_tsquery('english', $2))
		) DESC
	`

	// Add limit
	limit := query.MaxResults
	if limit == 0 {
		limit = MaxRetrievalResults
	}
	searchQuery += fmt.Sprintf(" LIMIT $%d", argIndex)
	args = append(args, limit)

	rows, err := s.db.Query(ctx, searchQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("vector search failed: %w", err)
	}
	defer rows.Close()

	var chunks []DocumentChunk
	for rows.Next() {
		var chunk DocumentChunk
		var vectorDistance, keywordScore float64

		err := rows.Scan(
			&chunk.ID, &chunk.DocumentID, &chunk.ChunkIndex, &chunk.Content,
			&chunk.Embedding, &chunk.StartChar, &chunk.EndChar, &chunk.TokenCount,
			&chunk.LegalDomain, &chunk.Confidence, &chunk.CreatedAt,
			&vectorDistance, &keywordScore,
		)
		if err != nil {
			s.logger.Error("Failed to scan chunk", zap.Error(err))
			continue
		}

		chunks = append(chunks, chunk)
	}

	s.logger.Info("Vector search completed",
		zap.String("query", query.Query),
		zap.Int("results", len(chunks)))

	return chunks, nil
}

// =============================================================================
// GPU-ACCELERATED SHADER CACHING SYSTEM
// =============================================================================

// ShaderCache represents cached GPU shader programs for WebGPU acceleration
type ShaderCache struct {
	ID          string    `json:"id"`
	ShaderType  string    `json:"shader_type"`  // "vertex", "fragment", "compute"
	Source      string    `json:"source"`
	Compiled    []byte    `json:"compiled"`
	Metadata    string    `json:"metadata"`
	HitCount    int64     `json:"hit_count"`
	CreatedAt   time.Time `json:"created_at"`
	LastUsed    time.Time `json:"last_used"`
}

// cacheShaderHandler caches WebGPU shaders for legal document visualization
func (s *UnifiedRAGService) cacheShaderHandler(c *gin.Context) {
	var shader ShaderCache
	if err := c.ShouldBindJSON(&shader); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Invalid shader data: %v", err),
		})
		return
	}

	// Generate shader hash for caching
	hasher := sha256.Sum256([]byte(shader.Source))
	shaderID := fmt.Sprintf("shader_%x", hasher)
	shader.ID = shaderID
	shader.CreatedAt = time.Now()
	shader.LastUsed = time.Now()

	// Store in database
	ctx := context.Background()
	_, err := s.db.Exec(ctx, `
		INSERT INTO gpu_shader_cache (id, shader_type, source, compiled, metadata, hit_count, created_at, last_used)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (id) DO UPDATE SET
			hit_count = gpu_shader_cache.hit_count + 1,
			last_used = CURRENT_TIMESTAMP
	`, shader.ID, shader.ShaderType, shader.Source, shader.Compiled,
		shader.Metadata, 1, shader.CreatedAt, shader.LastUsed)

	if err != nil {
		s.logger.Error("Failed to cache shader", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to cache shader",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"shader_id": shaderID,
		"cached_at": shader.CreatedAt,
	})
}

// =============================================================================
// ADDITIONAL HELPER METHODS
// =============================================================================

// Helper implementations for the unified service
func (s *UnifiedRAGService) storeDocument(doc *Document) (string, error) {
	ctx := context.Background()
	var id string
	err := s.db.QueryRow(ctx, `
		INSERT INTO rag_documents (title, file_type, file_size, minio_path, metadata, uploaded_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, doc.Title, doc.FileType, doc.FileSize, doc.MinIOPath,
		doc.Metadata, doc.UploadedAt).Scan(&id)
	return id, err
}

func (s *UnifiedRAGService) storeDocumentChunk(ctx context.Context, chunk *DocumentChunk) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO rag_document_chunks
		(document_id, chunk_index, content, start_char, end_char, token_count, legal_domain, confidence, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, chunk.DocumentID, chunk.ChunkIndex, chunk.Content, chunk.StartChar,
		chunk.EndChar, chunk.TokenCount, chunk.LegalDomain, chunk.Confidence, chunk.CreatedAt)
	return err
}

func (s *UnifiedRAGService) getDocumentContent(ctx context.Context, minioPath string) (string, error) {
	object, err := s.minioClient.GetObject(ctx, MinIOBucketName, minioPath, minio.GetObjectOptions{})
	if err != nil {
		return "", err
	}
	defer object.Close()

	content, err := io.ReadAll(object)
	if err != nil {
		return "", err
	}

	return string(content), nil
}

func (s *UnifiedRAGService) selectChunkingStrategy(doc *Document, content string) ChunkingStrategy {
	// Simple heuristics for strategy selection
	lowerTitle := strings.ToLower(doc.Title)
	lowerContent := strings.ToLower(content)

	if strings.Contains(lowerTitle, "contract") || strings.Contains(lowerContent, "agreement") {
		return DefaultChunkingStrategies["legal_contracts"]
	}

	if strings.Contains(lowerTitle, "case") || strings.Contains(lowerContent, "plaintiff") || strings.Contains(lowerContent, "defendant") {
		return DefaultChunkingStrategies["case_law"]
	}

	if strings.Contains(lowerContent, "statute") || strings.Contains(lowerContent, "section") {
		return DefaultChunkingStrategies["statutes"]
	}

	// Default to contract strategy
	return DefaultChunkingStrategies["legal_contracts"]
}

func (s *UnifiedRAGService) estimateTokenCount(text string) int {
	// Rough approximation: 1 token ≈ 4 characters for English
	return len(text) / 4
}

func (s *UnifiedRAGService) classifyLegalDomain(text string) string {
	lower := strings.ToLower(text)

	switch {
	case strings.Contains(lower, "contract") || strings.Contains(lower, "agreement"):
		return "contract"
	case strings.Contains(lower, "criminal") || strings.Contains(lower, "crime"):
		return "criminal"
	case strings.Contains(lower, "tort") || strings.Contains(lower, "negligence"):
		return "tort"
	case strings.Contains(lower, "property") || strings.Contains(lower, "real estate"):
		return "property"
	case strings.Contains(lower, "constitutional"):
		return "constitutional"
	case strings.Contains(lower, "corporate") || strings.Contains(lower, "business"):
		return "corporate"
	case strings.Contains(lower, "family") || strings.Contains(lower, "divorce"):
		return "family"
	default:
		return "general"
	}
}

func (s *UnifiedRAGService) calculateChunkConfidence(content string) float32 {
	confidence := float32(0.5)

	// Legal terminology increases confidence
	legalTerms := []string{"law", "legal", "court", "judge", "statute", "regulation", "case", "precedent"}
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

func (s *UnifiedRAGService) processDocumentAsync(doc *Document) {
	job := &chunkJob{
		Document: doc,
		Response: make(chan error, 1),
	}

	select {
	case s.chunkProcessor <- job:
		if err := <-job.Response; err != nil {
			s.logger.Error("Document processing failed",
				zap.String("document_id", doc.ID),
				zap.Error(err))
		}
	default:
		s.logger.Warn("Chunk processor queue full",
			zap.String("document_id", doc.ID))
	}
}

// Additional handler implementations
func (s *UnifiedRAGService) listDocumentsHandler(c *gin.Context) {
	// Implementation for listing documents
	c.JSON(http.StatusOK, gin.H{"message": "List documents - Implementation needed"})
}

func (s *UnifiedRAGService) getDocumentHandler(c *gin.Context) {
	// Implementation for getting specific document
	c.JSON(http.StatusOK, gin.H{"message": "Get document - Implementation needed"})
}

func (s *UnifiedRAGService) deleteDocumentHandler(c *gin.Context) {
	// Implementation for deleting document
	c.JSON(http.StatusOK, gin.H{"message": "Delete document - Implementation needed"})
}

func (s *UnifiedRAGService) semanticSearchHandler(c *gin.Context) {
	query := c.Query("q")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))

	ragQuery := &RAGQuery{
		Query:      query,
		MaxResults: limit,
	}

	chunks, err := s.retrieveSimilarChunks(context.Background(), ragQuery)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"query":   query,
		"results": chunks,
		"count":   len(chunks),
	})
}

func (s *UnifiedRAGService) healthHandler(c *gin.Context) {
	s.mutex.RLock()
	stats := map[string]interface{}{
		"service": "unified-rag-service",
		"status":  "healthy",
		"metrics": map[string]interface{}{
			"documents_processed": s.documentsProcessed,
			"chunks_generated":   s.chunksGenerated,
			"queries_handled":    s.queriesHandled,
		},
		"features": []string{
			"document_chunking",
			"streaming_embeddings",
			"vector_search",
			"shader_caching",
			"gpu_workers",
			"minio_storage",
			"postgresql_pgvector",
		},
	}
	s.mutex.RUnlock()

	c.JSON(http.StatusOK, stats)
}

func (s *UnifiedRAGService) metricsHandler(c *gin.Context) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	c.JSON(http.StatusOK, gin.H{
		"documents_processed": s.documentsProcessed,
		"chunks_generated":   s.chunksGenerated,
		"queries_handled":    s.queriesHandled,
		"timestamp":          time.Now(),
	})
}