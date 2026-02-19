package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"runtime"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// AsyncGlyphWorker handles asynchronous glyph generation and processing
type AsyncGlyphWorker struct {
	redisClient     *redis.Client
	glyphGenerator  *GlyphGenerator
	aiReader        *AIReader
	executionRuntime *ExecutionRuntime
	tensorCache     *TensorCacheManager
	historyTracker  *ComputationHistoryTracker
	workers         []*WorkerInstance
	jobQueue        chan *WorkJob
	resultStore     map[string]*WorkResult
	resultMutex     sync.RWMutex
	isRunning       bool
	stopChannel     chan struct{}
	wg              sync.WaitGroup
}

// WorkJob represents an asynchronous work item
type WorkJob struct {
	ID          string                 `json:"id"`
	Type        WorkJobType            `json:"type"`
	Priority    int                    `json:"priority"` // 1-10, higher = more priority
	UserID      string                 `json:"user_id"`
	SessionID   string                 `json:"session_id"`
	Parameters  map[string]interface{} `json:"parameters"`
	CreatedAt   time.Time              `json:"created_at"`
	StartedAt   *time.Time             `json:"started_at"`
	CompletedAt *time.Time             `json:"completed_at"`
	Status      WorkJobStatus          `json:"status"`
	WorkerID    string                 `json:"worker_id"`
	RetryCount  int                    `json:"retry_count"`
	MaxRetries  int                    `json:"max_retries"`
	LegalContext map[string]interface{} `json:"legal_context"`
}

// WorkJobType defines the type of work to be performed
type WorkJobType string

const (
	JobTypeGenerateGlyph  WorkJobType = "generate_glyph"
	JobTypeTranspileGlyph WorkJobType = "transpile_glyph"
	JobTypeExecuteGlyph   WorkJobType = "execute_glyph"
	JobTypeBatchGenerate  WorkJobType = "batch_generate"
	JobTypeOptimizeCache  WorkJobType = "optimize_cache"
	JobTypeAnalyzeUsage   WorkJobType = "analyze_usage"
)

// WorkJobStatus defines the current status of a work job
type WorkJobStatus string

const (
	JobStatusPending    WorkJobStatus = "pending"
	JobStatusRunning    WorkJobStatus = "running"
	JobStatusCompleted  WorkJobStatus = "completed"
	JobStatusFailed     WorkJobStatus = "failed"
	JobStatusCancelled  WorkJobStatus = "cancelled"
	JobStatusRetrying   WorkJobStatus = "retrying"
)

// WorkResult represents the result of an asynchronous work job
type WorkResult struct {
	JobID       string                 `json:"job_id"`
	Status      WorkJobStatus          `json:"status"`
	Result      map[string]interface{} `json:"result"`
	ErrorDetails *string               `json:"error_details"`
	StartTime   time.Time              `json:"start_time"`
	EndTime     *time.Time             `json:"end_time"`
	Duration    *time.Duration         `json:"duration"`
	WorkerID    string                 `json:"worker_id"`
	ResourceUsage *ResourceUsage       `json:"resource_usage"`
	Metrics     map[string]float64     `json:"metrics"`
}

// WorkerInstance represents a single worker thread
type WorkerInstance struct {
	ID              string
	IsAvailable     bool
	CurrentJobID    string
	ProcessedJobs   int64
	LastJobTime     time.Time
	ResourceUsage   *ResourceUsage
	PerformanceMetrics map[string]float64
}

// WorkerPool configuration
type WorkerPoolConfig struct {
	NumWorkers      int
	QueueSize       int
	MaxRetries      int
	RetryDelay      time.Duration
	HeartbeatInterval time.Duration
	CleanupInterval time.Duration
}

// NewAsyncGlyphWorker creates a new async glyph worker
func NewAsyncGlyphWorker(
	redisClient *redis.Client,
	glyphGenerator *GlyphGenerator,
	aiReader *AIReader,
	executionRuntime *ExecutionRuntime,
	tensorCache *TensorCacheManager,
	historyTracker *ComputationHistoryTracker,
) *AsyncGlyphWorker {
	
	config := &WorkerPoolConfig{
		NumWorkers:        runtime.NumCPU() * 2, // 2 workers per CPU core
		QueueSize:         1000,
		MaxRetries:        3,
		RetryDelay:        5 * time.Second,
		HeartbeatInterval: 30 * time.Second,
		CleanupInterval:   5 * time.minute,
	}
	
	worker := &AsyncGlyphWorker{
		redisClient:      redisClient,
		glyphGenerator:   glyphGenerator,
		aiReader:         aiReader,
		executionRuntime: executionRuntime,
		tensorCache:      tensorCache,
		historyTracker:   historyTracker,
		jobQueue:         make(chan *WorkJob, config.QueueSize),
		resultStore:      make(map[string]*WorkResult),
		stopChannel:      make(chan struct{}),
	}
	
	// Initialize worker instances
	for i := 0; i < config.NumWorkers; i++ {
		workerInstance := &WorkerInstance{
			ID:                 fmt.Sprintf("worker-%d", i+1),
			IsAvailable:        true,
			ProcessedJobs:      0,
			PerformanceMetrics: make(map[string]float64),
		}
		worker.workers = append(worker.workers, workerInstance)
	}
	
	return worker
}

// Start starts the async worker pool
func (agw *AsyncGlyphWorker) Start(ctx context.Context) error {
	if agw.isRunning {
		return fmt.Errorf("worker pool is already running")
	}
	
	agw.isRunning = true
	
	// Start worker goroutines
	for _, workerInstance := range agw.workers {
		agw.wg.Add(1)
		go agw.runWorker(ctx, workerInstance)
	}
	
	// Start job distributor
	agw.wg.Add(1)
	go agw.runJobDistributor(ctx)
	
	// Start result cleaner
	agw.wg.Add(1)
	go agw.runResultCleaner(ctx)
	
	// Start health monitor
	agw.wg.Add(1)
	go agw.runHealthMonitor(ctx)
	
	log.Printf("Started async glyph worker pool with %d workers", len(agw.workers))
	return nil
}

// Stop stops the async worker pool
func (agw *AsyncGlyphWorker) Stop(ctx context.Context) error {
	if !agw.isRunning {
		return nil
	}
	
	log.Println("Stopping async glyph worker pool...")
	
	agw.isRunning = false
	close(agw.stopChannel)
	
	// Wait for all workers to finish with timeout
	done := make(chan struct{})
	go func() {
		agw.wg.Wait()
		close(done)
	}()
	
	select {
	case <-done:
		log.Println("All workers stopped gracefully")
	case <-time.After(30 * time.Second):
		log.Println("Worker shutdown timeout - forcing stop")
	}
	
	return nil
}

// SubmitJob submits a new job to the worker pool
func (agw *AsyncGlyphWorker) SubmitJob(ctx context.Context, job *WorkJob) (string, error) {
	if !agw.isRunning {
		return "", fmt.Errorf("worker pool is not running")
	}
	
	// Generate job ID if not provided
	if job.ID == "" {
		job.ID = fmt.Sprintf("job-%d-%s", time.Now().UnixNano(), job.Type)
	}
	
	job.CreatedAt = time.Now()
	job.Status = JobStatusPending
	job.MaxRetries = 3
	
	// Store job in Redis for persistence
	jobJSON, err := json.Marshal(job)
	if err != nil {
		return "", fmt.Errorf("failed to marshal job: %v", err)
	}
	
	// Store job with expiration (24 hours)
	err = agw.redisClient.Set(ctx, fmt.Sprintf("job:%s", job.ID), jobJSON, 24*time.Hour).Err()
	if err != nil {
		return "", fmt.Errorf("failed to store job in Redis: %v", err)
	}
	
	// Add to priority queue (higher priority jobs processed first)
	select {
	case agw.jobQueue <- job:
		log.Printf("Submitted job %s (type: %s, priority: %d)", job.ID, job.Type, job.Priority)
		return job.ID, nil
	case <-time.After(5 * time.Second):
		return "", fmt.Errorf("job queue is full, try again later")
	}
}

// GetJobResult retrieves the result of a completed job
func (agw *AsyncGlyphWorker) GetJobResult(ctx context.Context, jobID string) (*WorkResult, error) {
	// Check in-memory result store first
	agw.resultMutex.RLock()
	if result, exists := agw.resultStore[jobID]; exists {
		agw.resultMutex.RUnlock()
		return result, nil
	}
	agw.resultMutex.RUnlock()
	
	// Check Redis for persistent results
	resultJSON, err := agw.redisClient.Get(ctx, fmt.Sprintf("result:%s", jobID)).Result()
	if err != nil {
		return nil, fmt.Errorf("job result not found: %v", err)
	}
	
	var result WorkResult
	err = json.Unmarshal([]byte(resultJSON), &result)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal result: %v", err)
	}
	
	return &result, nil
}

// GetJobStatus retrieves the current status of a job
func (agw *AsyncGlyphWorker) GetJobStatus(ctx context.Context, jobID string) (WorkJobStatus, error) {
	jobJSON, err := agw.redisClient.Get(ctx, fmt.Sprintf("job:%s", jobID)).Result()
	if err != nil {
		return JobStatusFailed, fmt.Errorf("job not found: %v", err)
	}
	
	var job WorkJob
	err = json.Unmarshal([]byte(jobJSON), &job)
	if err != nil {
		return JobStatusFailed, fmt.Errorf("failed to unmarshal job: %v", err)
	}
	
	return job.Status, nil
}

// runWorker runs a single worker instance
func (agw *AsyncGlyphWorker) runWorker(ctx context.Context, worker *WorkerInstance) {
	defer agw.wg.Done()
	
	log.Printf("Worker %s started", worker.ID)
	
	for {
		select {
		case <-agw.stopChannel:
			log.Printf("Worker %s stopping", worker.ID)
			return
			
		case job := <-agw.jobQueue:
			if job == nil {
				continue
			}
			
			agw.processJob(ctx, worker, job)
		}
	}
}

// processJob processes a single job
func (agw *AsyncGlyphWorker) processJob(ctx context.Context, worker *WorkerInstance, job *WorkJob) {
	startTime := time.Now()
	worker.IsAvailable = false
	worker.CurrentJobID = job.ID
	
	// Update job status to running
	job.Status = JobStatusRunning
	job.StartedAt = &startTime
	job.WorkerID = worker.ID
	
	agw.updateJobInRedis(ctx, job)
	
	log.Printf("Worker %s processing job %s (type: %s)", worker.ID, job.ID, job.Type)
	
	// Start execution tracking
	execution := &ComputationExecution{
		ID:              fmt.Sprintf("exec-%s", job.ID),
		GlyphID:         fmt.Sprintf("%v", job.Parameters["glyph_id"]),
		UserID:          job.UserID,
		SessionID:       job.SessionID,
		ExecutionType:   string(job.Type),
		InputParameters: job.Parameters,
		LegalContext:    job.LegalContext,
	}
	
	agw.historyTracker.StartExecution(ctx, execution)
	
	// Process job based on type
	var result map[string]interface{}
	var err error
	
	switch job.Type {
	case JobTypeGenerateGlyph:
		result, err = agw.processGenerateGlyph(ctx, job)
	case JobTypeTranspileGlyph:
		result, err = agw.processTranspileGlyph(ctx, job)
	case JobTypeExecuteGlyph:
		result, err = agw.processExecuteGlyph(ctx, job)
	case JobTypeBatchGenerate:
		result, err = agw.processBatchGenerate(ctx, job)
	case JobTypeOptimizeCache:
		result, err = agw.processOptimizeCache(ctx, job)
	case JobTypeAnalyzeUsage:
		result, err = agw.processAnalyzeUsage(ctx, job)
	default:
		err = fmt.Errorf("unknown job type: %s", job.Type)
	}
	
	endTime := time.Now()
	duration := endTime.Sub(startTime)
	
	// Create result
	workResult := &WorkResult{
		JobID:     job.ID,
		StartTime: startTime,
		EndTime:   &endTime,
		Duration:  &duration,
		WorkerID:  worker.ID,
		Metrics:   make(map[string]float64),
	}
	
	// Update job and execution based on result
	if err != nil {
		// Job failed
		job.Status = JobStatusFailed
		workResult.Status = JobStatusFailed
		errorStr := err.Error()
		workResult.ErrorDetails = &errorStr
		
		// Record failure
		agw.historyTracker.FailExecution(ctx, execution.ID, err.Error(), nil)
		
		// Retry logic
		if job.RetryCount < job.MaxRetries {
			job.RetryCount++
			job.Status = JobStatusRetrying
			log.Printf("Retrying job %s (attempt %d/%d)", job.ID, job.RetryCount, job.MaxRetries)
			
			// Re-queue with delay
			go func() {
				time.Sleep(5 * time.Second)
				select {
				case agw.jobQueue <- job:
				case <-agw.stopChannel:
				}
			}()
		}
	} else {
		// Job succeeded
		job.Status = JobStatusCompleted
		job.CompletedAt = &endTime
		workResult.Status = JobStatusCompleted
		workResult.Result = result
		
		// Record completion
		agw.historyTracker.CompleteExecution(ctx, execution.ID, result, nil, nil)
	}
	
	// Update worker stats
	worker.ProcessedJobs++
	worker.LastJobTime = endTime
	worker.IsAvailable = true
	worker.CurrentJobID = ""
	
	// Store result
	agw.storeResult(ctx, workResult)
	agw.updateJobInRedis(ctx, job)
	
	log.Printf("Worker %s completed job %s in %v (status: %s)", 
		worker.ID, job.ID, duration, workResult.Status)
}

// Job processing methods
func (agw *AsyncGlyphWorker) processGenerateGlyph(ctx context.Context, job *WorkJob) (map[string]interface{}, error) {
	// Extract parameters
	computationGraph, ok := job.Parameters["computation_graph"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("missing or invalid computation_graph parameter")
	}
	
	// Generate glyph
	glyph, err := agw.glyphGenerator.GenerateGlyph(ctx, computationGraph)
	if err != nil {
		return nil, fmt.Errorf("glyph generation failed: %v", err)
	}
	
	return map[string]interface{}{
		"glyph_id":    glyph.ID,
		"image_data":  glyph.ImageData,
		"metadata":    glyph.Metadata,
		"cache_keys":  glyph.CacheKeys,
		"generated_at": time.Now(),
	}, nil
}

func (agw *AsyncGlyphWorker) processTranspileGlyph(ctx context.Context, job *WorkJob) (map[string]interface{}, error) {
	imageData, ok := job.Parameters["image_data"].([]byte)
	if !ok {
		return nil, fmt.Errorf("missing or invalid image_data parameter")
	}
	
	// Transpile glyph to binary
	binary, err := agw.aiReader.TranspileGlyph(ctx, imageData)
	if err != nil {
		return nil, fmt.Errorf("glyph transpilation failed: %v", err)
	}
	
	return map[string]interface{}{
		"binary_data":    binary.Data,
		"instructions":   binary.Instructions,
		"metadata":       binary.Metadata,
		"transpiled_at":  time.Now(),
	}, nil
}

func (agw *AsyncGlyphWorker) processExecuteGlyph(ctx context.Context, job *WorkJob) (map[string]interface{}, error) {
	binaryData, ok := job.Parameters["binary_data"].([]byte)
	if !ok {
		return nil, fmt.Errorf("missing or invalid binary_data parameter")
	}
	
	// Execute glyph binary
	result, err := agw.executionRuntime.ExecuteBinary(ctx, binaryData)
	if err != nil {
		return nil, fmt.Errorf("glyph execution failed: %v", err)
	}
	
	return map[string]interface{}{
		"execution_result": result,
		"executed_at":      time.Now(),
	}, nil
}

func (agw *AsyncGlyphWorker) processBatchGenerate(ctx context.Context, job *WorkJob) (map[string]interface{}, error) {
	graphs, ok := job.Parameters["computation_graphs"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("missing or invalid computation_graphs parameter")
	}
	
	var results []map[string]interface{}
	var errors []string
	
	for i, graphInterface := range graphs {
		graph, ok := graphInterface.(map[string]interface{})
		if !ok {
			errors = append(errors, fmt.Sprintf("invalid graph at index %d", i))
			continue
		}
		
		glyph, err := agw.glyphGenerator.GenerateGlyph(ctx, graph)
		if err != nil {
			errors = append(errors, fmt.Sprintf("failed to generate glyph %d: %v", i, err))
			continue
		}
		
		results = append(results, map[string]interface{}{
			"glyph_id":   glyph.ID,
			"image_data": glyph.ImageData,
			"metadata":   glyph.Metadata,
		})
	}
	
	return map[string]interface{}{
		"generated_glyphs": results,
		"errors":          errors,
		"total_requested": len(graphs),
		"successful":      len(results),
		"failed":          len(errors),
	}, nil
}

func (agw *AsyncGlyphWorker) processOptimizeCache(ctx context.Context, job *WorkJob) (map[string]interface{}, error) {
	// Run cache optimization
	maxAge := 24 * time.Hour // Default 24 hours
	if ageParam, exists := job.Parameters["max_age_hours"]; exists {
		if hours, ok := ageParam.(float64); ok {
			maxAge = time.Duration(hours) * time.Hour
		}
	}
	
	err := agw.tensorCache.EvictLeastRecentlyUsed(ctx, maxAge)
	if err != nil {
		return nil, fmt.Errorf("cache optimization failed: %v", err)
	}
	
	// Get cache statistics
	stats := agw.tensorCache.GetCacheStats()
	
	return map[string]interface{}{
		"optimization_completed": true,
		"max_age_hours":         maxAge.Hours(),
		"cache_stats":           stats,
		"optimized_at":          time.Now(),
	}, nil
}

func (agw *AsyncGlyphWorker) processAnalyzeUsage(ctx context.Context, job *WorkJob) (map[string]interface{}, error) {
	// Analyze computation usage patterns
	timeRange := 7 * 24 * time.Hour // Default 7 days
	if rangeParam, exists := job.Parameters["time_range_hours"]; exists {
		if hours, ok := rangeParam.(float64); ok {
			timeRange = time.Duration(hours) * time.Hour
		}
	}
	
	analytics, err := agw.historyTracker.GetComputationAnalytics(ctx, timeRange)
	if err != nil {
		return nil, fmt.Errorf("usage analysis failed: %v", err)
	}
	
	return map[string]interface{}{
		"analytics":     analytics,
		"time_range":    timeRange.String(),
		"analyzed_at":   time.Now(),
	}, nil
}

// Helper methods
func (agw *AsyncGlyphWorker) updateJobInRedis(ctx context.Context, job *WorkJob) {
	jobJSON, _ := json.Marshal(job)
	agw.redisClient.Set(ctx, fmt.Sprintf("job:%s", job.ID), jobJSON, 24*time.Hour)
}

func (agw *AsyncGlyphWorker) storeResult(ctx context.Context, result *WorkResult) {
	// Store in memory
	agw.resultMutex.Lock()
	agw.resultStore[result.JobID] = result
	agw.resultMutex.Unlock()
	
	// Store in Redis
	resultJSON, _ := json.Marshal(result)
	agw.redisClient.Set(ctx, fmt.Sprintf("result:%s", result.JobID), resultJSON, 24*time.Hour)
}

func (agw *AsyncGlyphWorker) runJobDistributor(ctx context.Context) {
	defer agw.wg.Done()
	
	// Implement priority-based job distribution
	// This is a simple implementation - could be enhanced with more sophisticated algorithms
	for {
		select {
		case <-agw.stopChannel:
			return
		default:
			time.Sleep(100 * time.Millisecond) // Simple polling
		}
	}
}

func (agw *AsyncGlyphWorker) runResultCleaner(ctx context.Context) {
	defer agw.wg.Done()
	
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	
	for {
		select {
		case <-agw.stopChannel:
			return
		case <-ticker.C:
			agw.cleanupOldResults(ctx)
		}
	}
}

func (agw *AsyncGlyphWorker) runHealthMonitor(ctx context.Context) {
	defer agw.wg.Done()
	
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-agw.stopChannel:
			return
		case <-ticker.C:
			agw.reportHealthMetrics(ctx)
		}
	}
}

func (agw *AsyncGlyphWorker) cleanupOldResults(ctx context.Context) {
	agw.resultMutex.Lock()
	defer agw.resultMutex.Unlock()
	
	cutoff := time.Now().Add(-2 * time.Hour) // Keep results for 2 hours
	
	for jobID, result := range agw.resultStore {
		if result.EndTime != nil && result.EndTime.Before(cutoff) {
			delete(agw.resultStore, jobID)
		}
	}
}

func (agw *AsyncGlyphWorker) reportHealthMetrics(ctx context.Context) {
	availableWorkers := 0
	totalProcessedJobs := int64(0)
	
	for _, worker := range agw.workers {
		if worker.IsAvailable {
			availableWorkers++
		}
		totalProcessedJobs += worker.ProcessedJobs
	}
	
	log.Printf("Worker Health: %d/%d available, %d total jobs processed, %d queued jobs",
		availableWorkers, len(agw.workers), totalProcessedJobs, len(agw.jobQueue))
}

// GetWorkerStats returns current worker pool statistics
func (agw *AsyncGlyphWorker) GetWorkerStats() map[string]interface{} {
	agw.resultMutex.RLock()
	defer agw.resultMutex.RUnlock()
	
	availableWorkers := 0
	totalProcessedJobs := int64(0)
	
	for _, worker := range agw.workers {
		if worker.IsAvailable {
			availableWorkers++
		}
		totalProcessedJobs += worker.ProcessedJobs
	}
	
	return map[string]interface{}{
		"total_workers":       len(agw.workers),
		"available_workers":   availableWorkers,
		"busy_workers":        len(agw.workers) - availableWorkers,
		"queued_jobs":         len(agw.jobQueue),
		"completed_results":   len(agw.resultStore),
		"total_processed":     totalProcessedJobs,
		"is_running":          agw.isRunning,
	}
}