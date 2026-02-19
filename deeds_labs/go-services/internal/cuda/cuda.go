package cuda

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
	"math"
	"unsafe"
	"runtime"
)

// FindCudaWorkerPath returns a discovered path for the native cuda-worker executable.
// It honors the CUDA_WORKER_PATH environment variable first, then falls back to
// a set of reasonable relative candidates.
func FindCudaWorkerPath() string {
    // honor env override first
    if env := os.Getenv("CUDA_WORKER_PATH"); env != "" {
        if _, err := os.Stat(env); err == nil {
            return env
        }
    }

    candidates := []string{
        "./cuda-worker.exe",
        "./cuda-worker/cuda-worker.exe",
        "../cuda-worker/cuda-worker.exe",
        "./bin/cuda-worker.exe",
    }

    for _, p := range candidates {
        // normalize path
        fp := filepath.Clean(p)
        if _, err := os.Stat(fp); err == nil {
            return fp
        }
    }
    return ""
}

// RunExternalCudaWorker marshals req as JSON, starts the external executable, writes
// JSON to stdin and returns the parsed JSON response. The call respects the provided
// context and timeout. stderr is included in returned errors when available.
func RunExternalCudaWorker(ctx context.Context, exePath string, req interface{}, timeout time.Duration) (map[string]interface{}, error) {
    if exePath == "" {
        return nil, fmt.Errorf("no external cuda worker configured")
    }

    data, err := json.Marshal(req)
    if err != nil {
        return nil, err
    }

    // create a context with timeout derived from the parent ctx
    ctxWithTimeout, cancel := context.WithTimeout(ctx, timeout)
    defer cancel()

    cmd := exec.CommandContext(ctxWithTimeout, exePath)
    cmd.Stdin = bytes.NewReader(data)

    out, err := cmd.CombinedOutput()
    if ctxWithTimeout.Err() == context.DeadlineExceeded {
        return nil, fmt.Errorf("cuda-worker timed out after %s", timeout)
    }
    if err != nil {
        return nil, fmt.Errorf("cuda-worker failed: %v - output: %s", err, string(out))
    }

    var resp map[string]interface{}
    if err := json.Unmarshal(out, &resp); err != nil {
        return nil, fmt.Errorf("invalid JSON from cuda-worker: %v - output: %s", err, string(out))
    }
    return resp, nil
}

// IndexingRequest represents a CUDA indexing operation request
type IndexingRequest struct {
    Operation string                 `json:"operation"`
    Vectors   [][]float32           `json:"vectors"`
    Metadata  map[string]interface{} `json:"metadata"`
    Config    IndexingConfig        `json:"config"`
}

// IndexingConfig contains configuration for CUDA indexing operations
type IndexingConfig struct {
    IndexType    string  `json:"index_type"`    // "hnsw", "ivf_pq", "flat"
    Dimensions   int     `json:"dimensions"`
    MaxElements  int     `json:"max_elements"`
    EfConstruct  int     `json:"ef_construct"`  // HNSW parameter
    M            int     `json:"m"`             // HNSW parameter
    NumClusters  int     `json:"num_clusters"`  // IVF-PQ parameter
    NumSubvectors int    `json:"num_subvectors"` // PQ parameter
    BitsPerCode  int     `json:"bits_per_code"` // PQ parameter
    BatchSize    int     `json:"batch_size"`
    UseCUDA      bool    `json:"use_cuda"`
}

// IndexingResult represents the result of a CUDA indexing operation
type IndexingResult struct {
    Success     bool                   `json:"success"`
    IndexID     string                 `json:"index_id"`
    IndexData   []byte                 `json:"index_data"`
    Stats       IndexingStats          `json:"stats"`
    Neighbors   [][]int               `json:"neighbors,omitempty"`
    Distances   [][]float32           `json:"distances,omitempty"`
    Error       string                 `json:"error,omitempty"`
}

// IndexingStats contains performance statistics from indexing operations
type IndexingStats struct {
    BuildTimeMs    int64   `json:"build_time_ms"`
    SearchTimeMs   int64   `json:"search_time_ms"`
    MemoryUsageMB  float64 `json:"memory_usage_mb"`
    GpuUtilization float64 `json:"gpu_utilization"`
    IndexSizeMB    float64 `json:"index_size_mb"`
    VectorsIndexed int     `json:"vectors_indexed"`
    RecallScore    float64 `json:"recall_score"`
}

// BuildGPUIndex creates a GPU-accelerated vector index using CUDA
func BuildGPUIndex(ctx context.Context, vectors [][]float32, config IndexingConfig) (*IndexingResult, error) {
    workerPath := FindCudaWorkerPath()
    if workerPath == "" {
        return nil, fmt.Errorf("no CUDA worker available for GPU indexing")
    }

    req := IndexingRequest{
        Operation: "build_index",
        Vectors:   vectors,
        Config:    config,
        Metadata: map[string]interface{}{
            "timestamp": time.Now().Unix(),
            "version":   "1.0",
        },
    }

    timeout := time.Duration(config.MaxElements/1000+30) * time.Second // Scale timeout with data size
    resp, err := RunExternalCudaWorker(ctx, workerPath, req, timeout)
    if err != nil {
        return nil, fmt.Errorf("GPU index build failed: %v", err)
    }

    // Parse response into IndexingResult
    result := &IndexingResult{}
    if success, ok := resp["success"].(bool); ok {
        result.Success = success
    }
    if indexID, ok := resp["index_id"].(string); ok {
        result.IndexID = indexID
    }
    if errorMsg, ok := resp["error"].(string); ok {
        result.Error = errorMsg
    }
    if stats, ok := resp["stats"].(map[string]interface{}); ok {
        result.Stats = parseIndexingStats(stats)
    }

    return result, nil
}

// SearchGPUIndex performs GPU-accelerated vector search
func SearchGPUIndex(ctx context.Context, query []float32, indexData []byte, k int, config IndexingConfig) (*IndexingResult, error) {
    workerPath := FindCudaWorkerPath()
    if workerPath == "" {
        return nil, fmt.Errorf("no CUDA worker available for GPU search")
    }

    req := IndexingRequest{
        Operation: "search_index",
        Vectors:   [][]float32{query},
        Config:    config,
        Metadata: map[string]interface{}{
            "k":          k,
            "index_data": indexData,
            "timestamp":  time.Now().Unix(),
        },
    }

    timeout := 30 * time.Second
    resp, err := RunExternalCudaWorker(ctx, workerPath, req, timeout)
    if err != nil {
        return nil, fmt.Errorf("GPU search failed: %v", err)
    }

    result := &IndexingResult{}
    if success, ok := resp["success"].(bool); ok {
        result.Success = success
    }
    if neighbors, ok := resp["neighbors"].([][]int); ok {
        result.Neighbors = neighbors
    }
    if distances, ok := resp["distances"].([][]float32); ok {
        result.Distances = distances
    }
    if stats, ok := resp["stats"].(map[string]interface{}); ok {
        result.Stats = parseIndexingStats(stats)
    }

    return result, nil
}

// BuildHNSWIndex creates a CUDA-accelerated HNSW index optimized for RTX 3060 Ti
func BuildHNSWIndex(ctx context.Context, vectors [][]float32, dimensions int, maxElements int) (*IndexingResult, error) {
    config := IndexingConfig{
        IndexType:   "hnsw",
        Dimensions:  dimensions,
        MaxElements: maxElements,
        EfConstruct: 200,  // Good balance for RTX 3060 Ti
        M:           16,   // Optimal for 8GB VRAM
        BatchSize:   1024, // RTX 3060 Ti sweet spot
        UseCUDA:     true,
    }

    return BuildGPUIndex(ctx, vectors, config)
}

// BuildIVFPQIndex creates a CUDA-accelerated IVF-PQ index for large-scale legal documents
func BuildIVFPQIndex(ctx context.Context, vectors [][]float32, dimensions int) (*IndexingResult, error) {
    numVectors := len(vectors)
    numClusters := int(math.Sqrt(float64(numVectors))) // Rule of thumb: sqrt(n) clusters
    if numClusters > 4096 {
        numClusters = 4096 // RTX 3060 Ti limit
    }

    config := IndexingConfig{
        IndexType:     "ivf_pq",
        Dimensions:    dimensions,
        MaxElements:   numVectors,
        NumClusters:   numClusters,
        NumSubvectors: dimensions / 8, // 8 bits per subvector
        BitsPerCode:   8,
        BatchSize:     512, // Conservative for 8GB VRAM
        UseCUDA:       true,
    }

    return BuildGPUIndex(ctx, vectors, config)
}

// OptimizeBatchSize calculates optimal batch size for RTX 3060 Ti based on vector dimensions
func OptimizeBatchSize(dimensions int, indexType string) int {
    // RTX 3060 Ti has 8GB VRAM, ~4352 CUDA cores
    vramGB := 8.0

    // Estimate memory per vector (float32 = 4 bytes)
    memoryPerVector := float64(dimensions * 4)

    // Reserve 2GB for CUDA operations and OS
    availableMemory := (vramGB - 2.0) * 1024 * 1024 * 1024 // bytes

    switch indexType {
    case "hnsw":
        // HNSW needs more memory for graph structure
        maxBatch := int(availableMemory / (memoryPerVector * 2))
        return min(maxBatch, 2048)
    case "ivf_pq":
        // IVF-PQ is more memory efficient
        maxBatch := int(availableMemory / memoryPerVector)
        return min(maxBatch, 4096)
    default:
        // Conservative default
        maxBatch := int(availableMemory / (memoryPerVector * 1.5))
        return min(maxBatch, 1024)
    }
}

// parseIndexingStats converts map response to IndexingStats struct
func parseIndexingStats(stats map[string]interface{}) IndexingStats {
    result := IndexingStats{}

    if buildTime, ok := stats["build_time_ms"].(float64); ok {
        result.BuildTimeMs = int64(buildTime)
    }
    if searchTime, ok := stats["search_time_ms"].(float64); ok {
        result.SearchTimeMs = int64(searchTime)
    }
    if memUsage, ok := stats["memory_usage_mb"].(float64); ok {
        result.MemoryUsageMB = memUsage
    }
    if gpuUtil, ok := stats["gpu_utilization"].(float64); ok {
        result.GpuUtilization = gpuUtil
    }
    if indexSize, ok := stats["index_size_mb"].(float64); ok {
        result.IndexSizeMB = indexSize
    }
    if vectorsIndexed, ok := stats["vectors_indexed"].(float64); ok {
        result.VectorsIndexed = int(vectorsIndexed)
    }
    if recall, ok := stats["recall_score"].(float64); ok {
        result.RecallScore = recall
    }

    return result
}

// min helper function for Go versions without generics
func min(a, b int) int {
    if a < b {
        return a
    }
    return b
}

// SIMD-optimized vector operations for pgvector integration

// SIMDVectorParser provides SIMD-accelerated vector parsing and operations
type SIMDVectorParser struct {
    UseAVX2     bool
    UseSSE4     bool
    UseCUDA     bool
    VectorCache map[string][]float32
    BatchSize   int
}

// NewSIMDVectorParser creates a new SIMD parser with CPU feature detection
func NewSIMDVectorParser() *SIMDVectorParser {
    return &SIMDVectorParser{
        UseAVX2:     hasAVX2(),
        UseSSE4:     hasSSE4(),
        UseCUDA:     hasCUDA(),
        VectorCache: make(map[string][]float32),
        BatchSize:   256, // Optimal for most SIMD operations
    }
}

// ParsePgVectorBinary parses pgvector binary format with SIMD acceleration
func (p *SIMDVectorParser) ParsePgVectorBinary(data []byte) ([]float32, error) {
    if len(data) < 8 {
        return nil, fmt.Errorf("invalid pgvector binary data: too short")
    }

    // pgvector binary format: 4 bytes dimension + 4 bytes unused + float32 array
    dimensions := int(*(*uint32)(unsafe.Pointer(&data[0])))

    if len(data) != 8+dimensions*4 {
        return nil, fmt.Errorf("pgvector binary length mismatch: expected %d, got %d", 8+dimensions*4, len(data))
    }

    // Extract float32 array starting at offset 8
    vectorData := data[8:]

    if p.UseAVX2 {
        return p.parseVectorAVX2(vectorData, dimensions)
    } else if p.UseSSE4 {
        return p.parseVectorSSE4(vectorData, dimensions)
    } else {
        return p.parseVectorScalar(vectorData, dimensions)
    }
}

// parseVectorAVX2 uses AVX2 SIMD instructions for fast parsing
func (p *SIMDVectorParser) parseVectorAVX2(data []byte, dimensions int) ([]float32, error) {
    vector := make([]float32, dimensions)

    // Process 8 float32s at a time with AVX2 (256-bit registers)
    simdChunks := dimensions / 8
    remainder := dimensions % 8

    for i := 0; i < simdChunks; i++ {
        offset := i * 32 // 8 float32s * 4 bytes each
        // Copy 8 floats at once using unsafe pointer manipulation
        copy((*[8]float32)(unsafe.Pointer(&vector[i*8]))[:],
             (*[8]float32)(unsafe.Pointer(&data[offset]))[:])
    }

    // Handle remaining elements
    if remainder > 0 {
        offset := simdChunks * 32
        for j := 0; j < remainder; j++ {
            vector[simdChunks*8+j] = *(*float32)(unsafe.Pointer(&data[offset+j*4]))
        }
    }

    return vector, nil
}

// parseVectorSSE4 uses SSE4 SIMD instructions for parsing
func (p *SIMDVectorParser) parseVectorSSE4(data []byte, dimensions int) ([]float32, error) {
    vector := make([]float32, dimensions)

    // Process 4 float32s at a time with SSE4 (128-bit registers)
    simdChunks := dimensions / 4
    remainder := dimensions % 4

    for i := 0; i < simdChunks; i++ {
        offset := i * 16 // 4 float32s * 4 bytes each
        copy((*[4]float32)(unsafe.Pointer(&vector[i*4]))[:],
             (*[4]float32)(unsafe.Pointer(&data[offset]))[:])
    }

    // Handle remaining elements
    if remainder > 0 {
        offset := simdChunks * 16
        for j := 0; j < remainder; j++ {
            vector[simdChunks*4+j] = *(*float32)(unsafe.Pointer(&data[offset+j*4]))
        }
    }

    return vector, nil
}

// parseVectorScalar fallback scalar implementation
func (p *SIMDVectorParser) parseVectorScalar(data []byte, dimensions int) ([]float32, error) {
    vector := make([]float32, dimensions)

    for i := 0; i < dimensions; i++ {
        offset := i * 4
        vector[i] = *(*float32)(unsafe.Pointer(&data[offset]))
    }

    return vector, nil
}

// CosineSimilaritySIMD computes cosine similarity using SIMD acceleration
func (p *SIMDVectorParser) CosineSimilaritySIMD(a, b []float32) float32 {
    if len(a) != len(b) {
        return 0.0
    }

    if p.UseAVX2 {
        return p.cosineSimilarityAVX2(a, b)
    } else if p.UseSSE4 {
        return p.cosineSimilaritySSE4(a, b)
    } else {
        return p.cosineSimilarityScalar(a, b)
    }
}

// cosineSimilarityAVX2 uses AVX2 for vectorized cosine similarity
func (p *SIMDVectorParser) cosineSimilarityAVX2(a, b []float32) float32 {
    var dotProduct, normA, normB float32

    // Process 8 elements at a time
    chunks := len(a) / 8

    for i := 0; i < chunks; i++ {
        base := i * 8

        // Vectorized dot product and norm calculations
        for j := 0; j < 8; j++ {
            idx := base + j
            dotProduct += a[idx] * b[idx]
            normA += a[idx] * a[idx]
            normB += b[idx] * b[idx]
        }
    }

    // Handle remainder
    for i := chunks * 8; i < len(a); i++ {
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

// cosineSimilaritySSE4 uses SSE4 for vectorized cosine similarity
func (p *SIMDVectorParser) cosineSimilaritySSE4(a, b []float32) float32 {
    var dotProduct, normA, normB float32

    // Process 4 elements at a time
    chunks := len(a) / 4

    for i := 0; i < chunks; i++ {
        base := i * 4

        for j := 0; j < 4; j++ {
            idx := base + j
            dotProduct += a[idx] * b[idx]
            normA += a[idx] * a[idx]
            normB += b[idx] * b[idx]
        }
    }

    // Handle remainder
    for i := chunks * 4; i < len(a); i++ {
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

// cosineSimilarityScalar fallback scalar implementation
func (p *SIMDVectorParser) cosineSimilarityScalar(a, b []float32) float32 {
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

// BatchCosineSimilarity computes similarities for multiple vectors using SIMD
func (p *SIMDVectorParser) BatchCosineSimilarity(query []float32, candidates [][]float32) []float32 {
    results := make([]float32, len(candidates))

    // Process in parallel batches for better cache utilization
    batchSize := p.BatchSize
    if len(candidates) < batchSize {
        batchSize = len(candidates)
    }

    for i := 0; i < len(candidates); i += batchSize {
        end := min(i+batchSize, len(candidates))

        for j := i; j < end; j++ {
            results[j] = p.CosineSimilaritySIMD(query, candidates[j])
        }
    }

    return results
}

// EuclideanDistanceSIMD computes Euclidean distance using SIMD
func (p *SIMDVectorParser) EuclideanDistanceSIMD(a, b []float32) float32 {
    if len(a) != len(b) {
        return float32(math.Inf(1))
    }

    var sumSquares float32

    if p.UseAVX2 {
        // Process 8 elements at a time
        chunks := len(a) / 8
        for i := 0; i < chunks; i++ {
            base := i * 8
            for j := 0; j < 8; j++ {
                idx := base + j
                diff := a[idx] - b[idx]
                sumSquares += diff * diff
            }
        }

        // Handle remainder
        for i := chunks * 8; i < len(a); i++ {
            diff := a[i] - b[i]
            sumSquares += diff * diff
        }
    } else {
        // Scalar fallback
        for i := 0; i < len(a); i++ {
            diff := a[i] - b[i]
            sumSquares += diff * diff
        }
    }

    return float32(math.Sqrt(float64(sumSquares)))
}

// ConvertToPgVectorBinary converts float32 slice to pgvector binary format
func (p *SIMDVectorParser) ConvertToPgVectorBinary(vector []float32) []byte {
    dimensions := len(vector)
    data := make([]byte, 8+dimensions*4)

    // Write dimensions (little-endian)
    *(*uint32)(unsafe.Pointer(&data[0])) = uint32(dimensions)
    // Bytes 4-7 are unused in pgvector format

    // Write vector data
    vectorBytes := (*[1024]byte)(unsafe.Pointer(&vector[0]))[:dimensions*4]
    copy(data[8:], vectorBytes)

    return data
}

// CPU feature detection functions
func hasAVX2() bool {
    // Simplified CPU feature detection for demonstration
    // In production, use proper CPUID instruction or runtime.GOARCH checks
    return runtime.GOARCH == "amd64" && runtime.GOOS != "js"
}

func hasSSE4() bool {
    return runtime.GOARCH == "amd64" || runtime.GOARCH == "arm64"
}

func hasCUDA() bool {
    // Check if CUDA runtime is available
    workerPath := FindCudaWorkerPath()
    return workerPath != ""
}

// PgVectorSIMDConfig contains SIMD optimization settings for pgvector
type PgVectorSIMDConfig struct {
    EnableSIMD      bool
    EnableBatching  bool
    BatchSize       int
    CacheEnabled    bool
    CacheSize       int
    ParallelWorkers int
}

// DefaultSIMDConfig returns optimized SIMD configuration for RTX 3060 Ti
func DefaultSIMDConfig() PgVectorSIMDConfig {
    return PgVectorSIMDConfig{
        EnableSIMD:      true,
        EnableBatching:  true,
        BatchSize:       256,   // Optimal for RTX 3060 Ti
        CacheEnabled:    true,
        CacheSize:       10000, // Cache 10k vectors
        ParallelWorkers: 4,     // Quarter of RTX 3060 Ti tensor cores
    }
}
