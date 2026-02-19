package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

type InferenceRequest struct {
	Prompt      string  `json:"prompt"`
	MaxLength   int     `json:"max_length,omitempty"`
	Temperature float64 `json:"temperature,omitempty"`
}

type InferenceResponse struct {
	GeneratedText string  `json:"generated_text"`
	TokensPerSec  float64 `json:"tokens_per_sec"`
	Error         string  `json:"error,omitempty"`
}

func runPythonInference(req InferenceRequest) (InferenceResponse, error) {
	// Prepare the Python script call
	maxLen := 100
	if req.MaxLength > 0 {
		maxLen = req.MaxLength
	}
	temp := 0.7
	if req.Temperature > 0 {
		temp = req.Temperature
	}

	// Create a temporary script that calls our inference function
	script := fmt.Sprintf(`
import sys
sys.path.append('/workspace')
from gemma3_cuda_inference import generate_text_cuda
import json

result = generate_text_cuda("%s", max_length=%d, temperature=%.2f)
print(json.dumps(result))
`, strings.ReplaceAll(req.Prompt, `"`, `\"`), maxLen, temp)

	// Write script to temp file
	tempFile, err := os.CreateTemp("", "inference_*.py")
	if err != nil {
		return InferenceResponse{}, err
	}
	defer os.Remove(tempFile.Name())

	if _, err := tempFile.WriteString(script); err != nil {
		return InferenceResponse{}, err
	}
	tempFile.Close()

	// Run Python inference
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "python3", tempFile.Name())
	cmd.Dir = "/workspace"

	output, err := cmd.Output()
	if err != nil {
		return InferenceResponse{}, fmt.Errorf("python execution failed: %v, output: %s", err, string(output))
	}

	// Parse JSON response
	var result InferenceResponse
	if err := json.Unmarshal(output, &result); err != nil {
		return InferenceResponse{}, fmt.Errorf("failed to parse response: %v, output: %s", err, string(output))
	}

	return result, nil
}

func inferenceHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req InferenceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Prompt == "" {
		http.Error(w, "Prompt is required", http.StatusBadRequest)
		return
	}

	// Run inference
	result, err := runPythonInference(req)
	if err != nil {
		log.Printf("Inference error: %v", err)
		result = InferenceResponse{Error: err.Error()}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "healthy",
		"model": "gemma3-270m-onnx-cuda",
		"timestamp": time.Now().Unix(),
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}

	http.HandleFunc("/generate", inferenceHandler)
	http.HandleFunc("/health", healthHandler)

	fmt.Printf("🚀 Gemma3 CUDA Inference Service starting on port %s\n", port)
	fmt.Println("📍 Endpoints:")
	fmt.Println("   POST /generate - Run text generation")
	fmt.Println("   GET  /health   - Health check")

	log.Fatal(http.ListenAndServe(":"+port, nil))
}