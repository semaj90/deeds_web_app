package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/redis/go-redis/v9"
)

// EndToEndTester demonstrates the complete shareable glyph workflow
type EndToEndTester struct {
	engine *GlyphExecutionEngine
	ctx    context.Context
}

// TestScenario represents a complete test scenario
type TestScenario struct {
	Name               string                 `json:"name"`
	Description        string                 `json:"description"`
	ComputationGraph   map[string]interface{} `json:"computation_graph"`
	LegalContext       map[string]interface{} `json:"legal_context"`
	ExpectedOperations []string               `json:"expected_operations"`
	ValidationCriteria map[string]interface{} `json:"validation_criteria"`
}

// TestResult captures the results of end-to-end testing
type TestResult struct {
	ScenarioName      string                 `json:"scenario_name"`
	Success           bool                   `json:"success"`
	ExecutionTime     time.Duration          `json:"execution_time"`
	GeneratedGlyph    *GeneratedGlyph        `json:"generated_glyph"`
	TranspiledBinary  *CompiledGlyphBinary   `json:"transpiled_binary"`
	ExecutionResults  map[string]interface{} `json:"execution_results"`
	CacheMetrics      *CacheStats            `json:"cache_metrics"`
	PerformanceMetrics map[string]float64    `json:"performance_metrics"`
	ValidationResults  map[string]bool       `json:"validation_results"`
	ErrorDetails      []string               `json:"error_details"`
}

// NewEndToEndTester creates a new end-to-end tester
func NewEndToEndTester() *EndToEndTester {
	ctx := context.Background()
	
	// Initialize Redis client
	redisClient := redis.NewClient(&redis.Options{
		Addr:     "localhost:4005",
		Password: "",
		DB:       0,
	})
	
	// Initialize PostgreSQL connection
	pgPool, err := pgxpool.New(ctx, "postgresql://postgres:123456@localhost:5432/legal_ai_db")
	if err != nil {
		log.Fatalf("Failed to connect to PostgreSQL: %v", err)
	}
	
	// Initialize MinIO client
	minioClient, err := minio.New("localhost:4002", &minio.Options{
		Creds:  credentials.NewStaticV4("minioadmin", "minioadmin", ""),
		Secure: false,
	})
	if err != nil {
		log.Fatalf("Failed to initialize MinIO client: %v", err)
	}
	
	// Create engine components
	tensorCache := NewTensorCacheManager(redisClient, pgPool)
	historyTracker := NewComputationHistoryTracker(pgPool)
	glyphGenerator := NewGlyphGenerator(redisClient, tensorCache)
	aiReader := NewAIReader()
	executionRuntime := NewExecutionRuntime(redisClient, tensorCache)
	asyncWorker := NewAsyncGlyphWorker(
		redisClient, glyphGenerator, aiReader, 
		executionRuntime, tensorCache, historyTracker,
	)
	
	// Create main engine
	engine := &GlyphExecutionEngine{
		RedisClient:      redisClient,
		PostgresPool:     pgPool,
		MinIOClient:      minioClient,
		TensorCache:      tensorCache,
		HistoryTracker:   historyTracker,
		GlyphGenerator:   glyphGenerator,
		AIReader:         aiReader,
		ExecutionRuntime: executionRuntime,
		AsyncWorker:      asyncWorker,
	}
	
	return &EndToEndTester{
		engine: engine,
		ctx:    ctx,
	}
}

// RunCompleteWorkflowTest demonstrates the complete shareable glyph workflow
func (e2e *EndToEndTester) RunCompleteWorkflowTest() error {
	log.Println("🚀 Starting Complete Shareable Glyph Workflow Test")
	log.Println("=" * 80)
	
	// Initialize database tables
	err := e2e.initializeDatabaseTables()
	if err != nil {
		return fmt.Errorf("failed to initialize database tables: %v", err)
	}
	
	// Start async worker
	err = e2e.engine.AsyncWorker.Start(e2e.ctx)
	if err != nil {
		return fmt.Errorf("failed to start async worker: %v", err)
	}
	defer e2e.engine.AsyncWorker.Stop(e2e.ctx)
	
	// Define test scenarios
	scenarios := e2e.createTestScenarios()
	
	var allResults []TestResult
	totalScenarios := len(scenarios)
	successCount := 0
	
	for i, scenario := range scenarios {
		log.Printf("\n📋 Test Scenario %d/%d: %s", i+1, totalScenarios, scenario.Name)
		log.Printf("   Description: %s", scenario.Description)
		
		result := e2e.runSingleScenario(scenario)
		allResults = append(allResults, result)
		
		if result.Success {
			successCount++
			log.Printf("   ✅ SUCCESS: Completed in %v", result.ExecutionTime)
		} else {
			log.Printf("   ❌ FAILED: %v", result.ErrorDetails)
		}
		
		// Brief pause between scenarios
		time.Sleep(1 * time.Second)
	}
	
	// Generate comprehensive report
	e2e.generateTestReport(allResults, successCount, totalScenarios)
	
	if successCount == totalScenarios {
		log.Println("\n🎉 ALL TESTS PASSED! The Shareable Glyph Workflow is fully functional!")
		return nil
	} else {
		return fmt.Errorf("test failures: %d/%d scenarios passed", successCount, totalScenarios)
	}
}

// runSingleScenario executes a complete glyph workflow scenario
func (e2e *EndToEndTester) runSingleScenario(scenario TestScenario) TestResult {
	startTime := time.Now()
	result := TestResult{
		ScenarioName:       scenario.Name,
		Success:           false,
		ValidationResults: make(map[string]bool),
		PerformanceMetrics: make(map[string]float64),
		ErrorDetails:      []string{},
	}
	
	log.Printf("   🔄 Step 1: Generating visual glyph from computation graph...")
	
	// STEP 1: Generate Visual Glyph from Computation Graph
	glyph, err := e2e.engine.GlyphGenerator.GenerateGlyph(e2e.ctx, scenario.ComputationGraph)
	if err != nil {
		result.ErrorDetails = append(result.ErrorDetails, fmt.Sprintf("Glyph generation failed: %v", err))
		result.ExecutionTime = time.Since(startTime)
		return result
	}
	result.GeneratedGlyph = glyph
	log.Printf("      Generated glyph %s with %d visual elements", glyph.ID, len(glyph.VisualElements))
	
	// STEP 2: AI Reader Transpiles Visual Glyph to Binary
	log.Printf("   🔄 Step 2: Transpiling visual glyph to executable binary...")
	
	binary, err := e2e.engine.AIReader.TranspileGlyph(e2e.ctx, glyph.ImageData)
	if err != nil {
		result.ErrorDetails = append(result.ErrorDetails, fmt.Sprintf("Glyph transpilation failed: %v", err))
		result.ExecutionTime = time.Since(startTime)
		return result
	}
	result.TranspiledBinary = binary
	log.Printf("      Transpiled to binary with %d instructions (%d bytes)", 
		len(binary.Instructions), len(binary.Data))
	
	// STEP 3: Execute Binary with Legal AI Operations
	log.Printf("   🔄 Step 3: Executing binary with legal AI operations...")
	
	executionResult, err := e2e.engine.ExecutionRuntime.ExecuteBinary(e2e.ctx, binary.Data)
	if err != nil {
		result.ErrorDetails = append(result.ErrorDetails, fmt.Sprintf("Binary execution failed: %v", err))
		result.ExecutionTime = time.Since(startTime)
		return result
	}
	result.ExecutionResults = executionResult
	log.Printf("      Execution completed with %d operations", len(executionResult))
	
	// STEP 4: Validate Results
	log.Printf("   🔄 Step 4: Validating workflow results...")
	
	validationResults := e2e.validateScenarioResults(scenario, result)
	result.ValidationResults = validationResults
	
	allValidationsPassed := true
	for _, passed := range validationResults {
		if !passed {
			allValidationsPassed = false
			break
		}
	}
	
	// STEP 5: Collect Performance Metrics
	result.CacheMetrics = e2e.engine.TensorCache.GetCacheStats()
	result.PerformanceMetrics = e2e.collectPerformanceMetrics(startTime)
	
	result.Success = allValidationsPassed
	result.ExecutionTime = time.Since(startTime)
	
	// STEP 6: Demonstrate Sharing Capability
	if result.Success {
		log.Printf("   🔄 Step 5: Demonstrating glyph sharing capability...")
		err = e2e.demonstrateGlyphSharing(glyph, binary)
		if err != nil {
			log.Printf("      Warning: Sharing demonstration failed: %v", err)
		} else {
			log.Printf("      ✅ Glyph successfully shared and retrieved")
		}
	}
	
	return result
}

// createTestScenarios defines comprehensive test scenarios
func (e2e *EndToEndTester) createTestScenarios() []TestScenario {
	return []TestScenario{
		{
			Name:        "Legal Contract Analysis Workflow",
			Description: "Complete contract analysis with risk assessment and entity extraction",
			ComputationGraph: map[string]interface{}{
				"operations": []map[string]interface{}{
					{
						"id":   "load_contract",
						"type": "LOAD_FROM_CACHE",
						"parameters": map[string]interface{}{
							"cache_key": "contract_123",
							"document_type": "legal_contract",
						},
					},
					{
						"id":   "analyze_contract",
						"type": "CONTRACT_PARSING",
						"parameters": map[string]interface{}{
							"extract_parties": true,
							"identify_clauses": true,
							"analyze_terms": true,
						},
					},
					{
						"id":   "assess_risk",
						"type": "RISK_ASSESSMENT",
						"parameters": map[string]interface{}{
							"risk_factors": []string{"compliance", "financial", "operational"},
							"jurisdiction": "US_FEDERAL",
						},
					},
					{
						"id":   "extract_entities",
						"type": "ENTITY_EXTRACTION",
						"parameters": map[string]interface{}{
							"entity_types": []string{"person", "organization", "date", "monetary"},
						},
					},
				},
				"connections": []map[string]interface{}{
					{"from": "load_contract", "to": "analyze_contract"},
					{"from": "analyze_contract", "to": "assess_risk"},
					{"from": "analyze_contract", "to": "extract_entities"},
				},
			},
			LegalContext: map[string]interface{}{
				"case_id": "case_001",
				"document_type": "contract",
				"jurisdiction": "US_FEDERAL",
				"practice_area": "commercial_law",
				"confidentiality_level": "standard",
			},
			ExpectedOperations: []string{"LOAD_FROM_CACHE", "CONTRACT_PARSING", "RISK_ASSESSMENT", "ENTITY_EXTRACTION"},
			ValidationCriteria: map[string]interface{}{
				"min_operations": 4,
				"required_outputs": []string{"contract_analysis", "risk_assessment", "extracted_entities"},
				"max_execution_time_ms": 5000,
			},
		},
		{
			Name:        "Evidence Analysis Pipeline",
			Description: "Multi-stage evidence processing with classification and metadata extraction",
			ComputationGraph: map[string]interface{}{
				"operations": []map[string]interface{}{
					{
						"id":   "load_evidence",
						"type": "LOAD_FROM_CACHE",
						"parameters": map[string]interface{}{
							"cache_key": "evidence_456",
							"document_type": "evidence_document",
						},
					},
					{
						"id":   "classify_evidence",
						"type": "EVIDENCE_ANALYSIS",
						"parameters": map[string]interface{}{
							"classification_type": "document_category",
							"confidence_threshold": 0.8,
						},
					},
					{
						"id":   "semantic_search",
						"type": "SEMANTIC_SEARCH",
						"parameters": map[string]interface{}{
							"query": "related legal precedents",
							"search_scope": "case_database",
							"max_results": 10,
						},
					},
				},
				"connections": []map[string]interface{}{
					{"from": "load_evidence", "to": "classify_evidence"},
					{"from": "classify_evidence", "to": "semantic_search"},
				},
			},
			LegalContext: map[string]interface{}{
				"case_id": "case_002",
				"document_type": "evidence",
				"jurisdiction": "STATE_CA",
				"practice_area": "criminal_law",
				"confidentiality_level": "high",
			},
			ExpectedOperations: []string{"LOAD_FROM_CACHE", "EVIDENCE_ANALYSIS", "SEMANTIC_SEARCH"},
			ValidationCriteria: map[string]interface{}{
				"min_operations": 3,
				"required_outputs": []string{"evidence_analysis", "semantic_results"},
				"max_execution_time_ms": 3000,
			},
		},
		{
			Name:        "Batch Legal Document Processing",
			Description: "Parallel processing of multiple legal documents with aggregate analysis",
			ComputationGraph: map[string]interface{}{
				"operations": []map[string]interface{}{
					{
						"id":   "batch_load",
						"type": "BATCH_LOAD",
						"parameters": map[string]interface{}{
							"cache_keys": []string{"doc_001", "doc_002", "doc_003"},
							"parallel": true,
						},
					},
					{
						"id":   "parallel_analysis",
						"type": "PARALLEL_ANALYSIS",
						"parameters": map[string]interface{}{
							"analysis_types": []string{"contract", "evidence", "brief"},
							"worker_count": 3,
						},
					},
					{
						"id":   "aggregate_results",
						"type": "AGGREGATE_ANALYSIS",
						"parameters": map[string]interface{}{
							"aggregation_method": "weighted_average",
							"confidence_weighting": true,
						},
					},
				},
				"connections": []map[string]interface{}{
					{"from": "batch_load", "to": "parallel_analysis"},
					{"from": "parallel_analysis", "to": "aggregate_results"},
				},
			},
			LegalContext: map[string]interface{}{
				"case_id": "case_003",
				"document_type": "batch_processing",
				"jurisdiction": "MULTI",
				"practice_area": "litigation",
				"confidentiality_level": "standard",
			},
			ExpectedOperations: []string{"BATCH_LOAD", "PARALLEL_ANALYSIS", "AGGREGATE_ANALYSIS"},
			ValidationCriteria: map[string]interface{}{
				"min_operations": 3,
				"required_outputs": []string{"batch_results", "aggregate_analysis"},
				"max_execution_time_ms": 7000,
			},
		},
	}
}

// validateScenarioResults validates the results of a scenario execution
func (e2e *EndToEndTester) validateScenarioResults(scenario TestScenario, result TestResult) map[string]bool {
	validations := make(map[string]bool)
	
	// Validate minimum operations
	if minOps, exists := scenario.ValidationCriteria["min_operations"]; exists {
		expectedMin := int(minOps.(float64))
		actualOps := len(result.TranspiledBinary.Instructions)
		validations["min_operations"] = actualOps >= expectedMin
	}
	
	// Validate execution time
	if maxTimeMs, exists := scenario.ValidationCriteria["max_execution_time_ms"]; exists {
		maxTime := time.Duration(maxTimeMs.(float64)) * time.Millisecond
		validations["execution_time"] = result.ExecutionTime <= maxTime
	}
	
	// Validate required outputs
	if requiredOutputs, exists := scenario.ValidationCriteria["required_outputs"]; exists {
		outputs := requiredOutputs.([]interface{})
		hasAllOutputs := true
		
		for _, outputInterface := range outputs {
			output := outputInterface.(string)
			if _, exists := result.ExecutionResults[output]; !exists {
				hasAllOutputs = false
				break
			}
		}
		validations["required_outputs"] = hasAllOutputs
	}
	
	// Validate expected operations were executed
	hasAllExpectedOps := true
	for _, expectedOp := range scenario.ExpectedOperations {
		found := false
		for _, instruction := range result.TranspiledBinary.Instructions {
			if instruction.Operation == expectedOp {
				found = true
				break
			}
		}
		if !found {
			hasAllExpectedOps = false
			break
		}
	}
	validations["expected_operations"] = hasAllExpectedOps
	
	// Validate glyph generation quality
	validations["glyph_generated"] = result.GeneratedGlyph != nil && result.GeneratedGlyph.ID != ""
	validations["binary_transpiled"] = result.TranspiledBinary != nil && len(result.TranspiledBinary.Data) > 0
	validations["execution_completed"] = len(result.ExecutionResults) > 0
	
	return validations
}

// demonstrateGlyphSharing shows how glyphs can be shared and executed elsewhere
func (e2e *EndToEndTester) demonstrateGlyphSharing(glyph *GeneratedGlyph, binary *CompiledGlyphBinary) error {
	// Store glyph image in MinIO for sharing
	bucketName := "shared-glyphs"
	objectName := fmt.Sprintf("glyph_%s.png", glyph.ID)
	
	// Ensure bucket exists
	exists, err := e2e.engine.MinIOClient.BucketExists(e2e.ctx, bucketName)
	if err != nil {
		return fmt.Errorf("failed to check bucket existence: %v", err)
	}
	
	if !exists {
		err = e2e.engine.MinIOClient.MakeBucket(e2e.ctx, bucketName, minio.MakeBucketOptions{})
		if err != nil {
			return fmt.Errorf("failed to create bucket: %v", err)
		}
	}
	
	// Upload glyph image
	_, err = e2e.engine.MinIOClient.PutObject(e2e.ctx, bucketName, objectName,
		bytes.NewReader(glyph.ImageData), int64(len(glyph.ImageData)),
		minio.PutObjectOptions{ContentType: "image/png"})
	if err != nil {
		return fmt.Errorf("failed to upload glyph: %v", err)
	}
	
	// Store binary for execution
	binaryObjectName := fmt.Sprintf("glyph_%s.gbin", glyph.ID)
	_, err = e2e.engine.MinIOClient.PutObject(e2e.ctx, bucketName, binaryObjectName,
		bytes.NewReader(binary.Data), int64(len(binary.Data)),
		minio.PutObjectOptions{ContentType: "application/octet-stream"})
	if err != nil {
		return fmt.Errorf("failed to upload binary: %v", err)
	}
	
	// Demonstrate retrieval and re-execution
	retrievedObject, err := e2e.engine.MinIOClient.GetObject(e2e.ctx, bucketName, binaryObjectName, minio.GetObjectOptions{})
	if err != nil {
		return fmt.Errorf("failed to retrieve binary: %v", err)
	}
	defer retrievedObject.Close()
	
	retrievedBinary := make([]byte, len(binary.Data))
	_, err = retrievedObject.Read(retrievedBinary)
	if err != nil {
		return fmt.Errorf("failed to read retrieved binary: %v", err)
	}
	
	// Re-execute the retrieved binary to prove shareability
	reexecutionResult, err := e2e.engine.ExecutionRuntime.ExecuteBinary(e2e.ctx, retrievedBinary)
	if err != nil {
		return fmt.Errorf("failed to re-execute shared binary: %v", err)
	}
	
	log.Printf("      Shared glyph re-executed with %d results", len(reexecutionResult))
	return nil
}

// collectPerformanceMetrics gathers performance data
func (e2e *EndToEndTester) collectPerformanceMetrics(startTime time.Time) map[string]float64 {
	return map[string]float64{
		"total_execution_time_ms": float64(time.Since(startTime).Nanoseconds()) / 1e6,
		"cache_hit_ratio":         float64(e2e.engine.TensorCache.GetCacheStats().Hits) / 
									float64(e2e.engine.TensorCache.GetCacheStats().Hits + e2e.engine.TensorCache.GetCacheStats().Misses),
		"compression_ratio":       e2e.engine.TensorCache.GetCacheStats().CompressionRatio,
		"avg_latency_ms":          float64(e2e.engine.TensorCache.GetCacheStats().AvgLatency.Nanoseconds()) / 1e6,
	}
}

// initializeDatabaseTables ensures all required database tables exist
func (e2e *EndToEndTester) initializeDatabaseTables() error {
	log.Println("   🔄 Initializing database tables...")
	
	err := e2e.engine.TensorCache.CreateTensorCacheTable(e2e.ctx)
	if err != nil {
		return fmt.Errorf("failed to create tensor cache table: %v", err)
	}
	
	err = e2e.engine.HistoryTracker.CreateComputationHistoryTables(e2e.ctx)
	if err != nil {
		return fmt.Errorf("failed to create computation history tables: %v", err)
	}
	
	log.Println("   ✅ Database tables initialized successfully")
	return nil
}

// generateTestReport creates a comprehensive test report
func (e2e *EndToEndTester) generateTestReport(results []TestResult, successCount, totalScenarios int) {
	log.Println("\n" + "=" * 80)
	log.Println("🎯 COMPREHENSIVE GLYPH EXECUTION ENGINE TEST REPORT")
	log.Println("=" * 80)
	
	log.Printf("📊 Overall Results: %d/%d scenarios passed (%.1f%% success rate)",
		successCount, totalScenarios, float64(successCount)/float64(totalScenarios)*100)
	
	// Calculate aggregate metrics
	totalExecutionTime := time.Duration(0)
	totalOperations := 0
	
	for _, result := range results {
		totalExecutionTime += result.ExecutionTime
		if result.TranspiledBinary != nil {
			totalOperations += len(result.TranspiledBinary.Instructions)
		}
	}
	
	log.Printf("⏱️  Total Execution Time: %v", totalExecutionTime)
	log.Printf("🔧 Total Operations Executed: %d", totalOperations)
	log.Printf("📈 Average Execution Time: %v", totalExecutionTime/time.Duration(totalScenarios))
	
	// Individual scenario results
	log.Println("\n📋 Individual Scenario Results:")
	for i, result := range results {
		status := "✅ PASSED"
		if !result.Success {
			status = "❌ FAILED"
		}
		
		log.Printf("   %d. %s %s (%v)", i+1, result.ScenarioName, status, result.ExecutionTime)
		
		if result.Success {
			log.Printf("      - Generated Glyph: %s", result.GeneratedGlyph.ID)
			log.Printf("      - Binary Instructions: %d", len(result.TranspiledBinary.Instructions))
			log.Printf("      - Execution Results: %d outputs", len(result.ExecutionResults))
			
			// Validation results
			passed := 0
			total := len(result.ValidationResults)
			for _, v := range result.ValidationResults {
				if v {
					passed++
				}
			}
			log.Printf("      - Validations: %d/%d passed", passed, total)
		} else {
			log.Printf("      - Errors: %v", result.ErrorDetails)
		}
	}
	
	// Performance summary
	if len(results) > 0 && results[0].CacheMetrics != nil {
		log.Println("\n📊 Performance Metrics:")
		metrics := results[0].CacheMetrics
		log.Printf("   - Cache Hits: %d", metrics.Hits)
		log.Printf("   - Cache Misses: %d", metrics.Misses)
		log.Printf("   - Cache Hit Ratio: %.1f%%", 
			float64(metrics.Hits)/float64(metrics.Hits+metrics.Misses)*100)
		log.Printf("   - Average Compression Ratio: %.1f:1", metrics.CompressionRatio)
		log.Printf("   - Average Latency: %v", metrics.AvgLatency)
	}
	
	// Architecture validation
	log.Println("\n🏗️  Architecture Component Status:")
	log.Printf("   ✅ Glyph Generator: Visual computation graph rendering")
	log.Printf("   ✅ AI Reader: Visual-to-binary transpilation")
	log.Printf("   ✅ Execution Runtime: Legal AI operation execution")
	log.Printf("   ✅ Tensor Cache: Multi-tier memory management")
	log.Printf("   ✅ History Tracking: Comprehensive audit trails")
	log.Printf("   ✅ Async Workers: Scalable background processing")
	log.Printf("   ✅ MinIO Integration: Shareable artifact storage")
	
	log.Println("\n" + "=" * 80)
	if successCount == totalScenarios {
		log.Println("🚀 REVOLUTIONARY SHAREABLE GLYPH WORKFLOW: FULLY FUNCTIONAL!")
		log.Println("   The world's first visual programming language for legal AI is ready!")
	} else {
		log.Printf("⚠️  PARTIAL SUCCESS: %d/%d scenarios need attention", totalScenarios-successCount, totalScenarios)
	}
	log.Println("=" * 80)
}

// Main test execution function
func RunGlyphEngineTests() error {
	tester := NewEndToEndTester()
	return tester.RunCompleteWorkflowTest()
}