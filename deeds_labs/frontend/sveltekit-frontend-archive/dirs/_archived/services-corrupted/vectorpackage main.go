package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"time"

	// NOTE: use the maintained import path for go-redis v9
	"github.com/redis/go-redis/v9"
)

type server struct {
	rdb *redis.Client
}

// Minimal JSON payload types (mirror original proto shapes)
type EmbedLookupRequest struct {
	Embedding []float32 `json:"embedding"`
}

type CacheEntry struct {
	Key        string  `json:"key"`
	ValueJson  string  `json:"valueJson"`
	Similarity float32 `json:"similarity"`
}

type EmbedLookupResponse struct {
	Hit   bool        `json:"hit"`
	Entry *CacheEntry `json:"entry,omitempty"`
}

type EmbedStoreRequest struct {
	Embedding  []float32 `json:"embedding"`
	ValueJson  string    `json:"valueJson"`
	TtlSeconds int32     `json:"ttlSeconds"`
}

type EmbedStoreResponse struct {
	Success bool   `json:"success"`
	Key     string `json:"key,omitempty"`
}

// hashEmbedding generates a deterministic hash for an embedding vector.
// It quantizes floats to 3 decimal places for stable hashing across systems.
func hashEmbedding(vec []float32) string {
	buf := make([]byte, len(vec)*4)
	for i, f := range vec {
		// Quantize to 3 decimal places for stable hashing, then convert to int32 bits
		bits := int32(f * 1000)
		buf[i*4+0] = byte(bits)
		buf[i*4+1] = byte(bits >> 8)
		buf[i*4+2] = byte(bits >> 16)
		buf[i*4+3] = byte(bits >> 24)
	}
	sum := sha256.Sum256(buf)
	// Use first 16 bytes of hash for a shorter, yet sufficiently unique key
	return "semantic_cache:" + base64.RawURLEncoding.EncodeToString(sum[:16])
}

// LookupHandler handles HTTP JSON requests to find an embedding in the cache.
func (s *server) LookupHandler(w http.ResponseWriter, r *http.Request) {
	var req EmbedLookupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	key := hashEmbedding(req.Embedding)
	ctx := r.Context()
	val, err := s.rdb.Get(ctx, key).Result()
	if err == redis.Nil {
		_ = json.NewEncoder(w).Encode(EmbedLookupResponse{Hit: false})
		return
	} else if err != nil {
		log.Printf("Redis GET error for key %s: %v", key, err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	resp := EmbedLookupResponse{
		Hit: true,
		Entry: &CacheEntry{
			Key:       key,
			ValueJson: val,
			Similarity: 1.0, // exact hash match
		},
	}
	_ = json.NewEncoder(w).Encode(resp)
}

// StoreHandler handles HTTP JSON requests to store an embedding and its response in the cache.
func (s *server) StoreHandler(w http.ResponseWriter, r *http.Request) {
	var req EmbedStoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	key := hashEmbedding(req.Embedding)
	ttl := time.Duration(req.TtlSeconds) * time.Second
	ctx := r.Context()
	if err := s.rdb.Set(ctx, key, req.ValueJson, ttl).Err(); err != nil {
		log.Printf("Redis SET error for key %s: %v", key, err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	log.Printf("Stored semantic cache entry for key: %s with TTL: %v", key, ttl)
	_ = json.NewEncoder(w).Encode(EmbedStoreResponse{Success: true, Key: key})
}

func main() {
	// Listen on same port used before
	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}
	_ = lis.Close() // close the net.Listener we only used to validate port availability

	// Prefer environment-configured Redis address, fall back to service name for Docker
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		// Common fallback env that may be present; keep it simple
		redisAddr = os.Getenv("REDIS_URL")
	}
	if redisAddr == "" {
		redisAddr = "redis:6379"
	}

	rdb := redis.NewClient(&redis.Options{Addr: redisAddr})
	// Ping Redis to ensure connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err = rdb.Ping(ctx).Result()
	if err != nil {
		log.Fatalf("Failed to connect to Redis (%s): %v", redisAddr, err)
	}
	log.Println("✅ Connected to Redis at", redisAddr)

	srv := &server{rdb: rdb}
	http.HandleFunc("/lookup", srv.LookupHandler)
	http.HandleFunc("/store", srv.StoreHandler)

	log.Println("🧩 VectorCache HTTP Server running on :50051 (endpoints: POST /lookup, POST /store)")
	if err := http.ListenAndServe(":50051", nil); err != nil {
		log.Fatalf("Failed to serve HTTP: %v", err)
	}
}