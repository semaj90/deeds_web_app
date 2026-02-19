// +build !cuda

package main

import (
	"context"
	"fmt"
	"log"
	"math"
	"runtime"
	"sync"
	"time"
)

// CPU fallback implementation of CUDA worker
type CudaWorker struct {
	Available    bool
	DeviceCount  int
	DeviceInfo   []CudaDeviceInfo
	initialized  bool
	mutex        sync.RWMutex
	cpuWorkers   int
}

type CudaDeviceInfo struct {
	DeviceID    int    `json:"device_id"`
	Name        string `json:"name"`
	MemoryMB    int    `json:"memory_mb"`
	IsAvailable bool   `json:"is_available"`
}

type VectorSimilarityRequest struct {
	QueryVector     []float32 `json:"query_vector"`
	DocumentVectors [][]float32 `json:"document_vectors"`
	Threshold       float32   `json:"threshold"`
}

type VectorSimilarityResponse struct {
	Similarities []float32 `json:"similarities"`
	Indices      []int     `json:"indices"`
	ProcessTime  int64     `json:"process_time_ms"`
	Method       string    `json:"method"`
}

type BatchEmbeddingRequest struct {
	Inputs      [][]float32 `json:"inputs"`
	OutputDims  int         `json:"output_dims"`
	BatchSize   int         `json:"batch_size"`
}

type BatchEmbeddingResponse struct {
	Embeddings  [][]float32 `json:"embeddings"`
	ProcessTime int64       `json:"process_time_ms"`
	Method      string      `json:"method"`
}

type BenchmarkResult struct {
	Operation   string  `json:"operation"`
	CPUTime     int64   `json:"cpu_time_ms"`
	GPUTime     int64   `json:"gpu_time_ms"`
	Speedup     float64 `json:"speedup"`
	Method      string  `json:"method"`
}

// NewCudaWorker creates a new CUDA worker with CPU fallback
func NewCudaWorker() *CudaWorker {
	cw := &CudaWorker{
		Available:   false, // CUDA not available in CPU build
		DeviceCount: 0,
		DeviceInfo:  []CudaDeviceInfo{},
		cpuWorkers:  runtime.NumCPU(),
	}

	log.Printf("CUDA Worker initialized with CPU fallback (CPUs: %d)", cw.cpuWorkers)
	return cw
}

// Initialize sets up the worker (no-op for CPU version)
func (cw *CudaWorker) Initialize(ctx context.Context) error {
	cw.mutex.Lock()
	defer cw.mutex.Unlock()

	cw.initialized = true
	log.Println("CUDA Worker initialized with CPU-only processing")
	return nil
}

// ComputeVectorSimilarity performs vector similarity using CPU
func (cw *CudaWorker) ComputeVectorSimilarity(ctx context.Context, req VectorSimilarityRequest) ([]float32, error) {
	start := time.Now()
	
	if len(req.QueryVector) == 0 || len(req.DocumentVectors) == 0 {
		return nil, fmt.Errorf("empty vectors provided")
	}

	similarities := make([]float32, len(req.DocumentVectors))
	
	// CPU-based parallel computation
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, cw.cpuWorkers)
	
	for i, docVec := range req.DocumentVectors {
		wg.Add(1)
		go func(index int, doc []float32) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()
			
			similarities[index] = cosineSimilarityCPU(req.QueryVector, doc)
		}(i, docVec)
	}
	
	wg.Wait()
	
	elapsed := time.Since(start).Milliseconds()
	log.Printf("CPU vector similarity completed in %dms for %d documents", elapsed, len(req.DocumentVectors))
	
	return similarities, nil
}

// ProcessBatchEmbeddings processes embeddings using CPU
func (cw *CudaWorker) ProcessBatchEmbeddings(ctx context.Context, req BatchEmbeddingRequest) (*BatchEmbeddingResponse, error) {
	start := time.Now()
	
	if len(req.Inputs) == 0 {
		return nil, fmt.Errorf("empty inputs provided")
	}

	embeddings := make([][]float32, len(req.Inputs))
	
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, cw.cpuWorkers)
	
	for i, input := range req.Inputs {
		wg.Add(1)
		go func(index int, inp []float32) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()
			
			// Simple transformation (normalize for demonstration)
			embedding := make([]float32, req.OutputDims)
			for j := 0; j < req.OutputDims && j < len(inp); j++ {
				embedding[j] = inp[j]
			}
			
			// Normalize
			norm := float32(0)
			for _, val := range embedding {
				norm += val * val
			}
			norm = float32(math.Sqrt(float64(norm)))
			
			if norm > 0 {
				for j := range embedding {
					embedding[j] /= norm
				}
			}
			
			embeddings[index] = embedding
		}(i, input)
	}
	
	wg.Wait()
	
	elapsed := time.Since(start).Milliseconds()
	
	return &BatchEmbeddingResponse{
		Embeddings:  embeddings,
		ProcessTime: elapsed,
		Method:      "CPU",
	}, nil
}

// RunBenchmark runs performance benchmarks (CPU only)
func (cw *CudaWorker) RunBenchmark(ctx context.Context) ([]BenchmarkResult, error) {
	log.Println("Running CPU benchmarks...")
	
	results := []BenchmarkResult{}
	
	// Vector similarity benchmark
	queryVec := make([]float32, 768)
	docVecs := make([][]float32, 1000)
	
	for i := range queryVec {
		queryVec[i] = float32(i) / 768.0
	}
	
	for i := range docVecs {
		docVecs[i] = make([]float32, 768)
		for j := range docVecs[i] {
			docVecs[i][j] = float32((i+j)%100) / 100.0
		}
	}
	
	start := time.Now()
	_, err := cw.ComputeVectorSimilarity(ctx, VectorSimilarityRequest{
		QueryVector:     queryVec,
		DocumentVectors: docVecs,
		Threshold:       0.7,
	})
	cpuTime := time.Since(start).Milliseconds()
	
	if err != nil {
		return nil, fmt.Errorf("benchmark failed: %v", err)
	}
	
	results = append(results, BenchmarkResult{
		Operation: "vector_similarity",
		CPUTime:   cpuTime,
		GPUTime:   0, // N/A for CPU build
		Speedup:   1.0,
		Method:    "CPU",
	})
	
	log.Printf("CPU benchmark completed: vector similarity %dms", cpuTime)
	
	return results, nil
}

// GetDeviceInfo returns CPU info (no GPU devices)
func (cw *CudaWorker) GetDeviceInfo() []CudaDeviceInfo {
	return []CudaDeviceInfo{
		{
			DeviceID:    0,
			Name:        fmt.Sprintf("CPU (%d cores)", cw.cpuWorkers),
			MemoryMB:    8192, // Approximate system memory
			IsAvailable: true,
		},
	}
}

// IsAvailable returns false for CPU-only build
func (cw *CudaWorker) IsAvailable() bool {
	return false // No CUDA in CPU build
}

// Cleanup is a no-op for CPU version
func (cw *CudaWorker) Cleanup() error {
	log.Println("CUDA Worker cleanup (CPU version)")
	return nil
}

// Helper function for CPU-based cosine similarity
func cosineSimilarityCPU(a, b []float32) float32 {
	if len(a) != len(b) {
		return 0.0
	}
	
	var dotProduct, normA, normB float32
	
	for i := 0; i < len(a); i++ {
		dotProduct += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	
	normA = float32(math.Sqrt(float64(normA)))
	normB = float32(math.Sqrt(float64(normB)))
	
	if normA == 0 || normB == 0 {
		return 0.0
	}
	
	return dotProduct / (normA * normB)
}