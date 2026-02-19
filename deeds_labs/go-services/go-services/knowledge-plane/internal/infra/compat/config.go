// Package compat provides infrastructure adapters
// This allows the Knowledge Plane to reuse existing go-microservice patterns
// without rewriting infrastructure code.
//
// After running discovery (ripgrep + go list), edit these files to import
// the correct packages from your existing codebase.

package compat

import "os"

// TODO: After discovery, replace these imports with your actual packages
// Example:
// import "github.com/semaj90/mau5law/go-services/common/config"
// import "github.com/semaj90/mau5law/go-services/common/logger"

type Config struct {
	DatabaseURL      string
	RedisURL         string
	QdrantURL        string
	OllamaURL        string
	Port             string
	EmbeddingModel   string
	ChatModel        string
}

// LoadConfig loads configuration from environment variables
// TODO: Replace with your existing config loader
func LoadConfig() *Config {
	// Placeholder implementation
	// In production, this should call your existing config package
	return &Config{
		DatabaseURL:    getEnv("DATABASE_URL", "postgresql://user@127.0.0.1:5434/legal"),
		RedisURL:       getEnv("REDIS_URL", "redis://127.0.0.1:6379"),
		QdrantURL:      getEnv("QDRANT_URL", "http://127.0.0.1:6333"),
		OllamaURL:      getEnv("OLLAMA_URL", "http://127.0.0.1:11434"),
		Port:           getEnv("KNOWLEDGE_PLANE_PORT", "8099"),
		EmbeddingModel: getEnv("OLLAMA_EMBED_MODEL", "embeddinggemma:latest"),
		ChatModel:      getEnv("OLLAMA_CHAT_MODEL", "gemma3-legal:latest"),
	}
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

// After discovery, this file should become a thin wrapper:
// func LoadConfig() *Config {
//     return myexistingpackage.Load()
// }
