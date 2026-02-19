package cache

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sync"
	"time"

	redis "github.com/redis/go-redis/v9"
)

// Cache defines the minimal contract used by the GPU microservice to cache prompts and results.
type Cache interface {
	Get(ctx context.Context, key string) ([]byte, bool, error)
	Set(ctx context.Context, key string, value []byte, ttl time.Duration) error
	Delete(ctx context.Context, key string) error
	Close() error
}

// KeyHash returns a stable cache key for any string input (e.g., prompts + model + params).
func KeyHash(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

// ----------------------------- In-Memory TTL Cache -----------------------------

type memEntry struct {
	value     []byte
	expiresAt time.Time
}

// InMemoryCache is a fast, process-local TTL cache used as a fallback or hot cache.
type InMemoryCache struct {
	mu      sync.RWMutex
	items   map[string]memEntry
	stopCh  chan struct{}
	stopped bool
}

// NewInMemory creates a new in-memory cache with a background janitor.
func NewInMemory() *InMemoryCache {
	c := &InMemoryCache{
		items:  make(map[string]memEntry, 1024),
		stopCh: make(chan struct{}),
	}
	go c.janitor(15 * time.Second)
	return c
}

func (c *InMemoryCache) Get(_ context.Context, key string) ([]byte, bool, error) {
	c.mu.RLock()
	e, ok := c.items[key]
	c.mu.RUnlock()
	if !ok {
		return nil, false, nil
	}
	if !e.expiresAt.IsZero() && time.Now().After(e.expiresAt) {
		// lazy expiry
		c.Delete(context.Background(), key)
		return nil, false, nil
	}
	return e.value, true, nil
}

func (c *InMemoryCache) Set(_ context.Context, key string, value []byte, ttl time.Duration) error {
	var exp time.Time
	if ttl > 0 {
		exp = time.Now().Add(ttl)
	}
	c.mu.Lock()
	c.items[key] = memEntry{value: append([]byte(nil), value...), expiresAt: exp}
	c.mu.Unlock()
	return nil
}

func (c *InMemoryCache) Delete(_ context.Context, key string) error {
	c.mu.Lock()
	delete(c.items, key)
	c.mu.Unlock()
	return nil
}

func (c *InMemoryCache) Close() error {
	if c.stopped {
		return nil
	}
	close(c.stopCh)
	c.stopped = true
	return nil
}

func (c *InMemoryCache) janitor(every time.Duration) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			now := time.Now()
			c.mu.Lock()
			for k, v := range c.items {
				if !v.expiresAt.IsZero() && now.After(v.expiresAt) {
					delete(c.items, k)
				}
			}
			c.mu.Unlock()
		case <-c.stopCh:
			return
		}
	}
}

// ----------------------------- Redis Cache -----------------------------

type RedisCache struct {
	client *redis.Client
}

// NewRedis creates a Redis-backed cache using a standard URL (e.g. redis://localhost:4005/0).
func NewRedis(url string) (*RedisCache, error) {
	opt, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}
	cli := redis.NewClient(opt)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if _, err := cli.Ping(ctx).Result(); err != nil {
		return nil, err
	}
	return &RedisCache{client: cli}, nil
}

func (r *RedisCache) Get(ctx context.Context, key string) ([]byte, bool, error) {
	res, err := r.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return res, true, nil
}

func (r *RedisCache) Set(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	return r.client.Set(ctx, key, value, ttl).Err()
}

func (r *RedisCache) Delete(ctx context.Context, key string) error {
	return r.client.Del(ctx, key).Err()
}

func (r *RedisCache) Close() error {
	if r.client == nil {
		return nil
	}
	return r.client.Close()
}

// ----------------------------- SWR Helpers -----------------------------

// GetOrCompute returns the cached value or computes it with fn and caches the result.
func GetOrCompute(ctx context.Context, c Cache, key string, ttl time.Duration, fn func() ([]byte, error)) ([]byte, error) {
	if c == nil {
		return nil, errors.New("cache is nil")
	}
	if v, ok, _ := c.Get(ctx, key); ok {
		return v, nil
	}
	v, err := fn()
	if err != nil {
		return nil, err
	}
	_ = c.Set(ctx, key, v, ttl) // best effort
	return v, nil
}

// ----------------------------- Adapter for PyTorchStyleCache -----------------------------

// MultiLevelAdapter wraps a PyTorchStyleCache to satisfy the byte-oriented Cache interface.
type MultiLevelAdapter struct{ C *PyTorchStyleCache }

func (a *MultiLevelAdapter) Get(ctx context.Context, key string) ([]byte, bool, error) {
	if a == nil || a.C == nil {
		return nil, false, errors.New("adapter not initialized")
	}
	v, ok := a.C.Get(ctx, key)
	if !ok {
		return nil, false, nil
	}
	switch t := v.(type) {
	case []byte:
		return t, true, nil
	case string:
		return []byte(t), true, nil
	default:
		b, err := json.Marshal(t)
		if err != nil {
			return nil, false, err
		}
		return b, true, nil
	}
}

func (a *MultiLevelAdapter) Set(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	if a == nil || a.C == nil {
		return errors.New("adapter not initialized")
	}
	return a.C.Set(ctx, key, value, ttl)
}

func (a *MultiLevelAdapter) Delete(ctx context.Context, key string) error {
	if a == nil || a.C == nil {
		return errors.New("adapter not initialized")
	}
	return a.C.Delete(ctx, key)
}

func (a *MultiLevelAdapter) Close() error { return nil }
