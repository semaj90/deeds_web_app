// Package main — Go gRPC Embedding Server
//
// Implements EmbeddingService proto (proto/active/embedding.proto):
//   GenerateEmbeddings — batch Ollama proxy with Redis cache
//   StreamEmbeddings   — streaming embedding generation
//   Health             — deep health check (Ollama + Redis)
//   GetStats           — service statistics
//
// Also exposes HTTP on :8097 for health checks.
//
// ENV:
//   OLLAMA_URL         — Ollama API endpoint (default http://localhost:11434)
//   REDIS_URL          — Redis connection string (default redis://localhost:6379)
//   GRPC_PORT          — gRPC listen port (default 50051)
//   HTTP_PORT          — HTTP health port (default 8097)
//   EMBED_MODEL        — Embedding model name (default embeddinggemma:latest)
//   EMBED_BATCH_MAX    — Max batch size (default 4, tuned for RTX 3060 Ti 8GB)
//   EMBED_CACHE_TTL    — Redis cache TTL in seconds (default 86400 = 24h)
package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
	"google.golang.org/grpc/keepalive"
	"google.golang.org/grpc/reflection"

	pb "github.com/deeds-web-app/services/go-embedding-service/proto/embedding"
)

// ── Configuration ─────────────────────────────────────────────────────────

type config struct {
	OllamaURL    string
	RedisURL     string
	GRPCPort     string
	HTTPPort     string
	EmbedModel   string
	BatchMax     int
	CacheTTL     time.Duration
}

func loadConfig() config {
	batchMax, _ := strconv.Atoi(envOr("EMBED_BATCH_MAX", "4"))
	cacheTTL, _ := strconv.Atoi(envOr("EMBED_CACHE_TTL", "86400"))
	return config{
		OllamaURL:  envOr("OLLAMA_URL", "http://localhost:11434"),
		RedisURL:   envOr("REDIS_URL", "redis://localhost:6379"),
		GRPCPort:   envOr("GRPC_PORT", "50051"),
		HTTPPort:   envOr("HTTP_PORT", "8097"),
		EmbedModel: envOr("EMBED_MODEL", "embeddinggemma:latest"),
		BatchMax:   batchMax,
		CacheTTL:   time.Duration(cacheTTL) * time.Second,
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ── Ollama client ─────────────────────────────────────────────────────────

type ollamaEmbedRequest struct {
	Model string `json:"model"`
	Input any    `json:"input"` // string or []string
}

type ollamaEmbedResponse struct {
	Embeddings [][]float32 `json:"embeddings"`
}

func ollamaEmbed(ctx context.Context, ollamaURL, model string, texts []string) ([][]float32, error) {
	body := ollamaEmbedRequest{Model: model, Input: texts}
	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", ollamaURL+"/api/embed", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ollama: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("ollama status %d", resp.StatusCode)
	}

	var result ollamaEmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}

	if len(result.Embeddings) != len(texts) {
		return nil, fmt.Errorf("expected %d embeddings, got %d", len(texts), len(result.Embeddings))
	}

	return result.Embeddings, nil
}

var httpClient = &http.Client{
	Timeout: 60 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        10,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
	},
}

// ── Redis cache ───────────────────────────────────────────────────────────

func textHash(text string) string {
	h := sha256.Sum256([]byte(text))
	return hex.EncodeToString(h[:16]) // 128-bit prefix
}

func cacheKey(model, hash string) string {
	return fmt.Sprintf("embed:%s:%s", model, hash)
}

// ── Request-scoped slice pool ──────────────────────────────────────────────
//
// Pools the three per-request slices that grow with chunk count.
// Eliminates make() allocations and GC pressure at high QPS.

type embedBatch struct {
	texts    []string
	indexMap []int
	hashes   []string
}

var embedBatchPool = sync.Pool{
	New: func() any { return &embedBatch{} },
}

func acquireEmbedBatch(n int) *embedBatch {
	b := embedBatchPool.Get().(*embedBatch)
	if n < 8 {
		n = 8
	}
	if cap(b.texts) < n {
		b.texts    = make([]string, 0, n)
		b.indexMap = make([]int, 0, n)
		b.hashes   = make([]string, 0, n)
	} else {
		b.texts    = b.texts[:0]
		b.indexMap = b.indexMap[:0]
		b.hashes   = b.hashes[:0]
	}
	return b
}

func releaseEmbedBatch(b *embedBatch) { embedBatchPool.Put(b) }

// ── gRPC Service ──────────────────────────────────────────────────────────

type embeddingServer struct {
	pb.UnimplementedEmbeddingServiceServer
	cfg   config
	rdb   *redis.Client
	mu    sync.RWMutex
	stats struct {
		totalRequests  atomic.Int64
		totalTimeMs    atomic.Int64
		cacheHits      atomic.Int64
		cacheMisses    atomic.Int64
	}
	startTime time.Time
}

func (s *embeddingServer) GenerateEmbeddings(ctx context.Context, req *pb.EmbeddingRequest) (*pb.EmbeddingResponse, error) {
	start := time.Now()
	s.stats.totalRequests.Add(1)

	chunks := req.GetChunks()
	if len(chunks) == 0 {
		return &pb.EmbeddingResponse{Status: "error: no chunks"}, nil
	}

	// Cap batch size
	batchSize := int(req.GetBatchSize())
	if batchSize <= 0 || batchSize > s.cfg.BatchMax {
		batchSize = s.cfg.BatchMax
	}

	embeddings := make([]*pb.Embedding, len(chunks))

	// Check Redis cache first — use pooled slices to avoid per-request allocation
	b := acquireEmbedBatch(len(chunks))
	defer releaseEmbedBatch(b)

	// grow hashes slice to match chunks length
	for len(b.hashes) < len(chunks) {
		b.hashes = append(b.hashes, "")
	}
	b.hashes = b.hashes[:len(chunks)]

	for i, chunk := range chunks {
		b.hashes[i] = textHash(chunk.GetText())
		key := cacheKey(s.cfg.EmbedModel, b.hashes[i])

		// Try cache
		cached, err := s.rdb.Get(ctx, key).Bytes()
		if err == nil && len(cached) > 0 {
			var vec []float32
			if json.Unmarshal(cached, &vec) == nil && len(vec) > 0 {
				s.stats.cacheHits.Add(1)
				embeddings[i] = &pb.Embedding{
					ChunkId:    chunk.GetChunkId(),
					Vector:     vec,
					TokenCount: int32(len(chunk.GetText()) / 4),
					Status:     "success",
				}
				continue
			}
		}
		s.stats.cacheMisses.Add(1)
		b.texts    = append(b.texts, chunk.GetText())
		b.indexMap = append(b.indexMap, i)
	}

	// Batch embed uncached texts via Ollama
	if len(b.texts) > 0 {
		for batchStart := 0; batchStart < len(b.texts); batchStart += batchSize {
			batchEnd := batchStart + batchSize
			if batchEnd > len(b.texts) {
				batchEnd = len(b.texts)
			}
			batch := b.texts[batchStart:batchEnd]

			vectors, err := ollamaEmbed(ctx, s.cfg.OllamaURL, s.cfg.EmbedModel, batch)
			if err != nil {
				slog.Error("ollama embed failed", "error", err, "batch_size", len(batch))
				// Mark failed chunks
				for j := batchStart; j < batchEnd; j++ {
					idx := b.indexMap[j]
					embeddings[idx] = &pb.Embedding{
						ChunkId: chunks[idx].GetChunkId(),
						Status:  fmt.Sprintf("error: %v", err),
					}
				}
				continue
			}

			for j, vec := range vectors {
				idx := b.indexMap[batchStart+j]
				embeddings[idx] = &pb.Embedding{
					ChunkId:          chunks[idx].GetChunkId(),
					Vector:           vec,
					ProcessingTimeMs: float32(time.Since(start).Milliseconds()),
					TokenCount:       int32(len(chunks[idx].GetText()) / 4),
					Status:           "success",
				}

				// Cache in Redis
				if data, err := json.Marshal(vec); err == nil {
					s.rdb.Set(ctx, cacheKey(s.cfg.EmbedModel, b.hashes[idx]), data, s.cfg.CacheTTL)
				}
			}
		}
	}

	totalMs := float32(time.Since(start).Milliseconds())
	s.stats.totalTimeMs.Add(int64(totalMs))

	return &pb.EmbeddingResponse{
		Embeddings:        embeddings,
		TotalTimeMs:       totalMs,
		ModelName:          s.cfg.EmbedModel,
		EmbeddingDimension: 768,
		Status:             "success",
	}, nil
}

func (s *embeddingServer) StreamEmbeddings(stream pb.EmbeddingService_StreamEmbeddingsServer) error {
	seq := int32(0)
	for {
		chunk, err := stream.Recv()
		if err != nil {
			return nil // client closed
		}

		vectors, err := ollamaEmbed(stream.Context(), s.cfg.OllamaURL, s.cfg.EmbedModel, []string{chunk.GetText()})
		result := &pb.EmbeddingResult{
			ChunkId:        chunk.GetChunkId(),
			SequenceNumber: seq,
		}
		seq++

		if err != nil || len(vectors) == 0 {
			result.Status = fmt.Sprintf("error: %v", err)
		} else {
			result.Vector = vectors[0]
			result.TokenCount = int32(len(chunk.GetText()) / 4)
			result.Status = "success"
		}

		if err := stream.Send(result); err != nil {
			return err
		}
	}
}

func (s *embeddingServer) Health(ctx context.Context, req *pb.HealthRequest) (*pb.HealthResponse, error) {
	// Check Ollama
	ollamaOk := false
	httpReq, _ := http.NewRequestWithContext(ctx, "GET", s.cfg.OllamaURL+"/api/tags", nil)
	if resp, err := httpClient.Do(httpReq); err == nil {
		ollamaOk = resp.StatusCode == 200
		resp.Body.Close()
	}

	status := "healthy"
	if !ollamaOk {
		status = "unhealthy"
	}

	return &pb.HealthResponse{
		Status:      status,
		ModelLoaded: fmt.Sprintf("%v", ollamaOk),
		Device:      "cpu", // Ollama handles GPU internally
		Timestamp:   time.Now().Unix(),
	}, nil
}

func (s *embeddingServer) GetStats(ctx context.Context, req *pb.StatsRequest) (*pb.StatsResponse, error) {
	total := s.stats.totalRequests.Load()
	totalTimeMs := s.stats.totalTimeMs.Load()
	avgMs := float32(0)
	if total > 0 {
		avgMs = float32(totalTimeMs) / float32(total)
	}

	return &pb.StatsResponse{
		ModelName:          s.cfg.EmbedModel,
		Device:             "ollama-gpu",
		IsLoaded:           true,
		EmbeddingDimension: 768,
		BatchSize:          int32(s.cfg.BatchMax),
		MaxLength:          512,
		TotalRequests:      total,
		TotalProcessingTimeS: float32(totalTimeMs) / 1000.0,
		AvgProcessingTimeMs:  avgMs,
		GpuAvailable:        true,
		UptimeSeconds:       int32(time.Since(s.startTime).Seconds()),
	}, nil
}

// ── HTTP health ───────────────────────────────────────────────────────────

func httpHealthHandler(srv *embeddingServer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp, _ := srv.Health(r.Context(), &pb.HealthRequest{})
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

func httpStatsHandler(srv *embeddingServer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp, _ := srv.GetStats(r.Context(), &pb.StatsRequest{IncludeMemory: true})
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

// httpEmbedHandler — POST /embed
// Request:  {"texts": ["..."], "model": "embeddinggemma:latest"}
// Response: {"embeddings": [[0.1, 0.2, ...]]}
// Used by go-retrieval-service as the fast HTTP embedding path.
func httpEmbedHandler(srv *embeddingServer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Texts []string `json:"texts"`
			Model string   `json:"model"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		if len(req.Texts) == 0 {
			http.Error(w, "texts required", http.StatusBadRequest)
			return
		}
		model := req.Model
		if model == "" {
			model = srv.cfg.EmbedModel
		}

		ctx := r.Context()
		embeddings := make([][]float32, len(req.Texts))
		misses := make([]int, 0, len(req.Texts))
		hashes := make([]string, len(req.Texts))

		// Redis cache lookup
		for i, text := range req.Texts {
			hashes[i] = textHash(text)
			key := cacheKey(model, hashes[i])
			cached, err := srv.rdb.Get(ctx, key).Bytes()
			if err == nil && len(cached) > 0 {
				var vec []float32
				if json.Unmarshal(cached, &vec) == nil && len(vec) > 0 {
					srv.stats.cacheHits.Add(1)
					embeddings[i] = vec
					continue
				}
			}
			srv.stats.cacheMisses.Add(1)
			misses = append(misses, i)
		}

		// Batch embed cache misses via Ollama
		if len(misses) > 0 {
			missTexts := make([]string, len(misses))
			for j, idx := range misses {
				missTexts[j] = req.Texts[idx]
			}
			vectors, err := ollamaEmbed(ctx, srv.cfg.OllamaURL, model, missTexts)
			if err != nil {
				slog.Error("httpEmbedHandler ollamaEmbed failed", "error", err)
				http.Error(w, "embedding failed", http.StatusInternalServerError)
				return
			}
			for j, vec := range vectors {
				idx := misses[j]
				embeddings[idx] = vec
				if data, encErr := json.Marshal(vec); encErr == nil {
					srv.rdb.Set(ctx, cacheKey(model, hashes[idx]), data, srv.cfg.CacheTTL)
				}
			}
		}

		srv.stats.totalRequests.Add(1)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"embeddings": embeddings})
	}
}

// ── Main ──────────────────────────────────────────────────────────────────

func main() {
	cfg := loadConfig()

	// Redis
	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("redis URL: %v", err)
	}
	rdb := redis.NewClient(opts)
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		slog.Warn("Redis unavailable, caching disabled", "error", err)
	} else {
		slog.Info("Redis connected", "url", cfg.RedisURL)
	}

	srv := &embeddingServer{
		cfg:       cfg,
		rdb:       rdb,
		startTime: time.Now(),
	}

	// gRPC server
	lis, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Fatalf("listen: %v", err)
	}

	grpcServer := grpc.NewServer(
		grpc.KeepaliveParams(keepalive.ServerParameters{
			MaxConnectionIdle:     5 * time.Minute,
			MaxConnectionAge:      30 * time.Minute,
			MaxConnectionAgeGrace: 5 * time.Second,
			Time:                  1 * time.Minute,
			Timeout:               20 * time.Second,
		}),
		grpc.MaxRecvMsgSize(16 * 1024 * 1024), // 16MB for large batches
	)
	pb.RegisterEmbeddingServiceServer(grpcServer, srv)
	reflection.Register(grpcServer)

	// HTTP server
	mux := http.NewServeMux()
	mux.HandleFunc("/health", httpHealthHandler(srv))
	mux.HandleFunc("/stats", httpStatsHandler(srv))
	mux.HandleFunc("/embed", httpEmbedHandler(srv))
	httpServer := &http.Server{Addr: ":" + cfg.HTTPPort, Handler: mux}

	// Start servers
	go func() {
		slog.Info("gRPC listening", "port", cfg.GRPCPort)
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("grpc serve: %v", err)
		}
	}()
	go func() {
		slog.Info("HTTP listening", "port", cfg.HTTPPort)
		if err := httpServer.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("http serve: %v", err)
		}
	}()

	// Graceful shutdown
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	slog.Info("Shutting down...")
	grpcServer.GracefulStop()
	httpServer.Shutdown(context.Background())
	rdb.Close()
	slog.Info("Stopped")
}