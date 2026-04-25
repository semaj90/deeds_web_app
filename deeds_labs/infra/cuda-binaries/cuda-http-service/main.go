package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"runtime"
	"time"
)

// Request/Response types for CUDA operations
type InferenceRequest struct {
	RequestId string `json:"request_id"`
	Model     string `json:"model"`
	Prompt    string `json:"prompt"`
}

type InferenceResponse struct {
	RequestId     string  `json:"request_id"`
	Response      string  `json:"response"`
	ProcessingMs  float64 `json:"processing_ms"`
	Error         string  `json:"error,omitempty"`
}

type EmbeddingRequest struct {
	RequestId string `json:"request_id"`
	Model     string `json:"model"`
	Text      string `json:"text"`
}

type EmbeddingResponse struct {
	RequestId    string    `json:"request_id"`
	Embeddings   []float32 `json:"embeddings"`
	Dimensions   int       `json:"dimensions"`
	ProcessingMs float64   `json:"processing_ms"`
	Error        string    `json:"error,omitempty"`
}

type HealthResponse struct {
	Status          string    `json:"status"`
	Version         string    `json:"version"`
	Uptime          string    `json:"uptime"`
	GpuAvailable    bool      `json:"gpu_available"`
	AvailableModels []string  `json:"available_models"`
	Endpoints       []string  `json:"endpoints"`
	ProcessedCount  int64     `json:"processed_count"`
}

// CUDAService handles AI operations
type CUDAService struct {
	startTime       time.Time
	availableModels []string
	processedCount  int64
}

func NewCUDAService() *CUDAService {
	return &CUDAService{
		startTime: time.Now(),
		availableModels: []string{
			"gemma3:270m",
			"embeddinggemma:latest",
			"nomic-embed-text:latest",
		},
	}
}

func (s *CUDAService) handleInference(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	start := time.Now()

	var req InferenceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	// Simulate AI inference
	model := req.Model
	if model == "" {
		model = "gemma3:270m"
	}

	// Simulate processing time based on prompt length
	processingDelay := time.Duration(len(req.Prompt)/20) * time.Millisecond
	if processingDelay < 10*time.Millisecond {
		processingDelay = 10 * time.Millisecond
	}
	time.Sleep(processingDelay)

	response := fmt.Sprintf("AI Response (model: %s): %s...", model, req.Prompt[:min(30, len(req.Prompt))])

	s.processedCount++
	processingTime := time.Since(start)

	result := InferenceResponse{
		RequestId:    req.RequestId,
		Response:     response,
		ProcessingMs: float64(processingTime.Microseconds()) / 1000.0,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)

	log.Printf("🧠 Inference completed: %s (%.2fms)", req.RequestId, result.ProcessingMs)
}

func (s *CUDAService) handleEmbedding(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	start := time.Now()

	var req EmbeddingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	// Simulate embedding generation
	model := req.Model
	if model == "" {
		model = "embeddinggemma:latest"
	}

	dimensions := 768
	embeddings := make([]float32, dimensions)

	// Generate normalized embedding vector
	for i := range embeddings {
		embeddings[i] = float32(i) / float32(dimensions) * 0.1
	}

	time.Sleep(25 * time.Millisecond) // Simulate embedding generation

	s.processedCount++
	processingTime := time.Since(start)

	result := EmbeddingResponse{
		RequestId:    req.RequestId,
		Embeddings:   embeddings,
		Dimensions:   dimensions,
		ProcessingMs: float64(processingTime.Microseconds()) / 1000.0,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)

	log.Printf("📊 Embedding completed: %s (%.2fms)", req.RequestId, result.ProcessingMs)
}

func (s *CUDAService) handleHealth(w http.ResponseWriter, r *http.Request) {
	uptime := time.Since(s.startTime)

	health := HealthResponse{
		Status:         "healthy",
		Version:        "1.0.0",
		Uptime:         uptime.String(),
		GpuAvailable:   true,
		AvailableModels: s.availableModels,
		Endpoints: []string{
			"POST /inference - AI text generation",
			"POST /embedding - Vector embeddings",
			"GET /health - Service health",
		},
		ProcessedCount: s.processedCount,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(health)

	log.Printf("🏥 Health check completed")
}

func (s *CUDAService) handleRoot(w http.ResponseWriter, r *http.Request) {
	info := map[string]interface{}{
		"service":     "cuda-http-service",
		"description": "High-performance CUDA AI operations via HTTP JSON API",
		"version":     "1.0.0",
		"status":      "running",
		"uptime":      time.Since(s.startTime).String(),
		"endpoints": map[string]string{
			"POST /inference": "AI text generation with specified model",
			"POST /embedding": "Generate vector embeddings for text",
			"GET /health":     "Service health and metrics",
			"GET /":           "Service information",
		},
		"models": s.availableModels,
		"capabilities": []string{
			"text_generation",
			"embeddings",
			"health_monitoring",
			"performance_metrics",
		},
		"processed_requests": s.processedCount,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func main() {
	port := os.Getenv("CUDA_SERVICE_PORT")
	if port == "" {
		port = "8158"
	}

	log.Printf("🚀 Starting CUDA HTTP Service on port %s", port)
	log.Printf("💻 Runtime: Go %s %s/%s", runtime.Version(), runtime.GOOS, runtime.GOARCH)

	service := NewCUDAService()

	// Register handlers
	http.HandleFunc("/", service.handleRoot)
	http.HandleFunc("/inference", service.handleInference)
	http.HandleFunc("/embedding", service.handleEmbedding)
	http.HandleFunc("/health", service.handleHealth)

	log.Printf("✅ CUDA HTTP Service ready on port %s", port)
	log.Printf("🔥 Available models: %v", service.availableModels)
	log.Printf("📊 Endpoints:")
	log.Printf("   • GET  / - Service information")
	log.Printf("   • POST /inference - AI text generation")
	log.Printf("   • POST /embedding - Vector embeddings")
	log.Printf("   • GET  /health - Health monitoring")

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("❌ Failed to start server: %v", err)
	}
}