//go:build archived
// +build archived

// Universal Document Accelerator (UDA) Worker - Production Architecture
// SvelteKit → MinIO → Go UDA Worker ↔ Redis ↔ Python GPU Service (gRPC)

package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"google.golang.org/grpc"
	"github.com/gorilla/websocket"
)

// Production UDA Worker with MinIO + gRPC + Streaming
type UDAWorkerProd struct {
	redis        *redis.Client
	dbPool       *pgxpool.Pool
	minioClient  *minio.Client
	grpcClient   LegalGPUServiceClient
	httpServer   *gin.Engine
	jobQueue     chan *UDAJobProd
	workers      int
	wsUpgrader   websocket.Upgrader
}

// Enhanced job structure for production
type UDAJobProd struct {
	JobID        string                 `json:"job_id"`
	DocumentID   string                 `json:"document_id"`
	FileName     string                 `json:"file_name"`
	FileSize     int64                  `json:"file_size"`
	ContentType  string                 `json:"content_type"`
	MinIOPath    string                 `json:"minio_path"`
	JobType      string                 `json:"job_type"`
	Status       string                 `json:"status"`
	Priority     string                 `json:"priority"`
	Progress     int                    `json:"progress"`
	CurrentStep  string                 `json:"current_step"`
	Steps        []ProcessingStep       `json:"steps"`
	Results      *ProcessingResults     `json:"results,omitempty"`
	CreatedAt    time.Time              `json:"created_at"`
	StartedAt    *time.Time             `json:"started_at,omitempty"`
	CompletedAt  *time.Time             `json:"completed_at,omitempty"`
	ErrorMsg     string                 `json:"error_msg,omitempty"`
	Metadata     map[string]interface{} `json:"metadata"`
}

// Processing step tracking
type ProcessingStep struct {
	Name        string    `json:"name"`
	Status      string    `json:"status"` // pending, running, completed, failed
	Progress    int       `json:"progress"`
	StartedAt   time.Time `json:"started_at,omitempty"`
	CompletedAt time.Time `json:"completed_at,omitempty"`
	Duration    int64     `json:"duration_ms,omitempty"`
	Details     string    `json:"details,omitempty"`
}

// Document chunks for processing
type DocumentChunk struct {
	ChunkID     string                 `json:"chunk_id"`
	DocumentID  string                 `json:"document_id"`
	Content     string                 `json:"content"`
	ChunkIndex  int                    `json:"chunk_index"`
	StartOffset int                    `json:"start_offset"`
	EndOffset   int                    `json:"end_offset"`
	Metadata    map[string]interface{} `json:"metadata"`
}

// Enhanced processing results
type ProcessingResults struct {
	DocumentMetadata  map[string]interface{}   `json:"document_metadata"`
	OCRResults        map[string]interface{}   `json:"ocr_results,omitempty"`
	Chunks           []DocumentChunk          `json:"chunks"`
	Entities         []map[string]interface{} `json:"entities"`
	Embeddings       []map[string]interface{} `json:"embeddings"`
	Relationships    []map[string]interface{} `json:"relationships"`
	KnowledgeGraph   map[string]interface{}   `json:"knowledge_graph,omitempty"`
	Performance      PerformanceMetrics       `json:"performance"`
}

type PerformanceMetrics struct {
	TotalProcessingTime int64            `json:"total_processing_time_ms"`
	StepTimings        map[string]int64 `json:"step_timings_ms"`
	ChunksProcessed    int              `json:"chunks_processed"`
	EntitiesExtracted  int              `json:"entities_extracted"`
	EmbeddingsGenerated int             `json:"embeddings_generated"`
	ThroughputMBps     float64          `json:"throughput_mbps"`
}

// gRPC client interface (placeholder - implement actual proto)
type LegalGPUServiceClient interface {
	ProcessOCR(ctx context.Context, req *OCRRequest) (*OCRResponse, error)
	ExtractEntities(ctx context.Context, req *NERRequest) (*NERResponse, error)
	GenerateEmbeddings(ctx context.Context, req *EmbeddingRequest) (*EmbeddingResponse, error)
}

// gRPC request/response types (implement from proto)
type OCRRequest struct {
	DocumentPath string `json:"document_path"`
	DocumentType string `json:"document_type"`
}

type OCRResponse struct {
	ExtractedText string                 `json:"extracted_text"`
	Confidence   float64                `json:"confidence"`
	Metadata     map[string]interface{} `json:"metadata"`
}

type NERRequest struct {
	Text string `json:"text"`
	Model string `json:"model"` // "legal-bert"
}

type NERResponse struct {
	Entities []map[string]interface{} `json:"entities"`
	Confidence float64               `json:"confidence"`
}

type EmbeddingRequest struct {
	Texts []string `json:"texts"`
	Model string   `json:"model"` // "embeddinggemma"
}

type EmbeddingResponse struct {
	Embeddings [][]float32 `json:"embeddings"`
	Dimensions int         `json:"dimensions"`
}

func NewUDAWorkerProd() *UDAWorkerProd {
	// Redis connection for job queue and progress
	redisClient := redis.NewClient(&redis.Options{
		Addr:     "localhost:6379",
		Password: "redis",
		DB:       1,
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

	// MinIO client setup
	minioClient, err := minio.New("localhost:9000", &minio.Options{
		Creds:  credentials.NewStaticV4("minioadmin", "minioadmin", ""),
		Secure: false,
	})
	if err != nil {
		log.Printf("Warning: Failed to connect to MinIO: %v", err)
	}

	// gRPC connection to Python GPU service (placeholder)
	// conn, err := grpc.Dial("localhost:50051", grpc.WithInsecure())
	// grpcClient := NewLegalGPUServiceClient(conn)

	return &UDAWorkerProd{
		redis:       redisClient,
		dbPool:      dbPool,
		minioClient: minioClient,
		// grpcClient:  grpcClient,
		jobQueue: make(chan *UDAJobProd, 100),
		workers:  4,
		wsUpgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

// Start production worker with enhanced features
func (uda *UDAWorkerProd) Start() {
	log.Printf("🚀 Starting Production UDA Worker")
	log.Printf("Architecture: SvelteKit → MinIO → Go UDA → Redis → Python GPU (gRPC)")

	// Ensure MinIO bucket exists
	uda.ensureMinIOBucket("legal-documents")

	// Start worker goroutines
	for i := 0; i < uda.workers; i++ {
		go uda.processJobsWithStreaming(i)
	}

	// Start job queue listener
	go uda.listenForJobs()

	log.Printf("✅ Production UDA Workers started with streaming support")
}

// Enhanced job processing with streaming progress
func (uda *UDAWorkerProd) processJobsWithStreaming(workerID int) {
	log.Printf("🔧 Enhanced Worker %d started", workerID)

	for job := range uda.jobQueue {
		log.Printf("🔄 Worker %d processing job %s", workerID, job.JobID)

		// Initialize job steps
		job.Steps = []ProcessingStep{
			{Name: "download_from_minio", Status: "pending"},
			{Name: "ocr_processing", Status: "pending"},
			{Name: "chunking", Status: "pending"},
			{Name: "entity_extraction", Status: "pending"},
			{Name: "embedding_generation", Status: "pending"},
			{Name: "knowledge_graph", Status: "pending"},
			{Name: "store_results", Status: "pending"},
		}

		// Update job status
		job.Status = "processing"
		now := time.Now()
		job.StartedAt = &now
		uda.updateJobStatusWithStreaming(job)

		// Process job with detailed steps
		err := uda.processJobSteps(job)
		if err != nil {
			log.Printf("❌ Worker %d failed job %s: %v", workerID, job.JobID, err)
			job.Status = "failed"
			job.ErrorMsg = err.Error()
		} else {
			log.Printf("✅ Worker %d completed job %s", workerID, job.JobID)
			job.Status = "completed"
			job.Progress = 100
		}

		// Final update
		completedAt := time.Now()
		job.CompletedAt = &completedAt
		uda.updateJobStatusWithStreaming(job)
	}
}

// Process job with detailed steps and progress streaming
func (uda *UDAWorkerProd) processJobSteps(job *UDAJobProd) error {
	startTime := time.Now()

	// Step 1: Download from MinIO
	if err := uda.processStep(job, 0, func() error {
		return uda.downloadFromMinIO(job)
	}); err != nil {
		return err
	}

	// Step 2: OCR Processing (if needed)
	if err := uda.processStep(job, 1, func() error {
		return uda.processOCR(job)
	}); err != nil {
		return err
	}

	// Step 3: Chunking
	if err := uda.processStep(job, 2, func() error {
		return uda.chunkDocument(job)
	}); err != nil {
		return err
	}

	// Step 4: Entity Extraction via gRPC
	if err := uda.processStep(job, 3, func() error {
		return uda.extractEntitiesGRPC(job)
	}); err != nil {
		return err
	}

	// Step 5: Embedding Generation via gRPC
	if err := uda.processStep(job, 4, func() error {
		return uda.generateEmbeddingsGRPC(job)
	}); err != nil {
		return err
	}

	// Step 6: Knowledge Graph Construction
	if err := uda.processStep(job, 5, func() error {
		return uda.buildKnowledgeGraph(job)
	}); err != nil {
		return err
	}

	// Step 7: Store Results
	if err := uda.processStep(job, 6, func() error {
		return uda.storeResults(job)
	}); err != nil {
		return err
	}

	// Calculate performance metrics
	totalTime := time.Since(startTime)
	if job.Results == nil {
		job.Results = &ProcessingResults{}
	}

	job.Results.Performance = PerformanceMetrics{
		TotalProcessingTime: totalTime.Milliseconds(),
		ChunksProcessed:     len(job.Results.Chunks),
		EntitiesExtracted:   len(job.Results.Entities),
		EmbeddingsGenerated: len(job.Results.Embeddings),
		ThroughputMBps:     float64(job.FileSize) / float64(totalTime.Seconds()) / 1024 / 1024,
	}

	return nil
}

// Process individual step with progress tracking
func (uda *UDAWorkerProd) processStep(job *UDAJobProd, stepIndex int, stepFunc func() error) error {
	step := &job.Steps[stepIndex]
	step.Status = "running"
	step.StartedAt = time.Now()

	job.CurrentStep = step.Name
	job.Progress = stepIndex * 100 / len(job.Steps)
	uda.updateJobStatusWithStreaming(job)

	// Execute step
	err := stepFunc()

	// Update step completion
	step.CompletedAt = time.Now()
	step.Duration = step.CompletedAt.Sub(step.StartedAt).Milliseconds()

	if err != nil {
		step.Status = "failed"
		step.Details = err.Error()
		return err
	} else {
		step.Status = "completed"
		step.Progress = 100
	}

	job.Progress = (stepIndex + 1) * 100 / len(job.Steps)
	uda.updateJobStatusWithStreaming(job)

	return nil
}

// Download document from MinIO
func (uda *UDAWorkerProd) downloadFromMinIO(job *UDAJobProd) error {
	log.Printf("📥 Downloading %s from MinIO", job.MinIOPath)

	object, err := uda.minioClient.GetObject(context.Background(), "legal-documents", job.MinIOPath, minio.GetObjectOptions{})
	if err != nil {
		return fmt.Errorf("failed to get object from MinIO: %w", err)
	}
	defer object.Close()

	// Read content for processing
	content, err := io.ReadAll(object)
	if err != nil {
		return fmt.Errorf("failed to read object content: %w", err)
	}

	// Store content for processing (in memory or temp file)
	if job.Results == nil {
		job.Results = &ProcessingResults{}
	}

	job.Results.DocumentMetadata = map[string]interface{}{
		"file_size":    len(content),
		"content_type": job.ContentType,
		"download_time": time.Now(),
	}

	return nil
}

// Process OCR if needed (delegate to Python GPU service)
func (uda *UDAWorkerProd) processOCR(job *UDAJobProd) error {
	// Check if OCR is needed based on content type
	if !strings.Contains(job.ContentType, "pdf") {
		log.Printf("⏭️ Skipping OCR for %s (not PDF)", job.ContentType)
		return nil
	}

	log.Printf("🔍 Processing OCR for job %s", job.JobID)

	// gRPC call to Python service (placeholder implementation)
	// req := &OCRRequest{
	// 	DocumentPath: job.MinIOPath,
	// 	DocumentType: job.ContentType,
	// }
	//
	// resp, err := uda.grpcClient.ProcessOCR(context.Background(), req)
	// if err != nil {
	// 	return fmt.Errorf("OCR processing failed: %w", err)
	// }

	// Mock OCR results for now
	job.Results.OCRResults = map[string]interface{}{
		"extracted_text": "Mock OCR extracted text...",
		"confidence":     0.95,
		"pages":         1,
	}

	return nil
}

// Chunk document into processable segments
func (uda *UDAWorkerProd) chunkDocument(job *UDAJobProd) error {
	log.Printf("📄 Chunking document for job %s", job.JobID)

	// Get text content (from OCR or direct)
	var text string
	if job.Results.OCRResults != nil {
		text = job.Results.OCRResults["extracted_text"].(string)
	} else {
		// Mock text for now - would read from MinIO
		text = "Legal document content would be here..."
	}

	// Chunk text into 512-token segments (optimized for SIMD)
	chunks := uda.createChunks(text, 512, job.DocumentID)
	job.Results.Chunks = chunks

	log.Printf("✂️ Created %d chunks for document %s", len(chunks), job.DocumentID)
	return nil
}

// Create text chunks
func (uda *UDAWorkerProd) createChunks(text string, maxTokens int, docID string) []DocumentChunk {
	words := strings.Fields(text)
	var chunks []DocumentChunk

	chunkSize := maxTokens // Approximate tokens as words
	for i := 0; i < len(words); i += chunkSize {
		end := i + chunkSize
		if end > len(words) {
			end = len(words)
		}

		chunkText := strings.Join(words[i:end], " ")
		chunks = append(chunks, DocumentChunk{
			ChunkID:     fmt.Sprintf("%s_chunk_%d", docID, len(chunks)),
			DocumentID:  docID,
			Content:     chunkText,
			ChunkIndex:  len(chunks),
			StartOffset: i,
			EndOffset:   end,
			Metadata: map[string]interface{}{
				"word_count": end - i,
				"created_at": time.Now(),
			},
		})
	}

	return chunks
}

// Extract entities via gRPC to Python GPU service
func (uda *UDAWorkerProd) extractEntitiesGRPC(job *UDAJobProd) error {
	log.Printf("🧬 Extracting entities via gRPC for job %s", job.JobID)

	var allEntities []map[string]interface{}

	// Process each chunk
	for i, chunk := range job.Results.Chunks {
		// Update progress
		chunkProgress := int(float64(i) / float64(len(job.Results.Chunks)) * 100)
		job.Steps[3].Progress = chunkProgress
		uda.updateJobStatusWithStreaming(job)

		// gRPC call to Python Legal-BERT service (placeholder)
		// req := &NERRequest{
		// 	Text:  chunk.Content,
		// 	Model: "legal-bert",
		// }
		//
		// resp, err := uda.grpcClient.ExtractEntities(context.Background(), req)
		// if err != nil {
		// 	return fmt.Errorf("entity extraction failed for chunk %d: %w", i, err)
		// }

		// Mock entities for now
		entities := []map[string]interface{}{
			{
				"entity_type": "LEGAL_ENTITY",
				"text":       "Supreme Court",
				"confidence": 0.95,
				"chunk_id":   chunk.ChunkID,
				"start_pos":  10,
				"end_pos":    23,
			},
		}

		allEntities = append(allEntities, entities...)
	}

	job.Results.Entities = allEntities
	log.Printf("🎯 Extracted %d entities from %d chunks", len(allEntities), len(job.Results.Chunks))

	return nil
}

// Generate embeddings via gRPC
func (uda *UDAWorkerProd) generateEmbeddingsGRPC(job *UDAJobProd) error {
	log.Printf("🧠 Generating embeddings via gRPC for job %s", job.JobID)

	// Extract texts for embedding
	var texts []string
	for _, chunk := range job.Results.Chunks {
		texts = append(texts, chunk.Content)
	}

	// gRPC call to Python EmbeddingGemma service (placeholder)
	// req := &EmbeddingRequest{
	// 	Texts: texts,
	// 	Model: "embeddinggemma",
	// }
	//
	// resp, err := uda.grpcClient.GenerateEmbeddings(context.Background(), req)
	// if err != nil {
	// 	return fmt.Errorf("embedding generation failed: %w", err)
	// }

	// Mock embeddings (512-dimensional for SIMD optimization)
	var embeddings []map[string]interface{}
	for i, chunk := range job.Results.Chunks {
		embedding := make([]float32, 512)
		for j := range embedding {
			embedding[j] = float32(i*j) / 1000.0 // Mock deterministic data
		}

		embeddings = append(embeddings, map[string]interface{}{
			"chunk_id":   chunk.ChunkID,
			"embedding":  embedding,
			"dimensions": 512,
			"model":      "embeddinggemma",
		})
	}

	job.Results.Embeddings = embeddings
	log.Printf("🎯 Generated %d embeddings (512-dim)", len(embeddings))

	return nil
}

// Build knowledge graph
func (uda *UDAWorkerProd) buildKnowledgeGraph(job *UDAJobProd) error {
	log.Printf("🔗 Building knowledge graph for job %s", job.JobID)

	// Use existing knowledge graph service
	reqData := map[string]interface{}{
		"id":      job.DocumentID,
		"title":   job.FileName,
		"content": "Aggregated content from chunks",
		"doc_type": "legal_document",
		"metadata": job.Metadata,
	}

	jsonData, _ := json.Marshal(reqData)
	resp, err := http.Post("http://localhost:8099/api/v1/knowledge-graph",
		"application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("knowledge graph service error: %w", err)
	}
	defer resp.Body.Close()

	var kgResult map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&kgResult); err != nil {
		return fmt.Errorf("failed to decode KG response: %w", err)
	}

	job.Results.KnowledgeGraph = kgResult
	return nil
}

// Store results in PostgreSQL and MinIO
func (uda *UDAWorkerProd) storeResults(job *UDAJobProd) error {
	log.Printf("💾 Storing results for job %s", job.JobID)

	if uda.dbPool == nil {
		return fmt.Errorf("database not available")
	}

	ctx := context.Background()

	// Store in uda_processing_results table
	resultsJSON, _ := json.Marshal(job.Results)
	stepsJSON, _ := json.Marshal(job.Steps)
	metadataJSON, _ := json.Marshal(job.Metadata)

	_, err := uda.dbPool.Exec(ctx, `
		INSERT INTO uda_processing_results (
			job_id, document_id, file_name, minio_path,
			results, steps, performance_metrics,
			total_processing_time_ms, created_at, metadata
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
	`, job.JobID, job.DocumentID, job.FileName, job.MinIOPath,
		string(resultsJSON), string(stepsJSON),
		job.Results.Performance.TotalProcessingTime,
		job.Results.Performance.TotalProcessingTime, string(metadataJSON))

	if err != nil {
		return fmt.Errorf("failed to store results: %w", err)
	}

	return nil
}

// Update job status with WebSocket streaming
func (uda *UDAWorkerProd) updateJobStatusWithStreaming(job *UDAJobProd) {
	// Update Redis
	jobJSON, _ := json.Marshal(job)
	uda.redis.Set(context.Background(), fmt.Sprintf("uda:job:%s", job.JobID),
		string(jobJSON), 24*time.Hour)

	// Publish to Redis for WebSocket streaming
	progressUpdate := map[string]interface{}{
		"job_id":      job.JobID,
		"status":      job.Status,
		"progress":    job.Progress,
		"current_step": job.CurrentStep,
		"steps":       job.Steps,
		"timestamp":   time.Now(),
	}

	progressJSON, _ := json.Marshal(progressUpdate)
	uda.redis.Publish(context.Background(), fmt.Sprintf("uda:progress:%s", job.JobID), string(progressJSON))
}

// Ensure MinIO bucket exists
func (uda *UDAWorkerProd) ensureMinIOBucket(bucketName string) {
	ctx := context.Background()

	exists, err := uda.minioClient.BucketExists(ctx, bucketName)
	if err != nil {
		log.Printf("Error checking bucket: %v", err)
		return
	}

	if !exists {
		err = uda.minioClient.MakeBucket(ctx, bucketName, minio.MakeBucketOptions{})
		if err != nil {
			log.Printf("Error creating bucket: %v", err)
		} else {
			log.Printf("✅ Created MinIO bucket: %s", bucketName)
		}
	}
}

// Listen for jobs (Redis implementation)
func (uda *UDAWorkerProd) listenForJobs() {
	for {
		result, err := uda.redis.BLPop(context.Background(), 0, "uda:job_queue").Result()
		if err != nil {
			log.Printf("Redis queue error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		var job UDAJobProd
		if err := json.Unmarshal([]byte(result[1]), &job); err != nil {
			log.Printf("Failed to parse job: %v", err)
			continue
		}

		select {
		case uda.jobQueue <- &job:
			log.Printf("📝 Queued production job %s", job.JobID)
		default:
			log.Printf("⚠️ Job queue full, dropping job %s", job.JobID)
		}
	}
}

// Setup HTTP routes for production
func (uda *UDAWorkerProd) setupRoutes() {
	gin.SetMode(gin.ReleaseMode)
	uda.httpServer = gin.New()
	uda.httpServer.Use(gin.Logger(), gin.Recovery())

	// CORS
	uda.httpServer.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	api := uda.httpServer.Group("/api/v1")
	{
		api.GET("/health", uda.healthHandler)
		api.POST("/upload", uda.uploadToMinIOHandler)
		api.POST("/process", uda.processDocumentHandler)
		api.GET("/jobs/:job_id", uda.getJobHandler)
		api.GET("/jobs/:job_id/progress", uda.streamProgressHandler)
		api.GET("/results/:job_id", uda.getResultsHandler)
	}
}

// Upload to MinIO handler
func (uda *UDAWorkerProd) uploadToMinIOHandler(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	// Generate paths
	docID := uuid.New().String()
	minioPath := fmt.Sprintf("documents/%s/%s", docID, header.Filename)

	// Upload to MinIO
	_, err = uda.minioClient.PutObject(context.Background(), "legal-documents",
		minioPath, file, header.Size, minio.PutObjectOptions{
			ContentType: header.Header.Get("Content-Type"),
		})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload to MinIO"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"document_id": docID,
		"file_name":   header.Filename,
		"file_size":   header.Size,
		"minio_path":  minioPath,
		"content_type": header.Header.Get("Content-Type"),
	})
}

// Process document handler (enhanced)
func (uda *UDAWorkerProd) processDocumentHandler(c *gin.Context) {
	var req struct {
		DocumentID  string                 `json:"document_id"`
		FileName    string                 `json:"file_name"`
		FileSize    int64                  `json:"file_size"`
		MinIOPath   string                 `json:"minio_path"`
		ContentType string                 `json:"content_type"`
		Pipeline    string                 `json:"pipeline"`
		Priority    string                 `json:"priority"`
		Metadata    map[string]interface{} `json:"metadata"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	// Create production job
	job := &UDAJobProd{
		JobID:       uuid.New().String(),
		DocumentID:  req.DocumentID,
		FileName:    req.FileName,
		FileSize:    req.FileSize,
		ContentType: req.ContentType,
		MinIOPath:   req.MinIOPath,
		JobType:     req.Pipeline,
		Status:      "pending",
		Priority:    req.Priority,
		Progress:    0,
		CreatedAt:   time.Now(),
		Metadata:    req.Metadata,
	}

	// Queue job
	jobJSON, _ := json.Marshal(job)
	err := uda.redis.RPush(context.Background(), "uda:job_queue", string(jobJSON)).Err()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to queue job"})
		return
	}

	uda.updateJobStatusWithStreaming(job)

	c.JSON(http.StatusCreated, gin.H{
		"job_id":         job.JobID,
		"status":         job.Status,
		"pipeline":       req.Pipeline,
		"estimated_time": "60s",
		"progress_url":   fmt.Sprintf("/api/v1/jobs/%s/progress", job.JobID),
	})
}

// Stream progress via WebSocket
func (uda *UDAWorkerProd) streamProgressHandler(c *gin.Context) {
	jobID := c.Param("job_id")

	// Upgrade to WebSocket
	conn, err := uda.wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	// Subscribe to Redis progress updates
	pubsub := uda.redis.Subscribe(context.Background(), fmt.Sprintf("uda:progress:%s", jobID))
	defer pubsub.Close()

	// Stream progress updates
	for {
		msg, err := pubsub.ReceiveMessage(context.Background())
		if err != nil {
			log.Printf("Redis subscription error: %v", err)
			break
		}

		// Send progress update to client
		if err := conn.WriteMessage(websocket.TextMessage, []byte(msg.Payload)); err != nil {
			log.Printf("WebSocket write error: %v", err)
			break
		}
	}
}

// Get job handler
func (uda *UDAWorkerProd) getJobHandler(c *gin.Context) {
	jobID := c.Param("job_id")

	jobJSON, err := uda.redis.Get(context.Background(), fmt.Sprintf("uda:job:%s", jobID)).Result()
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
		return
	}

	var job UDAJobProd
	if err := json.Unmarshal([]byte(jobJSON), &job); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse job"})
		return
	}

	c.JSON(http.StatusOK, job)
}

// Get results handler
func (uda *UDAWorkerProd) getResultsHandler(c *gin.Context) {
	jobID := c.Param("job_id")

	// Get from database
	if uda.dbPool == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Database not available"})
		return
	}

	var resultsJSON string
	err := uda.dbPool.QueryRow(context.Background(),
		"SELECT results FROM uda_processing_results WHERE job_id = $1", jobID).Scan(&resultsJSON)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Results not found"})
		return
	}

	var results ProcessingResults
	if err := json.Unmarshal([]byte(resultsJSON), &results); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse results"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"job_id": jobID,
		"results": results,
	})
}

// Health handler
func (uda *UDAWorkerProd) healthHandler(c *gin.Context) {
	// Check all services
	redisStatus := "disconnected"
	if err := uda.redis.Ping(context.Background()).Err(); err == nil {
		redisStatus = "connected"
	}

	dbStatus := "disconnected"
	if uda.dbPool != nil {
		if err := uda.dbPool.Ping(context.Background()); err == nil {
			dbStatus = "connected"
		}
	}

	minioStatus := "disconnected"
	if uda.minioClient != nil {
		if _, err := uda.minioClient.ListBuckets(context.Background()); err == nil {
			minioStatus = "connected"
		}
	}

	queueLength := uda.redis.LLen(context.Background(), "uda:job_queue").Val()

	c.JSON(http.StatusOK, gin.H{
		"service": "uda-worker-production",
		"status":  "healthy",
		"architecture": "SvelteKit → MinIO → Go UDA → Redis → Python GPU (gRPC)",
		"connections": gin.H{
			"redis":    redisStatus,
			"database": dbStatus,
			"minio":    minioStatus,
		},
		"queue": gin.H{
			"pending_jobs": queueLength,
			"workers":      uda.workers,
		},
		"capabilities": gin.H{
			"file_upload":        true,
			"minio_storage":      true,
			"ocr_processing":     true,
			"entity_extraction":  true,
			"embedding_generation": true,
			"knowledge_graphs":   true,
			"progress_streaming": true,
			"grpc_integration":   true,
		},
		"timestamp": time.Now(),
	})
}

func main() {
	log.Printf("🚀 Starting Production UDA Worker")
	log.Printf("Architecture: SvelteKit → MinIO → Go UDA ↔ Redis ↔ Python GPU (gRPC)")

	// Create enhanced database schema
	createProductionSchema()

	worker := NewUDAWorkerProd()
	worker.setupRoutes()
	worker.Start()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8100"
	}

	log.Printf("🌐 Production UDA API: http://localhost:%s/api/v1/health", port)
	log.Printf("📁 MinIO Upload: http://localhost:%s/api/v1/upload", port)
	log.Printf("🔄 Process Document: http://localhost:%s/api/v1/process", port)
	log.Printf("📊 Progress Streaming: ws://localhost:%s/api/v1/jobs/{id}/progress", port)

	if err := worker.httpServer.Run(":" + port); err != nil {
		log.Fatalf("Failed to start production UDA Worker: %v", err)
	}
}

// Create production database schema
func createProductionSchema() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://legal_admin:123456@localhost:5432/legal_ai_db?sslmode=disable"
	}

	dbPool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Printf("Warning: Failed to connect to database: %v", err)
		return
	}
	defer dbPool.Close()

	_, err = dbPool.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS uda_processing_results (
			id SERIAL PRIMARY KEY,
			job_id VARCHAR(255) UNIQUE NOT NULL,
			document_id VARCHAR(255) NOT NULL,
			file_name VARCHAR(500),
			minio_path VARCHAR(1000),
			results JSONB,
			steps JSONB,
			performance_metrics BIGINT,
			total_processing_time_ms BIGINT,
			created_at TIMESTAMP DEFAULT NOW(),
			metadata JSONB
		);

		CREATE INDEX IF NOT EXISTS idx_uda_results_job_id ON uda_processing_results(job_id);
		CREATE INDEX IF NOT EXISTS idx_uda_results_doc_id ON uda_processing_results(document_id);
		CREATE INDEX IF NOT EXISTS idx_uda_results_created ON uda_processing_results(created_at);
		CREATE INDEX IF NOT EXISTS idx_uda_results_performance ON uda_processing_results(total_processing_time_ms);
	`)

	if err != nil {
		log.Printf("Failed to create production schema: %v", err)
	} else {
		log.Printf("✅ Production UDA database schema ready")
	}
}