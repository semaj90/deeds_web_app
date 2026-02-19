package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/bytedance/sonic"
	"github.com/gorilla/mux"
	"github.com/minio/simdjson-go"
)

// SIMDJSONResult represents the result of SIMD JSON parsing
type SIMDJSONResult struct {
	Tokens   []string          `json:"tokens"`
	Metadata map[string]interface{} `json:"metadata"`
	Error    string            `json:"error,omitempty"`
}

// SIMDJSONAccelerator provides high-performance JSON parsing using simdjson-go + sonic
type SIMDJSONAccelerator struct {
	port        int
	minioClient *MinIOClient
}

// NewSIMDJSONAccelerator creates a new SIMD JSON accelerator
func NewSIMDJSONAccelerator(port int) (*SIMDJSONAccelerator, error) {
	// Initialize MinIO client
	minioClient, err := NewMinIOClient()
	if err != nil {
		log.Printf("⚠️  MinIO not available: %v", err)
		minioClient = nil // Continue without MinIO
	}

	return &SIMDJSONAccelerator{
		port:        port,
		minioClient: minioClient,
	}, nil
}

// parseWithSimdJSON uses simdjson-go for AVX2-optimized parsing
func parseWithSimdJSON(jsonStr string) (interface{}, error) {
	pj, err := simdjson.Parse([]byte(jsonStr), nil)
	if err != nil {
		return nil, fmt.Errorf("simdjson parse error: %w", err)
	}

	// Convert to Go interface{}
	iter := pj.Iter()
	return iter.Interface()
}

// parseWithSonic uses bytedance/sonic for fast JSON parsing
func parseWithSonic(jsonStr string) (interface{}, error) {
	var result interface{}
	err := sonic.UnmarshalString(jsonStr, &result)
	if err != nil {
		return nil, fmt.Errorf("sonic parse error: %w", err)
	}
	return result, nil
}

// tokenizeJSONOptimized performs optimized JSON tokenization (fallback)
func tokenizeJSONOptimized(jsonStr string) []string {
	// Convert string to byte slice for efficient processing
	data := []byte(jsonStr)
	tokens := make([]string, 0, len(data)/4) // Estimate capacity

	i := 0
	for i < len(data) {
		// Skip whitespace efficiently
		for i < len(data) && isWhitespace(data[i]) {
			i++
		}
		if i >= len(data) {
			break
		}

		char := data[i]
		switch char {
		case '{', '}', '[', ']', ':', ',':
			tokens = append(tokens, string(char))
			i++
		case '"':
			// Parse string efficiently
			start := i
			i++ // Skip opening quote
			for i < len(data) && data[i] != '"' {
				if data[i] == '\\' {
					i += 2 // Skip escaped character
				} else {
					i++
				}
			}
			if i < len(data) {
				i++ // Skip closing quote
				tokens = append(tokens, string(data[start:i]))
			}
		case 't', 'f', 'n':
			// Parse true, false, null
			start := i
			if strings.HasPrefix(jsonStr[i:], "true") {
				i += 4
			} else if strings.HasPrefix(jsonStr[i:], "false") {
				i += 5
			} else if strings.HasPrefix(jsonStr[i:], "null") {
				i += 4
			}
			tokens = append(tokens, string(data[start:i]))
		default:
			// Parse numbers
			if char == '-' || (char >= '0' && char <= '9') {
				start := i
				for i < len(data) && isNumberChar(data[i]) {
					i++
				}
				tokens = append(tokens, string(data[start:i]))
			} else {
				i++ // Skip unknown characters
			}
		}
	}

	return tokens
}

// isWhitespace checks if a byte is whitespace
func isWhitespace(b byte) bool {
	return b == ' ' || b == '\t' || b == '\n' || b == '\r'
}

// isNumberChar checks if a byte is a valid number character
func isNumberChar(b byte) bool {
	return (b >= '0' && b <= '9') || b == '.' || b == '-' || b == '+' || b == 'e' || b == 'E'
}

// parseHandler handles HTTP requests for JSON parsing with simdjson-go + sonic
func (s *SIMDJSONAccelerator) parseHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var request struct {
		JSON   string `json:"json"`
		Method string `json:"method"` // "simdjson", "sonic", or "tokens"
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
		return
	}

	if request.JSON == "" {
		http.Error(w, "JSON field is required", http.StatusBadRequest)
		return
	}

	// Default to simdjson for AVX2 optimization
	if request.Method == "" {
		request.Method = "simdjson"
	}

	start := time.Now()
	var result SIMDJSONResult
	var parseErr error

	switch request.Method {
	case "simdjson":
		// Use simdjson-go (AVX2-optimized)
		parsed, err := parseWithSimdJSON(request.JSON)
		if err != nil {
			parseErr = err
		} else {
			result.Metadata = map[string]interface{}{
				"parsed_data": parsed,
				"method":      "simdjson-go",
				"avx2":        true,
			}
		}

	case "sonic":
		// Use bytedance/sonic (fast alternative)
		parsed, err := parseWithSonic(request.JSON)
		if err != nil {
			parseErr = err
		} else {
			result.Metadata = map[string]interface{}{
				"parsed_data": parsed,
				"method":      "sonic",
			}
		}

	case "tokens":
		// Tokenization only (legacy)
		tokens := tokenizeJSONOptimized(request.JSON)
		result.Tokens = tokens
		result.Metadata = map[string]interface{}{
			"tokens_count": len(tokens),
			"method":       "tokenize",
		}

	default:
		http.Error(w, "Invalid method. Use 'simdjson', 'sonic', or 'tokens'", http.StatusBadRequest)
		return
	}

	duration := time.Since(start)

	if parseErr != nil {
		result.Error = parseErr.Error()
	}

	// Add common metadata
	if result.Metadata == nil {
		result.Metadata = make(map[string]interface{})
	}
	result.Metadata["optimized_parsing"] = true
	result.Metadata["processing_time_ms"] = duration.Milliseconds()
	result.Metadata["processing_time_us"] = duration.Microseconds()
	result.Metadata["input_length"] = len(request.JSON)
	result.Metadata["processed_at"] = time.Now().Unix()
	result.Metadata["go_version"] = runtime.Version()
	result.Metadata["goroutines"] = runtime.NumGoroutine()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// healthHandler provides health check endpoint
func (s *SIMDJSONAccelerator) healthHandler(w http.ResponseWriter, r *http.Request) {
	health := map[string]interface{}{
		"status": "healthy",
		"service": "simd-json-accelerator",
		"port": s.port,
		"optimized_parsing": true,
		"timestamp": time.Now().Unix(),
		"goroutines": runtime.NumGoroutine(),
		"go_version": runtime.Version(),
		"memory_stats": map[string]interface{}{
			"alloc": "N/A", // Would need runtime.ReadMemStats()
			"total_alloc": "N/A",
			"sys": "N/A",
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(health)
}

// minioStoreHandler stores a document in MinIO
func (s *SIMDJSONAccelerator) minioStoreHandler(w http.ResponseWriter, r *http.Request) {
	if s.minioClient == nil {
		http.Error(w, "MinIO not available", http.StatusServiceUnavailable)
		return
	}

	var request struct {
		ObjectName string `json:"object_name"`
		Data       string `json:"data"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
		return
	}

	ctx := context.Background()
	reader := bytes.NewReader([]byte(request.Data))

	err := s.minioClient.StoreDocument(ctx, request.ObjectName, reader, int64(len(request.Data)))
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to store: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "success",
		"object_name": request.ObjectName,
		"size":        len(request.Data),
	})
}

// minioGetHandler retrieves a document from MinIO
func (s *SIMDJSONAccelerator) minioGetHandler(w http.ResponseWriter, r *http.Request) {
	if s.minioClient == nil {
		http.Error(w, "MinIO not available", http.StatusServiceUnavailable)
		return
	}

	vars := mux.Vars(r)
	objectName := vars["id"]

	ctx := context.Background()
	data, err := s.minioClient.GetDocument(ctx, objectName)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get: %v", err), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// minioListHandler lists documents in MinIO
func (s *SIMDJSONAccelerator) minioListHandler(w http.ResponseWriter, r *http.Request) {
	if s.minioClient == nil {
		http.Error(w, "MinIO not available", http.StatusServiceUnavailable)
		return
	}

	prefix := r.URL.Query().Get("prefix")
	ctx := context.Background()

	documents, err := s.minioClient.ListDocuments(ctx, prefix)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to list: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"documents": documents,
		"count":     len(documents),
	})
}

// Start starts the SIMD JSON accelerator service
func (s *SIMDJSONAccelerator) Start() error {
	r := mux.NewRouter()

	// JSON parsing routes
	r.HandleFunc("/parse", s.parseHandler).Methods("POST")
	r.HandleFunc("/health", s.healthHandler).Methods("GET")

	// MinIO routes (if available)
	if s.minioClient != nil {
		r.HandleFunc("/minio/store", s.minioStoreHandler).Methods("POST")
		r.HandleFunc("/minio/get/{id}", s.minioGetHandler).Methods("GET")
		r.HandleFunc("/minio/list", s.minioListHandler).Methods("GET")
		log.Printf("📦 MinIO integration enabled")
	}

	addr := fmt.Sprintf(":%d", s.port)
	log.Printf("🚀 SIMD JSON Accelerator starting on port %d", s.port)
	log.Printf("📊 AVX2-optimized parsing enabled (simdjson-go + sonic)")
	log.Printf("🔗 Health check: http://localhost:%d/health", s.port)
	log.Printf("🔗 Parse endpoint: http://localhost:%d/parse", s.port)
	if s.minioClient != nil {
		log.Printf("🔗 MinIO store: http://localhost:%d/minio/store", s.port)
		log.Printf("🔗 MinIO get: http://localhost:%d/minio/get/:id", s.port)
		log.Printf("🔗 MinIO list: http://localhost:%d/minio/list", s.port)
	}

	server := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	return server.ListenAndServe()
}

// findAvailablePort attempts to bind to a port, trying fallbacks if needed
func findAvailablePort(basePort int, maxRetries int) (int, error) {
	for i := 0; i <= maxRetries; i++ {
		port := basePort + i
		addr := fmt.Sprintf(":%d", port)

		// Quick check using net.Listen
		listener, err := net.Listen("tcp", addr)
		if err == nil {
			listener.Close()
			if i > 0 {
				log.Printf("⚠️  Port %d busy, using port %d instead", basePort, port)
			}
			return port, nil
		}

		log.Printf("Port %d unavailable, trying next...", port)
	}

	return 0, fmt.Errorf("could not find available port in range %d-%d", basePort, basePort+maxRetries)
}

func main() {
	// Default port with environment variable override
	defaultPort := 8104 // Avoid conflict with phase66-langextract on 8095
	portEnv := os.Getenv("SIMD_JSON_ACCEL_PORT")
	if portEnv != "" {
		if p, err := strconv.Atoi(portEnv); err == nil {
			defaultPort = p
		} else {
			log.Printf("⚠️  Invalid SIMD_JSON_ACCEL_PORT '%s', using default %d", portEnv, defaultPort)
		}
	}

	// Find available port with fallback (tries up to 10 ports)
	port, err := findAvailablePort(defaultPort, 10)
	if err != nil {
		log.Fatalf("Failed to find available port: %v", err)
	}

	log.Printf("🎯 Starting SIMD JSON Accelerator Service")
	log.Printf("🔧 AVX2-optimized parsing (simdjson-go + sonic)")
	log.Printf("📡 Port: %d", port)
	log.Printf("💻 CPU: 11th gen Intel (AVX2 support)")
	log.Printf("🔗 URL: http://127.0.0.1:%d", port)
	log.Printf("💡 Set SIMD_JSON_ACCEL_URL=http://127.0.0.1:%d for clients", port)

	accelerator, err := NewSIMDJSONAccelerator(port)
	if err != nil {
		log.Fatalf("Failed to create accelerator: %v", err)
	}

	if err := accelerator.Start(); err != nil {
		log.Fatalf("Failed to start SIMD JSON accelerator: %v", err)
	}
}