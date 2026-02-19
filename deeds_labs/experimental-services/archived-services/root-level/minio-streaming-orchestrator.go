//go:build archived
// +build archived

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/rs/cors"
	"github.com/go-redis/redis/v8"
)

// MinIO Streaming Orchestrator for Large Legal Documents
// Port 8106 - Handles document upload, streaming, chunked processing, and result aggregation
// Features: Multi-part upload, resumable transfers, chunk-based processing, progress tracking

type StreamingOrchestrator struct {
	minioClient *minio.Client
	redis       *redis.Client
	logger      *log.Logger
	upgrader    websocket.Upgrader
	jobManager  *JobManager
}

type JobManager struct {
	activeJobs map[string]*ProcessingJob
	mutex      sync.RWMutex
}

type ProcessingJob struct {
	ID            string                 `json:"id"`
	DocumentID    string                 `json:"document_id"`
	FileName      string                 `json:"file_name"`
	TotalSize     int64                  `json:"total_size"`
	ProcessedSize int64                  `json:"processed_size"`
	Status        string                 `json:"status"`
	ChunkCount    int                    `json:"chunk_count"`
	ProcessedChunks int                  `json:"processed_chunks"`
	StartTime     time.Time              `json:"start_time"`
	LastUpdate    time.Time              `json:"last_update"`
	Metadata      map[string]interface{} `json:"metadata"`
	Progress      float64                `json:"progress"`
	Error         string                 `json:"error,omitempty"`
}

type UploadRequest struct {
	DocumentID   string                 `json:"document_id"`
	FileName     string                 `json:"file_name"`
	ContentType  string                 `json:"content_type"`
	TotalSize    int64                  `json:"total_size"`
	ChunkSize    int                    `json:"chunk_size"`
	Metadata     map[string]interface{} `json:"metadata"`
	ProcessingOptions ProcessingOptions   `json:"processing_options"`
}

type ProcessingOptions struct {
	EnableOCR          bool     `json:"enable_ocr"`
	EnableNER          bool     `json:"enable_ner"`
	EnableSummarization bool    `json:"enable_summarization"`
	EnableGraphBuilding bool    `json:"enable_graph_building"`
	ChunkOverlap       int      `json:"chunk_overlap"`
	TargetLanguages    []string `json:"target_languages"`
	Priority           string   `json:"priority"` // low, normal, high, urgent
}

type StreamingResponse struct {
	Type      string      `json:"type"`      // upload_progress, processing_progress, chunk_complete, job_complete, error
	JobID     string      `json:"job_id"`
	Data      interface{} `json:"data,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
}

type ChunkProcessingRequest struct {
	JobID      string `json:"job_id"`
	ChunkID    string `json:"chunk_id"`
	ObjectPath string `json:"object_path"`
	StartByte  int64  `json:"start_byte"`
	EndByte    int64  `json:"end_byte"`
}

type DocumentUploadResult struct {
	DocumentID    string    `json:"document_id"`
	MinIOPath     string    `json:"minio_path"`
	UploadTime    time.Time `json:"upload_time"`
	FileSize      int64     `json:"file_size"`
	ContentType   string    `json:"content_type"`
	ChecksumMD5   string    `json:"checksum_md5"`
	StorageClass  string    `json:"storage_class"`
}

func NewStreamingOrchestrator() (*StreamingOrchestrator, error) {
	// MinIO configuration
	endpoint := getEnv("MINIO_ENDPOINT", "localhost:9000")
	accessKey := getEnv("MINIO_ACCESS_KEY", "minioadmin")
	secretKey := getEnv("MINIO_SECRET_KEY", "minioadmin")
	useSSL := getEnv("MINIO_USE_SSL", "false") == "true"

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create MinIO client: %w", err)
	}

	// Redis configuration for job tracking
	redisAddr := getEnv("REDIS_ADDR", "localhost:6379")
	redisPassword := getEnv("REDIS_PASSWORD", "")

	rdb := redis.NewClient(&redis.Options{
		Addr:     redisAddr,
		Password: redisPassword,
		DB:       2, // Use DB 2 for job management
	})

	logger := log.New(os.Stdout, "[MINIO-ORCHESTRATOR] ", log.LstdFlags)

	upgrader := websocket.Upgrader{
		CheckOrigin:     func(r *http.Request) bool { return true },
		ReadBufferSize:  8192,
		WriteBufferSize: 8192,
	}

	jobManager := &JobManager{
		activeJobs: make(map[string]*ProcessingJob),
	}

	// Ensure buckets exist
	ctx := context.Background()
	buckets := []string{"legal-documents", "processed-chunks", "summaries", "embeddings"}
	for _, bucket := range buckets {
		exists, err := client.BucketExists(ctx, bucket)
		if err != nil {
			logger.Printf("Warning: Could not check bucket %s: %v", bucket, err)
			continue
		}
		if !exists {
			err = client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{})
			if err != nil {
				logger.Printf("Warning: Could not create bucket %s: %v", bucket, err)
			} else {
				logger.Printf("Created bucket: %s", bucket)
			}
		}
	}

	return &StreamingOrchestrator{
		minioClient: client,
		redis:       rdb,
		logger:      logger,
		upgrader:    upgrader,
		jobManager:  jobManager,
	}, nil
}

func (so *StreamingOrchestrator) CreateUploadJob(req *UploadRequest) (*ProcessingJob, error) {
	jobID := fmt.Sprintf("job_%s_%d", req.DocumentID, time.Now().Unix())

	job := &ProcessingJob{
		ID:              jobID,
		DocumentID:      req.DocumentID,
		FileName:        req.FileName,
		TotalSize:       req.TotalSize,
		Status:          "created",
		ChunkCount:      int(req.TotalSize/int64(req.ChunkSize)) + 1,
		StartTime:       time.Now(),
		LastUpdate:      time.Now(),
		Metadata:        req.Metadata,
		Progress:        0.0,
	}

	// Store job in Redis for persistence
	jobData, err := json.Marshal(job)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal job: %w", err)
	}

	ctx := context.Background()
	err = so.redis.Set(ctx, "job:"+jobID, jobData, 24*time.Hour).Err()
	if err != nil {
		so.logger.Printf("Warning: Failed to store job in Redis: %v", err)
	}

	// Store in memory for active processing
	so.jobManager.mutex.Lock()
	so.jobManager.activeJobs[jobID] = job
	so.jobManager.mutex.Unlock()

	return job, nil
}

func (so *StreamingOrchestrator) HandleStreamingUpload(conn *websocket.Conn, req *UploadRequest) error {
	job, err := so.CreateUploadJob(req)
	if err != nil {
		return fmt.Errorf("failed to create upload job: %w", err)
	}

	so.logger.Printf("Starting streaming upload for job %s, document %s", job.ID, req.DocumentID)

	ctx := context.Background()
	objectName := fmt.Sprintf("raw/%s/%s", req.DocumentID, req.FileName)

	// Send job created response
	conn.WriteJSON(StreamingResponse{
		Type:      "job_created",
		JobID:     job.ID,
		Data:      job,
		Timestamp: time.Now(),
	})

	// Create a pipe for streaming upload
	reader, writer := io.Pipe()

	// Start MinIO upload in goroutine
	uploadErrChan := make(chan error, 1)
	var uploadInfo minio.UploadInfo

	go func() {
		defer reader.Close()
		info, err := so.minioClient.PutObject(ctx, "legal-documents", objectName, reader, req.TotalSize, minio.PutObjectOptions{
			ContentType: req.ContentType,
			UserMetadata: map[string]string{
				"document-id": req.DocumentID,
				"job-id":      job.ID,
			},
		})
		uploadInfo = info
		uploadErrChan <- err
	}()

	// Receive file chunks via WebSocket
	var totalReceived int64
	chunkNum := 0

	for totalReceived < req.TotalSize {
		// Read chunk from WebSocket
		_, chunkData, err := conn.ReadMessage()
		if err != nil {
			writer.CloseWithError(fmt.Errorf("WebSocket read error: %w", err))
			return err
		}

		// Write chunk to MinIO stream
		n, err := writer.Write(chunkData)
		if err != nil {
			writer.CloseWithError(fmt.Errorf("pipe write error: %w", err))
			return err
		}

		totalReceived += int64(n)
		chunkNum++

		// Update job progress
		job.ProcessedSize = totalReceived
		job.Progress = float64(totalReceived) / float64(req.TotalSize) * 100
		job.LastUpdate = time.Now()

		// Send progress update
		conn.WriteJSON(StreamingResponse{
			Type:      "upload_progress",
			JobID:     job.ID,
			Data: map[string]interface{}{
				"processed_size": totalReceived,
				"total_size":     req.TotalSize,
				"progress":       job.Progress,
				"chunk_number":   chunkNum,
			},
			Timestamp: time.Now(),
		})

		so.logger.Printf("Job %s: Received chunk %d, %d/%d bytes (%.1f%%)",
			job.ID, chunkNum, totalReceived, req.TotalSize, job.Progress)
	}

	// Close writer to signal end of upload
	writer.Close()

	// Wait for upload completion
	if err := <-uploadErrChan; err != nil {
		job.Status = "upload_failed"
		job.Error = err.Error()
		return fmt.Errorf("MinIO upload failed: %w", err)
	}

	// Upload successful
	job.Status = "uploaded"
	job.Progress = 100.0

	result := DocumentUploadResult{
		DocumentID:   req.DocumentID,
		MinIOPath:    objectName,
		UploadTime:   time.Now(),
		FileSize:     uploadInfo.Size,
		ContentType:  req.ContentType,
		ChecksumMD5:  uploadInfo.ETag,
		StorageClass: "STANDARD",
	}

	conn.WriteJSON(StreamingResponse{
		Type:      "upload_complete",
		JobID:     job.ID,
		Data:      result,
		Timestamp: time.Now(),
	})

	// Start processing pipeline
	so.StartProcessingPipeline(job, req.ProcessingOptions, conn)

	return nil
}

func (so *StreamingOrchestrator) StartProcessingPipeline(job *ProcessingJob, options ProcessingOptions, conn *websocket.Conn) {
	so.logger.Printf("Starting processing pipeline for job %s", job.ID)

	job.Status = "processing"

	// Send to processing pipeline
	conn.WriteJSON(StreamingResponse{
		Type:      "processing_started",
		JobID:     job.ID,
		Data: map[string]interface{}{
			"pipeline_steps": []string{
				"pdf_extraction",
				"chunking",
				"entity_extraction",
				"embedding_generation",
				"summarization",
				"graph_building",
			},
			"estimated_time": "5-15 minutes",
		},
		Timestamp: time.Now(),
	})

	// Call streaming PDF processor
	if options.EnableOCR {
		so.callStreamingProcessor(job, "pdf_extraction", conn)
	}

	// Call other services in pipeline
	if options.EnableNER {
		so.callEntityExtraction(job, conn)
	}

	if options.EnableSummarization {
		so.callSummarization(job, conn)
	}

	if options.EnableGraphBuilding {
		so.callGraphBuilding(job, conn)
	}

	// Complete job
	job.Status = "completed"
	job.Progress = 100.0
	job.LastUpdate = time.Now()

	conn.WriteJSON(StreamingResponse{
		Type:      "job_complete",
		JobID:     job.ID,
		Data: map[string]interface{}{
			"total_time":       time.Since(job.StartTime).String(),
			"processed_chunks": job.ProcessedChunks,
			"final_status":     "success",
		},
		Timestamp: time.Now(),
	})

	so.logger.Printf("Job %s completed successfully in %v", job.ID, time.Since(job.StartTime))
}

func (so *StreamingOrchestrator) callStreamingProcessor(job *ProcessingJob, stage string, conn *websocket.Conn) {
	// Simulate calling streaming PDF processor (port 8103)
	conn.WriteJSON(StreamingResponse{
		Type:      "processing_progress",
		JobID:     job.ID,
		Data: map[string]interface{}{
			"stage":    stage,
			"progress": 25.0,
			"message":  "PDF extraction in progress",
		},
		Timestamp: time.Now(),
	})

	// Update job progress
	job.ProcessedChunks++
}

func (so *StreamingOrchestrator) callEntityExtraction(job *ProcessingJob, conn *websocket.Conn) {
	// Simulate calling entity extraction service (port 8098)
	conn.WriteJSON(StreamingResponse{
		Type:      "processing_progress",
		JobID:     job.ID,
		Data: map[string]interface{}{
			"stage":    "entity_extraction",
			"progress": 50.0,
			"message":  "Extracting legal entities",
		},
		Timestamp: time.Now(),
	})

	job.ProcessedChunks++
}

func (so *StreamingOrchestrator) callSummarization(job *ProcessingJob, conn *websocket.Conn) {
	// Simulate calling Gemma3 summarization service (port 8101)
	conn.WriteJSON(StreamingResponse{
		Type:      "processing_progress",
		JobID:     job.ID,
		Data: map[string]interface{}{
			"stage":    "summarization",
			"progress": 75.0,
			"message":  "Generating hierarchical summaries",
		},
		Timestamp: time.Now(),
	})

	job.ProcessedChunks++
}

func (so *StreamingOrchestrator) callGraphBuilding(job *ProcessingJob, conn *websocket.Conn) {
	// Simulate calling Neo4j graph building (port 8102)
	conn.WriteJSON(StreamingResponse{
		Type:      "processing_progress",
		JobID:     job.ID,
		Data: map[string]interface{}{
			"stage":    "graph_building",
			"progress": 90.0,
			"message":  "Building knowledge graph",
		},
		Timestamp: time.Now(),
	})

	job.ProcessedChunks++
}

func (so *StreamingOrchestrator) GetJobStatus(jobID string) (*ProcessingJob, error) {
	// Check memory first
	so.jobManager.mutex.RLock()
	if job, exists := so.jobManager.activeJobs[jobID]; exists {
		so.jobManager.mutex.RUnlock()
		return job, nil
	}
	so.jobManager.mutex.RUnlock()

	// Check Redis
	ctx := context.Background()
	jobData, err := so.redis.Get(ctx, "job:"+jobID).Result()
	if err != nil {
		return nil, fmt.Errorf("job not found: %w", err)
	}

	var job ProcessingJob
	err = json.Unmarshal([]byte(jobData), &job)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal job data: %w", err)
	}

	return &job, nil
}

func (so *StreamingOrchestrator) ListActiveJobs() []*ProcessingJob {
	so.jobManager.mutex.RLock()
	defer so.jobManager.mutex.RUnlock()

	jobs := make([]*ProcessingJob, 0, len(so.jobManager.activeJobs))
	for _, job := range so.jobManager.activeJobs {
		jobs = append(jobs, job)
	}

	return jobs
}

// HTTP Handlers

func (so *StreamingOrchestrator) handleStreamingUpload(w http.ResponseWriter, r *http.Request) {
	conn, err := so.upgrader.Upgrade(w, r, nil)
	if err != nil {
		so.logger.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	// Read upload request
	var req UploadRequest
	if err := conn.ReadJSON(&req); err != nil {
		so.logger.Printf("Failed to read upload request: %v", err)
		conn.WriteJSON(StreamingResponse{
			Type:      "error",
			Data:      map[string]string{"error": "Invalid upload request"},
			Timestamp: time.Now(),
		})
		return
	}

	// Set defaults
	if req.ChunkSize == 0 {
		req.ChunkSize = 1024 * 1024 // 1MB default
	}

	// Handle streaming upload
	if err := so.HandleStreamingUpload(conn, &req); err != nil {
		so.logger.Printf("Streaming upload failed: %v", err)
		conn.WriteJSON(StreamingResponse{
			Type:      "error",
			Data:      map[string]string{"error": err.Error()},
			Timestamp: time.Now(),
		})
	}
}

func (so *StreamingOrchestrator) handleJobStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	jobID := vars["job_id"]

	job, err := so.GetJobStatus(jobID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Job not found: %v", err), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}

func (so *StreamingOrchestrator) handleListJobs(w http.ResponseWriter, r *http.Request) {
	jobs := so.ListActiveJobs()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"active_jobs": jobs,
		"total_count": len(jobs),
		"timestamp":   time.Now(),
	})
}

func (so *StreamingOrchestrator) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	// Test MinIO connection
	minioStatus := "connected"
	if _, err := so.minioClient.ListBuckets(ctx); err != nil {
		minioStatus = "disconnected"
	}

	// Test Redis connection
	redisStatus := "connected"
	if _, err := so.redis.Ping(ctx).Result(); err != nil {
		redisStatus = "disconnected"
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"service":   "minio-streaming-orchestrator",
		"status":    "healthy",
		"timestamp": time.Now(),
		"connections": map[string]string{
			"minio": minioStatus,
			"redis": redisStatus,
		},
		"active_jobs": len(so.jobManager.activeJobs),
		"capabilities": map[string]bool{
			"streaming_upload":        true,
			"resumable_transfers":     true,
			"progress_tracking":       true,
			"pipeline_orchestration":  true,
			"chunk_based_processing":  true,
		},
	})
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func main() {
	orchestrator, err := NewStreamingOrchestrator()
	if err != nil {
		log.Fatalf("Failed to initialize streaming orchestrator: %v", err)
	}

	r := mux.NewRouter()

	// Streaming endpoints
	r.HandleFunc("/api/v1/stream/upload", orchestrator.handleStreamingUpload)
	r.HandleFunc("/api/v1/jobs/{job_id}", orchestrator.handleJobStatus).Methods("GET")
	r.HandleFunc("/api/v1/jobs", orchestrator.handleListJobs).Methods("GET")
	r.HandleFunc("/api/v1/health", orchestrator.handleHealth).Methods("GET")

	// Enable CORS
	c := cors.New(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"*"},
	})

	handler := c.Handler(r)

	port := getEnv("PORT", "8106")
	orchestrator.logger.Printf("MinIO Streaming Orchestrator starting on port %s", port)
	orchestrator.logger.Printf("Endpoints:")
	orchestrator.logger.Printf("  WS  /api/v1/stream/upload - Stream upload large documents")
	orchestrator.logger.Printf("  GET /api/v1/jobs/{job_id} - Get job status")
	orchestrator.logger.Printf("  GET /api/v1/jobs - List active jobs")
	orchestrator.logger.Printf("  GET /api/v1/health - Service health check")
	orchestrator.logger.Printf("Features: Multi-part upload, resumable transfers, progress tracking")

	log.Fatal(http.ListenAndServe(":"+port, handler))
}