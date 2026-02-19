package cache

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	redis "github.com/redis/go-redis/v9"
)

// PyTorch-style cache implementation for legal AI system
// Provides multi-level caching: memory (L1), Redis (L2), disk (L3)

type CacheConfig struct {
	// Memory cache settings (L1 - fastest)
	MemorySize int           `json:"memory_size"` // Max items in memory
	MemoryTTL  time.Duration `json:"memory_ttl"`  // Time to live for memory cache

	// Redis cache settings (L2 - distributed)
	RedisAddr     string        `json:"redis_addr"`     // Redis connection (host:port)
	RedisPassword string        `json:"redis_password"` // Redis auth
	RedisDB       int           `json:"redis_db"`       // Redis database
	RedisTTL      time.Duration `json:"redis_ttl"`      // Redis TTL

	// Disk cache settings (L3 - persistent)
	DiskPath string        `json:"disk_path"` // Disk cache directory
	DiskSize int64         `json:"disk_size"` // Max disk cache size in bytes
	DiskTTL  time.Duration `json:"disk_ttl"`  // Disk cache TTL

	// Performance settings
	EnableCompression bool `json:"enable_compression"` // Compress cached data
	EnableMetrics     bool `json:"enable_metrics"`     // Track cache metrics
}

type PyTorchStyleCache struct {
	config *CacheConfig

	// L1 Cache - Memory (fastest)
	memoryCache map[string]*CacheEntry
	memoryLock  sync.RWMutex
	memoryStats *CacheStats

	// L2 Cache - Redis (distributed)
	redisClient *redis.Client
	redisStats  *CacheStats

	// L3 Cache - Disk (persistent)
	diskStats *CacheStats

	// Cache metrics
	metrics     *CacheMetrics
	metricsLock sync.RWMutex
}

type CacheEntry struct {
	Key         string        `json:"key"`
	Value       interface{}   `json:"value"`
	CreatedAt   time.Time     `json:"created_at"`
	AccessedAt  time.Time     `json:"accessed_at"`
	AccessCount int64         `json:"access_count"`
	Size        int64         `json:"size"`
	TTL         time.Duration `json:"ttl"`
	Compressed  bool          `json:"compressed"`
}

type CacheStats struct {
	Hits      int64 `json:"hits"`
	Misses    int64 `json:"misses"`
	Sets      int64 `json:"sets"`
	Deletes   int64 `json:"deletes"`
	Evictions int64 `json:"evictions"`
	Size      int64 `json:"size"`
	ItemCount int64 `json:"item_count"`
}

type CacheMetrics struct {
	L1Stats     *CacheStats `json:"l1_stats"` // Memory cache stats
	L2Stats     *CacheStats `json:"l2_stats"` // Redis cache stats
	L3Stats     *CacheStats `json:"l3_stats"` // Disk cache stats
	TotalHits   int64       `json:"total_hits"`
	TotalMisses int64       `json:"total_misses"`
	HitRatio    float64     `json:"hit_ratio"`
	StartTime   time.Time   `json:"start_time"`
}

// Cache key types for different data types
const (
	// Embedding cache keys
	CacheKeyEmbedding     = "emb:%s"      // Document/text embeddings
	CacheKeyUserEmbedding = "user_emb:%s" // User behavior embeddings

	// Model response cache keys
	CacheKeyLLMResponse = "llm:%s"    // LLM response cache
	CacheKeyRAGResponse = "rag:%s"    // RAG pipeline results
	CacheKeySearch      = "search:%s" // Search results

	// Legal document cache keys
	CacheKeyDocument = "doc:%s"      // Parsed document content
	CacheKeyAnalysis = "analysis:%s" // Document analysis results
	CacheKeyEntities = "entities:%s" // Legal entity extraction

	// User pattern cache keys
	CacheKeyUserPattern  = "pattern:%s"  // User behavior patterns
	CacheKeyPersonalized = "personal:%s" // Personalized recommendations

	// Training cache keys
	CacheKeyTrainingData = "train:%s"   // ML training data
	CacheKeyModelWeights = "weights:%s" // Model weights/checkpoints
)

// NewPyTorchStyleCache creates a new multi-level cache system
func NewPyTorchStyleCache(config *CacheConfig) (*PyTorchStyleCache, error) {
	cache := &PyTorchStyleCache{
		config:      config,
		memoryCache: make(map[string]*CacheEntry),
		memoryStats: &CacheStats{},
		redisStats:  &CacheStats{},
		diskStats:   &CacheStats{},
		metrics: &CacheMetrics{
			L1Stats:   &CacheStats{},
			L2Stats:   &CacheStats{},
			L3Stats:   &CacheStats{},
			StartTime: time.Now(),
		},
	}

	// Initialize Redis client (L2 cache)
	if config.RedisAddr != "" {
		cache.redisClient = redis.NewClient(&redis.Options{
			Addr:     config.RedisAddr,
			Password: config.RedisPassword,
			DB:       config.RedisDB,
		})

		// Test Redis connection
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := cache.redisClient.Ping(ctx).Err(); err != nil {
			log.Printf("Redis cache unavailable: %v", err)
			cache.redisClient = nil
		} else {
			log.Printf("✅ Redis cache connected: %s", config.RedisAddr)
		}
	}

	log.Printf("🧠 PyTorch-style cache initialized:")
	log.Printf("   📦 L1 (Memory): %d items, %v TTL", config.MemorySize, config.MemoryTTL)
	log.Printf("   🔄 L2 (Redis): %s, %v TTL", config.RedisAddr, config.RedisTTL)
	log.Printf("   💾 L3 (Disk): %s, %d bytes, %v TTL", config.DiskPath, config.DiskSize, config.DiskTTL)

	return cache, nil
}

// Get retrieves a value from the cache using PyTorch-style multi-level lookup
func (c *PyTorchStyleCache) Get(ctx context.Context, key string) (interface{}, bool) {
	startTime := time.Now()

	// L1 Cache - Memory (fastest)
	if value, found := c.getFromMemory(key); found {
		c.recordHit("L1", time.Since(startTime))
		return value, true
	}

	// L2 Cache - Redis (distributed)
	if c.redisClient != nil {
		if value, found := c.getFromRedis(ctx, key); found {
			// Promote to L1 cache
			c.setToMemory(key, value, c.config.MemoryTTL)
			c.recordHit("L2", time.Since(startTime))
			return value, true
		}
	}

	// L3 Cache - Disk (persistent)
	if value, found := c.getFromDisk(key); found {
		// Promote to L2 and L1 caches
		if c.redisClient != nil {
			c.setToRedis(ctx, key, value, c.config.RedisTTL)
		}
		c.setToMemory(key, value, c.config.MemoryTTL)
		c.recordHit("L3", time.Since(startTime))
		return value, true
	}

	c.recordMiss(time.Since(startTime))
	return nil, false
}

// Set stores a value in all cache levels
func (c *PyTorchStyleCache) Set(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
	// Store in all cache levels
	c.setToMemory(key, value, ttl)

	if c.redisClient != nil {
		if err := c.setToRedis(ctx, key, value, ttl); err != nil {
			log.Printf("Redis cache set error: %v", err)
		}
	}

	if err := c.setToDisk(key, value, ttl); err != nil {
		log.Printf("Disk cache set error: %v", err)
	}

	return nil
}

// SetEmbedding caches document/text embeddings with optimizations
func (c *PyTorchStyleCache) SetEmbedding(ctx context.Context, text string, embedding []float32) error {
	key := fmt.Sprintf(CacheKeyEmbedding, c.hashKey(text))
	return c.Set(ctx, key, embedding, c.config.RedisTTL)
}

// GetEmbedding retrieves cached embeddings
func (c *PyTorchStyleCache) GetEmbedding(ctx context.Context, text string) ([]float32, bool) {
	key := fmt.Sprintf(CacheKeyEmbedding, c.hashKey(text))
	if value, found := c.Get(ctx, key); found {
		if embedding, ok := value.([]float32); ok {
			return embedding, true
		}
	}
	return nil, false
}

// SetLLMResponse caches LLM responses with metadata
func (c *PyTorchStyleCache) SetLLMResponse(ctx context.Context, query string, response string, metadata map[string]interface{}) error {
	key := fmt.Sprintf(CacheKeyLLMResponse, c.hashKey(query))
	data := map[string]interface{}{
		"response":  response,
		"metadata":  metadata,
		"timestamp": time.Now().Unix(),
	}
	return c.Set(ctx, key, data, c.config.RedisTTL)
}

// GetLLMResponse retrieves cached LLM responses
func (c *PyTorchStyleCache) GetLLMResponse(ctx context.Context, query string) (string, map[string]interface{}, bool) {
	key := fmt.Sprintf(CacheKeyLLMResponse, c.hashKey(query))
	if value, found := c.Get(ctx, key); found {
		if data, ok := value.(map[string]interface{}); ok {
			response := data["response"].(string)
			metadata := data["metadata"].(map[string]interface{})
			return response, metadata, true
		}
	}
	return "", nil, false
}

// SetUserPattern caches user behavior patterns
func (c *PyTorchStyleCache) SetUserPattern(ctx context.Context, userID string, pattern interface{}) error {
	key := fmt.Sprintf(CacheKeyUserPattern, userID)
	return c.Set(ctx, key, pattern, c.config.RedisTTL)
}

// GetUserPattern retrieves cached user patterns
func (c *PyTorchStyleCache) GetUserPattern(ctx context.Context, userID string) (interface{}, bool) {
	key := fmt.Sprintf(CacheKeyUserPattern, userID)
	return c.Get(ctx, key)
}

// Memory cache operations (L1)
func (c *PyTorchStyleCache) getFromMemory(key string) (interface{}, bool) {
	c.memoryLock.RLock()
	entry, exists := c.memoryCache[key]
	c.memoryLock.RUnlock()
	if !exists {
		return nil, false
	}

	// TTL check with write lock to safely delete
	if time.Since(entry.CreatedAt) > entry.TTL {
		c.memoryLock.Lock()
		delete(c.memoryCache, key)
		c.memoryLock.Unlock()
		return nil, false
	}

	// Update access statistics under write lock
	c.memoryLock.Lock()
	if e, ok := c.memoryCache[key]; ok {
		e.AccessedAt = time.Now()
		e.AccessCount++
	}
	c.memoryLock.Unlock()

	return entry.Value, true
}

func (c *PyTorchStyleCache) setToMemory(key string, value interface{}, ttl time.Duration) {
	c.memoryLock.Lock()
	defer c.memoryLock.Unlock()

	// Evict if memory is full
	if len(c.memoryCache) >= c.config.MemorySize {
		c.evictLRU()
	}

	entry := &CacheEntry{
		Key:         key,
		Value:       value,
		CreatedAt:   time.Now(),
		AccessedAt:  time.Now(),
		AccessCount: 1,
		TTL:         ttl,
	}

	c.memoryCache[key] = entry
	c.memoryStats.Sets++
	c.memoryStats.ItemCount++
}

// Redis cache operations (L2)
func (c *PyTorchStyleCache) getFromRedis(ctx context.Context, key string) (interface{}, bool) {
	if c.redisClient == nil {
		return nil, false
	}

	data, err := c.redisClient.Get(ctx, key).Result()
	if err == redis.Nil {
		return nil, false
	}
	if err != nil {
		return nil, false
	}

	var value interface{}
	if err := json.Unmarshal([]byte(data), &value); err != nil {
		return nil, false
	}

	c.redisStats.Hits++
	return value, true
}

func (c *PyTorchStyleCache) setToRedis(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
	if c.redisClient == nil {
		return fmt.Errorf("redis client not available")
	}

	data, err := json.Marshal(value)
	if err != nil {
		return err
	}

	if err := c.redisClient.Set(ctx, key, data, ttl).Err(); err != nil {
		return err
	}

	c.redisStats.Sets++
	c.redisStats.ItemCount++
	return nil
}

// Disk cache operations (L3)
func (c *PyTorchStyleCache) getFromDisk(key string) (interface{}, bool) {
	if c.config.DiskPath == "" {
		return nil, false
	}
	path := c.diskFilePath(key)
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, false
	}
	var wrap struct {
		CreatedAt  int64           `json:"created_at"`
		TTLSeconds int64           `json:"ttl_seconds"`
		Value      json.RawMessage `json:"value"`
	}
	if err := json.Unmarshal(b, &wrap); err != nil {
		_ = os.Remove(path)
		return nil, false
	}
	if wrap.TTLSeconds > 0 {
		exp := time.Unix(wrap.CreatedAt, 0).Add(time.Duration(wrap.TTLSeconds) * time.Second)
		if time.Now().After(exp) {
			_ = os.Remove(path)
			return nil, false
		}
	}
	var value interface{}
	if err := json.Unmarshal(wrap.Value, &value); err != nil {
		return nil, false
	}
	return value, true
}

func (c *PyTorchStyleCache) setToDisk(key string, value interface{}, ttl time.Duration) error {
	if c.config.DiskPath == "" {
		return nil
	}
	if err := os.MkdirAll(c.config.DiskPath, 0o755); err != nil {
		return err
	}
	path := c.diskFilePath(key)
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	wrap := struct {
		CreatedAt  int64  `json:"created_at"`
		TTLSeconds int64  `json:"ttl_seconds"`
		Value      []byte `json:"value"`
	}{
		CreatedAt:  time.Now().Unix(),
		TTLSeconds: int64(ttl.Seconds()),
		Value:      payload,
	}
	data, err := json.Marshal(&wrap)
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	c.enforceDiskSize()
	return nil
}

// Cache maintenance operations
func (c *PyTorchStyleCache) evictLRU() {
	// Find least recently used item
	var oldestKey string
	var oldestTime time.Time = time.Now()

	for key, entry := range c.memoryCache {
		if entry.AccessedAt.Before(oldestTime) {
			oldestTime = entry.AccessedAt
			oldestKey = key
		}
	}

	if oldestKey != "" {
		delete(c.memoryCache, oldestKey)
		c.memoryStats.Evictions++
		c.memoryStats.ItemCount--
	}
}

// Utility functions
func (c *PyTorchStyleCache) hashKey(input string) string {
	h := sha256.Sum256([]byte(input))
	return fmt.Sprintf("%x", h)[:16] // Use first 16 chars of hash
}

func (c *PyTorchStyleCache) recordHit(level string, duration time.Duration) {
	c.metricsLock.Lock()
	defer c.metricsLock.Unlock()

	c.metrics.TotalHits++

	switch level {
	case "L1":
		c.metrics.L1Stats.Hits++
	case "L2":
		c.metrics.L2Stats.Hits++
	case "L3":
		c.metrics.L3Stats.Hits++
	}

	c.updateHitRatio()
}

func (c *PyTorchStyleCache) recordMiss(duration time.Duration) {
	c.metricsLock.Lock()
	defer c.metricsLock.Unlock()

	c.metrics.TotalMisses++
	c.metrics.L1Stats.Misses++
	c.metrics.L2Stats.Misses++
	c.metrics.L3Stats.Misses++

	c.updateHitRatio()
}

func (c *PyTorchStyleCache) updateHitRatio() {
	total := c.metrics.TotalHits + c.metrics.TotalMisses
	if total > 0 {
		c.metrics.HitRatio = float64(c.metrics.TotalHits) / float64(total)
	}
}

// GetMetrics returns cache performance metrics
func (c *PyTorchStyleCache) GetMetrics() *CacheMetrics {
	c.metricsLock.RLock()
	defer c.metricsLock.RUnlock()

	// Create a copy to avoid race conditions
	metrics := *c.metrics
	return &metrics
}

// Clear removes all cached data
func (c *PyTorchStyleCache) Clear(ctx context.Context) error {
	// Clear memory cache
	c.memoryLock.Lock()
	c.memoryCache = make(map[string]*CacheEntry)
	c.memoryLock.Unlock()

	// Clear Redis cache
	if c.redisClient != nil {
		if err := c.redisClient.FlushDB(ctx).Err(); err != nil {
			return err
		}
	}

	// Clear disk cache
	if c.config.DiskPath != "" {
		_ = os.RemoveAll(c.config.DiskPath)
		_ = os.MkdirAll(c.config.DiskPath, 0o755)
	}

	log.Println("🧹 Cache cleared across all levels")
	return nil
}

// Delete removes a key from all cache levels.
func (c *PyTorchStyleCache) Delete(ctx context.Context, key string) error {
	// Memory
	c.memoryLock.Lock()
	delete(c.memoryCache, key)
	c.memoryLock.Unlock()

	// Redis
	if c.redisClient != nil {
		_ = c.redisClient.Del(ctx, key).Err()
	}

	// Disk
	if c.config.DiskPath != "" {
		_ = os.Remove(c.diskFilePath(key))
	}
	return nil
}

// Warmup preloads frequently used data into cache
func (c *PyTorchStyleCache) Warmup(ctx context.Context, data map[string]interface{}) error {
	log.Println("🔥 Warming up cache with frequently used data...")

	for key, value := range data {
		if err := c.Set(ctx, key, value, c.config.RedisTTL); err != nil {
			log.Printf("Cache warmup error for key %s: %v", key, err)
		}
	}

	log.Printf("✅ Cache warmup completed: %d items loaded", len(data))
	return nil
}

// DefaultCacheConfig returns a production-ready cache configuration
func DefaultCacheConfig() *CacheConfig {
	return &CacheConfig{
		// Memory cache (L1)
		MemorySize: 10000,
		MemoryTTL:  15 * time.Minute,

		// Redis cache (L2)
		RedisAddr:     "localhost:4005",
		RedisPassword: "",
		RedisDB:       1, // Use DB 1 for cache
		RedisTTL:      1 * time.Hour,

		// Disk cache (L3)
		DiskPath: "./cache",
		DiskSize: 10 * 1024 * 1024 * 1024, // 10GB
		DiskTTL:  24 * time.Hour,

		// Performance
		EnableCompression: true,
		EnableMetrics:     true,
	}
}

// Helpers
func (c *PyTorchStyleCache) diskFilePath(key string) string {
	sum := sha256.Sum256([]byte(key))
	name := fmt.Sprintf("%x.json", sum[:16])
	return filepath.Join(c.config.DiskPath, name)
}

func (c *PyTorchStyleCache) enforceDiskSize() {
	if c.config.DiskSize <= 0 || c.config.DiskPath == "" {
		return
	}
	entries, err := os.ReadDir(c.config.DiskPath)
	if err != nil {
		return
	}
	type fileInfo struct {
		path string
		size int64
		mod  time.Time
	}
	var total int64
	files := make([]fileInfo, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		p := filepath.Join(c.config.DiskPath, e.Name())
		st, err := os.Stat(p)
		if err != nil {
			continue
		}
		total += st.Size()
		files = append(files, fileInfo{path: p, size: st.Size(), mod: st.ModTime()})
	}
	if total <= c.config.DiskSize {
		return
	}
	sort.Slice(files, func(i, j int) bool { return files[i].mod.Before(files[j].mod) })
	for _, f := range files {
		_ = os.Remove(f.path)
		total -= f.size
		if total <= c.config.DiskSize {
			break
		}
	}
}
