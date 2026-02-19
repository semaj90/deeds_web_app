package cache

import (
	"context"
	"testing"
	"time"
)

func TestPyTorchCacheBasicOperations(t *testing.T) {
	config := &CacheConfig{
		MemorySize: 100,
		MemoryTTL:  1 * time.Minute,
		RedisTTL:   5 * time.Minute,
		DiskPath:   "./test_cache",
		DiskSize:   1024 * 1024, // 1MB
		DiskTTL:    10 * time.Minute,
		EnableCompression: false,
		EnableMetrics:     true,
	}

	cache, err := NewPyTorchStyleCache(config)
	if err != nil {
		t.Fatalf("Failed to create cache: %v", err)
	}

	ctx := context.Background()

	// Test Set and Get
	testKey := "test_key"
	testValue := "test_value"

	err = cache.Set(ctx, testKey, testValue, 1*time.Minute)
	if err != nil {
		t.Errorf("Failed to set value: %v", err)
	}

	value, found := cache.Get(ctx, testKey)
	if !found {
		t.Error("Expected to find cached value")
	}

	if value != testValue {
		t.Errorf("Expected %s, got %v", testValue, value)
	}

	// Test metrics
	metrics := cache.GetMetrics()
	if metrics.TotalHits == 0 {
		t.Error("Expected at least one hit")
	}

	// Clean up
	_ = cache.Clear(ctx)
}

func TestEmbeddingCache(t *testing.T) {
	config := DefaultCacheConfig()
	config.RedisAddr = "" // Disable Redis for this test

	cache, err := NewPyTorchStyleCache(config)
	if err != nil {
		t.Fatalf("Failed to create cache: %v", err)
	}

	ctx := context.Background()
	text := "sample legal document text"
	embedding := []float32{0.1, 0.2, 0.3, 0.4, 0.5}

	// Test embedding cache
	err = cache.SetEmbedding(ctx, text, embedding)
	if err != nil {
		t.Errorf("Failed to set embedding: %v", err)
	}

	retrievedEmbedding, found := cache.GetEmbedding(ctx, text)
	if !found {
		t.Error("Expected to find cached embedding")
	}

	if len(retrievedEmbedding) != len(embedding) {
		t.Errorf("Expected embedding length %d, got %d", len(embedding), len(retrievedEmbedding))
	}

	for i, val := range retrievedEmbedding {
		if val != embedding[i] {
			t.Errorf("Expected embedding[%d] = %f, got %f", i, embedding[i], val)
		}
	}

	// Clean up
	_ = cache.Clear(ctx)
}

func TestLLMResponseCache(t *testing.T) {
	config := DefaultCacheConfig()
	config.RedisAddr = "" // Disable Redis for this test

	cache, err := NewPyTorchStyleCache(config)
	if err != nil {
		t.Fatalf("Failed to create cache: %v", err)
	}

	ctx := context.Background()
	query := "What are the legal implications of this contract?"
	response := "This contract appears to be a standard NDA with enforceable terms."
	metadata := map[string]interface{}{
		"confidence": 0.95,
		"model":      "legal-ai-v1",
		"tokens":     150,
	}

	// Test LLM response cache
	err = cache.SetLLMResponse(ctx, query, response, metadata)
	if err != nil {
		t.Errorf("Failed to set LLM response: %v", err)
	}

	retrievedResponse, retrievedMetadata, found := cache.GetLLMResponse(ctx, query)
	if !found {
		t.Error("Expected to find cached LLM response")
	}

	if retrievedResponse != response {
		t.Errorf("Expected response %s, got %s", response, retrievedResponse)
	}

	if retrievedMetadata["confidence"] != metadata["confidence"] {
		t.Error("Metadata confidence mismatch")
	}

	// Clean up
	_ = cache.Clear(ctx)
}

func TestCacheWarmup(t *testing.T) {
	config := DefaultCacheConfig()
	config.RedisAddr = "" // Disable Redis for this test

	cache, err := NewPyTorchStyleCache(config)
	if err != nil {
		t.Fatalf("Failed to create cache: %v", err)
	}

	ctx := context.Background()
	
	// Prepare warmup data
	warmupData := map[string]interface{}{
		"frequently_used_1": "legal document template",
		"frequently_used_2": []float32{1.0, 2.0, 3.0},
		"frequently_used_3": map[string]string{"type": "contract", "category": "employment"},
	}

	// Test cache warmup
	err = cache.Warmup(ctx, warmupData)
	if err != nil {
		t.Errorf("Failed to warmup cache: %v", err)
	}

	// Verify data was cached
	for key := range warmupData {
		value, found := cache.Get(ctx, key)
		if !found {
			t.Errorf("Expected to find warmed up key: %s", key)
		}
		if value == nil {
			t.Errorf("Expected non-nil value for key: %s", key)
		}
	}

	// Clean up
	_ = cache.Clear(ctx)
}

func TestMultiLevelAdapter(t *testing.T) {
	config := DefaultCacheConfig()
	config.RedisAddr = "" // Disable Redis for this test

	pyTorchCache, err := NewPyTorchStyleCache(config)
	if err != nil {
		t.Fatalf("Failed to create PyTorch cache: %v", err)
	}

	adapter := &MultiLevelAdapter{C: pyTorchCache}

	ctx := context.Background()
	key := "adapter_test_key"
	value := []byte("adapter_test_value")

	// Test adapter interface
	err = adapter.Set(ctx, key, value, 1*time.Minute)
	if err != nil {
		t.Errorf("Failed to set value through adapter: %v", err)
	}

	retrievedValue, found, err := adapter.Get(ctx, key)
	if err != nil {
		t.Errorf("Failed to get value through adapter: %v", err)
	}
	if !found {
		t.Error("Expected to find value through adapter")
	}
	if string(retrievedValue) != string(value) {
		t.Errorf("Expected %s, got %s", string(value), string(retrievedValue))
	}

	// Test delete
	err = adapter.Delete(ctx, key)
	if err != nil {
		t.Errorf("Failed to delete value through adapter: %v", err)
	}

	_, found, _ = adapter.Get(ctx, key)
	if found {
		t.Error("Expected value to be deleted")
	}

	// Clean up
	_ = pyTorchCache.Clear(ctx)
}