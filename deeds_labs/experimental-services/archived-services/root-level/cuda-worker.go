//go:build archived
// +build archived

// Universal Document Accelerator (UDA) Worker
// Go-based orchestrator with CUDA ML delegation
// Hybrid architecture: Go performance + CUDA ML power

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/google/uuid"
)

// UDA Job represents a document processing job
type UDAJob struct {
	JobID       string                 `json:"job_id"`
	DocumentID  string                 `json:"document_id"`
	JobType     string                 `json:"job_type"` // "extraction", "knowledge-graph", "rag"
	Status      string                 `json:"status"`   // "pending", "processing", "completed", "failed"
	Priority    string                 `json:"priority"` // "high", "normal", "low"
	InputData   map[string]interface{} `json:"input_data"`
	Results     map[string]interface{} `json:"results,omitempty"`
	Progress    int                    `json:"progress"` // 0-100
	CreatedAt   time.Time              `json:"created_at"`
	StartedAt   *time.Time             `json:"started_at,omitempty"`
	CompletedAt *time.Time             `json:"completed_at,omitempty"`
	ErrorMsg    string                 `json:"error_msg,omitempty"`
	Metadata    map[string]interface{} `json:"metadata"`
}

// UDA Services integration
type UDAServices struct {
	CUDAServiceURL     string `json:"cuda_service_url"`
	ExtractionURL      string `json:"extraction_url"`
	KnowledgeGraphURL  string `json:"knowledge_graph_url"`
	OllamaURL          string `json:"ollama_url"`
}

// UDA Worker main service
type UDAWorker struct {
	redis       *redis.Client
	dbPool      *pgxpool.Pool
	services    UDAServices
	httpServer  *gin.Engine
	jobQueue    chan *UDAJob
	workers     int
}

// Document represents input document
type Document struct {
	ID          string                 `json:"id"`
	Filename    string                 `json:"filename,omitempty"`
	ContentType string                 `json:"content_type"`
	Content     string                 `json:"content"`
	FilePath    string                 `json:"file_path,omitempty"`
	Metadata    map[string]interface{} `json:"metadata"`
}

// Processing results from CUDA services
type ProcessingResults struct {
	Entities      []map[string]interface{} `json:"entities,omitempty"`
	Embeddings    []map[string]interface{} `json:"embeddings,omitempty"`
	Relationships []map[string]interface{} `json:"relationships,omitempty"`
	KnowledgeGraph map[string]interface{}  `json:"knowledge_graph,omitempty"`
	RAGResponse   map[string]interface{}   `json:"rag_response,omitempty"`
	Performance   map[string]interface{}   `json:"performance"`
}

func NewUDAWorker() *UDAWorker {
	// Redis connection for job queue
	redisClient := redis.NewClient(&redis.Options{
		Addr:     "localhost:6379",
		Password: "redis",
		DB:       1, // Use DB 1 for job queue
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

	// Service URLs
	services := UDAServices{
		CUDAServiceURL:    "http://localhost:8097",
		ExtractionURL:     "http://localhost:8098",
		KnowledgeGraphURL: "http://localhost:8099",
		OllamaURL:         "http://localhost:11434",
	}

	return &UDAWorker{
		redis:    redisClient,
		dbPool:   dbPool,
		services: services,
		jobQueue: make(chan *UDAJob, 100), // Buffer 100 jobs
		workers:  4,                       // 4 concurrent workers
	}
}

// Start UDA Worker with job processing goroutines
func (uda *UDAWorker) Start() {
	log.Printf("🚀 Starting UDA Worker with %d concurrent workers", uda.workers)

	// Start worker goroutines
	for i := 0; i < uda.workers; i++ {
		go uda.processJobs(i)
	}

	// Start job queue listener (Redis)
	go uda.listenForJobs()

	log.Printf("✅ UDA Workers started and listening for jobs")
}

// Listen for jobs from Redis queue
func (uda *UDAWorker) listenForJobs() {
	for {
		// Pop job from Redis queue (blocking)
		result, err := uda.redis.BLPop(context.Background(), 0, "uda:job_queue").Result()
		if err != nil {
			log.Printf("Redis queue error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		// Parse job
		var job UDAJob
		if err := json.Unmarshal([]byte(result[1]), &job); err != nil {
			log.Printf("Failed to parse job: %v", err)
			continue
		}

		// Send to job processing channel
		select {
		case uda.jobQueue <- &job:
			log.Printf("📝 Queued job %s for processing", job.JobID)
		default:
			log.Printf("⚠️ Job queue full, dropping job %s", job.JobID)
		}
	}
}

// Process jobs from queue
func (uda *UDAWorker) processJobs(workerID int) {
	log.Printf("🔧 Worker %d started", workerID)

	for job := range uda.jobQueue {
		log.Printf("🔄 Worker %d processing job %s (type: %s)", workerID, job.JobID, job.JobType)

		// Update job status
		job.Status = "processing"
		now := time.Now()
		job.StartedAt = &now
		uda.updateJobStatus(job)

		// Process job based on type
		results, err := uda.processJob(job)
		if err != nil {
			log.Printf("❌ Worker %d failed job %s: %v", workerID, job.JobID, err)
			job.Status = "failed"
			job.ErrorMsg = err.Error()
		} else {
			log.Printf("✅ Worker %d completed job %s", workerID, job.JobID)
			job.Status = "completed"
			job.Results = results
			job.Progress = 100
		}

		// Update final status
		completedAt := time.Now()
		job.CompletedAt = &completedAt
		uda.updateJobStatus(job)
	}
}

// Process individual job based on type
func (uda *UDAWorker) processJob(job *UDAJob) (map[string]interface{}, error) {
	switch job.JobType {
	case "entity_extraction":
		return uda.processEntityExtraction(job)
	case "knowledge_graph":
		return uda.processKnowledgeGraph(job)
	case "rag_query":
		return uda.processRAGQuery(job)
	case "full_pipeline":
		return uda.processFullPipeline(job)
	default:
		return nil, fmt.Errorf("unknown job type: %s", job.JobType)
	}
}

// Process entity extraction via existing service
func (uda *UDAWorker) processEntityExtraction(job *UDAJob) (map[string]interface{}, error) {
	log.Printf("🧬 Processing entity extraction for job %s", job.JobID)

	// Update progress
	job.Progress = 25
	uda.updateJobStatus(job)

	// Call existing extraction service
	reqData := map[string]interface{}{
		"id":      job.DocumentID,
		"title":   job.InputData["title"],
		"content": job.InputData["content"],
		"doc_type": job.InputData["doc_type"],
		"metadata": job.Metadata,
	}

	jsonData, _ := json.Marshal(reqData)
	resp, err := http.Post(uda.services.ExtractionURL+"/api/v1/extract",
		"application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("extraction service error: %w", err)
	}
	defer resp.Body.Close()

	job.Progress = 75
	uda.updateJobStatus(job)

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode extraction response: %w", err)
	}

	return map[string]interface{}{
		"extraction_result": result,
		"service_used":      "parallel_extraction",
		"processing_time":   time.Since(*job.StartedAt).Milliseconds(),
	}, nil
}

// Process knowledge graph creation
func (uda *UDAWorker) processKnowledgeGraph(job *UDAJob) (map[string]interface{}, error) {
	log.Printf("🔗 Processing knowledge graph for job %s", job.JobID)

	job.Progress = 20
	uda.updateJobStatus(job)

	// Call sequential KG service
	reqData := map[string]interface{}{
		"id":      job.DocumentID,
		"title":   job.InputData["title"],
		"content": job.InputData["content"],
		"doc_type": job.InputData["doc_type"],
		"metadata": job.Metadata,
	}

	jsonData, _ := json.Marshal(reqData)
	resp, err := http.Post(uda.services.KnowledgeGraphURL+"/api/v1/knowledge-graph",
		"application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("knowledge graph service error: %w", err)
	}
	defer resp.Body.Close()

	job.Progress = 90
	uda.updateJobStatus(job)

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode KG response: %w", err)
	}

	return map[string]interface{}{
		"knowledge_graph": result,
		"service_used":    "sequential_pipeline",
		"processing_time": time.Since(*job.StartedAt).Milliseconds(),
	}, nil
}

// Process RAG query
func (uda *UDAWorker) processRAGQuery(job *UDAJob) (map[string]interface{}, error) {
	log.Printf("🔍 Processing RAG query for job %s", job.JobID)

	query := job.InputData["query"].(string)

	// Step 1: Vector similarity search via CUDA service
	job.Progress = 25
	uda.updateJobStatus(job)

	searchReq := map[string]interface{}{
		"q":     query,
		"limit": 5,
	}

	jsonData, _ := json.Marshal(searchReq)
	resp, err := http.Post(uda.services.CUDAServiceURL+"/api/v1/search",
		"application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("CUDA search service error: %w", err)
	}
	defer resp.Body.Close()

	var searchResults map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&searchResults); err != nil {
		return nil, fmt.Errorf("failed to decode search response: %w", err)
	}

	job.Progress = 50
	uda.updateJobStatus(job)

	// Step 2: Generate response via Ollama
	context := uda.buildRAGContext(searchResults)
	prompt := fmt.Sprintf(`You are a legal AI assistant. Answer the following question based on the provided context.

Question: %s

Context:
%s

Please provide a comprehensive answer based on the legal documents provided.`, query, context)

	ollamaReq := map[string]interface{}{
		"model":  "gemma3:legal-latest",
		"prompt": prompt,
		"stream": false,
	}

	jsonData, _ = json.Marshal(ollamaReq)
	resp, err = http.Post(uda.services.OllamaURL+"/api/generate",
		"application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("Ollama service error: %w", err)
	}
	defer resp.Body.Close()

	job.Progress = 90
	uda.updateJobStatus(job)

	var ollamaResponse map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&ollamaResponse); err != nil {
		return nil, fmt.Errorf("failed to decode Ollama response: %w", err)
	}

	return map[string]interface{}{
		"query":           query,
		"search_results":  searchResults,
		"rag_response":    ollamaResponse["response"],
		"context_docs":    len(searchResults),
		"processing_time": time.Since(*job.StartedAt).Milliseconds(),
	}, nil
}

// Process full pipeline (extraction + KG + embeddings)
func (uda *UDAWorker) processFullPipeline(job *UDAJob) (map[string]interface{}, error) {
	log.Printf("🔄 Processing full pipeline for job %s", job.JobID)

	results := make(map[string]interface{})

	// Step 1: Entity extraction
	job.Progress = 20
	uda.updateJobStatus(job)

	extractionJob := &UDAJob{
		JobID:      job.JobID + "_extraction",
		DocumentID: job.DocumentID,
		JobType:    "entity_extraction",
		InputData:  job.InputData,
		Metadata:   job.Metadata,
		StartedAt:  job.StartedAt,
	}

	extractionResults, err := uda.processEntityExtraction(extractionJob)
	if err != nil {
		return nil, fmt.Errorf("extraction step failed: %w", err)
	}
	results["extraction"] = extractionResults

	// Step 2: Knowledge graph
	job.Progress = 60
	uda.updateJobStatus(job)

	kgJob := &UDAJob{
		JobID:      job.JobID + "_kg",
		DocumentID: job.DocumentID,
		JobType:    "knowledge_graph",
		InputData:  job.InputData,
		Metadata:   job.Metadata,
		StartedAt:  job.StartedAt,
	}

	kgResults, err := uda.processKnowledgeGraph(kgJob)
	if err != nil {
		return nil, fmt.Errorf("knowledge graph step failed: %w", err)
	}
	results["knowledge_graph"] = kgResults

	job.Progress = 90
	uda.updateJobStatus(job)

	results["pipeline"] = "full_processing_complete"
	results["total_processing_time"] = time.Since(*job.StartedAt).Milliseconds()

	return results, nil
}

// Helper function to build RAG context from search results
func (uda *UDAWorker) buildRAGContext(searchResults map[string]interface{}) string {
	var context strings.Builder

	if results, ok := searchResults["results"].([]interface{}); ok {
		for i, result := range results {
			if doc, ok := result.(map[string]interface{}); ok {
				context.WriteString(fmt.Sprintf("Document %d:\n", i+1))
				if title, ok := doc["title"].(string); ok {
					context.WriteString(fmt.Sprintf("Title: %s\n", title))
				}
				if content, ok := doc["content"].(string); ok {
					// Truncate long content
					if len(content) > 500 {
						content = content[:500] + "..."
					}
					context.WriteString(fmt.Sprintf("Content: %s\n\n", content))
				}
			}
		}
	}

	return context.String()
}

// Update job status in Redis and database
func (uda *UDAWorker) updateJobStatus(job *UDAJob) {
	// Update Redis
	jobJSON, _ := json.Marshal(job)
	uda.redis.Set(context.Background(), fmt.Sprintf("uda:job:%s", job.JobID),
		string(jobJSON), 24*time.Hour)

	// Update database if available
	if uda.dbPool != nil {
		uda.storeJobInDB(job)
	}
}

// Store job in database
func (uda *UDAWorker) storeJobInDB(job *UDAJob) {
	ctx := context.Background()

	inputDataJSON, _ := json.Marshal(job.InputData)
	resultsJSON, _ := json.Marshal(job.Results)
	metadataJSON, _ := json.Marshal(job.Metadata)

	_, err := uda.dbPool.Exec(ctx, `
		INSERT INTO uda_jobs (
			job_id, document_id, job_type, status, priority,
			input_data, results, progress, created_at, started_at, completed_at,
			error_msg, metadata
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		ON CONFLICT (job_id) DO UPDATE SET
			status = EXCLUDED.status,
			results = EXCLUDED.results,
			progress = EXCLUDED.progress,
			started_at = EXCLUDED.started_at,
			completed_at = EXCLUDED.completed_at,
			error_msg = EXCLUDED.error_msg,
			updated_at = NOW()
	`, job.JobID, job.DocumentID, job.JobType, job.Status, job.Priority,
		string(inputDataJSON), string(resultsJSON), job.Progress,
		job.CreatedAt, job.StartedAt, job.CompletedAt, job.ErrorMsg, string(metadataJSON))

	if err != nil {
		log.Printf("Failed to store job in database: %v", err)
	}
}

// HTTP API for job management
func (uda *UDAWorker) setupRoutes() {
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
		api.POST("/jobs", uda.createJobHandler)
		api.GET("/jobs/:job_id", uda.getJobHandler)
		api.GET("/jobs", uda.listJobsHandler)
		api.POST("/upload", uda.uploadHandler)
		api.POST("/process", uda.processDocumentHandler)
	}
}

// Create job handler
func (uda *UDAWorker) createJobHandler(c *gin.Context) {
	var req struct {
		JobType    string                 `json:"job_type"`
		DocumentID string                 `json:"document_id,omitempty"`
		Priority   string                 `json:"priority"`
		InputData  map[string]interface{} `json:"input_data"`
		Metadata   map[string]interface{} `json:"metadata"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	// Create job
	job := &UDAJob{
		JobID:      uuid.New().String(),
		DocumentID: req.DocumentID,
		JobType:    req.JobType,
		Status:     "pending",
		Priority:   req.Priority,
		InputData:  req.InputData,
		Metadata:   req.Metadata,
		CreatedAt:  time.Now(),
		Progress:   0,
	}

	// Queue job in Redis
	jobJSON, _ := json.Marshal(job)
	err := uda.redis.RPush(context.Background(), "uda:job_queue", string(jobJSON)).Err()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to queue job"})
		return
	}

	// Store job
	uda.updateJobStatus(job)

	c.JSON(http.StatusCreated, gin.H{
		"job_id":          job.JobID,
		"status":          job.Status,
		"estimated_time":  "30s",
		"queue_position":  uda.redis.LLen(context.Background(), "uda:job_queue").Val(),
	})
}

// Get job status handler
func (uda *UDAWorker) getJobHandler(c *gin.Context) {
	jobID := c.Param("job_id")

	// Get from Redis
	jobJSON, err := uda.redis.Get(context.Background(), fmt.Sprintf("uda:job:%s", jobID)).Result()
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
		return
	}

	var job UDAJob
	if err := json.Unmarshal([]byte(jobJSON), &job); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse job"})
		return
	}

	c.JSON(http.StatusOK, job)
}

// Upload handler for documents
func (uda *UDAWorker) uploadHandler(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	// Generate document ID
	docID := uuid.New().String()

	// Save file (implement proper file storage here)
	uploadDir := "./uploads"
	os.MkdirAll(uploadDir, 0755)

	filePath := filepath.Join(uploadDir, docID+"_"+header.Filename)
	outFile, err := os.Create(filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}
	defer outFile.Close()

	io.Copy(outFile, file)

	c.JSON(http.StatusOK, gin.H{
		"document_id": docID,
		"filename":    header.Filename,
		"file_path":   filePath,
		"size":        header.Size,
	})
}

// Process document handler (comprehensive)
func (uda *UDAWorker) processDocumentHandler(c *gin.Context) {
	var req struct {
		DocumentID string                 `json:"document_id,omitempty"`
		Content    string                 `json:"content,omitempty"`
		Title      string                 `json:"title"`
		DocType    string                 `json:"doc_type"`
		Pipeline   string                 `json:"pipeline"` // "extraction", "knowledge_graph", "full"
		Priority   string                 `json:"priority"`
		Metadata   map[string]interface{} `json:"metadata"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	// Create processing job
	job := &UDAJob{
		JobID:      uuid.New().String(),
		DocumentID: req.DocumentID,
		JobType:    req.Pipeline,
		Status:     "pending",
		Priority:   req.Priority,
		InputData: map[string]interface{}{
			"title":    req.Title,
			"content":  req.Content,
			"doc_type": req.DocType,
		},
		Metadata:  req.Metadata,
		CreatedAt: time.Now(),
		Progress:  0,
	}

	// Queue job
	jobJSON, _ := json.Marshal(job)
	err := uda.redis.RPush(context.Background(), "uda:job_queue", string(jobJSON)).Err()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to queue job"})
		return
	}

	uda.updateJobStatus(job)

	c.JSON(http.StatusCreated, gin.H{
		"job_id":         job.JobID,
		"status":         job.Status,
		"pipeline":       req.Pipeline,
		"estimated_time": "45s",
	})
}

// Health handler
func (uda *UDAWorker) healthHandler(c *gin.Context) {
	// Check service health
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

	// Check CUDA services
	cudaStatus := uda.checkServiceHealth(uda.services.CUDAServiceURL + "/api/v1/health")
	extractionStatus := uda.checkServiceHealth(uda.services.ExtractionURL + "/api/v1/health")
	kgStatus := uda.checkServiceHealth(uda.services.KnowledgeGraphURL + "/api/v1/health")

	queueLength := uda.redis.LLen(context.Background(), "uda:job_queue").Val()

	c.JSON(http.StatusOK, gin.H{
		"service": "uda-worker",
		"status":  "healthy",
		"connections": gin.H{
			"redis":    redisStatus,
			"database": dbStatus,
		},
		"services": gin.H{
			"cuda_service":     cudaStatus,
			"extraction":       extractionStatus,
			"knowledge_graph":  kgStatus,
		},
		"queue": gin.H{
			"pending_jobs": queueLength,
			"workers":      uda.workers,
		},
		"capabilities": gin.H{
			"entity_extraction":   true,
			"knowledge_graphs":    true,
			"rag_processing":      true,
			"file_upload":         true,
			"async_processing":    true,
		},
		"timestamp": time.Now(),
	})
}

// List jobs handler
func (uda *UDAWorker) listJobsHandler(c *gin.Context) {
	status := c.Query("status")
	limit := c.DefaultQuery("limit", "10")

	// Query from database (simplified)
	c.JSON(http.StatusOK, gin.H{
		"jobs":   []gin.H{}, // Would implement actual DB query
		"total":  0,
		"status": status,
		"limit":  limit,
	})
}

// Helper to check service health
func (uda *UDAWorker) checkServiceHealth(url string) string {
	resp, err := http.Get(url)
	if err != nil {
		return "disconnected"
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		return "connected"
	}
	return "error"
}

func main() {
	log.Printf("🚀 Starting UDA (Universal Document Accelerator) Worker")
	log.Printf("Architecture: Go Orchestrator + CUDA ML Services")

	// Create database schema for jobs
	createJobsSchema()

	worker := NewUDAWorker()
	worker.setupRoutes()

	// Start worker goroutines
	worker.Start()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8100"
	}

	log.Printf("🌐 UDA Worker API: http://localhost:%s/api/v1/health", port)
	log.Printf("📝 Job Creation: http://localhost:%s/api/v1/jobs", port)
	log.Printf("📁 File Upload: http://localhost:%s/api/v1/upload", port)
	log.Printf("🔄 Process Document: http://localhost:%s/api/v1/process", port)

	if err := worker.httpServer.Run(":" + port); err != nil {
		log.Fatalf("Failed to start UDA Worker: %v", err)
	}
}

// Create database schema for UDA jobs
func createJobsSchema() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://legal_admin:123456@localhost:5432/legal_ai_db?sslmode=disable"
	}

	dbPool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Printf("Warning: Failed to connect to database for schema creation: %v", err)
		return
	}
	defer dbPool.Close()

	_, err = dbPool.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS uda_jobs (
			id SERIAL PRIMARY KEY,
			job_id VARCHAR(255) UNIQUE NOT NULL,
			document_id VARCHAR(255),
			job_type VARCHAR(100) NOT NULL,
			status VARCHAR(50) NOT NULL,
			priority VARCHAR(20) DEFAULT 'normal',
			input_data JSONB,
			results JSONB,
			progress INTEGER DEFAULT 0,
			created_at TIMESTAMP DEFAULT NOW(),
			started_at TIMESTAMP,
			completed_at TIMESTAMP,
			updated_at TIMESTAMP DEFAULT NOW(),
			error_msg TEXT,
			metadata JSONB
		);

		CREATE INDEX IF NOT EXISTS idx_uda_jobs_status ON uda_jobs(status);
		CREATE INDEX IF NOT EXISTS idx_uda_jobs_type ON uda_jobs(job_type);
		CREATE INDEX IF NOT EXISTS idx_uda_jobs_created ON uda_jobs(created_at);
	`)

	if err != nil {
		log.Printf("Failed to create UDA jobs schema: %v", err)
	} else {
		log.Printf("✅ UDA jobs database schema ready")
	}
}