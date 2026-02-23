package main

import (
	"bytes"
	"encoding/json"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

// Test configuration
func getTestConfig() *Config {
	return &Config{
		Server: struct {
			Name    string `yaml:"name"`
			Version string `yaml:"version"`
			HTTP    struct {
				Addr    string `yaml:"addr"`
				Timeout string `yaml:"timeout"`
			} `yaml:"http"`
			GRPC struct {
				Addr    string `yaml:"addr"`
				Timeout string `yaml:"timeout"`
			} `yaml:"grpc"`
		}{
			Name:    "test-service",
			Version: "v1.0.0-test",
			HTTP: struct {
				Addr    string `yaml:"addr"`
				Timeout string `yaml:"timeout"`
			}{
				Addr:    ":8086",
				Timeout: "30s",
			},
		},
		GPU: struct {
			MaxMemoryGB      int `yaml:"max_memory_gb"`
			MaxConcurrentJobs int `yaml:"max_concurrent_jobs"`
			DeviceID         int `yaml:"device_id"`
		}{
			MaxMemoryGB:      1,
			MaxConcurrentJobs: 2,
			DeviceID:         0,
		},
		Algorithms: struct {
			Enabled  []string               `yaml:"enabled"`
			Defaults map[string]interface{} `yaml:"defaults"`
		}{
			Enabled: []string{"kmeans", "dbscan"},
		},
		Auth: struct {
			Enabled   bool     `yaml:"enabled"`
			JWTSecret string   `yaml:"jwt_secret"`
			APIKeys   []string `yaml:"api_keys"`
		}{
			Enabled: false,
		},
		RateLimiting: struct {
			Enabled           bool `yaml:"enabled"`
			RequestsPerMinute int  `yaml:"requests_per_minute"`
			Burst             int  `yaml:"burst"`
		}{
			Enabled: false,
		},
	}
}

var globalTestService *ProductionClusterService

func setupTestService() *ProductionClusterService {
	if globalTestService != nil {
		return globalTestService
	}
	
	config := getTestConfig()
	service, err := NewProductionClusterService(config)
	if err != nil {
		panic(err)
	}
	service.registerAlgorithms()
	globalTestService = service
	return service
}

// Test GPU Memory Pool
func TestGPUMemoryPool_AllocateAndFree(t *testing.T) {
	pool, err := NewGPUMemoryPool(0, 1024*1024*1024) // 1GB
	if err != nil {
		t.Fatalf("Failed to create memory pool: %v", err)
	}

	// Test allocation
	allocation, err := pool.Allocate("test", 1024*1024, 1) // 1MB
	if err != nil {
		t.Fatalf("Failed to allocate memory: %v", err)
	}

	if allocation.Size != 1024*1024 {
		t.Errorf("Expected allocation size 1048576, got %d", allocation.Size)
	}

	if pool.usedMemory != 1024*1024 {
		t.Errorf("Expected used memory 1048576, got %d", pool.usedMemory)
	}

	// Test freeing
	err = pool.Free(allocation.ID)
	if err != nil {
		t.Fatalf("Failed to free memory: %v", err)
	}

	if pool.usedMemory != 0 {
		t.Errorf("Expected used memory 0, got %d", pool.usedMemory)
	}
}

func TestGPUMemoryPool_InsufficientMemory(t *testing.T) {
	pool, err := NewGPUMemoryPool(0, 1024) // 1KB
	if err != nil {
		t.Fatalf("Failed to create memory pool: %v", err)
	}

	// Try to allocate more than available
	_, err = pool.Allocate("test", 2048, 1) // 2KB
	if err == nil {
		t.Error("Expected insufficient memory error")
	}
}

// Test Rate Limiter
func TestRateLimiter_Allow(t *testing.T) {
	limiter := NewRateLimiter(2, time.Minute)

	// First two requests should be allowed
	if !limiter.Allow() {
		t.Error("First request should be allowed")
	}
	if !limiter.Allow() {
		t.Error("Second request should be allowed")
	}

	// Third request should be denied
	if limiter.Allow() {
		t.Error("Third request should be denied")
	}
}

// Test Cache
func TestCache_SetAndGet(t *testing.T) {
	cache := NewCache(10, time.Minute)

	// Test setting and getting
	cache.Set("key1", "value1")
	
	value, exists := cache.Get("key1")
	if !exists {
		t.Error("Expected key to exist in cache")
	}
	
	if value != "value1" {
		t.Errorf("Expected 'value1', got %v", value)
	}

	// Test non-existent key
	_, exists = cache.Get("nonexistent")
	if exists {
		t.Error("Expected key to not exist in cache")
	}
}

func TestCache_Expiration(t *testing.T) {
	cache := NewCache(10, time.Millisecond*100)

	cache.Set("key1", "value1")
	
	// Should exist immediately
	_, exists := cache.Get("key1")
	if !exists {
		t.Error("Expected key to exist immediately")
	}

	// Wait for expiration
	time.Sleep(time.Millisecond * 150)
	
	_, exists = cache.Get("key1")
	if exists {
		t.Error("Expected key to be expired")
	}
}

// Test Algorithm Validation
func TestKMeansGPU_ValidateParams(t *testing.T) {
	kmeans := &KMeansGPU{}

	// Valid params
	validParams := ClusterParams{
		NumClusters: 3,
	}
	if err := kmeans.ValidateParams(validParams); err != nil {
		t.Errorf("Valid params should not return error: %v", err)
	}

	// Invalid params
	invalidParams := ClusterParams{
		NumClusters: 0,
	}
	if err := kmeans.ValidateParams(invalidParams); err == nil {
		t.Error("Invalid params should return error")
	}
}

func TestKMeansGPU_Cluster(t *testing.T) {
	kmeans := &KMeansGPU{}
	kmeans.Initialize(nil)

	// Test data
	data := [][]float64{
		{1.0, 2.0},
		{2.0, 3.0},
		{3.0, 4.0},
		{10.0, 11.0},
		{11.0, 12.0},
		{12.0, 13.0},
	}

	params := ClusterParams{
		Algorithm:   "kmeans",
		NumClusters: 2,
	}

	result, err := kmeans.Cluster(data, params)
	if err != nil {
		t.Fatalf("Clustering failed: %v", err)
	}

	if result.Algorithm != "kmeans" {
		t.Errorf("Expected algorithm 'kmeans', got %s", result.Algorithm)
	}

	if len(result.Clusters) != 2 {
		t.Errorf("Expected 2 clusters, got %d", len(result.Clusters))
	}

	if result.Iterations <= 0 {
		t.Error("Expected positive iteration count")
	}
}

// Test HTTP Handlers
func TestListAlgorithms(t *testing.T) {
	service := setupTestService()

	req, err := http.NewRequest("GET", "/api/algorithms", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(service.listAlgorithms)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("Expected status 200, got %v", status)
	}

	var algorithms map[string]interface{}
	err = json.Unmarshal(rr.Body.Bytes(), &algorithms)
	if err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if len(algorithms) == 0 {
		t.Error("Expected algorithms to be returned")
	}
}

func TestClusterHandler(t *testing.T) {
	service := setupTestService()

	requestBody := map[string]interface{}{
		"data": [][]float64{
			{1.0, 2.0},
			{2.0, 3.0},
			{3.0, 4.0},
		},
		"params": map[string]interface{}{
			"algorithm":     "kmeans",
			"num_clusters":  2,
			"max_iterations": 100,
		},
	}

	jsonBody, _ := json.Marshal(requestBody)
	req, err := http.NewRequest("POST", "/api/cluster/kmeans", bytes.NewBuffer(jsonBody))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	
	// We need to use mux to test path variables
	router := http.NewServeMux()
	router.HandleFunc("/api/cluster/kmeans", service.clusterHandler)
	
	router.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("Expected status 200, got %v", status)
	}
}

func TestHealthCheck(t *testing.T) {
	service := setupTestService()

	req, err := http.NewRequest("GET", "/api/health", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(service.healthCheck)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("Expected status 200, got %v", status)
	}

	var health map[string]interface{}
	err = json.Unmarshal(rr.Body.Bytes(), &health)
	if err != nil {
		t.Fatalf("Failed to parse health response: %v", err)
	}

	if health["status"] != "healthy" {
		t.Errorf("Expected status 'healthy', got %v", health["status"])
	}
}

func TestGPUStatus(t *testing.T) {
	service := setupTestService()

	req, err := http.NewRequest("GET", "/api/gpu/status", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(service.getGPUStatus)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("Expected status 200, got %v", status)
	}

	var status map[string]interface{}
	err = json.Unmarshal(rr.Body.Bytes(), &status)
	if err != nil {
		t.Fatalf("Failed to parse GPU status response: %v", err)
	}

	if _, exists := status["device_id"]; !exists {
		t.Error("Expected device_id in GPU status")
	}

	if _, exists := status["total_memory"]; !exists {
		t.Error("Expected total_memory in GPU status")
	}
}

// Test Middleware
func TestRecoveryMiddleware(t *testing.T) {
	service := setupTestService()

	// Handler that panics
	panicHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("test panic")
	})

	req, err := http.NewRequest("GET", "/test", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	
	// Wrap with recovery middleware
	handler := service.recoveryMiddleware(panicHandler)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusInternalServerError {
		t.Errorf("Expected status 500, got %v", status)
	}
}

// Benchmark tests
func BenchmarkKMeansClustering(b *testing.B) {
	kmeans := &KMeansGPU{}
	kmeans.Initialize(nil)

	data := make([][]float64, 1000)
	for i := range data {
		data[i] = []float64{float64(i), float64(i * 2)}
	}

	params := ClusterParams{
		Algorithm:   "kmeans",
		NumClusters: 10,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := kmeans.Cluster(data, params)
		if err != nil {
			b.Fatalf("Clustering failed: %v", err)
		}
	}
}

func BenchmarkMemoryAllocation(b *testing.B) {
	pool, err := NewGPUMemoryPool(0, 1024*1024*1024) // 1GB
	if err != nil {
		b.Fatalf("Failed to create memory pool: %v", err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		allocation, err := pool.Allocate("test", 1024*1024, 1) // 1MB
		if err != nil {
			b.Fatalf("Failed to allocate memory: %v", err)
		}
		pool.Free(allocation.ID)
	}
}

// Integration tests
func TestIntegrationFullWorkflow(t *testing.T) {
	service := setupTestService()
	go service.startWorkerPool(2)

	// Test full clustering workflow
	data := [][]float64{
		{1.0, 2.0}, {2.0, 3.0}, {3.0, 4.0},
		{10.0, 11.0}, {11.0, 12.0}, {12.0, 13.0},
	}

	params := ClusterParams{
		Algorithm:   "kmeans",
		NumClusters: 2,
	}

	job := ClusterJob{
		ID:         "test-job",
		Algorithm:  "kmeans",
		Data:       data,
		Params:     params,
		CreatedAt:  time.Now(),
		Status:     "queued",
		ResponseCh: make(chan *ClusterResult, 1),
	}

	// Send job to queue
	service.jobQueue <- job

	// Wait for result
	select {
	case result := <-job.ResponseCh:
		if result == nil {
			t.Error("Expected result, got nil")
		}
		if result.Algorithm != "kmeans" {
			t.Errorf("Expected algorithm 'kmeans', got %s", result.Algorithm)
		}
	case <-time.After(5 * time.Second):
		t.Error("Job timed out")
	}
}

func TestConfigurationLoading(t *testing.T) {
	// Create temporary config file
	configContent := `
server:
  name: "test-service"
  version: "v1.0.0"
  http:
    addr: ":8085"
gpu:
  max_memory_gb: 8
  max_concurrent_jobs: 4
algorithms:
  enabled: ["kmeans", "dbscan"]
auth:
  enabled: false
`

	// Write to temp file
	tmpFile := "test-config.yaml"
	err := os.WriteFile(tmpFile, []byte(configContent), 0644)
	if err != nil {
		t.Fatalf("Failed to write test config: %v", err)
	}
	defer os.Remove(tmpFile)

	// Load config
	config, err := LoadConfig(tmpFile)
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}

	if config.Server.Name != "test-service" {
		t.Errorf("Expected server name 'test-service', got %s", config.Server.Name)
	}

	if config.GPU.MaxMemoryGB != 8 {
		t.Errorf("Expected max memory 8GB, got %d", config.GPU.MaxMemoryGB)
	}
}

// Test helpers
func generateTestData(points, dimensions int) [][]float64 {
	data := make([][]float64, points)
	for i := range data {
		data[i] = make([]float64, dimensions)
		for j := range data[i] {
			data[i][j] = rand.Float64() * 100
		}
	}
	return data
}