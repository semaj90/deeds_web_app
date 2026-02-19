package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/bytedance/sonic"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"golang.org/x/net/context"
)

// ===========================
// DATA STRUCTURES
// ===========================

// IndexEntry represents a single indexed file with metadata
type IndexEntry struct {
	FilePath     string   `json:"filePath"`
	RelativePath string   `json:"relativePath"`
	FileName     string   `json:"fileName"`
	FileSize     int64    `json:"fileSize"`
	Extension    string   `json:"extension"`
	ModifiedAt   string   `json:"modifiedAt"`
	Exports      []string `json:"exports"`
	Imports      []string `json:"imports"`
	Types        []string `json:"types"`
	Functions    []string `json:"functions"`
	Classes      []string `json:"classes"`
	Product      string   `json:"product"`
	Structure    string   `json:"structure"`
	Technologies []string `json:"technologies"`
	LOC          int      `json:"loc"`
}

// IndexStats represents indexing statistics
type IndexStats struct {
	TotalFiles    int       `json:"totalFiles"`
	TotalBytes    int64     `json:"totalBytes"`
	TotalLOC      int       `json:"totalLOC"`
	IndexedAt     time.Time `json:"indexedAt"`
	Duration      string    `json:"duration"`
	FilesPerSecond float64  `json:"filesPerSecond"`
}

// AnalyzeErrorsRequest represents error analysis request
type AnalyzeErrorsRequest struct {
	Errors []string `json:"errors" binding:"required"`
}

// AnalyzeErrorsResponse represents error analysis response
type AnalyzeErrorsResponse struct {
	Status       string   `json:"status"`
	Patterns     []string `json:"patterns"`
	Suggestions  string   `json:"suggestions"`
	HighPriority []string `json:"highPriority"`
	MediumPriority []string `json:"mediumPriority"`
	LowPriority  []string `json:"lowPriority"`
}

// ===========================
// GLOBAL STATE
// ===========================

var (
	fileIndex  = make(map[string]IndexEntry)
	indexMutex sync.RWMutex
	stats      IndexStats
	redisClient *redis.Client
	ctx         = context.Background()
)

// ===========================
// CONFIGURATION
// ===========================

const (
	RedisURL        = "localhost:6379"
	RedisDB         = 0
	QueueKey        = "phase89:indexing:queue"
	ProgressKey     = "phase89:indexing:progress"
	ResultsKey      = "phase89:indexing:results"
	OrganizationKey = "phase89:organization:hierarchy"
)

// ===========================
// FILE PARSING
// ===========================

// parseTypeScriptFile extracts exports, imports, types, functions from TypeScript files
func parseTypeScriptFile(content string) ([]string, []string, []string, []string, []string) {
	var exports, imports, types, functions, classes []string

	// Extract exports
	exportRegex := regexp.MustCompile(`export\s+(?:const|function|class|interface|type|enum)\s+(\w+)`)
	for _, match := range exportRegex.FindAllStringSubmatch(content, -1) {
		if len(match) > 1 {
			exports = append(exports, match[1])
		}
	}

	// Extract imports
	importRegex := regexp.MustCompile(`import\s+.*?from\s+['"]([^'"]+)['"]`)
	for _, match := range importRegex.FindAllStringSubmatch(content, -1) {
		if len(match) > 1 {
			imports = append(imports, match[1])
		}
	}

	// Extract types/interfaces
	typeRegex := regexp.MustCompile(`(?:type|interface)\s+(\w+)`)
	for _, match := range typeRegex.FindAllStringSubmatch(content, -1) {
		if len(match) > 1 {
			types = append(types, match[1])
		}
	}

	// Extract functions
	functionRegex := regexp.MustCompile(`function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>`)
	for _, match := range functionRegex.FindAllStringSubmatch(content, -1) {
		if len(match) > 1 {
			if match[1] != "" {
				functions = append(functions, match[1])
			} else if match[2] != "" {
				functions = append(functions, match[2])
			}
		}
	}

	// Extract classes
	classRegex := regexp.MustCompile(`class\s+(\w+)`)
	for _, match := range classRegex.FindAllStringSubmatch(content, -1) {
		if len(match) > 1 {
			classes = append(classes, match[1])
		}
	}

	return exports, imports, types, functions, classes
}

// inferProduct infers product category from file path
func inferProduct(path string) string {
	lowerPath := strings.ToLower(path)
	if strings.Contains(lowerPath, "evidence") {
		return "evidence"
	} else if strings.Contains(lowerPath, "search") {
		return "search"
	} else if strings.Contains(lowerPath, "vision") || strings.Contains(lowerPath, "visualization") {
		return "vision"
	} else if strings.Contains(lowerPath, "ai") || strings.Contains(lowerPath, "inference") || strings.Contains(lowerPath, "llm") {
		return "inference"
	} else if strings.Contains(lowerPath, "workflow") || strings.Contains(lowerPath, "case") {
		return "workflow"
	}
	return "general"
}

// inferStructure infers structural category from file path
func inferStructure(path string) string {
	if strings.Contains(path, "/routes/") || strings.Contains(path, "/components/") || strings.Contains(path, "/stores/") {
		return "frontend"
	} else if strings.Contains(path, ".server.ts") || strings.Contains(path, "/api/") {
		return "backend"
	} else if strings.Contains(path, "docker") || strings.Contains(path, "pm2") || strings.Contains(path, ".config.") {
		return "infra"
	} else if strings.Contains(path, "/docs/") || strings.Contains(path, ".md") {
		return "docs"
	} else if strings.Contains(path, "/tests/") || strings.Contains(path, ".spec.") || strings.Contains(path, ".test.") {
		return "tests"
	}
	return "lib"
}

// inferTechnologies infers technology stack from file content and path
func inferTechnologies(path string, content string) []string {
	var techs []string
	lowerPath := strings.ToLower(path)
	lowerContent := strings.ToLower(content)

	if strings.HasSuffix(path, ".svelte") || strings.Contains(lowerContent, "sveltekit") {
		techs = append(techs, "SvelteKit")
	}
	if strings.HasSuffix(path, ".go") {
		techs = append(techs, "Go")
	}
	if strings.Contains(lowerContent, "qdrant") {
		techs = append(techs, "Qdrant")
	}
	if strings.Contains(lowerContent, "pgvector") || strings.Contains(lowerContent, "postgresql") {
		techs = append(techs, "pgvector")
	}
	if strings.Contains(lowerContent, "redis") {
		techs = append(techs, "Redis")
	}
	if strings.Contains(lowerContent, "neo4j") {
		techs = append(techs, "Neo4j")
	}
	if strings.Contains(lowerContent, "minio") {
		techs = append(techs, "MinIO")
	}
	if strings.Contains(lowerContent, "quic") || strings.Contains(lowerPath, "quic") {
		techs = append(techs, "QUIC")
	}

	return techs
}

// countLines counts lines of code (excluding empty lines and comments)
func countLines(content string) int {
	lines := strings.Split(content, "\n")
	count := 0
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" && !strings.HasPrefix(trimmed, "//") && !strings.HasPrefix(trimmed, "/*") {
			count++
		}
	}
	return count
}

// ===========================
// INDEXING
// ===========================

// buildFileSystemIndex scans directory and builds in-memory index
func buildFileSystemIndex(root string) error {
	startTime := time.Now()
	log.Printf("🚀 Building filesystem index for: %s", root)

	var totalFiles int
	var totalBytes int64
	var totalLOC int

	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip directories, node_modules, .git, .svelte-kit
		if info.IsDir() {
			dirName := info.Name()
			if dirName == "node_modules" || dirName == ".git" || dirName == ".svelte-kit" || dirName == "build" || dirName == "dist" {
				return filepath.SkipDir
			}
			return nil
		}

		// Only index code files
		ext := filepath.Ext(path)
		if ext != ".ts" && ext != ".js" && ext != ".svelte" && ext != ".go" && ext != ".md" {
			return nil
		}

		// Read file
		content, err := os.ReadFile(path)
		if err != nil {
			log.Printf("⚠️  Could not read %s: %v", path, err)
			return nil
		}

		contentStr := string(content)
		relPath, _ := filepath.Rel(root, path)

		// Parse exports/imports/types
		var exports, imports, types, functions, classes []string
		if ext == ".ts" || ext == ".js" || ext == ".svelte" {
			exports, imports, types, functions, classes = parseTypeScriptFile(contentStr)
		}

		// Build entry
		entry := IndexEntry{
			FilePath:     path,
			RelativePath: relPath,
			FileName:     info.Name(),
			FileSize:     info.Size(),
			Extension:    ext,
			ModifiedAt:   info.ModTime().Format(time.RFC3339),
			Exports:      exports,
			Imports:      imports,
			Types:        types,
			Functions:    functions,
			Classes:      classes,
			Product:      inferProduct(path),
			Structure:    inferStructure(path),
			Technologies: inferTechnologies(path, contentStr),
			LOC:          countLines(contentStr),
		}

		// Store in index
		indexMutex.Lock()
		fileIndex[path] = entry
		indexMutex.Unlock()

		totalFiles++
		totalBytes += info.Size()
		totalLOC += entry.LOC

		if totalFiles%100 == 0 {
			log.Printf("📊 Indexed %d files...", totalFiles)
		}

		return nil
	})

	if err != nil {
		return fmt.Errorf("error walking directory: %w", err)
	}

	duration := time.Since(startTime)
	filesPerSecond := float64(totalFiles) / duration.Seconds()

	stats = IndexStats{
		TotalFiles:     totalFiles,
		TotalBytes:     totalBytes,
		TotalLOC:       totalLOC,
		IndexedAt:      time.Now(),
		Duration:       duration.String(),
		FilesPerSecond: filesPerSecond,
	}

	log.Printf("✅ Filesystem index built: %d files, %d bytes, %d LOC in %s (%.2f files/sec)",
		totalFiles, totalBytes, totalLOC, duration, filesPerSecond)

	return nil
}

// ===========================
// ERROR ANALYSIS
// ===========================

// analyzeErrors analyzes TypeScript errors and provides recommendations
func analyzeErrors(errors []string) AnalyzeErrorsResponse {
	patterns := make(map[string]int)
	var highPriority, mediumPriority, lowPriority []string

	for _, err := range errors {
		lowerErr := strings.ToLower(err)

		// Pattern detection
		if strings.Contains(lowerErr, "cannot find module") || strings.Contains(lowerErr, "has no exported member") {
			patterns["import_errors"]++
			highPriority = append(highPriority, "Fix import/export mismatches")
		}
		if strings.Contains(lowerErr, "type") && strings.Contains(lowerErr, "not assignable") {
			patterns["type_errors"]++
			highPriority = append(highPriority, "Apply type safety workflow (Zod validation, typed queries)")
		}
		if strings.Contains(lowerErr, "property") && strings.Contains(lowerErr, "does not exist") {
			patterns["schema_errors"]++
			highPriority = append(highPriority, "Validate database schema compliance")
		}
		if strings.Contains(lowerErr, "xstate") || strings.Contains(lowerErr, "machine") {
			patterns["xstate_errors"]++
			mediumPriority = append(mediumPriority, "Fix XState machine type definitions")
		}
	}

	// Build suggestions based on Context7 best practices
	suggestions := "Based on error patterns, apply Context7 systematic debugging:\n\n"
	suggestions += "1. Follow the Types: Trace imports to source files\n"
	suggestions += "2. Schema is Law: Treat database schema as authoritative\n"
	suggestions += "3. Validate at Boundaries: Use Zod schemas for API endpoints\n"
	suggestions += "4. Systematic Elimination: Focus on one category at a time\n\n"

	if patterns["type_errors"] > patterns["import_errors"] {
		suggestions += "PRIMARY ISSUE: Type safety violations. Start by creating unified types.ts file.\n"
	} else if patterns["import_errors"] > 0 {
		suggestions += "PRIMARY ISSUE: Import/export mismatches. Use Go indexer to build module map.\n"
	} else {
		suggestions += "PRIMARY ISSUE: Schema inconsistencies. Validate against Drizzle schema.\n"
	}

	// Convert pattern map to slice
	var patternList []string
	for pattern, count := range patterns {
		patternList = append(patternList, fmt.Sprintf("%s: %d occurrences", pattern, count))
	}

	return AnalyzeErrorsResponse{
		Status:         "analysis_complete",
		Patterns:       patternList,
		Suggestions:    suggestions,
		HighPriority:   highPriority,
		MediumPriority: mediumPriority,
		LowPriority:    lowPriority,
	}
}

// ===========================
// REDIS INTEGRATION
// ===========================

// publishToRedis publishes index results to Redis
func publishToRedis() error {
	// Serialize index using SIMD JSON (sonic)
	indexJSON, err := sonic.Marshal(fileIndex)
	if err != nil {
		return fmt.Errorf("error marshaling index: %w", err)
	}

	// Store in Redis with 30-day TTL
	err = redisClient.Set(ctx, ResultsKey, indexJSON, 30*24*time.Hour).Err()
	if err != nil {
		return fmt.Errorf("error storing in Redis: %w", err)
	}

	// Store stats
	statsJSON, _ := sonic.Marshal(stats)
	err = redisClient.Set(ctx, "phase89:indexing:stats", statsJSON, 30*24*time.Hour).Err()
	if err != nil {
		return fmt.Errorf("error storing stats: %w", err)
	}

	log.Printf("✅ Published index to Redis (%d bytes)", len(indexJSON))
	return nil
}

// ===========================
// HTTP HANDLERS
// ===========================

// healthHandler returns health status
func healthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "healthy",
		"service": "context7-code-indexer",
		"version": "1.0.0",
		"stats": stats,
	})
}

// indexHandler returns entire file index
func indexHandler(c *gin.Context) {
	indexMutex.RLock()
	defer indexMutex.RUnlock()

	c.JSON(http.StatusOK, fileIndex)
}

// statsHandler returns indexing statistics
func statsHandler(c *gin.Context) {
	c.JSON(http.StatusOK, stats)
}

// analyzeErrorsHandler handles error analysis requests
func analyzeErrorsHandler(c *gin.Context) {
	var req AnalyzeErrorsRequest

	// Parse request using SIMD JSON
	body, _ := c.GetRawData()
	if err := sonic.Unmarshal(body, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON"})
		return
	}

	response := analyzeErrors(req.Errors)
	c.JSON(http.StatusOK, response)
}

// rebuildHandler triggers index rebuild
func rebuildHandler(c *gin.Context) {
	root := c.DefaultQuery("root", "../sveltekit-frontend")

	go func() {
		if err := buildFileSystemIndex(root); err != nil {
			log.Printf("❌ Error rebuilding index: %v", err)
			return
		}
		if err := publishToRedis(); err != nil {
			log.Printf("❌ Error publishing to Redis: %v", err)
		}
	}()

	c.JSON(http.StatusAccepted, gin.H{
		"status": "rebuilding",
		"message": "Index rebuild started in background",
	})
}

// searchHandler searches index by criteria
func searchHandler(c *gin.Context) {
	product := c.Query("product")
	structure := c.Query("structure")
	tech := c.Query("tech")
	query := c.Query("q")

	indexMutex.RLock()
	defer indexMutex.RUnlock()

	var results []IndexEntry
	for _, entry := range fileIndex {
		if product != "" && entry.Product != product {
			continue
		}
		if structure != "" && entry.Structure != structure {
			continue
		}
		if tech != "" {
			found := false
			for _, t := range entry.Technologies {
				if t == tech {
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}
		if query != "" && !strings.Contains(strings.ToLower(entry.FilePath), strings.ToLower(query)) {
			continue
		}

		results = append(results, entry)
	}

	c.JSON(http.StatusOK, gin.H{
		"total": len(results),
		"results": results,
	})
}

// ===========================
// MAIN
// ===========================

func main() {
	log.Println("🚀 Context7 Code Indexer - Starting...")

	// Initialize Redis
	redisClient = redis.NewClient(&redis.Options{
		Addr: RedisURL,
		DB:   RedisDB,
	})

	// Test Redis connection
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Printf("⚠️  Redis connection failed: %v (continuing without Redis)", err)
	} else {
		log.Println("✅ Redis connected")
	}

	// Build initial index
	projectRoot := os.Getenv("PROJECT_ROOT")
	if projectRoot == "" {
		projectRoot = "../sveltekit-frontend"
	}

	if err := buildFileSystemIndex(projectRoot); err != nil {
		log.Fatalf("❌ Failed to build index: %v", err)
	}

	// Publish to Redis
	if redisClient != nil {
		if err := publishToRedis(); err != nil {
			log.Printf("⚠️  Failed to publish to Redis: %v", err)
		}
	}

	// Set up HTTP server
	gin.SetMode(gin.ReleaseMode)
	router := gin.Default()

	// Routes
	router.GET("/health", healthHandler)
	router.GET("/index", indexHandler)
	router.GET("/stats", statsHandler)
	router.GET("/search", searchHandler)
	router.POST("/analyze-errors", analyzeErrorsHandler)
	router.POST("/rebuild", rebuildHandler)

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8082"
	}

	log.Printf("✅ Context7 Code Indexer running on :%s", port)
	log.Printf("📊 Indexed %d files (%d bytes, %d LOC)", stats.TotalFiles, stats.TotalBytes, stats.TotalLOC)
	log.Println("🔗 Endpoints:")
	log.Println("   GET  /health           - Health check")
	log.Println("   GET  /index            - Full file index")
	log.Println("   GET  /stats            - Indexing statistics")
	log.Println("   GET  /search?product=  - Search by product/structure/tech")
	log.Println("   POST /analyze-errors   - Analyze TypeScript errors")
	log.Println("   POST /rebuild?root=    - Rebuild index")

	if err := router.Run(":" + port); err != nil {
		log.Fatalf("❌ Server failed: %v", err)
	}
}
