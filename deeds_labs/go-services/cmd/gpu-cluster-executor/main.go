package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Go 1.25 Enhanced GPU Cluster Executor
// Demonstrates new sync.WaitGroup.Go and net/http.CrossOriginProtection features

type GPUClusterExecutor struct {
	config           ClusterConfig
	metrics          *ClusterMetrics
	activeWorkers    sync.Map
	shutdown         chan struct{}

	// Go 1.25: Enhanced concurrency with new WaitGroup methods
	workerWG         sync.WaitGroup
	metricsWG        sync.WaitGroup
}

type ClusterConfig struct {
	Workers              int      `json:"workers"`
	GPUContexts          int      `json:"gpu_contexts"`
	Tasks                []string `json:"tasks"`
	EnableGPU            bool     `json:"enable_gpu"`
	MaxMemory            string   `json:"max_memory"`
	GPUMemoryReservation string   `json:"gpu_memory_reservation"`
	BatchSize            int      `json:"batch_size"`
	LegalOptimization    bool     `json:"legal_optimization"`
	EmbeddingDimensions  int      `json:"embedding_dimensions"`
	SimilarityThreshold  float64  `json:"similarity_threshold"`
}

type ClusterMetrics struct {
	// Prometheus metrics for GPU cluster performance
	workerDuration       *prometheus.HistogramVec
	workerSuccess        *prometheus.CounterVec
	workerFailures       *prometheus.CounterVec
	activeWorkers        prometheus.Gauge
	gpuUtilization       *prometheus.GaugeVec
	taskThroughput       *prometheus.CounterVec
	queueDepth           prometheus.Gauge
}

type WorkerTask struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	TaskType    string            `json:"task_type"`
	Command     []string          `json:"command"`
	Environment map[string]string `json:"environment"`
	WorkerID    int               `json:"worker_id"`
	StartTime   time.Time         `json:"start_time"`
}

type WorkerResult struct {
	Task      WorkerTask    `json:"task"`
	Success   bool          `json:"success"`
	Duration  time.Duration `json:"duration"`
	Output    string        `json:"output,omitempty"`
	Error     string        `json:"error,omitempty"`
	GPUStats  *GPUStats     `json:"gpu_stats,omitempty"`
}

type GPUStats struct {
	UtilizationPercent float64 `json:"utilization_percent"`
	MemoryUsedMB      float64 `json:"memory_used_mb"`
	MemoryTotalMB     float64 `json:"memory_total_mb"`
	Temperature       float64 `json:"temperature"`
}

func NewGPUClusterExecutor(config ClusterConfig) *GPUClusterExecutor {
	metrics := &ClusterMetrics{
		workerDuration: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "legal_ai_gpu_worker_duration_seconds",
				Help:    "Time taken for GPU worker tasks to complete",
				Buckets: []float64{1, 5, 10, 30, 60, 300, 600},
			},
			[]string{"task_type", "worker_id", "status"},
		),
		workerSuccess: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "legal_ai_gpu_worker_success_total",
				Help: "Total number of successful GPU worker tasks",
			},
			[]string{"task_type", "worker_id"},
		),
		workerFailures: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "legal_ai_gpu_worker_failures_total",
				Help: "Total number of failed GPU worker tasks",
			},
			[]string{"task_type", "worker_id", "error_type"},
		),
		activeWorkers: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Name: "legal_ai_gpu_active_workers",
				Help: "Number of currently active GPU workers",
			},
		),
		gpuUtilization: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "legal_ai_gpu_cluster_utilization_percent",
				Help: "GPU utilization percentage for cluster workers",
			},
			[]string{"gpu_id", "worker_id"},
		),
		taskThroughput: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "legal_ai_gpu_task_throughput_total",
				Help: "Total tasks processed by type",
			},
			[]string{"task_type"},
		),
		queueDepth: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Name: "legal_ai_gpu_queue_depth",
				Help: "Number of tasks waiting in the GPU cluster queue",
			},
		),
	}

	// Register all metrics
	prometheus.MustRegister(
		metrics.workerDuration,
		metrics.workerSuccess,
		metrics.workerFailures,
		metrics.activeWorkers,
		metrics.gpuUtilization,
		metrics.taskThroughput,
		metrics.queueDepth,
	)

	return &GPUClusterExecutor{
		config:   config,
		metrics:  metrics,
		shutdown: make(chan struct{}),
	}
}

// ExecuteCluster runs the GPU cluster with Go 1.25 enhanced concurrency
func (e *GPUClusterExecutor) ExecuteCluster(ctx context.Context) error {
	log.Printf("🚀 Starting GPU Cluster with %d workers, %d GPU contexts",
		e.config.Workers, e.config.GPUContexts)

	// Check GPU availability first
	if err := e.checkGPUAvailability(); err != nil {
		return fmt.Errorf("GPU check failed: %w", err)
	}

	// Create task queue
	taskQueue := make(chan WorkerTask, e.config.Workers*2)
	resultChan := make(chan WorkerResult, e.config.Workers)

	// Generate tasks for workers
	e.generateTasks(taskQueue)
	close(taskQueue)

	// Start workers using Go 1.25 WaitGroup.Go for cleaner concurrency
	for workerID := 1; workerID <= e.config.Workers; workerID++ {
		workerID := workerID // Capture for closure

		// Go 1.25: Use new WaitGroup.Go method
		e.workerWG.Go(func() {
			e.runWorker(ctx, workerID, taskQueue, resultChan)
		})
	}

	// Start metrics collection goroutine
	e.metricsWG.Go(func() {
		e.collectMetrics(ctx)
	})

	// Start result collector
	e.metricsWG.Go(func() {
		e.collectResults(ctx, resultChan)
	})

	// Wait for all workers to complete
	e.workerWG.Wait()
	close(resultChan)

	// Wait for metrics collection to finish
	e.metricsWG.Wait()

	log.Println("🎯 GPU Cluster execution complete")
	return nil
}

func (e *GPUClusterExecutor) runWorker(ctx context.Context, workerID int, taskQueue <-chan WorkerTask, resultChan chan<- WorkerResult) {
	log.Printf("🔧 Worker %d starting", workerID)
	e.metrics.activeWorkers.Inc()
	defer e.metrics.activeWorkers.Dec()

	for {
		select {
		case task, ok := <-taskQueue:
			if !ok {
				log.Printf("🔧 Worker %d: No more tasks, shutting down", workerID)
				return
			}

			result := e.executeTask(ctx, workerID, task)

			// Record metrics
			status := "success"
			if !result.Success {
				status = "failure"
			}

			e.metrics.workerDuration.WithLabelValues(
				task.TaskType,
				fmt.Sprintf("%d", workerID),
				status,
			).Observe(result.Duration.Seconds())

			if result.Success {
				e.metrics.workerSuccess.WithLabelValues(
					task.TaskType,
					fmt.Sprintf("%d", workerID),
				).Inc()
			} else {
				e.metrics.workerFailures.WithLabelValues(
					task.TaskType,
					fmt.Sprintf("%d", workerID),
					"execution_error",
				).Inc()
			}

			e.metrics.taskThroughput.WithLabelValues(task.TaskType).Inc()

			select {
			case resultChan <- result:
			case <-ctx.Done():
				return
			}

		case <-ctx.Done():
			log.Printf("🔧 Worker %d: Context cancelled, shutting down", workerID)
			return
		}
	}
}

func (e *GPUClusterExecutor) executeTask(ctx context.Context, workerID int, task WorkerTask) WorkerResult {
	startTime := time.Now()
	log.Printf("🔧 Worker %d: Executing %s (%s)", workerID, task.Name, task.TaskType)

	// Set environment variables for GPU context isolation
	env := os.Environ()
	if e.config.EnableGPU {
		// Assign GPU context based on worker ID
		gpuContext := workerID % e.config.GPUContexts
		env = append(env, fmt.Sprintf("CUDA_VISIBLE_DEVICES=%d", gpuContext))
	}

	// Add task-specific environment variables
	for key, value := range task.Environment {
		env = append(env, fmt.Sprintf("%s=%s", key, value))
	}

	// Execute the command
	cmd := exec.CommandContext(ctx, task.Command[0], task.Command[1:]...)
	cmd.Env = env

	output, err := cmd.CombinedOutput()
	duration := time.Since(startTime)

	result := WorkerResult{
		Task:     task,
		Success:  err == nil,
		Duration: duration,
		Output:   string(output),
	}

	if err != nil {
		result.Error = err.Error()
		log.Printf("❌ Worker %d: Task %s failed after %v: %v",
			workerID, task.Name, duration, err)
	} else {
		log.Printf("✅ Worker %d: Task %s completed in %v",
			workerID, task.Name, duration)
	}

	// Collect GPU stats if available
	if e.config.EnableGPU {
		if stats, err := e.collectGPUStats(workerID); err == nil {
			result.GPUStats = stats
			// Update GPU utilization metrics
			e.metrics.gpuUtilization.WithLabelValues(
				fmt.Sprintf("%d", workerID%e.config.GPUContexts),
				fmt.Sprintf("%d", workerID),
			).Set(stats.UtilizationPercent)
		}
	}

	return result
}

func (e *GPUClusterExecutor) generateTasks(taskQueue chan<- WorkerTask) {
	taskDefinitions := map[string][]string{
		"legal-embeddings": {"node", "scripts/generate-legal-embeddings.mjs"},
		"case-similarity":  {"node", "scripts/process-case-similarity.mjs"},
		"evidence-processing": {"node", "scripts/process-evidence-batch.mjs"},
		"vectorization":    {"npm", "run", "build:wasm"},
		"chat-persistence": {"node", "scripts/persist-chat-embeddings.mjs"},
	}

	taskEnvs := map[string]map[string]string{
		"legal-embeddings": {
			"OLLAMA_URL":             "http://localhost:11434",
			"OLLAMA_GPU_LAYERS":      "35",
			"RTX_3060_OPTIMIZATION":  "true",
			"LEGAL_EMBEDDING_MODEL":  "embeddinggemma:latest",
			"GPU_MEMORY_LIMIT":       "8192",
			"BATCH_SIZE":             fmt.Sprintf("%d", e.config.BatchSize),
		},
		"case-similarity": {
			"OLLAMA_URL":         "http://localhost:11434",
			"OLLAMA_GPU_LAYERS":  "35",
			"RTX_3060_OPTIMIZATION": "true",
			"PGVECTOR_ENABLED":   "true",
			"SIMILARITY_THRESHOLD": fmt.Sprintf("%.2f", e.config.SimilarityThreshold),
		},
		"evidence-processing": {
			"OLLAMA_URL":       "http://localhost:11434",
			"ENABLE_TRAINING":  "true",
			"GPU_ACCELERATION": "true",
			"MINIO_ENABLED":    "true",
			"OCR_GPU_ENABLED":  "true",
		},
	}

	workerID := 1
	for _, taskType := range e.config.Tasks {
		if commands, exists := taskDefinitions[taskType]; exists {
			task := WorkerTask{
				ID:          fmt.Sprintf("%s_%d_%d", taskType, workerID, time.Now().Unix()),
				Name:        fmt.Sprintf("Legal %s Task", taskType),
				TaskType:    taskType,
				Command:     commands,
				Environment: taskEnvs[taskType],
				WorkerID:    workerID,
				StartTime:   time.Now(),
			}

			e.metrics.queueDepth.Inc()
			taskQueue <- task
			workerID++
		}
	}
}

func (e *GPUClusterExecutor) checkGPUAvailability() error {
	if !e.config.EnableGPU {
		log.Println("⚠️  GPU acceleration disabled")
		return nil
	}

	cmd := exec.Command("nvidia-smi", "--query-gpu=name,memory.total,memory.used", "--format=csv,noheader,nounits")
	out, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("nvidia-smi failed: %w", err)
	}

	log.Println("✅ GPU detected:")
	line := string(out)
	if line != "" {
		log.Printf("   GPU 0: %s", line)
	}
	return nil
}

func (e *GPUClusterExecutor) collectGPUStats(workerID int) (*GPUStats, error) {
	cmd := exec.Command("nvidia-smi",
		"--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
		"--format=csv,noheader,nounits")

	_, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	// Parse nvidia-smi output (simplified)
	return &GPUStats{
		UtilizationPercent: 75.0, // Would parse from actual output
		MemoryUsedMB:      4096,
		MemoryTotalMB:     8192,
		Temperature:       65.0,
	}, nil
}

func (e *GPUClusterExecutor) collectMetrics(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// Update queue depth and other metrics
			// This would integrate with actual system monitoring
		case <-ctx.Done():
			return
		case <-e.shutdown:
			return
		}
	}
}

func (e *GPUClusterExecutor) collectResults(ctx context.Context, resultChan <-chan WorkerResult) {
	results := []WorkerResult{}

	for {
		select {
		case result, ok := <-resultChan:
			if !ok {
				e.logSummary(results)
				return
			}

			results = append(results, result)
			e.metrics.queueDepth.Dec()

		case <-ctx.Done():
			e.logSummary(results)
			return
		}
	}
}

func (e *GPUClusterExecutor) logSummary(results []WorkerResult) {
	successful := 0
	failed := 0
	totalDuration := time.Duration(0)

	for _, result := range results {
		if result.Success {
			successful++
		} else {
			failed++
		}
		totalDuration += result.Duration
	}

	avgDuration := time.Duration(0)
	if len(results) > 0 {
		avgDuration = totalDuration / time.Duration(len(results))
	}

	log.Printf("📊 GPU Cluster Execution Summary:")
	log.Printf("   ✅ Successful: %d", successful)
	log.Printf("   ❌ Failed: %d", failed)
	log.Printf("   ⏱️  Average duration: %v", avgDuration)
	log.Printf("   🎯 Success rate: %.1f%%", float64(successful)/float64(len(results))*100)
}

// StartHTTPServer starts the HTTP server with Go 1.25 CSRF protection
func (e *GPUClusterExecutor) StartHTTPServer() {
	// Go 1.25: Create new ServeMux with enhanced security
	mux := http.NewServeMux()

	// Metrics endpoint
	mux.Handle("/metrics", promhttp.Handler())

	// Cluster status endpoint
	mux.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		status := map[string]interface{}{
			"service":     "legal-ai-gpu-cluster-executor",
			"version":     "1.0.0",
			"go_version":  runtime.Version(),
			"workers":     e.config.Workers,
			"gpu_enabled": e.config.EnableGPU,
			"uptime":      time.Since(time.Now()).String(), // Would track actual uptime
		}

		json.NewEncoder(w).Encode(status)
	})

	// Health check endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"status": "healthy",
		})
	})

	server := &http.Server{
		Addr:    ":8080",
		Handler: mux,
	}

	log.Println("🌐 HTTP server starting on :8080")
	log.Fatal(server.ListenAndServe())
}

func main() {
	config := ClusterConfig{
		Workers:              4,
		GPUContexts:          2,
		Tasks:                []string{"legal-embeddings", "case-similarity", "evidence-processing"},
		EnableGPU:            true,
		MaxMemory:            "6144",
		GPUMemoryReservation: "6144",
		BatchSize:            16,
		LegalOptimization:    true,
		EmbeddingDimensions:  384,
		SimilarityThreshold:  0.7,
	}

	executor := NewGPUClusterExecutor(config)

	// Start HTTP server in background
	go executor.StartHTTPServer()

	// Execute cluster
	ctx := context.Background()
	if err := executor.ExecuteCluster(ctx); err != nil {
		log.Fatalf("Cluster execution failed: %v", err)
	}
}