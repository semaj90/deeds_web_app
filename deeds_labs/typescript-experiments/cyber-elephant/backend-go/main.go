package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// DocumentVector represents a document with its high-dimensional embedding and 3D projection
type DocumentVector struct {
	ID               string             `json:"id"`
	Title            string             `json:"title"`
	ContentSnippet   string             `json:"content_snippet"`
	Embedding        []float32          `json:"embedding"`
	Projected3D      ProjectedPoint     `json:"projected_3d"`
	DocumentType     string             `json:"document_type"`
	Metadata         map[string]string  `json:"metadata"`
	ClusterID        int                `json:"cluster_id"`
}

// ProjectedPoint represents a 3D point for visualization
type ProjectedPoint struct {
	X          float32 `json:"x"`
	Y          float32 `json:"y"`
	Z          float32 `json:"z"`
	Confidence float32 `json:"confidence"`
}

// DocumentCluster represents a cluster of documents
type DocumentCluster struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Centroid    ProjectedPoint `json:"centroid"`
	DocumentIDs []string      `json:"document_ids"`
	Density     float32       `json:"density"`
	ClusterType string        `json:"cluster_type"`
}

// VectorSearchResponse is the main response structure
type VectorSearchResponse struct {
	Documents  []DocumentVector  `json:"documents"`
	Clusters   []DocumentCluster `json:"clusters"`
	Stats      QueryStatistics   `json:"stats"`
	SessionID  string           `json:"session_id"`
}

// QueryStatistics provides performance metrics
type QueryStatistics struct {
	TotalDocuments     int32   `json:"total_documents"`
	ProcessedDocuments int32   `json:"processed_documents"`
	ProcessingTimeMs   float32 `json:"processing_time_ms"`
	EmbeddingTimeMs    float32 `json:"embedding_time_ms"`
	SearchTimeMs       float32 `json:"search_time_ms"`
	AlgorithmUsed      string  `json:"algorithm_used"`
}

// Global data store (in production, this would be a proper database)
var (
	documents []DocumentVector
	clusters  []DocumentCluster
)

// generateMockData creates sample documents with embeddings for the Cyber Elephant
func generateMockData() {
	rand.Seed(time.Now().UnixNano())
	
	// Sample legal document types and content
	sampleDocs := []struct {
		title   string
		content string
		docType string
	}{
		{"Contract Analysis - Software License Agreement", "This software license agreement establishes the terms and conditions for use of proprietary software systems in enterprise environments.", "contract"},
		{"Case Study - Breach of Contract Litigation", "Detailed analysis of contract breach litigation involving failure to deliver software components within specified timelines.", "case_law"},
		{"Legal Brief - Intellectual Property Rights", "Comprehensive examination of intellectual property rights as they relate to software development and licensing agreements.", "brief"},
		{"Regulatory Compliance - Data Privacy Standards", "Analysis of GDPR compliance requirements for data processing in legal document management systems.", "regulation"},
		{"Precedent Analysis - Software Liability Cases", "Review of key precedent cases establishing liability frameworks for software defects and failures.", "precedent"},
		{"Due Diligence Report - Technology Acquisition", "Comprehensive legal analysis of technology assets and intellectual property in corporate acquisition scenarios.", "report"},
		{"Patent Filing - Machine Learning Algorithms", "Technical and legal documentation for patent protection of novel machine learning algorithms in legal analysis.", "patent"},
		{"Employment Contract - Technology Sector", "Standard employment agreement template specifically designed for software engineers and technology professionals.", "contract"},
		{"Privacy Policy Template - Legal Tech Platform", "Comprehensive privacy policy framework for legal technology platforms handling sensitive client data.", "policy"},
		{"Terms of Service - Cloud-Based Legal Software", "Detailed terms of service agreement for cloud-based legal document management and analysis systems.", "terms"},
	}

	documents = make([]DocumentVector, 0, len(sampleDocs)*3) // Generate multiples for clustering demo
	
	clusterColors := []string{"legal_contracts", "case_precedents", "regulatory_compliance"}
	
	for i, doc := range sampleDocs {
		// Generate multiple variations of each document for clustering
		for variation := 0; variation < 3; variation++ {
			docID := uuid.New().String()
			
			// Generate high-dimensional embedding (1536D like OpenAI embeddings)
			embedding := make([]float32, 1536)
			baseValue := float32(i) * 0.1 // Base cluster positioning
			
			for j := range embedding {
				// Add some clustering structure + noise
				clusterNoise := rand.Float32()*0.2 - 0.1
				variationNoise := float32(variation) * 0.05
				embedding[j] = baseValue + clusterNoise + variationNoise + rand.Float32()*0.1
			}
			
			// Project to 3D using a simple dimensionality reduction simulation
			// In production, this would use UMAP, t-SNE, or PCA
			projected3D := ProjectedPoint{
				X:          float32(math.Cos(float64(i)*0.8)) * (3.0 + float32(variation)*0.5) + rand.Float32()*0.5,
				Y:          float32(math.Sin(float64(i)*0.8)) * (3.0 + float32(variation)*0.5) + rand.Float32()*0.5,
				Z:          float32(i%3-1)*2.0 + float32(variation)*0.3 + rand.Float32()*0.3,
				Confidence: 0.85 + rand.Float32()*0.1,
			}
			
			// Create document
			document := DocumentVector{
				ID:             docID,
				Title:          fmt.Sprintf("%s (v%d)", doc.title, variation+1),
				ContentSnippet: doc.content,
				Embedding:      embedding,
				Projected3D:    projected3D,
				DocumentType:   doc.docType,
				ClusterID:      i % len(clusterColors),
				Metadata: map[string]string{
					"source":         "mock_generator",
					"cluster_color":  clusterColors[i%len(clusterColors)],
					"complexity":     fmt.Sprintf("%.2f", rand.Float32()),
					"relevance_score": fmt.Sprintf("%.3f", 0.7+rand.Float32()*0.3),
				},
			}
			
			documents = append(documents, document)
		}
	}
	
	// Generate clusters
	clusters = make([]DocumentCluster, len(clusterColors))
	for i, colorType := range clusterColors {
		clusterDocs := []string{}
		var centroidX, centroidY, centroidZ float32
		count := 0
		
		// Find all documents in this cluster
		for _, doc := range documents {
			if doc.ClusterID == i {
				clusterDocs = append(clusterDocs, doc.ID)
				centroidX += doc.Projected3D.X
				centroidY += doc.Projected3D.Y
				centroidZ += doc.Projected3D.Z
				count++
			}
		}
		
		if count > 0 {
			centroidX /= float32(count)
			centroidY /= float32(count)
			centroidZ /= float32(count)
		}
		
		clusters[i] = DocumentCluster{
			ID:          uuid.New().String(),
			Name:        colorType,
			Centroid:    ProjectedPoint{X: centroidX, Y: centroidY, Z: centroidZ, Confidence: 0.9},
			DocumentIDs: clusterDocs,
			Density:     float32(count) / 10.0,
			ClusterType: colorType,
		}
	}
	
	log.Printf("Generated %d documents in %d clusters for Cyber Elephant", len(documents), len(clusters))
}

// Handler for initial data load
func getInitialData(c *gin.Context) {
	startTime := time.Now()
	
	response := VectorSearchResponse{
		Documents: documents,
		Clusters:  clusters,
		Stats: QueryStatistics{
			TotalDocuments:     int32(len(documents)),
			ProcessedDocuments: int32(len(documents)),
			ProcessingTimeMs:   float32(time.Since(startTime).Nanoseconds()) / 1e6,
			EmbeddingTimeMs:    5.2,  // Mock embedding time
			SearchTimeMs:       1.1,  // Mock search time
			AlgorithmUsed:      "KD-Tree + K-Means + UMAP",
		},
		SessionID: uuid.New().String(),
	}
	
	c.JSON(http.StatusOK, response)
}

// Handler for nearest neighbor search
func searchNearest(c *gin.Context) {
	startTime := time.Now()
	
	// Parse query parameters
	x, _ := strconv.ParseFloat(c.DefaultQuery("x", "0"), 32)
	y, _ := strconv.ParseFloat(c.DefaultQuery("y", "0"), 32)
	z, _ := strconv.ParseFloat(c.DefaultQuery("z", "0"), 32)
	k, _ := strconv.Atoi(c.DefaultQuery("k", "10"))
	
	queryPoint := ProjectedPoint{
		X: float32(x),
		Y: float32(y),
		Z: float32(z),
	}
	
	// Simple nearest neighbor search in 3D space
	type docDistance struct {
		doc  DocumentVector
		dist float32
	}
	
	distances := make([]docDistance, 0, len(documents))
	
	for _, doc := range documents {
		dx := doc.Projected3D.X - queryPoint.X
		dy := doc.Projected3D.Y - queryPoint.Y
		dz := doc.Projected3D.Z - queryPoint.Z
		dist := dx*dx + dy*dy + dz*dz // squared distance
		
		distances = append(distances, docDistance{doc: doc, dist: dist})
	}
	
	// Sort by distance and take top k
	for i := 0; i < len(distances)-1; i++ {
		for j := i + 1; j < len(distances); j++ {
			if distances[i].dist > distances[j].dist {
				distances[i], distances[j] = distances[j], distances[i]
			}
		}
	}
	
	if k > len(distances) {
		k = len(distances)
	}
	
	nearestDocs := make([]DocumentVector, k)
	for i := 0; i < k; i++ {
		nearestDocs[i] = distances[i].doc
	}
	
	response := VectorSearchResponse{
		Documents: nearestDocs,
		Clusters:  clusters,
		Stats: QueryStatistics{
			TotalDocuments:     int32(len(documents)),
			ProcessedDocuments: int32(k),
			ProcessingTimeMs:   float32(time.Since(startTime).Nanoseconds()) / 1e6,
			EmbeddingTimeMs:    0.0,
			SearchTimeMs:       float32(time.Since(startTime).Nanoseconds()) / 1e6,
			AlgorithmUsed:      "3D Euclidean Distance",
		},
		SessionID: uuid.New().String(),
	}
	
	c.JSON(http.StatusOK, response)
}

// Handler for system status
func getStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":        "healthy",
		"version":       "1.0.0-cyber-elephant",
		"documents":     len(documents),
		"clusters":      len(clusters),
		"uptime":        time.Since(time.Now()).String(),
		"gpu_available": false, // Mock GPU status
		"algorithms":    []string{"KD-Tree", "K-Means", "UMAP", "Euclidean Distance"},
	})
}

func main() {
	// Initialize mock data
	generateMockData()
	
	// Create Gin router
	router := gin.Default()
	
	// Enable CORS for frontend integration
	router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")
		
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		
		c.Next()
	})
	
	// API routes for the Cyber Elephant
	api := router.Group("/api/v1")
	{
		api.GET("/initial-data", getInitialData)
		api.GET("/search/nearest", searchNearest)
		api.GET("/status", getStatus)
		api.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"healthy": true,
				"service": "cyber-elephant-backend",
				"timestamp": time.Now().Unix(),
			})
		})
	}
	
	// Serve some basic info on root
	router.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"service":     "Cyber Elephant Backend",
			"description": "The Psychic Mind - High-dimensional document analysis and clustering",
			"version":     "1.0.0",
			"endpoints": []string{
				"/api/v1/initial-data",
				"/api/v1/search/nearest",
				"/api/v1/status",
				"/api/v1/health",
			},
		})
	})
	
	port := "8080"
	log.Printf("🐘 Cyber Elephant Backend (The Psychic Mind) starting on port %s", port)
	log.Printf("📊 Loaded %d documents in %d clusters", len(documents), len(clusters))
	log.Printf("🔗 Frontend can connect at http://localhost:%s/api/v1/initial-data", port)
	
	if err := router.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}