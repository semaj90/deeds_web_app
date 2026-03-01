package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"tensorrt-infer/trt"
	"time"
)

var (
	engine     *trt.Engine
	engineLock sync.RWMutex
	port       string
	enginePath string
)

// CompletionRequest matches OpenAI /v1/completions format
type CompletionRequest struct {
	Prompt      string  `json:"prompt"`
	MaxTokens   int     `json:"max_tokens"`
	Temperature float64 `json:"temperature"`
	Stream      bool    `json:"stream"`
}

// CompletionResponse matches OpenAI format
type CompletionResponse struct {
	Choices []Choice `json:"choices"`
	Usage   Usage    `json:"usage,omitempty"`
	Error   string   `json:"error,omitempty"`
}

type Choice struct {
	Text         string `json:"text"`
	Index        int    `json:"index"`
	FinishReason string `json:"finish_reason,omitempty"`
}

type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// EmbeddingRequest for /v1/embeddings
type EmbeddingRequest struct {
	Input string `json:"input"`
	Model string `json:"model"`
}

// EmbeddingResponse matches OpenAI format
type EmbeddingResponse struct {
	Data  []EmbeddingData `json:"data"`
	Usage Usage           `json:"usage,omitempty"`
	Error string          `json:"error,omitempty"`
}

type EmbeddingData struct {
	Embedding []float32 `json:"embedding"`
	Index     int       `json:"index"`
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	engineLock.RLock()
	defer engineLock.RUnlock()

	if engine == nil {
		http.Error(w, `{"status":"unhealthy","reason":"engine not loaded"}`, http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"healthy","model":"gemma3-12b-legal-q4km"}`)
}

func handleCompletions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Failed to read request: %v"}`, err), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var req CompletionRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Invalid JSON: %v"}`, err), http.StatusBadRequest)
		return
	}

	// Default values
	if req.MaxTokens == 0 {
		req.MaxTokens = 2048
	}
	if req.Temperature == 0 {
		req.Temperature = 0.7
	}

	engineLock.RLock()
	defer engineLock.RUnlock()

	if engine == nil {
		http.Error(w, `{"error":"Engine not loaded"}`, http.StatusServiceUnavailable)
		return
	}

	// For now, return a simple completion
	// TODO: Implement actual tokenization + inference + decoding
	resp := CompletionResponse{
		Choices: []Choice{
			{
				Text:         fmt.Sprintf("Response to: %s (tokens: %d, temp: %.2f)", req.Prompt[:min(50, len(req.Prompt))], req.MaxTokens, req.Temperature),
				Index:        0,
				FinishReason: "stop",
			},
		},
		Usage: Usage{
			PromptTokens:     len(req.Prompt) / 4, // Rough estimate
			CompletionTokens: 10,
			TotalTokens:      len(req.Prompt)/4 + 10,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleEmbeddings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Failed to read request: %v"}`, err), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var req EmbeddingRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Invalid JSON: %v"}`, err), http.StatusBadRequest)
		return
	}

	engineLock.RLock()
	defer engineLock.RUnlock()

	if engine == nil {
		http.Error(w, `{"error":"Engine not loaded"}`, http.StatusServiceUnavailable)
		return
	}

	// Prepare buffers (3840-dim for Gemma 3 12B IT)
	input := make([]float32, 3840)
	output := make([]float32, 3840)

	// TODO: Tokenize req.Input into embeddings
	// For now, fill with placeholder data
	for i := range input {
		input[i] = float32(i % 256) / 255.0
	}

	// Run inference
	if err := engine.Infer(input, output); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Inference failed: %v"}`, err), http.StatusInternalServerError)
		return
	}

	resp := EmbeddingResponse{
		Data: []EmbeddingData{
			{
				Embedding: output,
				Index:     0,
			},
		},
		Usage: Usage{
			PromptTokens: len(req.Input) / 4,
			TotalTokens:  len(req.Input) / 4,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}

func main() {
	flag.StringVar(&port, "port", "8099", "HTTP server port")
	flag.StringVar(&enginePath, "engine", "", "Path to TensorRT engine (.plan file)")
	flag.Parse()

	if enginePath == "" {
		log.Fatal("Error: --engine flag is required (path to .plan file)")
	}

	// Load TensorRT engine
	log.Printf("Loading TensorRT engine from %s...", enginePath)
	var err error
	engineLock.Lock()
	engine, err = trt.LoadPlan(enginePath)
	engineLock.Unlock()

	if err != nil {
		log.Fatalf("Failed to load engine: %v", err)
	}

	log.Printf("✅ Engine loaded successfully")

	// Setup HTTP routes
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/v1/completions", handleCompletions)
	mux.HandleFunc("/v1/embeddings", handleEmbeddings)

	// Wrap with logging middleware
	handler := loggingMiddleware(mux)

	// Start server
	addr := fmt.Sprintf(":%s", port)
	log.Printf("🚀 TensorRT-LLM server starting on http://localhost%s", addr)
	log.Printf("   Health: http://localhost%s/health", addr)
	log.Printf("   Completions: POST http://localhost%s/v1/completions", addr)
	log.Printf("   Embeddings: POST http://localhost%s/v1/embeddings", addr)

	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
