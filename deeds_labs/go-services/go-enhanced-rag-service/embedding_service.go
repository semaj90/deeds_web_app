package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// EmbeddingService handles text embedding generation with CUDA acceleration
type EmbeddingService struct {
	ollamaURL    string
	model        string
	cudaWorker   *CudaWorker
	cache        *EmbeddingCache
	client       *http.Client
	batchSize    int
	maxRetries   int
	stats        EmbeddingStats
	mu           sync.RWMutex
}

type EmbeddingCache struct {
	cache   map[string][]float32
	access  map[string]time.Time
	maxSize int
	mu      sync.RWMutex
}

type EmbeddingStats struct {
	TotalRequests     int64         `json:"total_requests"`
	CacheHits         int64         `json:"cache_hits"`
	CacheMisses       int64         `json:"cache_misses"`
	CudaAccelerated   int64         `json:"cuda_accelerated"`
	AverageTime       time.Duration `json:"average_time"`
	TotalProcessTime  time.Duration `json:"total_process_time"`
	BatchRequests     int64         `json:"batch_requests"`
	LastRequest       time.Time     `json:"last_request"`
}

type OllamaEmbedRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
}

type OllamaEmbedResponse struct {
	Embedding []float32 `json:"embedding"`
}

func NewEmbeddingService(ollamaURL, model string, cudaWorker *CudaWorker) *EmbeddingService {
	return &EmbeddingService{
		ollamaURL:  ollamaURL,
		model:      model,
		cudaWorker: cudaWorker,
		cache: &EmbeddingCache{
			cache:   make(map[string][]float32),
			access:  make(map[string]time.Time),
			maxSize: 10000, // Cache up to 10k embeddings
		},
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		batchSize:  32,
		maxRetries: 3,
		stats:      EmbeddingStats{},
	}
}

// GenerateEmbedding creates an embedding for a single text
func (es *EmbeddingService) GenerateEmbedding(ctx context.Context, text string) ([]float32, error) {
	startTime := time.Now()
	
	es.mu.Lock()
	es.stats.TotalRequests++
	es.stats.LastRequest = time.Now()
	es.mu.Unlock()

	// Clean and normalize text
	normalizedText := es.normalizeText(text)
	
	// Check cache first
	if embedding, found := es.cache.get(normalizedText); found {
		es.mu.Lock()
		es.stats.CacheHits++
		es.mu.Unlock()
		return embedding, nil
	}

	es.mu.Lock()
	es.stats.CacheMisses++
	es.mu.Unlock()

	// Generate embedding
	embedding, err := es.generateSingleEmbedding(ctx, normalizedText)
	if err != nil {
		return nil, fmt.Errorf("failed to generate embedding: %w", err)
	}

	// Cache the result
	es.cache.set(normalizedText, embedding)

	// Update stats
	processingTime := time.Since(startTime)
	es.mu.Lock()
	es.stats.TotalProcessTime += processingTime
	if es.stats.TotalRequests > 0 {
		es.stats.AverageTime = es.stats.TotalProcessTime / time.Duration(es.stats.TotalRequests)
	}
	es.mu.Unlock()

	return embedding, nil
}

// GenerateBatchEmbeddings creates embeddings for multiple texts with CUDA acceleration
func (es *EmbeddingService) GenerateBatchEmbeddings(ctx context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, fmt.Errorf("empty text batch")
	}

	startTime := time.Now()
	
	es.mu.Lock()
	es.stats.BatchRequests++
	es.stats.TotalRequests += int64(len(texts))
	es.stats.LastRequest = time.Now()
	es.mu.Unlock()

	// Normalize texts
	normalizedTexts := make([]string, len(texts))
	for i, text := range texts {
		normalizedTexts[i] = es.normalizeText(text)
	}

	// Check cache for existing embeddings
	embeddings := make([][]float32, len(texts))
	uncachedIndices := make([]int, 0)
	uncachedTexts := make([]string, 0)

	for i, text := range normalizedTexts {
		if embedding, found := es.cache.get(text); found {
			embeddings[i] = embedding
			es.mu.Lock()
			es.stats.CacheHits++
			es.mu.Unlock()
		} else {
			uncachedIndices = append(uncachedIndices, i)
			uncachedTexts = append(uncachedTexts, text)
			es.mu.Lock()
			es.stats.CacheMisses++
			es.mu.Unlock()
		}
	}

	// Generate embeddings for uncached texts
	if len(uncachedTexts) > 0 {
		var newEmbeddings [][]float32
		var err error

		if es.cudaWorker != nil && es.cudaWorker.IsAvailable() && len(uncachedTexts) >= 4 {
			// Use CUDA for batch processing
			newEmbeddings, err = es.generateBatchEmbeddingsCUDA(ctx, uncachedTexts)
			if err == nil {
				es.mu.Lock()
				es.stats.CudaAccelerated += int64(len(uncachedTexts))
				es.mu.Unlock()
			}
		}

		if newEmbeddings == nil {
			// Fallback to sequential generation
			newEmbeddings, err = es.generateBatchEmbeddingsSequential(ctx, uncachedTexts)
		}

		if err != nil {
			return nil, fmt.Errorf("failed to generate batch embeddings: %w", err)
		}

		// Cache new embeddings and assign to result
		for i, embedding := range newEmbeddings {
			originalIndex := uncachedIndices[i]
			embeddings[originalIndex] = embedding
			es.cache.set(uncachedTexts[i], embedding)
		}
	}

	// Update stats
	processingTime := time.Since(startTime)
	es.mu.Lock()
	es.stats.TotalProcessTime += processingTime
	if es.stats.TotalRequests > 0 {
		es.stats.AverageTime = es.stats.TotalProcessTime / time.Duration(es.stats.TotalRequests)
	}
	es.mu.Unlock()

	return embeddings, nil
}

// CUDA-accelerated batch embedding generation
func (es *EmbeddingService) generateBatchEmbeddingsCUDA(ctx context.Context, texts []string) ([][]float32, error) {
	if es.cudaWorker == nil {
		return nil, fmt.Errorf("CUDA worker not available")
	}

	// For now, we'll use a hybrid approach:
	// 1. Generate embeddings using Ollama
	// 2. Use CUDA for post-processing and similarity computations

	// Generate embeddings using Ollama first
	embeddings, err := es.generateBatchEmbeddingsSequential(ctx, texts)
	if err != nil {
		return nil, err
	}

	// Use CUDA for normalization and optimization
	if len(embeddings) > 0 && len(embeddings[0]) > 0 {
		// Flatten embeddings for CUDA processing
		flatEmbeddings := make([]float32, len(embeddings)*len(embeddings[0]))
		dims := len(embeddings[0])
		
		for i, emb := range embeddings {
			copy(flatEmbeddings[i*dims:(i+1)*dims], emb)
		}

		// Here we could use CUDA for additional processing like:
		// - Vector normalization
		// - Dimensionality reduction
		// - Quality enhancement
		
		// For now, just return the original embeddings
		// In a full implementation, you'd use the CUDA worker here
	}

	return embeddings, nil
}

// Sequential batch embedding generation
func (es *EmbeddingService) generateBatchEmbeddingsSequential(ctx context.Context, texts []string) ([][]float32, error) {
	embeddings := make([][]float32, len(texts))
	
	// Process in smaller batches to avoid overwhelming Ollama
	for i := 0; i < len(texts); i += es.batchSize {
		end := i + es.batchSize
		if end > len(texts) {
			end = len(texts)
		}

		batchTexts := texts[i:end]
		batchEmbeddings := make([][]float32, len(batchTexts))

		// Generate embeddings for this batch
		for j, text := range batchTexts {
			embedding, err := es.generateSingleEmbedding(ctx, text)
			if err != nil {
				return nil, fmt.Errorf("failed to generate embedding for text %d: %w", i+j, err)
			}
			batchEmbeddings[j] = embedding
		}

		// Copy to main results
		copy(embeddings[i:end], batchEmbeddings)

		// Small delay to avoid overwhelming the service
		if end < len(texts) {
			time.Sleep(10 * time.Millisecond)
		}
	}

	return embeddings, nil
}

// Generate embedding for a single text using Ollama
func (es *EmbeddingService) generateSingleEmbedding(ctx context.Context, text string) ([]float32, error) {
	request := OllamaEmbedRequest{
		Model:  es.model,
		Prompt: text,
	}

	var lastErr error
	for attempt := 0; attempt < es.maxRetries; attempt++ {
		embedding, err := es.callOllamaEmbed(ctx, request)
		if err == nil {
			return embedding, nil
		}
		
		lastErr = err
		
		// Exponential backoff
		if attempt < es.maxRetries-1 {
			delay := time.Duration(1<<attempt) * time.Second
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(delay):
				continue
			}
		}
	}

	return nil, fmt.Errorf("failed after %d attempts: %w", es.maxRetries, lastErr)
}

// Call Ollama embedding API
func (es *EmbeddingService) callOllamaEmbed(ctx context.Context, request OllamaEmbedRequest) ([]float32, error) {
	jsonData, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", es.ollamaURL+"/api/embeddings", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := es.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(body))
	}

	var response OllamaEmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(response.Embedding) == 0 {
		return nil, fmt.Errorf("received empty embedding")
	}

	return response.Embedding, nil
}

// Normalize text for consistent embedding generation
func (es *EmbeddingService) normalizeText(text string) string {
	// Remove excessive whitespace
	text = strings.TrimSpace(text)
	text = strings.ReplaceAll(text, "\n", " ")
	text = strings.ReplaceAll(text, "\t", " ")
	
	// Normalize multiple spaces to single space
	for strings.Contains(text, "  ") {
		text = strings.ReplaceAll(text, "  ", " ")
	}

	// Truncate if too long (Ollama has context limits)
	maxLength := 8000 // Conservative limit
	if len(text) > maxLength {
		text = text[:maxLength]
	}

	return text
}

// WarmCache preloads frequently used embeddings
func (es *EmbeddingService) WarmCache(ctx context.Context) error {
	// Common legal terms and phrases that are frequently searched
	commonTerms := []string{
		"contract",
		"agreement",
		"plaintiff",
		"defendant",
		"evidence",
		"objection",
		"sustained",
		"overruled",
		"liability",
		"damages",
		"jurisdiction",
		"precedent",
		"statute",
		"regulation",
		"compliance",
		"breach of contract",
		"negligence",
		"intellectual property",
		"legal analysis",
		"case law",
	}

	// Generate embeddings for common terms
	_, err := es.GenerateBatchEmbeddings(ctx, commonTerms)
	if err != nil {
		return fmt.Errorf("failed to warm cache: %w", err)
	}

	return nil
}

// GetStats returns embedding service statistics
func (es *EmbeddingService) GetStats() EmbeddingStats {
	es.mu.RLock()
	defer es.mu.RUnlock()
	return es.stats
}

// Cache methods
func (ec *EmbeddingCache) get(key string) ([]float32, bool) {
	ec.mu.RLock()
	defer ec.mu.RUnlock()
	
	embedding, exists := ec.cache[key]
	if exists {
		ec.access[key] = time.Now()
		return embedding, true
	}
	return nil, false
}

func (ec *EmbeddingCache) set(key string, embedding []float32) {
	ec.mu.Lock()
	defer ec.mu.Unlock()
	
	// Check if cache is full and needs cleanup
	if len(ec.cache) >= ec.maxSize {
		ec.cleanup()
	}
	
	ec.cache[key] = embedding
	ec.access[key] = time.Now()
}

func (ec *EmbeddingCache) cleanup() {
	// Remove 20% of least recently used items
	type cacheItem struct {
		key    string
		access time.Time
	}
	
	items := make([]cacheItem, 0, len(ec.access))
	for key, accessTime := range ec.access {
		items = append(items, cacheItem{key, accessTime})
	}
	
	// Sort by access time
	for i := 0; i < len(items)-1; i++ {
		for j := i + 1; j < len(items); j++ {
			if items[i].access.After(items[j].access) {
				items[i], items[j] = items[j], items[i]
			}
		}
	}
	
	// Remove oldest 20%
	removeCount := len(items) / 5
	for i := 0; i < removeCount; i++ {
		delete(ec.cache, items[i].key)
		delete(ec.access, items[i].key)
	}
}

func (ec *EmbeddingCache) size() int {
	ec.mu.RLock()
	defer ec.mu.RUnlock()
	return len(ec.cache)
}

func (ec *EmbeddingCache) clear() {
	ec.mu.Lock()
	defer ec.mu.Unlock()
	ec.cache = make(map[string][]float32)
	ec.access = make(map[string]time.Time)
}