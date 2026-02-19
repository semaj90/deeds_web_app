package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

// LegalGatewayServer implements the Legal Gateway service
type LegalGatewayServer struct {
	port            string
	serviceRegistry map[string]string
}

// ServiceInfo represents information about backend services
type ServiceInfo struct {
	Name     string `json:"name"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Status   string `json:"status"`
	Protocol string `json:"protocol"`
}

// InferenceRequest represents an AI inference request
type InferenceRequest struct {
	Prompt  string `json:"prompt"`
	Model   string `json:"model"`
	UseGPU  bool   `json:"use_gpu"`
	MaxTokens int  `json:"max_tokens"`
}

// InferenceResponse represents an AI inference response
type InferenceResponse struct {
	Text           string            `json:"text"`
	Confidence     float64           `json:"confidence"`
	Model          string            `json:"model"`
	ProcessingTime int64             `json:"processing_time_ms"`
	TokensUsed     int               `json:"tokens_used"`
	Metadata       map[string]string `json:"metadata"`
}

// EmbeddingRequest represents an embedding generation request
type EmbeddingRequest struct {
	Text  string `json:"text"`
	Model string `json:"model"`
}

// EmbeddingResponse represents an embedding response
type EmbeddingResponse struct {
	Embedding      []float32         `json:"embedding"`
	Dimensions     int               `json:"dimensions"`
	Model          string            `json:"model"`
	ProcessingTime int64             `json:"processing_time_ms"`
	Metadata       map[string]string `json:"metadata"`
}

// SearchRequest represents a similarity search request
type SearchRequest struct {
	QueryEmbedding []float32 `json:"query_embedding"`
	LegalDomain    string    `json:"legal_domain"`
	TopK           int       `json:"top_k"`
	Threshold      float64   `json:"threshold"`
}

// SearchResponse represents a search response
type SearchResponse struct {
	Results        []SearchResult    `json:"results"`
	TotalResults   int               `json:"total_results"`
	ProcessingTime int64             `json:"processing_time_ms"`
	Metadata       map[string]string `json:"metadata"`
}

// SearchResult represents a single search result
type SearchResult struct {
	ID           string            `json:"id"`
	Score        float64           `json:"score"`
	Content      string            `json:"content"`
	DocumentType string            `json:"document_type"`
	Metadata     map[string]string `json:"metadata"`
}

// NewLegalGatewayServer creates a new Legal Gateway server
func NewLegalGatewayServer() *LegalGatewayServer {
	// Service registry with all 37 microservices
	serviceRegistry := map[string]string{
		"enhanced-rag":         "localhost:8094",
		"gpu-orchestrator":     "localhost:8095",
		"cognitive-microservice": "localhost:8096",
		"cuda-service-worker":  "localhost:8097",
		"cuda-http-service":    "localhost:8765",
		"legal-ai-inference":   "localhost:8100",
		"case-scoring":         "localhost:8101",
		"precedent-search":     "localhost:8102",
		"document-classifier":  "localhost:8103",
		"entity-extractor":     "localhost:8104",
		"vector-search":        "localhost:8110",
		"embedding-generator":  "localhost:8111",
		"similarity-engine":    "localhost:8112",
		"semantic-analyzer":    "localhost:8113",
		"tensor-cache":         "localhost:8120",
		"redis-orchestrator":   "localhost:8121",
		"minio-gateway":        "localhost:8122",
		"qdrant-proxy":         "localhost:8123",
		"quic-streaming":       "localhost:8130",
		"websocket-gateway":    "localhost:8131",
		"rabbitmq-coordinator": "localhost:8132",
		"nats-streaming":       "localhost:8133",
		"health-monitor":       "localhost:8140",
		"metrics-collector":    "localhost:8141",
		"performance-analyzer": "localhost:8142",
		"resource-manager":     "localhost:8143",
		"auth-service":         "localhost:8150",
		"session-manager":      "localhost:8151",
		"security-gateway":     "localhost:8152",
		"job-scheduler":        "localhost:8160",
		"task-coordinator":     "localhost:8161",
		"worker-pool":          "localhost:8162",
		"queue-manager":        "localhost:8163",
		"ocr-processor":        "localhost:8170",
		"nlp-analyzer":         "localhost:8171",
		"sentiment-analyzer":   "localhost:8172",
		"recommendation-engine": "localhost:8173",
		"config-manager":       "localhost:8180",
		"log-aggregator":       "localhost:8181",
	}

	return &LegalGatewayServer{
		port:            "8080",
		serviceRegistry: serviceRegistry,
	}
}

// HTTP handlers
func (s *LegalGatewayServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	health := map[string]interface{}{
		"status":    "healthy",
		"service":   "legal-gateway",
		"version":   "1.0.0",
		"timestamp": time.Now(),
		"services":  len(s.serviceRegistry),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(health)
}

func (s *LegalGatewayServer) handleServices(w http.ResponseWriter, r *http.Request) {
	services := make([]ServiceInfo, 0, len(s.serviceRegistry))
	for name, endpoint := range s.serviceRegistry {
		parts := strings.Split(endpoint, ":")
		port := 8080
		if len(parts) == 2 {
			fmt.Sscanf(parts[1], "%d", &port)
		}

		services = append(services, ServiceInfo{
			Name:     name,
			Host:     parts[0],
			Port:     port,
			Status:   "unknown", // Would check actual status in production
			Protocol: "http",
		})
	}

	response := map[string]interface{}{
		"gateway":       "legal-gateway",
		"total_services": len(services),
		"services":      services,
		"timestamp":     time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *LegalGatewayServer) handleInference(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req InferenceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	log.Printf("Received inference request: %s", req.Prompt)

	// Route to appropriate AI service based on request
	var targetService string
	if req.UseGPU {
		targetService = "gpu-orchestrator"
	} else if strings.Contains(strings.ToLower(req.Prompt), "legal") {
		targetService = "legal-ai-inference"
	} else {
		targetService = "cognitive-microservice"
	}

	// Mock response for now
	response := InferenceResponse{
		Text:           fmt.Sprintf("Legal AI Analysis: %s", req.Prompt),
		Confidence:     0.95,
		Model:          req.Model,
		ProcessingTime: 150,
		TokensUsed:     len(strings.Split(req.Prompt, " ")),
		Metadata: map[string]string{
			"gateway":        "legal-gateway",
			"target_service": targetService,
			"version":        "1.0.0",
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *LegalGatewayServer) handleEmbedding(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req EmbeddingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	log.Printf("Received embedding request for text: %s", req.Text[:min(50, len(req.Text))])

	// Mock embedding response
	embedding := make([]float32, 768) // Standard embedding dimension
	for i := range embedding {
		embedding[i] = float32(i%100) / 100.0 // Mock values
	}

	response := EmbeddingResponse{
		Embedding:      embedding,
		Dimensions:     768,
		Model:          req.Model,
		ProcessingTime: 50,
		Metadata: map[string]string{
			"gateway":        "legal-gateway",
			"target_service": "embedding-generator",
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *LegalGatewayServer) handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	log.Printf("Received similarity search request with %d dimensions", len(req.QueryEmbedding))

	// Mock search results
	results := []SearchResult{
		{
			ID:           "doc_001",
			Score:        0.95,
			Content:      "Sample legal document content...",
			DocumentType: "contract",
			Metadata: map[string]string{
				"case_id": "case_123",
				"domain":  req.LegalDomain,
			},
		},
		{
			ID:           "doc_002",
			Score:        0.87,
			Content:      "Another relevant legal document...",
			DocumentType: "precedent",
			Metadata: map[string]string{
				"case_id": "case_456",
				"domain":  req.LegalDomain,
			},
		},
	}

	response := SearchResponse{
		Results:        results,
		TotalResults:   len(results),
		ProcessingTime: 75,
		Metadata: map[string]string{
			"gateway":        "legal-gateway",
			"target_service": "vector-search",
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *LegalGatewayServer) setupRoutes() {
	http.HandleFunc("/health", s.handleHealth)
	http.HandleFunc("/services", s.handleServices)
	http.HandleFunc("/api/v1/inference", s.handleInference)
	http.HandleFunc("/api/v1/embeddings", s.handleEmbedding)
	http.HandleFunc("/api/v1/search", s.handleSearch)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func main() {
	log.Println("🚀 Starting Legal Gateway Service")

	server := NewLegalGatewayServer()
	server.setupRoutes()

	// Graceful shutdown
	go func() {
		sigterm := make(chan os.Signal, 1)
		signal.Notify(sigterm, syscall.SIGINT, syscall.SIGTERM)
		<-sigterm
		log.Println("🛑 Shutting down Legal Gateway gracefully...")
		os.Exit(0)
	}()

	log.Printf("🌐 HTTP Legal Gateway starting on port %s", server.port)
	log.Printf("📊 Managing %d backend services", len(server.serviceRegistry))
	log.Printf("🔗 Available endpoints:")
	log.Printf("  GET  /health - Service health check")
	log.Printf("  GET  /services - List all backend services")
	log.Printf("  POST /api/v1/inference - AI inference")
	log.Printf("  POST /api/v1/embeddings - Generate embeddings")
	log.Printf("  POST /api/v1/search - Similarity search")

	if err := http.ListenAndServe(":"+server.port, nil); err != nil {
		log.Fatalf("Failed to serve HTTP: %v", err)
	}
}