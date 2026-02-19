package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/config"
	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/handlers"
	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/services"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("❌ Failed to load config: %v", err)
	}

	fmt.Println("\n" + "=" + "==========================================================================")
	fmt.Println("🧠 Knowledge Plane Service - Phase 87")
	fmt.Println("============================================================================")
	fmt.Println("")
	fmt.Println("🔧 Configuration:")
	fmt.Printf("   Port: %d\n", cfg.Port)
	fmt.Printf("   Database: %s\n", maskPassword(cfg.DatabaseURL))
	fmt.Printf("   Qdrant: %s (collection: %s)\n", cfg.QdrantURL, cfg.QdrantCollection)
	fmt.Printf("   Redis: %s\n", cfg.RedisURL)
	fmt.Printf("   Ollama: %s\n", cfg.OllamaURL)
	fmt.Printf("   Embed Model: %s\n", cfg.OllamaEmbedModel)
	fmt.Println("")
	fmt.Println("📊 Cache TTLs:")
	fmt.Printf("   Embeddings: %ds (7 days)\n", cfg.CacheEmbeddingTTL)
	fmt.Printf("   Retrieval: %ds (1 hour)\n", cfg.CacheRetrievalTTL)
	fmt.Printf("   Context: %ds (30-120 min)\n", cfg.CacheContextTTL)
	fmt.Println("")
	fmt.Println("🎯 Performance:")
	fmt.Printf("   RAG Top-K: %d\n", cfg.RAGTopK)
	fmt.Printf("   Hybrid Weights: pgvector=%.2f, qdrant=%.2f\n", cfg.HybridWeightPG, cfg.HybridWeightQdrant)
	fmt.Println("============================================================================")
	fmt.Println("")

	// Initialize services
	ctx := context.Background()

	pgService, err := services.NewPostgresService(ctx, cfg)
	if err != nil {
		log.Fatalf("❌ Failed to connect to PostgreSQL: %v", err)
	}
	defer pgService.Close()
	fmt.Println("✅ Connected to PostgreSQL")

	redisService, err := services.NewRedisService(ctx, cfg)
	if err != nil {
		log.Fatalf("❌ Failed to connect to Redis: %v", err)
	}
	defer redisService.Close()
	fmt.Println("✅ Connected to Redis")

	ollamaService := services.NewOllamaService(cfg)
	fmt.Println("✅ Initialized Ollama service")

	qdrantService, err := services.NewQdrantService(ctx, cfg)
	if err != nil {
		log.Printf("⚠️  Qdrant connection failed (non-fatal): %v", err)
		qdrantService = nil
	} else {
		fmt.Println("✅ Connected to Qdrant")
	}

	couchService := services.NewCouchDBService(cfg)
	fmt.Println("✅ Initialized CouchDB service")

	// Initialize handlers
	h := handlers.New(cfg, pgService, redisService, ollamaService, qdrantService, couchService)

	// Setup router
	mux := http.NewServeMux()

	// Routes
	mux.HandleFunc("/health", h.Health)
	mux.HandleFunc("/retrieve", h.Retrieve)
	mux.HandleFunc("/expand", h.Expand)
	mux.HandleFunc("/compose_prompt", h.ComposePrompt)
	mux.HandleFunc("/runs", h.IngestRun)
	mux.HandleFunc("/svelte/docs/search", h.SvelteDocsSearch) // Svelte 5 docs search

	// Start server
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 120 * time.Second, // Allow long streaming responses
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigint := make(chan os.Signal, 1)
		signal.Notify(sigint, os.Interrupt, syscall.SIGTERM)
		<-sigint

		fmt.Println("\n🛑 Shutting down server...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("Server shutdown error: %v", err)
		}
	}()

	fmt.Printf("\n✅ Knowledge Plane running on http://127.0.0.1:%d\n\n", cfg.Port)

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}

	fmt.Println("✅ Server stopped")
}

func maskPassword(connStr string) string {
	// Simple password masking for logs
	// postgresql://user:pass@host:port/db -> postgresql://user:***@host:port/db
	start := 0
	for i := 0; i < len(connStr); i++ {
		if connStr[i] == ':' && i > 0 {
			start = i + 1
			break
		}
	}

	end := start
	for i := start; i < len(connStr); i++ {
		if connStr[i] == '@' {
			end = i
			break
		}
	}

	if start > 0 && end > start {
		return connStr[:start] + "***" + connStr[end:]
	}
	return connStr
}
