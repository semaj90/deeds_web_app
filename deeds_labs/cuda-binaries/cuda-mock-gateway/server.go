// Mock CUDA HTTP Gateway for testing embedding generation
// Provides deterministic embeddings for development and testing
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

type EmbedRequest struct {
	Model  string   `json:"model"`
	Inputs []string `json:"inputs"`
}

type EmbedResponse struct {
	Embeddings [][]float32 `json:"embeddings"`
	Model      string      `json:"model"`
	Usage      Usage       `json:"usage"`
}

type Usage struct {
	TotalTokens  int `json:"total_tokens"`
	PromptTokens int `json:"prompt_tokens"`
}

type HealthResponse struct {
	Status    string            `json:"status"`
	Version   string            `json:"version"`
	Models    []string          `json:"models"`
	GPU       GPUInfo           `json:"gpu"`
	Endpoints map[string]string `json:"endpoints"`
}

type GPUInfo struct {
	Available bool   `json:"available"`
	Device    string `json:"device"`
	Memory    string `json:"memory"`
	Compute   string `json:"compute"`
}

// Deterministic embedding generation for testing
func generateDeterministicEmbedding(text string, dimensions int) []float32 {
	// Use text hash as seed for reproducible embeddings
	seed := int64(0)
	for _, char := range text {
		seed += int64(char)
	}
	
	rng := rand.New(rand.NewSource(seed))
	embedding := make([]float32, dimensions)
	
	// Generate embedding with legal domain bias
	legalTerms := []string{"contract", "agreement", "legal", "court", "judge", "law", "case", "evidence", "plaintiff", "defendant"}
	legalBoost := float32(0.0)
	
	lowerText := strings.ToLower(text)
	for _, term := range legalTerms {
		if strings.Contains(lowerText, term) {
			legalBoost += 0.1
		}
	}
	
	// Generate normalized embedding
	var magnitude float32 = 0.0
	for i := 0; i < dimensions; i++ {
		val := (rng.Float32()*2.0 - 1.0) * (1.0 + legalBoost)
		embedding[i] = val
		magnitude += val * val
	}
	
	// Normalize vector
	magnitude = float32(math.Sqrt(float64(magnitude)))
	if magnitude > 0 {
		for i := 0; i < dimensions; i++ {
			embedding[i] /= magnitude
		}
	}
	
	return embedding
}

func embedHandler(c *gin.Context) {
	var req EmbedRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request format", "details": err.Error()})
		return
	}
	
	if len(req.Inputs) == 0 {
		c.JSON(400, gin.H{"error": "No inputs provided"})
		return
	}
	
	if len(req.Inputs) > 100 {
		c.JSON(400, gin.H{"error": "Too many inputs, maximum 100 per request"})
		return
	}
	
	// Simulate processing time
	processingTime := time.Duration(50+len(req.Inputs)*10) * time.Millisecond
	time.Sleep(processingTime)
	
	model := req.Model
	if model == "" {
		model = "nomic-embed-text"
	}
	
	dimensions := 768
	if strings.Contains(model, "384") {
		dimensions = 384
	} else if strings.Contains(model, "1024") {
		dimensions = 1024
	}
	
	embeddings := make([][]float32, len(req.Inputs))
	totalTokens := 0
	
	for i, text := range req.Inputs {
		embeddings[i] = generateDeterministicEmbedding(text, dimensions)
		// Rough token estimation
		totalTokens += len(strings.Fields(text))
	}
	
	response := EmbedResponse{
		Embeddings: embeddings,
		Model:      model,
		Usage: Usage{
			TotalTokens:  totalTokens,
			PromptTokens: totalTokens,
		},
	}
	
	log.Printf("Generated %d embeddings for model %s (%d dimensions)", len(embeddings), model, dimensions)
	c.JSON(200, response)
}

func healthHandler(c *gin.Context) {
	response := HealthResponse{
		Status:  "healthy",
		Version: "1.0.0-mock",
		Models:  []string{"nomic-embed-text", "all-MiniLM-L6-v2", "sentence-transformers"},
		GPU: GPUInfo{
			Available: true,
			Device:    "Mock RTX 3060 Ti",
			Memory:    "8GB",
			Compute:   "8.6",
		},
		Endpoints: map[string]string{
			"embeddings": "/v1/embeddings",
			"health":     "/health",
			"models":     "/v1/models",
		},
	}
	
	c.JSON(200, response)
}

func modelsHandler(c *gin.Context) {
	models := map[string]interface{}{
		"data": []map[string]interface{}{
			{
				"id":         "nomic-embed-text",
				"object":     "model",
				"dimensions": 768,
				"max_tokens": 8192,
				"description": "Mock embedding model for legal documents",
			},
			{
				"id":         "all-MiniLM-L6-v2",
				"object":     "model", 
				"dimensions": 384,
				"max_tokens": 512,
				"description": "Mock sentence transformer model",
			},
		},
	}
	
	c.JSON(200, models)
}

func benchmarkHandler(c *gin.Context) {
	// Simulate a benchmark test
	testInputs := []string{
		"This is a legal contract between the parties.",
		"The plaintiff alleges damages in the amount of $50,000.",
		"Evidence submitted to the court includes documents and testimony.",
	}
	
	start := time.Now()
	embeddings := make([][]float32, len(testInputs))
	
	for i, text := range testInputs {
		embeddings[i] = generateDeterministicEmbedding(text, 768)
	}
	
	elapsed := time.Since(start)
	
	result := map[string]interface{}{
		"test_inputs":     len(testInputs),
		"dimensions":      768,
		"processing_time": elapsed.Milliseconds(),
		"throughput":      float64(len(testInputs)) / elapsed.Seconds(),
		"sample_embedding": embeddings[0][:10], // First 10 dimensions
	}
	
	c.JSON(200, result)
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "9001"
	}
	
	// Set gin mode
	gin.SetMode(gin.ReleaseMode)
	
	r := gin.New()
	r.Use(gin.Logger())
	r.Use(gin.Recovery())
	
	// CORS for browser requests
	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "Authorization"}
	r.Use(cors.New(config))
	
	// Routes
	r.GET("/health", healthHandler)
	r.GET("/v1/health", healthHandler)
	r.POST("/v1/embeddings", embedHandler)
	r.GET("/v1/models", modelsHandler)
	r.GET("/benchmark", benchmarkHandler)
	
	// Root endpoint
	r.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"service": "Mock CUDA Embedding Gateway",
			"version": "1.0.0",
			"endpoints": []string{
				"GET /health",
				"POST /v1/embeddings", 
				"GET /v1/models",
				"GET /benchmark",
			},
			"documentation": "Drop-in replacement for CUDA embedding service",
		})
	})
	
	log.Printf("🚀 Mock CUDA Gateway starting on port %s", port)
	log.Printf("📡 Endpoints:")
	log.Printf("   Health: http://localhost:%s/health", port)
	log.Printf("   Embeddings: POST http://localhost:%s/v1/embeddings", port)
	log.Printf("   Models: http://localhost:%s/v1/models", port)
	log.Printf("   Benchmark: http://localhost:%s/benchmark", port)
	
	if err := r.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}