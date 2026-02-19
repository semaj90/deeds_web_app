package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"legal-ai-production/pkg/cache"
)

func main() {
	// Initialize PyTorch-style cache with production settings
	config := cache.DefaultCacheConfig()
	
	// For this example, disable Redis to avoid connection dependencies
	config.RedisAddr = ""
	
	pyTorchCache, err := cache.NewPyTorchStyleCache(config)
	if err != nil {
		log.Fatalf("Failed to create cache: %v", err)
	}

	ctx := context.Background()

	// Example 1: Cache embeddings for legal documents
	fmt.Println("=== Example 1: Embedding Cache ===")
	docText := "This non-disclosure agreement governs the sharing of confidential information between parties."
	embedding := []float32{0.123, 0.456, 0.789, 0.321, 0.654}
	
	err = pyTorchCache.SetEmbedding(ctx, docText, embedding)
	if err != nil {
		log.Printf("Error setting embedding: %v", err)
	}

	retrievedEmbedding, found := pyTorchCache.GetEmbedding(ctx, docText)
	if found {
		fmt.Printf("✅ Cached embedding retrieved: %v\n", retrievedEmbedding[:3])
	} else {
		fmt.Println("❌ Embedding not found in cache")
	}

	// Example 2: Cache LLM responses for legal analysis
	fmt.Println("\n=== Example 2: LLM Response Cache ===")
	query := "What are the key terms in this employment contract?"
	response := "The key terms include: 1) Compensation structure, 2) Non-compete clause, 3) Termination conditions"
	metadata := map[string]interface{}{
		"confidence":      0.92,
		"model":          "legal-ai-v2",
		"processing_time": "2.3s",
		"tokens":         145,
	}

	err = pyTorchCache.SetLLMResponse(ctx, query, response, metadata)
	if err != nil {
		log.Printf("Error setting LLM response: %v", err)
	}

	retrievedResponse, retrievedMetadata, found := pyTorchCache.GetLLMResponse(ctx, query)
	if found {
		fmt.Printf("✅ Cached response: %s\n", retrievedResponse[:50]+"...")
		fmt.Printf("✅ Metadata: confidence=%.2f, tokens=%v\n", 
			retrievedMetadata["confidence"], retrievedMetadata["tokens"])
	}

	// Example 3: Cache user behavior patterns
	fmt.Println("\n=== Example 3: User Pattern Cache ===")
	userID := "user_12345"
	userPattern := map[string]interface{}{
		"preferred_domains": []string{"contract_law", "employment_law", "intellectual_property"},
		"avg_session_time":  "15m",
		"complexity_level":  "advanced",
		"frequent_queries":  []string{"contract analysis", "risk assessment"},
	}

	err = pyTorchCache.SetUserPattern(ctx, userID, userPattern)
	if err != nil {
		log.Printf("Error setting user pattern: %v", err)
	}

	retrievedPattern, found := pyTorchCache.GetUserPattern(ctx, userID)
	if found {
		if pattern, ok := retrievedPattern.(map[string]interface{}); ok {
			fmt.Printf("✅ User pattern cached - complexity: %v\n", pattern["complexity_level"])
		}
	}

	// Example 4: Cache warmup with frequently used data
	fmt.Println("\n=== Example 4: Cache Warmup ===")
	warmupData := map[string]interface{}{
		"common_legal_terms": []string{"consideration", "breach", "liability", "indemnity"},
		"standard_clauses":   map[string]string{
			"confidentiality": "Party agrees to maintain confidentiality of all information...",
			"termination":     "Either party may terminate this agreement with 30 days notice...",
		},
		"risk_categories": []string{"low", "medium", "high", "critical"},
	}

	err = pyTorchCache.Warmup(ctx, warmupData)
	if err != nil {
		log.Printf("Error warming up cache: %v", err)
	}

	// Example 5: Performance metrics
	fmt.Println("\n=== Example 5: Cache Metrics ===")
	
	// Perform some operations to generate metrics
	for i := 0; i < 10; i++ {
		key := fmt.Sprintf("test_key_%d", i)
		value := fmt.Sprintf("test_value_%d", i)
		_ = pyTorchCache.Set(ctx, key, value, 1*time.Minute)
	}

	// Retrieve some values to generate hits
	for i := 0; i < 5; i++ {
		key := fmt.Sprintf("test_key_%d", i)
		_, _ = pyTorchCache.Get(ctx, key)
	}

	// Try to get non-existent values to generate misses
	for i := 20; i < 25; i++ {
		key := fmt.Sprintf("missing_key_%d", i)
		_, _ = pyTorchCache.Get(ctx, key)
	}

	metrics := pyTorchCache.GetMetrics()
	fmt.Printf("📊 Cache Performance:\n")
	fmt.Printf("   Total Hits: %d\n", metrics.TotalHits)
	fmt.Printf("   Total Misses: %d\n", metrics.TotalMisses)
	fmt.Printf("   Hit Ratio: %.2f%%\n", metrics.HitRatio*100)
	fmt.Printf("   L1 Cache Hits: %d\n", metrics.L1Stats.Hits)
	fmt.Printf("   L2 Cache Hits: %d\n", metrics.L2Stats.Hits)
	fmt.Printf("   L3 Cache Hits: %d\n", metrics.L3Stats.Hits)

	// Example 6: Multi-level adapter for standard Cache interface
	fmt.Println("\n=== Example 6: Multi-Level Adapter ===")
	adapter := &cache.MultiLevelAdapter{C: pyTorchCache}
	
	// Use as standard byte-oriented cache
	key := "adapter_demo"
	value := []byte("This is a demo of the cache adapter interface")
	
	err = adapter.Set(ctx, key, value, 1*time.Minute)
	if err != nil {
		log.Printf("Error setting through adapter: %v", err)
	}

	retrievedBytes, found, err := adapter.Get(ctx, key)
	if err != nil {
		log.Printf("Error getting through adapter: %v", err)
	}
	if found {
		fmt.Printf("✅ Adapter retrieved: %s\n", string(retrievedBytes))
	}

	fmt.Println("\n🎉 PyTorch Cache Demo Complete!")
	fmt.Println("The cache successfully demonstrates:")
	fmt.Println("- Multi-level caching (Memory → Redis → Disk)")
	fmt.Println("- Specialized methods for embeddings, LLM responses, and user patterns")
	fmt.Println("- Cache warmup for frequently accessed data")
	fmt.Println("- Performance metrics and monitoring")
	fmt.Println("- Standard Cache interface compatibility")
}