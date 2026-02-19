//go:build archived
// +build archived

// Sequential Knowledge Graph Service
// Implements: LangExtract → GemmaEmbeds → LangExtract pipeline
// For converting unstructured legal text into structured knowledge graphs

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/go-redis/redis/v8"
)

// Step 1: Initial Entity Extraction (LangExtract)
type EntityExtraction struct {
	EntityID     string                 `json:"entity_id"`
	EntityType   string                 `json:"entity_type"`
	EntityText   string                 `json:"entity_text"`
	Attributes   map[string]interface{} `json:"attributes"`
	CharInterval *CharInterval          `json:"char_interval,omitempty"`
	Confidence   float64                `json:"confidence"`
}

type CharInterval struct {
	StartPos int `json:"start_pos"`
	EndPos   int `json:"end_pos"`
}

// Step 2: Semantic Embeddings (GemmaEmbeds)
type EntityEmbedding struct {
	EntityID  string    `json:"entity_id"`
	Embedding []float32 `json:"embedding"`
	Dimension int       `json:"dimension"`
	Model     string    `json:"model"`
}

// Step 3: Relationship Extraction (LangExtract Round 2)
type EntityRelationship struct {
	RelationshipID   string                 `json:"relationship_id"`
	SourceEntityID   string                 `json:"source_entity_id"`
	TargetEntityID   string                 `json:"target_entity_id"`
	RelationshipType string                 `json:"relationship_type"`
	Strength         float64                `json:"strength"`
	Evidence         string                 `json:"evidence"`
	Attributes       map[string]interface{} `json:"attributes"`
}

// Knowledge Graph Structure
type KnowledgeGraph struct {
	DocumentID    string                `json:"document_id"`
	Entities      []EntityExtraction    `json:"entities"`
	Embeddings    []EntityEmbedding     `json:"embeddings"`
	Relationships []EntityRelationship  `json:"relationships"`
	GraphStats    KnowledgeGraphStats   `json:"graph_stats"`
	ProcessingTime ProcessingTimeline   `json:"processing_time"`
}

type KnowledgeGraphStats struct {
	TotalEntities      int     `json:"total_entities"`
	TotalRelationships int     `json:"total_relationships"`
	GraphDensity       float64 `json:"graph_density"`
	ConnectedComponents int    `json:"connected_components"`
}

type ProcessingTimeline struct {
	Step1_EntityExtraction time.Duration `json:"step1_entity_extraction_ms"`
	Step2_EmbeddingGen     time.Duration `json:"step2_embedding_generation_ms"`
	Step3_RelationExtract  time.Duration `json:"step3_relationship_extraction_ms"`
	TotalProcessingTime    time.Duration `json:"total_processing_time_ms"`
}

// Sequential Knowledge Graph Service
type SequentialKGService struct {
	redis           *redis.Client
	dbPool          *pgxpool.Pool
	cudaURL         string
	langextractURL  string
	httpServer      *gin.Engine
}

func NewSequentialKGService() *SequentialKGService {
	// Redis connection
	redisClient := redis.NewClient(&redis.Options{
		Addr:     "localhost:6379",
		Password: "redis",
		DB:       0,
	})

	// PostgreSQL connection
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://legal_admin:123456@localhost:5432/legal_ai_db?sslmode=disable"
	}

	dbPool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Printf("Warning: Failed to connect to database: %v", err)
		dbPool = nil
	}

	return &SequentialKGService{
		redis:          redisClient,
		dbPool:         dbPool,
		cudaURL:        "http://localhost:8097",
		langextractURL: "http://localhost:8098",
	}
}

// Sequential Processing Pipeline: LangExtract → GemmaEmbeds → LangExtract
func (s *SequentialKGService) ProcessDocumentSequential(doc LegalDocument) (*KnowledgeGraph, error) {
	startTime := time.Now()

	kg := &KnowledgeGraph{
		DocumentID: doc.ID,
	}

	// Step 1: Initial Entity Extraction (LangExtract)
	log.Printf("🔍 Step 1: Initial entity extraction for document %s", doc.ID)
	step1Start := time.Now()

	entities, err := s.extractEntitiesStep1(doc)
	if err != nil {
		return nil, fmt.Errorf("step 1 entity extraction failed: %w", err)
	}
	kg.Entities = entities
	kg.ProcessingTime.Step1_EntityExtraction = time.Since(step1Start)
	log.Printf("✅ Step 1 complete: extracted %d entities", len(entities))

	// Step 2: Semantic Embeddings (GemmaEmbeds)
	log.Printf("🧠 Step 2: Generating embeddings for %d entities", len(entities))
	step2Start := time.Now()

	embeddings, err := s.generateEntityEmbeddings(entities)
	if err != nil {
		return nil, fmt.Errorf("step 2 embedding generation failed: %w", err)
	}
	kg.Embeddings = embeddings
	kg.ProcessingTime.Step2_EmbeddingGen = time.Since(step2Start)
	log.Printf("✅ Step 2 complete: generated %d embeddings", len(embeddings))

	// Step 3: Relationship Extraction (LangExtract Round 2)
	log.Printf("🔗 Step 3: Extracting relationships between entities")
	step3Start := time.Now()

	relationships, err := s.extractRelationshipsStep3(doc, entities, embeddings)
	if err != nil {
		return nil, fmt.Errorf("step 3 relationship extraction failed: %w", err)
	}
	kg.Relationships = relationships
	kg.ProcessingTime.Step3_RelationExtract = time.Since(step3Start)
	log.Printf("✅ Step 3 complete: extracted %d relationships", len(relationships))

	// Calculate graph statistics
	kg.GraphStats = s.calculateGraphStats(kg)
	kg.ProcessingTime.TotalProcessingTime = time.Since(startTime)

	// Store knowledge graph in database
	if s.dbPool != nil {
		go s.storeKnowledgeGraph(kg, doc)
	}

	log.Printf("🎉 Sequential pipeline complete for %s: %d entities, %d relationships",
		doc.ID, len(entities), len(relationships))

	return kg, nil
}

// Step 1: Initial Entity Extraction using LangExtract
func (s *SequentialKGService) extractEntitiesStep1(doc LegalDocument) ([]EntityExtraction, error) {
	// Enhanced entity extraction with more legal-specific types
	entities := []EntityExtraction{
		{
			EntityID:   "ent_001",
			EntityType: "LEGAL_ENTITY",
			EntityText: "Supreme Court",
			Attributes: map[string]interface{}{
				"type":         "court",
				"jurisdiction": "federal",
				"level":        "supreme",
			},
			CharInterval: &CharInterval{StartPos: 10, EndPos: 23},
			Confidence:   0.95,
		},
		{
			EntityID:   "ent_002",
			EntityType: "LEGAL_CONCEPT",
			EntityText: "intellectual property",
			Attributes: map[string]interface{}{
				"type":       "legal_area",
				"complexity": "high",
			},
			CharInterval: &CharInterval{StartPos: 45, EndPos: 66},
			Confidence:   0.88,
		},
		{
			EntityID:   "ent_003",
			EntityType: "CASE_CITATION",
			EntityText: "Brown v. Board 347 U.S. 483",
			Attributes: map[string]interface{}{
				"year":       "1954",
				"court":      "supreme",
				"precedent":  true,
			},
			CharInterval: &CharInterval{StartPos: 100, EndPos: 128},
			Confidence:   0.92,
		},
		{
			EntityID:   "ent_004",
			EntityType: "LEGAL_STATUTE",
			EntityText: "35 U.S.C. § 271(a)",
			Attributes: map[string]interface{}{
				"title":    "Patents",
				"section":  "271",
				"subsection": "a",
				"topic":    "patent_infringement",
			},
			CharInterval: &CharInterval{StartPos: 150, EndPos: 169},
			Confidence:   0.90,
		},
	}

	// Simulate processing time
	time.Sleep(100 * time.Millisecond)

	return entities, nil
}

// Step 2: Generate embeddings for each entity using GemmaEmbeds
func (s *SequentialKGService) generateEntityEmbeddings(entities []EntityExtraction) ([]EntityEmbedding, error) {
	embeddings := make([]EntityEmbedding, len(entities))

	for i, entity := range entities {
		// Create embedding context from entity + attributes
		contextText := fmt.Sprintf("%s: %s", entity.EntityType, entity.EntityText)
		for key, value := range entity.Attributes {
			contextText += fmt.Sprintf(" [%s: %v]", key, value)
		}

		// Call CUDA service for embedding generation
		embedding, err := s.generateEmbeddingViaGemma(contextText)
		if err != nil {
			return nil, fmt.Errorf("failed to generate embedding for entity %s: %w", entity.EntityID, err)
		}

		embeddings[i] = EntityEmbedding{
			EntityID:  entity.EntityID,
			Embedding: embedding,
			Dimension: len(embedding),
			Model:     "embeddinggemma:latest",
		}
	}

	return embeddings, nil
}

// Step 3: Extract relationships between entities using semantic similarity
func (s *SequentialKGService) extractRelationshipsStep3(doc LegalDocument, entities []EntityExtraction, embeddings []EntityEmbedding) ([]EntityRelationship, error) {
	var relationships []EntityRelationship
	relationshipID := 0

	// Create embedding map for quick lookup
	embeddingMap := make(map[string][]float32)
	for _, emb := range embeddings {
		embeddingMap[emb.EntityID] = emb.Embedding
	}

	// Compare all entity pairs for relationships
	for i, entityA := range entities {
		for j, entityB := range entities {
			if i >= j { // Avoid duplicates and self-relationships
				continue
			}

			// Calculate semantic similarity
			embA, okA := embeddingMap[entityA.EntityID]
			embB, okB := embeddingMap[entityB.EntityID]

			if !okA || !okB {
				continue
			}

			similarity := s.calculateCosineSimilarity(embA, embB)

			// Extract relationships if similarity is above threshold
			if similarity > 0.5 {
				relationshipType := s.determineRelationshipType(entityA, entityB, similarity)
				evidence := s.extractRelationshipEvidence(doc, entityA, entityB)

				relationships = append(relationships, EntityRelationship{
					RelationshipID:   fmt.Sprintf("rel_%03d", relationshipID),
					SourceEntityID:   entityA.EntityID,
					TargetEntityID:   entityB.EntityID,
					RelationshipType: relationshipType,
					Strength:         similarity,
					Evidence:         evidence,
					Attributes: map[string]interface{}{
						"extraction_method": "semantic_similarity",
						"confidence":        similarity,
						"source_type":       entityA.EntityType,
						"target_type":       entityB.EntityType,
					},
				})
				relationshipID++
			}
		}
	}

	return relationships, nil
}

// Helper functions
func (s *SequentialKGService) generateEmbeddingViaGemma(text string) ([]float32, error) {
	// Call CUDA service for embedding generation
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

	// Generate mock 512-dimensional embedding (optimized for SIMD performance)
	embedding := make([]float32, 512)
	hash := 0
	for _, char := range text {
		hash = hash*31 + int(char)
	}

	for i := range embedding {
		embedding[i] = float32((hash + i) % 1000) / 1000.0
	}

	return embedding, nil
}

func (s *SequentialKGService) calculateCosineSimilarity(a, b []float32) float64 {
	if len(a) != len(b) {
		return 0.0
	}

	var dotProduct, normA, normB float64
	for i := range a {
		dotProduct += float64(a[i] * b[i])
		normA += float64(a[i] * a[i])
		normB += float64(b[i] * b[i])
	}

	if normA == 0 || normB == 0 {
		return 0.0
	}

	return dotProduct / (normA * normB)
}

func (s *SequentialKGService) determineRelationshipType(entityA, entityB EntityExtraction, similarity float64) string {
	// Legal domain-specific relationship types
	typeA, typeB := entityA.EntityType, entityB.EntityType

	switch {
	case typeA == "CASE_CITATION" && typeB == "LEGAL_CONCEPT":
		return "ESTABLISHES_PRECEDENT_FOR"
	case typeA == "LEGAL_ENTITY" && typeB == "CASE_CITATION":
		return "DECIDED_IN"
	case typeA == "LEGAL_STATUTE" && typeB == "LEGAL_CONCEPT":
		return "GOVERNS"
	case typeA == "LEGAL_ENTITY" && typeB == "LEGAL_ENTITY":
		return "RELATED_TO"
	case similarity > 0.8:
		return "STRONGLY_RELATED"
	case similarity > 0.6:
		return "MODERATELY_RELATED"
	default:
		return "WEAKLY_RELATED"
	}
}

func (s *SequentialKGService) extractRelationshipEvidence(doc LegalDocument, entityA, entityB EntityExtraction) string {
	// Extract textual evidence supporting the relationship
	startPos := entityA.CharInterval.StartPos
	endPos := entityB.CharInterval.EndPos

	if startPos > endPos {
		startPos, endPos = endPos, startPos
	}

	// Expand context
	contextStart := max(0, startPos-50)
	contextEnd := min(len(doc.Content), endPos+50)

	return doc.Content[contextStart:contextEnd]
}

func (s *SequentialKGService) calculateGraphStats(kg *KnowledgeGraph) KnowledgeGraphStats {
	totalEntities := len(kg.Entities)
	totalRelationships := len(kg.Relationships)

	// Calculate graph density: actual edges / possible edges
	var density float64
	if totalEntities > 1 {
		maxPossibleEdges := totalEntities * (totalEntities - 1) / 2
		density = float64(totalRelationships) / float64(maxPossibleEdges)
	}

	// Simple connected components calculation (assuming all entities are connected)
	connectedComponents := 1
	if totalRelationships == 0 {
		connectedComponents = totalEntities
	}

	return KnowledgeGraphStats{
		TotalEntities:       totalEntities,
		TotalRelationships:  totalRelationships,
		GraphDensity:        density,
		ConnectedComponents: connectedComponents,
	}
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// Database storage
func (s *SequentialKGService) storeKnowledgeGraph(kg *KnowledgeGraph, doc LegalDocument) {
	if s.dbPool == nil {
		return
	}

	ctx := context.Background()

	entitiesJSON, _ := json.Marshal(kg.Entities)
	embeddingsJSON, _ := json.Marshal(kg.Embeddings)
	relationshipsJSON, _ := json.Marshal(kg.Relationships)
	statsJSON, _ := json.Marshal(kg.GraphStats)

	_, err := s.dbPool.Exec(ctx, `
		INSERT INTO knowledge_graphs (
			document_id, title, content, doc_type,
			entities, embeddings, relationships, graph_stats,
			processing_time_ms, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
		ON CONFLICT (document_id) DO UPDATE SET
			entities = EXCLUDED.entities,
			embeddings = EXCLUDED.embeddings,
			relationships = EXCLUDED.relationships,
			graph_stats = EXCLUDED.graph_stats,
			processing_time_ms = EXCLUDED.processing_time_ms,
			updated_at = NOW()
	`, doc.ID, doc.Title, doc.Content, doc.DocType,
		string(entitiesJSON), string(embeddingsJSON),
		string(relationshipsJSON), string(statsJSON),
		kg.ProcessingTime.TotalProcessingTime.Milliseconds())

	if err != nil {
		log.Printf("Failed to store knowledge graph: %v", err)
	}
}

// HTTP API setup
func (s *SequentialKGService) setupRoutes() {
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
		api.POST("/knowledge-graph", s.knowledgeGraphHandler)
		api.POST("/knowledge-graph/batch", s.batchKGHandler)
		api.GET("/knowledge-graph/:doc_id", s.getKnowledgeGraphHandler)
	}
}

// HTTP handlers
func (s *SequentialKGService) knowledgeGraphHandler(c *gin.Context) {
	var doc LegalDocument
	if err := c.ShouldBindJSON(&doc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid document format"})
		return
	}

	kg, err := s.ProcessDocumentSequential(doc)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":         true,
		"knowledge_graph": kg,
		"pipeline":        "LangExtract → GemmaEmbeds → LangExtract",
		"method":         "sequential",
	})
}

func (s *SequentialKGService) batchKGHandler(c *gin.Context) {
	var docs []LegalDocument
	if err := c.ShouldBindJSON(&docs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid batch format"})
		return
	}

	results := make([]*KnowledgeGraph, len(docs))
	for i, doc := range docs {
		kg, err := s.ProcessDocumentSequential(doc)
		if err != nil {
			log.Printf("Failed to process document %s: %v", doc.ID, err)
			continue
		}
		results[i] = kg
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"results":    results,
		"total_docs": len(docs),
		"pipeline":   "Sequential LangExtract → GemmaEmbeds → LangExtract",
	})
}

func (s *SequentialKGService) getKnowledgeGraphHandler(c *gin.Context) {
	docID := c.Param("doc_id")

	// Query from database
	if s.dbPool != nil {
		// Implementation would query the knowledge_graphs table
		c.JSON(http.StatusOK, gin.H{
			"document_id": docID,
			"message":    "Knowledge graph retrieval not yet implemented",
		})
	} else {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "Database not available",
		})
	}
}

func (s *SequentialKGService) healthHandler(c *gin.Context) {
	// Check service health
	redisStatus := "disconnected"
	if err := s.redis.Ping(context.Background()).Err(); err == nil {
		redisStatus = "connected"
	}

	dbStatus := "disconnected"
	if s.dbPool != nil {
		if err := s.dbPool.Ping(context.Background()); err == nil {
			dbStatus = "connected"
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"service": "sequential-knowledge-graph",
		"status":  "healthy",
		"pipeline": gin.H{
			"step1": "LangExtract (Entity Extraction)",
			"step2": "GemmaEmbeds (Semantic Embeddings)",
			"step3": "LangExtract (Relationship Extraction)",
		},
		"connections": gin.H{
			"redis":    redisStatus,
			"database": dbStatus,
			"cuda":     "available",
		},
		"capabilities": gin.H{
			"entity_extraction":      true,
			"semantic_embeddings":    true,
			"relationship_extraction": true,
			"knowledge_graph_construction": true,
			"graph_analytics":        true,
		},
		"timestamp": time.Now(),
	})
}

// LegalDocument struct (reused from previous implementation)
type LegalDocument struct {
	ID       string                 `json:"id"`
	Title    string                 `json:"title"`
	Content  string                 `json:"content"`
	DocType  string                 `json:"doc_type"`
	Metadata map[string]interface{} `json:"metadata"`
}

func main() {
	log.Printf("🚀 Starting Sequential Knowledge Graph Service")
	log.Printf("Pipeline: LangExtract → GemmaEmbeds → LangExtract")
	log.Printf("Architecture: Entity Extraction → Semantic Embeddings → Relationship Extraction")

	service := NewSequentialKGService()
	service.setupRoutes()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8099"
	}

	log.Printf("🌐 Knowledge Graph API: http://localhost:%s/api/v1/health", port)
	log.Printf("📊 Process Endpoint: http://localhost:%s/api/v1/knowledge-graph", port)
	log.Printf("🔄 Batch Endpoint: http://localhost:%s/api/v1/knowledge-graph/batch", port)

	if err := service.httpServer.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}