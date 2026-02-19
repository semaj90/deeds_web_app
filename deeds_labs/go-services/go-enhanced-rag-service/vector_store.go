package main

import (
	"context"
	"fmt"
	"sort"
	"time"

	"gorm.io/gorm"
	"github.com/redis/go-redis/v9"
)

// VectorStore handles vector similarity search with CUDA acceleration
type VectorStore struct {
	db         *gorm.DB
	redis      *redis.Client
	embedder   *EmbeddingService
	cudaWorker *CudaWorker
}

type SimilarityResult struct {
	Document   Document `json:"document"`
	Similarity float32  `json:"similarity"`
	Rank       int      `json:"rank"`
}

func NewVectorStore(db *gorm.DB, redis *redis.Client, embedder *EmbeddingService) *VectorStore {
	return &VectorStore{
		db:       db,
		redis:    redis,
		embedder: embedder,
	}
}

// SimilaritySearch performs CUDA-accelerated vector similarity search
func (vs *VectorStore) SimilaritySearch(ctx context.Context, queryEmbedding []float32, caseID string, limit int, threshold float32) ([]DocumentMatch, error) {
	startTime := time.Now()
	
	// Build query for documents
	query := vs.db.WithContext(ctx).Where("embedding IS NOT NULL")
	
	if caseID != "" {
		query = query.Where("case_id = ?", caseID)
	}
	
	// Get documents with embeddings
	var documents []Document
	if err := query.Find(&documents).Error; err != nil {
		return nil, fmt.Errorf("failed to query documents: %w", err)
	}
	
	if len(documents) == 0 {
		return nil, fmt.Errorf("no documents found with embeddings")
	}
	
	// Prepare vectors for CUDA computation
	docVectors := make([][]float32, len(documents))
	for i, doc := range documents {
		docVectors[i] = doc.Embedding
	}
	
	// Use CUDA for similarity computation if available
	var similarities []float32
	var err error
	
	if vs.cudaWorker != nil && vs.cudaWorker.IsAvailable() && len(documents) > 10 {
		// Use CUDA for large datasets
		similarities, err = vs.cudaWorker.ComputeVectorSimilarity(ctx, VectorSimilarityRequest{
			QueryVector:     queryEmbedding,
			DocumentVectors: docVectors,
			Threshold:       threshold,
		})
		
		if err != nil {
			// Fallback to CPU computation
			similarities = vs.computeSimilarityCPU(queryEmbedding, docVectors)
		}
	} else {
		// Use CPU for smaller datasets or when CUDA unavailable
		similarities = vs.computeSimilarityCPU(queryEmbedding, docVectors)
	}
	
	// Create results with similarity scores
	results := make([]DocumentMatch, 0, len(documents))
	for i, doc := range documents {
		if i < len(similarities) && similarities[i] >= threshold {
			results = append(results, DocumentMatch{
				Document:   doc,
				Similarity: similarities[i],
				Relevance:  vs.calculateRelevance(similarities[i], doc),
				Reasoning:  vs.generateReasoning(similarities[i], doc),
			})
		}
	}
	
	// Sort by similarity (descending)
	sort.Slice(results, func(i, j int) bool {
		return results[i].Similarity > results[j].Similarity
	})
	
	// Limit results
	if limit > 0 && len(results) > limit {
		results = results[:limit]
	}
	
	// Log performance
	fmt.Printf("Vector search completed in %v (CUDA: %v, docs: %d, results: %d)\n", 
		time.Since(startTime), 
		vs.cudaWorker != nil && vs.cudaWorker.IsAvailable(),
		len(documents),
		len(results))
	
	return results, nil
}

// CPU-based similarity computation (fallback)
func (vs *VectorStore) computeSimilarityCPU(queryVector []float32, docVectors [][]float32) []float32 {
	similarities := make([]float32, len(docVectors))
	
	for i, docVector := range docVectors {
		similarities[i] = vs.cosineSimilarity(queryVector, docVector)
	}
	
	return similarities
}

// Cosine similarity calculation
func (vs *VectorStore) cosineSimilarity(a, b []float32) float32 {
	if len(a) != len(b) {
		return 0.0
	}
	
	var dotProduct, normA, normB float32
	
	for i := range a {
		dotProduct += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	
	if normA == 0 || normB == 0 {
		return 0.0
	}
	
	return dotProduct / (float32(normA) * float32(normB))
}

// Calculate relevance score based on similarity and document metadata
func (vs *VectorStore) calculateRelevance(similarity float32, doc Document) float32 {
	relevance := similarity
	
	// Boost recent documents
	daysSinceCreation := time.Since(doc.CreatedAt).Hours() / 24
	if daysSinceCreation < 7 {
		relevance *= 1.1
	}
	
	// Boost based on document type
	switch doc.ContentType {
	case "legal_brief":
		relevance *= 1.2
	case "case_law":
		relevance *= 1.15
	case "contract":
		relevance *= 1.1
	}
	
	return min(relevance, 1.0)
}

// Generate reasoning for why document is relevant
func (vs *VectorStore) generateReasoning(similarity float32, doc Document) string {
	if similarity > 0.9 {
		return fmt.Sprintf("Highly similar content (%.1f%% match)", similarity*100)
	} else if similarity > 0.8 {
		return fmt.Sprintf("Very relevant (%.1f%% similarity)", similarity*100)
	} else if similarity > 0.7 {
		return fmt.Sprintf("Relevant content (%.1f%% similarity)", similarity*100)
	} else {
		return fmt.Sprintf("Potentially relevant (%.1f%% similarity)", similarity*100)
	}
}

func min(a, b float32) float32 {
	if a < b {
		return a
	}
	return b
}