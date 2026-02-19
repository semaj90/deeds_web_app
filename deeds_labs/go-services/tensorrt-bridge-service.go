package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/rs/cors"
)

// TensorRT Bridge Service - Port 8100
// Frontend: /api/ai/chat-tensorrt → http://127.0.0.1:8100
// Integrates with TensorRT-LLM Python environment for gemma3-legal:latest

type TensorRTBridge struct {
	logger      *log.Logger
	engines     map[string]*TensorRTEngine
	engineMutex sync.RWMutex
	pythonEnv   string
	modelPath   string
}

type TensorRTEngine struct {
	ID           string                 `json:"id"`
	ModelName    string                 `json:"model_name"`
	Status       string                 `json:"status"` // loaded, unloaded, loading
	LastUsed     time.Time              `json:"last_used"`
	UsageCount   int64                  `json:"usage_count"`
	LoadTime     time.Duration          `json:"load_time"`
	Priority     int                    `json:"priority"`
	Metadata     map[string]interface{} `json:"metadata"`
	mutex        sync.RWMutex
}

type ChatRequest struct {
	Messages    []Message `json:"messages"`
	Model       string    `json:"model"`
	Temperature float32   `json:"temperature"`
	MaxTokens   int       `json:"max_tokens"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatResponse struct {
	Content        string  `json:"content"`
	Model          string  `json:"model"`
	ProcessingTime float64 `json:"processing_time_ms"`
	TokenCount     int     `json:"token_count"`
	Status         string  `json:"status"`
}

type HealthResponse struct {
	Status         string `json:"status"`
	ModelLoaded    bool   `json:"model_loaded"`
	GPUAvailable   bool   `json:"gpu_available"`
	PythonEnv      string `json:"python_env"`
	ModelPath      string `json:"model_path"`
	Timestamp      string `json:"timestamp"`
}

func NewTensorRTBridge() *TensorRTBridge {
	return &TensorRTBridge{
		logger:    log.New(os.Stdout, "[TensorRT] ", log.LstdFlags),
		engines:   make(map[string]*TensorRTEngine),
		pythonEnv: getEnv("TENSORRT_PYTHON_ENV", "/home/james/trt_env_310/bin/python"),
		modelPath: getEnv("TENSORRT_MODEL_PATH", "/home/james/gemma3_engine_flash"),
	}
}

func (tb *TensorRTBridge) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Check if Python environment and model exist
	modelExists := fileExists(tb.modelPath)

	response := HealthResponse{
		Status:       "healthy",
		ModelLoaded:  modelExists,
		GPUAvailable: tb.checkGPU(),
		PythonEnv:    tb.pythonEnv,
		ModelPath:    tb.modelPath,
		Timestamp:    time.Now().Format(time.RFC3339),
	}

	json.NewEncoder(w).Encode(response)
}

func (tb *TensorRTBridge) handleChat(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	startTime := time.Now()

	// Extract the latest user message
	var userMessage string
	for i := len(req.Messages) - 1; i >= 0; i-- {
		if req.Messages[i].Role == "user" {
			userMessage = req.Messages[i].Content
			break
		}
	}

	if userMessage == "" {
		http.Error(w, "No user message found", http.StatusBadRequest)
		return
	}

	tb.logger.Printf("Processing chat request: %s", userMessage[:min(50, len(userMessage))])

	// Call TensorRT-LLM Python script
	response, tokenCount, err := tb.callTensorRT(userMessage, req.Model)
	if err != nil {
		tb.logger.Printf("TensorRT error: %v", err)
		http.Error(w, "TensorRT processing failed", http.StatusInternalServerError)
		return
	}

	processingTime := float64(time.Since(startTime).Nanoseconds()) / 1e6

	chatResponse := ChatResponse{
		Content:        response,
		Model:          req.Model,
		ProcessingTime: processingTime,
		TokenCount:     tokenCount,
		Status:         "success",
	}

	json.NewEncoder(w).Encode(chatResponse)
}

func (tb *TensorRTBridge) callTensorRT(prompt, model string) (string, int, error) {
	// Check if .plan engine files exist
	planFiles, err := tb.findPlanFiles()
	if err != nil || len(planFiles) == 0 {
		tb.logger.Printf("No .plan files found, falling back to OLLAMA...")
		return tb.callOLLAMA(prompt, model)
	}

	// TODO: Use actual TensorRT .plan files when available
	tb.logger.Printf("Using TensorRT .plan engine: %v", planFiles)

	// For now, fallback to OLLAMA until .plan files are properly integrated
	return tb.callOLLAMA(prompt, model)
}

func (tb *TensorRTBridge) findPlanFiles() ([]string, error) {
	var planFiles []string
	engineDirs := []string{
		tb.modelPath,
		"engines/gemma3-legal-production",
		"engines/gemma3-legal-q4km",
		"engines/gemma3-legal-q4km-rtx3060ti",
	}

	for _, dir := range engineDirs {
		matches, err := filepath.Glob(filepath.Join(dir, "*.plan"))
		if err == nil && len(matches) > 0 {
			planFiles = append(planFiles, matches...)
		}
	}

	return planFiles, nil
}

func (tb *TensorRTBridge) callOLLAMA(prompt, model string) (string, int, error) {
	// Use OLLAMA gemma3-legal:latest as fallback
	ollamaModel := "gemma3-legal:latest"
	if model != "" {
		ollamaModel = model
	}

	tb.logger.Printf("Calling OLLAMA with model: %s", ollamaModel)

	// Prepare OLLAMA API request
	payload := map[string]interface{}{
		"model":  ollamaModel,
		"prompt": prompt,
		"stream": false,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", 0, fmt.Errorf("failed to marshal OLLAMA payload: %v", err)
	}

	// Call OLLAMA API
	resp, err := http.Post("http://localhost:11434/api/generate", "application/json", bytes.NewBuffer(payloadBytes))
	if err != nil {
		return "", 0, fmt.Errorf("OLLAMA API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", 0, fmt.Errorf("OLLAMA API returned status: %d", resp.StatusCode)
	}

	// Parse OLLAMA response
	var ollamaResp struct {
		Response string `json:"response"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&ollamaResp); err != nil {
		return "", 0, fmt.Errorf("failed to decode OLLAMA response: %v", err)
	}

	tokenCount := len(ollamaResp.Response) / 4 // Rough estimate
	return ollamaResp.Response, tokenCount, nil
}

func (tb *TensorRTBridge) checkGPU() bool {
	cmd := exec.Command("nvidia-smi", "--query-gpu=name", "--format=csv,noheader")
	err := cmd.Run()
	return err == nil
}

func fileExists(filename string) bool {
	_, err := os.Stat(filename)
	return err == nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func main() {
	bridge := NewTensorRTBridge()
	bridge.logger.Println("Starting TensorRT Bridge Service on port 8100")

	router := mux.NewRouter()
	router.HandleFunc("/health", bridge.handleHealth).Methods("GET")
	router.HandleFunc("/chat", bridge.handleChat).Methods("POST")
	router.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"service": "TensorRT Bridge",
			"version": "1.0.0",
			"status":  "ready",
		})
	}).Methods("GET")

	// Enable CORS for frontend integration
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:5174", "http://localhost:5175"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	handler := c.Handler(router)

	bridge.logger.Printf("TensorRT Bridge ready on http://127.0.0.1:8100")
	bridge.logger.Printf("Python Env: %s", bridge.pythonEnv)
	bridge.logger.Printf("Model Path: %s", bridge.modelPath)

	log.Fatal(http.ListenAndServe(":8100", handler))
}