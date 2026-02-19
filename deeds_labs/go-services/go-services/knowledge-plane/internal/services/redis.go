package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/config"
)

type RedisService struct {
	client *redis.Client
	cfg    *config.Config
}

func NewRedisService(ctx context.Context, cfg *config.Config) (*RedisService, error) {
	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Redis URL: %w", err)
	}

	client := redis.NewClient(opts)

	// Test connection
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to ping Redis: %w", err)
	}

	return &RedisService{
		client: client,
		cfg:    cfg,
	}, nil
}

func (s *RedisService) Close() error {
	return s.client.Close()
}

// Ping checks Redis connectivity
func (s *RedisService) Ping(ctx context.Context) error {
	return s.client.Ping(ctx).Err()
}

// CacheKey generates a SHA256 hash key for caching
func (s *RedisService) CacheKey(prefix, data string) string {
	hash := sha256.Sum256([]byte(data))
	return fmt.Sprintf("%s:%s", prefix, hex.EncodeToString(hash[:]))
}

// GetEmbedding retrieves a cached embedding vector
func (s *RedisService) GetEmbedding(ctx context.Context, text string) ([]float32, bool, error) {
	key := s.CacheKey("emb", text)

	val, err := s.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return nil, false, nil // Cache miss
	}
	if err != nil {
		return nil, false, err
	}

	var embedding []float32
	if err := json.Unmarshal([]byte(val), &embedding); err != nil {
		return nil, false, err
	}

	return embedding, true, nil
}

// SetEmbedding caches an embedding vector with TTL
func (s *RedisService) SetEmbedding(ctx context.Context, text string, embedding []float32) error {
	key := s.CacheKey("emb", text)

	data, err := json.Marshal(embedding)
	if err != nil {
		return err
	}

	ttl := time.Duration(s.cfg.CacheEmbeddingTTL) * time.Second
	return s.client.Set(ctx, key, data, ttl).Err()
}

// GetRetrieval retrieves cached retrieval results
func (s *RedisService) GetRetrieval(ctx context.Context, queryKey string) (interface{}, bool, error) {
	key := s.CacheKey("ret", queryKey)

	val, err := s.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}

	var result interface{}
	if err := json.Unmarshal([]byte(val), &result); err != nil {
		return nil, false, err
	}

	return result, true, nil
}

// SetRetrieval caches retrieval results
func (s *RedisService) SetRetrieval(ctx context.Context, queryKey string, result interface{}) error {
	key := s.CacheKey("ret", queryKey)

	data, err := json.Marshal(result)
	if err != nil {
		return err
	}

	ttl := time.Duration(s.cfg.CacheRetrievalTTL) * time.Second
	return s.client.Set(ctx, key, data, ttl).Err()
}

// GetContext retrieves cached prompt context
func (s *RedisService) GetContext(ctx context.Context, errorID int) (interface{}, bool, error) {
	key := fmt.Sprintf("ctx:%d", errorID)

	val, err := s.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}

	var result interface{}
	if err := json.Unmarshal([]byte(val), &result); err != nil {
		return nil, false, err
	}

	return result, true, nil
}

// SetContext caches prompt context
func (s *RedisService) SetContext(ctx context.Context, errorID int, context interface{}) error {
	key := fmt.Sprintf("ctx:%d", errorID)

	data, err := json.Marshal(context)
	if err != nil {
		return err
	}

	ttl := time.Duration(s.cfg.CacheContextTTL) * time.Second
	return s.client.Set(ctx, key, data, ttl).Err()
}

// SetRunStatus tracks autonomous loop run status
func (s *RedisService) SetRunStatus(ctx context.Context, runID, status string) error {
	key := fmt.Sprintf("run:%s:status", runID)
	return s.client.Set(ctx, key, status, 2*time.Hour).Err()
}

// GetRunStatus retrieves run status
func (s *RedisService) GetRunStatus(ctx context.Context, runID string) (string, error) {
	key := fmt.Sprintf("run:%s:status", runID)
	return s.client.Get(ctx, key).Result()
}

// IncrCacheHits increments cache hit counter (for metrics)
func (s *RedisService) IncrCacheHits(ctx context.Context) error {
	return s.client.Incr(ctx, "metrics:cache_hits").Err()
}

// IncrCacheMisses increments cache miss counter
func (s *RedisService) IncrCacheMisses(ctx context.Context) error {
	return s.client.Incr(ctx, "metrics:cache_misses").Err()
}

// GetCacheStats returns cache hit/miss metrics
func (s *RedisService) GetCacheStats(ctx context.Context) (hits, misses int64, err error) {
	pipe := s.client.Pipeline()
	hitsCmd := pipe.Get(ctx, "metrics:cache_hits")
	missesCmd := pipe.Get(ctx, "metrics:cache_misses")

	_, err = pipe.Exec(ctx)
	if err != nil && err != redis.Nil {
		return 0, 0, err
	}

	hits, _ = hitsCmd.Int64()
	misses, _ = missesCmd.Int64()
	return hits, misses, nil
}
