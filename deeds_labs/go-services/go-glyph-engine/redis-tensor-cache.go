package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// TensorCacheManager handles multi-tier tensor caching (VRAM → Redis → PostgreSQL)
type TensorCacheManager struct {
	redisClient *redis.Client
	pgPool      *pgxpool.Pool
	stats       *CacheStats
}

// CacheStats tracks cache performance metrics
type CacheStats struct {
	Hits           int64 `json:"hits"`
	Misses         int64 `json:"misses"`
	VRAMHits       int64 `json:"vram_hits"`
	RedisHits      int64 `json:"redis_hits"`
	PostgreSQLHits int64 `json:"postgresql_hits"`
	CompressionRatio float64 `json:"compression_ratio"`
	AvgLatency     time.Duration `json:"avg_latency"`
}

// TensorMetadata stores tensor information and cache hierarchy
type TensorMetadata struct {
	Key             string            `json:"key"`
	Shape           []int             `json:"shape"`
	DataType        string            `json:"data_type"`
	CompressionType string            `json:"compression_type"`
	CacheLevel      string            `json:"cache_level"` // "vram", "redis", "postgresql"
	CreatedAt       time.Time         `json:"created_at"`
	LastAccessed    time.Time         `json:"last_accessed"`
	AccessCount     int64             `json:"access_count"`
	Size            int64             `json:"size"`
	CompressedSize  int64             `json:"compressed_size"`
	LegalContext    map[string]interface{} `json:"legal_context"`
}

// CachedTensor represents a tensor stored in cache hierarchy
type CachedTensor struct {
	Metadata *TensorMetadata `json:"metadata"`
	Data     []byte          `json:"data"`
	Hash     string          `json:"hash"`
}

// NewTensorCacheManager creates a new tensor cache manager
func NewTensorCacheManager(redisClient *redis.Client, pgPool *pgxpool.Pool) *TensorCacheManager {
	return &TensorCacheManager{
		redisClient: redisClient,
		pgPool:      pgPool,
		stats:       &CacheStats{},
	}
}

// StoreTensor stores a tensor in the appropriate cache tier
func (tcm *TensorCacheManager) StoreTensor(ctx context.Context, key string, tensorData []byte, metadata *TensorMetadata) error {
	startTime := time.Now()

	// Create cached tensor structure
	cachedTensor := &CachedTensor{
		Metadata: metadata,
		Data:     tensorData,
		Hash:     tcm.calculateHash(tensorData),
	}

	// Apply Neural Sprite compression if enabled
	compressedData, compressionRatio, err := tcm.applyNeuralSpriteCompression(tensorData, metadata)
	if err != nil {
		log.Printf("Neural Sprite compression failed for %s: %v", key, err)
		compressedData = tensorData
		compressionRatio = 1.0
	}

	cachedTensor.Data = compressedData
	cachedTensor.Metadata.CompressedSize = int64(len(compressedData))
	cachedTensor.Metadata.Size = int64(len(tensorData))

	// Update compression stats
	tcm.stats.CompressionRatio = (tcm.stats.CompressionRatio + compressionRatio) / 2

	// Serialize cached tensor
	serializedTensor, err := json.Marshal(cachedTensor)
	if err != nil {
		return fmt.Errorf("failed to serialize tensor: %v", err)
	}

	// Store in Redis (L2 cache)
	err = tcm.storeInRedis(ctx, key, serializedTensor, metadata)
	if err != nil {
		return fmt.Errorf("failed to store tensor in Redis: %v", err)
	}

	// Store metadata in PostgreSQL (L3 persistent storage)
	err = tcm.storeMetadataInPostgreSQL(ctx, key, metadata)
	if err != nil {
		log.Printf("Warning: Failed to store tensor metadata in PostgreSQL: %v", err)
	}

	// Update cache statistics
	tcm.updateLatencyStats(time.Since(startTime))

	log.Printf("Stored tensor %s: %d bytes → %d bytes (%.2fx compression)",
		key, len(tensorData), len(compressedData), compressionRatio)

	return nil
}

// RetrieveTensor retrieves a tensor from the cache hierarchy
func (tcm *TensorCacheManager) RetrieveTensor(ctx context.Context, key string) (*CachedTensor, error) {
	startTime := time.Now()

	// L1: Check VRAM cache (simulated - would be GPU memory in production)
	if tensor := tcm.checkVRAMCache(key); tensor != nil {
		tcm.stats.Hits++
		tcm.stats.VRAMHits++
		tcm.updateLatencyStats(time.Since(startTime))
		return tensor, nil
	}

	// L2: Check Redis cache
	tensor, err := tcm.retrieveFromRedis(ctx, key)
	if err == nil && tensor != nil {
		tcm.stats.Hits++
		tcm.stats.RedisHits++
		tcm.updateLatencyStats(time.Since(startTime))

		// Promote to VRAM cache for faster access
		tcm.promoteToVRAM(key, tensor)
		return tensor, nil
	}

	// L3: Check PostgreSQL persistent storage
	tensor, err = tcm.retrieveFromPostgreSQL(ctx, key)
	if err == nil && tensor != nil {
		tcm.stats.Hits++
		tcm.stats.PostgreSQLHits++
		tcm.updateLatencyStats(time.Since(startTime))

		// Promote to Redis and VRAM
		tcm.promoteToRedis(ctx, key, tensor)
		tcm.promoteToVRAM(key, tensor)
		return tensor, nil
	}

	// Cache miss
	tcm.stats.Misses++
	tcm.updateLatencyStats(time.Since(startTime))
	return nil, fmt.Errorf("tensor %s not found in cache hierarchy", key)
}

// storeInRedis stores tensor data in Redis with expiration and compression
func (tcm *TensorCacheManager) storeInRedis(ctx context.Context, key string, data []byte, metadata *TensorMetadata) error {
	// Use Redis pipeline for atomic operations
	pipe := tcm.redisClient.Pipeline()

	// Store tensor data with 24-hour expiration
	pipe.Set(ctx, fmt.Sprintf("tensor:%s", key), data, 24*time.Hour)

	// Store tensor metadata with longer expiration
	metadataJSON, _ := json.Marshal(metadata)
	pipe.Set(ctx, fmt.Sprintf("tensor:meta:%s", key), metadataJSON, 7*24*time.Hour)

	// Update access statistics
	pipe.Incr(ctx, fmt.Sprintf("tensor:access:%s", key))
	pipe.Set(ctx, fmt.Sprintf("tensor:last_access:%s", key), time.Now().Unix(), 7*24*time.Hour)

	// Add to legal context index for searching
	if metadata.LegalContext != nil {
		if caseID, exists := metadata.LegalContext["case_id"]; exists {
			pipe.SAdd(ctx, fmt.Sprintf("legal:case:%v", caseID), key)
		}
		if docType, exists := metadata.LegalContext["document_type"]; exists {
			pipe.SAdd(ctx, fmt.Sprintf("legal:doc_type:%v", docType), key)
		}
	}

	_, err := pipe.Exec(ctx)
	return err
}

// retrieveFromRedis retrieves tensor from Redis cache
func (tcm *TensorCacheManager) retrieveFromRedis(ctx context.Context, key string) (*CachedTensor, error) {
	// Retrieve tensor data and metadata
	pipe := tcm.redisClient.Pipeline()
	dataCmd := pipe.Get(ctx, fmt.Sprintf("tensor:%s", key))
	metaCmd := pipe.Get(ctx, fmt.Sprintf("tensor:meta:%s", key))

	_, err := pipe.Exec(ctx)
	if err != nil {
		// If the error is a missing key, treat as cache miss; otherwise return the error
		if err == redis.Nil {
			return nil, fmt.Errorf("tensor %s not found in redis", key)
		}
		return nil, err
	}

	// Parse tensor data
	tensorData, err := dataCmd.Bytes()
	if err != nil {
		return nil, err
	}

	var cachedTensor CachedTensor
	if err = json.Unmarshal(tensorData, &cachedTensor); err != nil {
		return nil, fmt.Errorf("failed to deserialize cached tensor: %v", err)
	}

	// Try to parse metadata if present and merge/overwrite fields
	if metaBytes, metaErr := metaCmd.Bytes(); metaErr == nil {
		var meta TensorMetadata
		if jerr := json.Unmarshal(metaBytes, &meta); jerr == nil {
			// Ensure we don't lose nested metadata if data contained some metadata already
			if cachedTensor.Metadata == nil {
				cachedTensor.Metadata = &meta
			} else {
				// Merge a few common fields from stored metadata (prefer explicit meta values)
				if meta.Size != 0 {
					cachedTensor.Metadata.Size = meta.Size
				}
				if meta.CompressedSize != 0 {
					cachedTensor.Metadata.CompressedSize = meta.CompressedSize
				}
				if meta.AccessCount != 0 {
					cachedTensor.Metadata.AccessCount = meta.AccessCount
				}
				if meta.LastAccessed.Unix() != 0 {
					cachedTensor.Metadata.LastAccessed = meta.LastAccessed
				}
				if meta.LegalContext != nil {
					cachedTensor.Metadata.LegalContext = meta.LegalContext
				}
			}
		} else {
			// Non-fatal: log metadata deserialization problems
			log.Printf("warning: failed to deserialize metadata for tensor %s: %v", key, jerr)
		}
	} else if metaErr != redis.Nil {
		// Non-fatal: log unexpected redis errors for metadata
		log.Printf("warning: redis meta get error for %s: %v", key, metaErr)
	}

	// Update last access time and counters (best-effort, non-blocking errors ignored)
	// Fixed: use updateRedisAccessStats which uses a pipeliner variable (no chained calls on StatusCmd)
	if err := tcm.updateRedisAccessStats(ctx, key); err != nil {
		log.Printf("warning: failed to update access stats for %s: %v", key, err)
	}

	// Ensure metadata fields reflect this access
	if cachedTensor.Metadata == nil {
		cachedTensor.Metadata = &TensorMetadata{Key: key}
	}
	cachedTensor.Metadata.LastAccessed = time.Now()
	cachedTensor.Metadata.AccessCount++

	return &cachedTensor, nil
}

// storeMetadataInPostgreSQL stores tensor metadata in PostgreSQL for persistent indexing
func (tcm *TensorCacheManager) storeMetadataInPostgreSQL(ctx context.Context, key string, metadata *TensorMetadata) error {
	query := `
		INSERT INTO tensor_cache_metadata (
			cache_key, shape, data_type, compression_type, cache_level,
			created_at, last_accessed, access_count, size, compressed_size,
			legal_context
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (cache_key) DO UPDATE SET
			last_accessed = $7,
			access_count = tensor_cache_metadata.access_count + 1,
			legal_context = $11
	`

	shapeJSON, _ := json.Marshal(metadata.Shape)
	legalContextJSON, _ := json.Marshal(metadata.LegalContext)

	_, err := tcm.pgPool.Exec(ctx, query,
		key,
		string(shapeJSON),
		metadata.DataType,
		metadata.CompressionType,
		metadata.CacheLevel,
		metadata.CreatedAt,
		metadata.LastAccessed,
		metadata.AccessCount,
		metadata.Size,
		metadata.CompressedSize,
		string(legalContextJSON),
	)

	return err
}

// retrieveFromPostgreSQL retrieves tensor from PostgreSQL (not typically used for data, only metadata)
func (tcm *TensorCacheManager) retrieveFromPostgreSQL(ctx context.Context, key string) (*CachedTensor, error) {
	// PostgreSQL typically only stores metadata, not tensor data
	// This is a fallback for when we might store small tensors in JSONB
	query := `
		SELECT legal_context, shape, data_type, compression_type,
			   created_at, last_accessed, access_count, size, compressed_size
		FROM tensor_cache_metadata
		WHERE cache_key = $1
	`

	var legalContextJSON, shapeJSON string
	var metadata TensorMetadata

	err := tcm.pgPool.QueryRow(ctx, query, key).Scan(
		&legalContextJSON,
		&shapeJSON,
		&metadata.DataType,
		&metadata.CompressionType,
		&metadata.CreatedAt,
		&metadata.LastAccessed,
		&metadata.AccessCount,
		&metadata.Size,
		&metadata.CompressedSize,
	)

	if err != nil {
		return nil, err
	}

	json.Unmarshal([]byte(legalContextJSON), &metadata.LegalContext)
	json.Unmarshal([]byte(shapeJSON), &metadata.Shape)

	metadata.Key = key
	metadata.CacheLevel = "postgresql"

	// For PostgreSQL retrieval, we return empty data since this is primarily metadata storage
	return &CachedTensor{
		Metadata: &metadata,
		Data:     []byte{}, // Would need to be reconstructed or fetched from external source
		Hash:     "",
	}, nil
}

// applyNeuralSpriteCompression applies Neural Sprite compression to tensor data
func (tcm *TensorCacheManager) applyNeuralSpriteCompression(data []byte, metadata *TensorMetadata) ([]byte, float64, error) {
	// Mock Neural Sprite compression - in production this would use the actual auto-encoder
	if len(data) < 1024 {
		return data, 1.0, nil // Skip compression for small tensors
	}

	// Simulate Neural Sprite compression ratios
	targetRatio := 50.0 // 50:1 compression ratio
	compressedSize := int(float64(len(data)) / targetRatio)

	// Create mock compressed data (in production, this would be actual compression)
	compressedData := make([]byte, compressedSize)
	copy(compressedData, data[:compressedSize])

	// Add Neural Sprite metadata headers
	header := fmt.Sprintf("NS%d:%s:", len(metadata.Shape), metadata.DataType)
	headerBytes := []byte(header)

	finalCompressed := make([]byte, len(headerBytes)+len(compressedData))
	copy(finalCompressed, headerBytes)
	copy(finalCompressed[len(headerBytes):], compressedData)

	actualRatio := float64(len(data)) / float64(len(finalCompressed))
	return finalCompressed, actualRatio, nil
}

// checkVRAMCache simulates checking VRAM cache (L1)
func (tcm *TensorCacheManager) checkVRAMCache(key string) *CachedTensor {
	// In production, this would check GPU VRAM using CUDA or OpenCL
	// For now, we simulate with a simple in-memory map
	// This is where hot tensors would be stored for immediate access
	return nil // Simulate cache miss for demonstration
}

// promoteToVRAM promotes tensor to VRAM cache
func (tcm *TensorCacheManager) promoteToVRAM(key string, tensor *CachedTensor) {
	// In production, this would copy tensor to GPU VRAM
	log.Printf("Promoting tensor %s to VRAM cache", key)
	tensor.Metadata.CacheLevel = "vram"
}

// promoteToRedis promotes tensor to Redis cache
func (tcm *TensorCacheManager) promoteToRedis(ctx context.Context, key string, tensor *CachedTensor) {
	serialized, err := json.Marshal(tensor)
	if err == nil {
		tcm.redisClient.Set(ctx, fmt.Sprintf("tensor:%s", key), serialized, 24*time.Hour)
		log.Printf("Promoted tensor %s to Redis cache", key)
	}
}

// SearchTensorsByLegalContext searches tensors by legal context metadata
func (tcm *TensorCacheManager) SearchTensorsByLegalContext(ctx context.Context, contextType string, contextValue interface{}) ([]string, error) {
	var keys []string

	switch contextType {
	case "case_id":
		members, err := tcm.redisClient.SMembers(ctx, fmt.Sprintf("legal:case:%v", contextValue)).Result()
		if err != nil {
			return nil, err
		}
		keys = members

	case "document_type":
		members, err := tcm.redisClient.SMembers(ctx, fmt.Sprintf("legal:doc_type:%v", contextValue)).Result()
		if err != nil {
			return nil, err
		}
		keys = members

	default:
		// Fallback to PostgreSQL search
		query := `
			SELECT cache_key FROM tensor_cache_metadata
			WHERE legal_context ->> $1 = $2
			ORDER BY last_accessed DESC
			LIMIT 100
		`

		rows, err := tcm.pgPool.Query(ctx, query, contextType, fmt.Sprintf("%v", contextValue))
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		for rows.Next() {
			var key string
			if err := rows.Scan(&key); err == nil {
				keys = append(keys, key)
			}
		}
	}

	return keys, nil
}

// GetCacheStats returns current cache performance statistics
func (tcm *TensorCacheManager) GetCacheStats() *CacheStats {
	return &CacheStats{
		Hits:             tcm.stats.Hits,
		Misses:           tcm.stats.Misses,
		VRAMHits:         tcm.stats.VRAMHits,
		RedisHits:        tcm.stats.RedisHits,
		PostgreSQLHits:   tcm.stats.PostgreSQLHits,
		CompressionRatio: tcm.stats.CompressionRatio,
		AvgLatency:       tcm.stats.AvgLatency,
	}
}

// EvictLeastRecentlyUsed evicts least recently used tensors to free cache space
func (tcm *TensorCacheManager) EvictLeastRecentlyUsed(ctx context.Context, maxAge time.Duration) error {
	cutoffTime := time.Now().Add(-maxAge)

	// Find old tensor keys
	pattern := "tensor:last_access:*"
	keys, err := tcm.redisClient.Keys(ctx, pattern).Result()
	if err != nil {
		return err
	}

	var keysToEvict []string
	// map to preserve last access string for logging during eviction
	lastAccessMap := make(map[string]string, len(keys))

	for _, key := range keys {
		lastAccessStr, err := tcm.redisClient.Get(ctx, key).Result()
		if err != nil {
			continue
		}

		lastAccess, err := strconv.ParseInt(lastAccessStr, 10, 64)
		if err != nil {
			continue
		}

		if time.Unix(lastAccess, 0).Before(cutoffTime) {
			tensorKey := strings.TrimPrefix(key, "tensor:last_access:")
			keysToEvict = append(keysToEvict, tensorKey)
			lastAccessMap[tensorKey] = lastAccessStr
		}
	}

	// Evict old tensors
	for _, tensorKey := range keysToEvict {
		pipe := tcm.redisClient.Pipeline()
		pipe.Del(ctx, fmt.Sprintf("tensor:%s", tensorKey))
		pipe.Del(ctx, fmt.Sprintf("tensor:meta:%s", tensorKey))
		pipe.Del(ctx, fmt.Sprintf("tensor:access:%s", tensorKey))
		pipe.Del(ctx, fmt.Sprintf("tensor:last_access:%s", tensorKey))

		_, err := pipe.Exec(ctx)
		if err != nil {
			log.Printf("Failed to evict tensor %s: %v", tensorKey, err)
		} else {
			lastAccessStr := lastAccessMap[tensorKey]
			log.Printf("Evicted tensor %s (last accessed: %s)", tensorKey, lastAccessStr)
		}
	}

	return nil
}

// calculateHash generates a hash for tensor data integrity
func (tcm *TensorCacheManager) calculateHash(data []byte) string {
	// Simple hash for demonstration - in production use SHA-256
	if len(data) == 0 {
		return "hash_0_0"
	}
	return fmt.Sprintf("hash_%d_%d", len(data), data[0])
}

// updateLatencyStats updates average latency statistics
func (tcm *TensorCacheManager) updateLatencyStats(latency time.Duration) {
	// Simple moving average
	tcm.stats.AvgLatency = (tcm.stats.AvgLatency + latency) / 2
}

// CreateTensorCacheTable creates the PostgreSQL table for tensor metadata
func (tcm *TensorCacheManager) CreateTensorCacheTable(ctx context.Context) error {
	query := `
		CREATE TABLE IF NOT EXISTS tensor_cache_metadata (
			id SERIAL PRIMARY KEY,
			cache_key VARCHAR(255) UNIQUE NOT NULL,
			shape TEXT NOT NULL,
			data_type VARCHAR(50) NOT NULL,
			compression_type VARCHAR(50) DEFAULT 'none',
			cache_level VARCHAR(20) DEFAULT 'redis',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
			last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
			access_count BIGINT DEFAULT 0,
			size BIGINT DEFAULT 0,
			compressed_size BIGINT DEFAULT 0,
			legal_context JSONB DEFAULT '{}',

			-- Indexes for fast queries
			CONSTRAINT valid_cache_level CHECK (cache_level IN ('vram', 'redis', 'postgresql'))
		);

		-- Create indexes for optimal performance
		CREATE INDEX IF NOT EXISTS idx_tensor_cache_key ON tensor_cache_metadata (cache_key);
		CREATE INDEX IF NOT EXISTS idx_tensor_last_accessed ON tensor_cache_metadata (last_accessed DESC);
		CREATE INDEX IF NOT EXISTS idx_tensor_legal_context ON tensor_cache_metadata USING GIN (legal_context);
		CREATE INDEX IF NOT EXISTS idx_tensor_access_count ON tensor_cache_metadata (access_count DESC);
	`

	_, err := tcm.pgPool.Exec(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to create tensor cache table: %v", err)
	}

	log.Println("Tensor cache metadata table created successfully")
	return nil
}

// updateRedisAccessStats updates Redis access counters using a proper pipeliner (no chaining)
func (tcm *TensorCacheManager) updateRedisAccessStats(ctx context.Context, key string) error {
	if tcm.redisClient == nil {
		return fmt.Errorf("redis client is nil")
	}

	pipe := tcm.redisClient.Pipeline()
	// Note: call methods on the pipe object instead of chaining on the returned Command
	pipe.Set(ctx, fmt.Sprintf("tensor:last_access:%s", key), strconv.FormatInt(time.Now().Unix(), 10), 7*24*time.Hour)
	pipe.Incr(ctx, fmt.Sprintf("tensor:access:%s", key))

	_, err := pipe.Exec(ctx)
	return err
}