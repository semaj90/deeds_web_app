package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ComputationHistoryTracker manages computation history and audit trails
type ComputationHistoryTracker struct {
	pgPool *pgxpool.Pool
}

// ComputationExecution represents a single glyph execution
type ComputationExecution struct {
	ID                string                 `json:"id"`
	GlyphID           string                 `json:"glyph_id"`
	GlyphVersion      string                 `json:"glyph_version"`
	UserID            string                 `json:"user_id"`
	SessionID         string                 `json:"session_id"`
	ExecutionType     string                 `json:"execution_type"` // "generate", "transpile", "execute"
	StartTime         time.Time              `json:"start_time"`
	EndTime           *time.Time             `json:"end_time"`
	Duration          *time.Duration         `json:"duration"`
	Status            ExecutionStatus        `json:"status"`
	InputParameters   map[string]interface{} `json:"input_parameters"`
	OutputResults     map[string]interface{} `json:"output_results"`
	ErrorDetails      *string                `json:"error_details"`
	ResourceUsage     *ResourceUsage         `json:"resource_usage"`
	LegalContext      map[string]interface{} `json:"legal_context"`
	PerformanceMetrics *PerformanceMetrics   `json:"performance_metrics"`
	ComplianceFlags   []string               `json:"compliance_flags"`
	AuditTrail        []AuditEvent           `json:"audit_trail"`
}

// ExecutionStatus represents the status of a computation execution
type ExecutionStatus string

const (
	StatusPending   ExecutionStatus = "pending"
	StatusRunning   ExecutionStatus = "running"
	StatusCompleted ExecutionStatus = "completed"
	StatusFailed    ExecutionStatus = "failed"
	StatusTimeout   ExecutionStatus = "timeout"
	StatusCancelled ExecutionStatus = "cancelled"
)

// ResourceUsage tracks system resource consumption
type ResourceUsage struct {
	CPUTime       time.Duration `json:"cpu_time"`
	MemoryPeak    int64         `json:"memory_peak"`
	MemoryAverage int64         `json:"memory_average"`
	GPUTime       time.Duration `json:"gpu_time"`
	GPUMemoryUsed int64         `json:"gpu_memory_used"`
	DiskIORead    int64         `json:"disk_io_read"`
	DiskIOWrite   int64         `json:"disk_io_write"`
	NetworkIn     int64         `json:"network_in"`
	NetworkOut    int64         `json:"network_out"`
}

// PerformanceMetrics tracks execution performance
type PerformanceMetrics struct {
	TensorOperations    int           `json:"tensor_operations"`
	CacheHits          int           `json:"cache_hits"`
	CacheMisses        int           `json:"cache_misses"`
	CompressionRatio   float64       `json:"compression_ratio"`
	ThroughputOpsPerSec float64      `json:"throughput_ops_per_sec"`
	LatencyP50         time.Duration `json:"latency_p50"`
	LatencyP95         time.Duration `json:"latency_p95"`
	LatencyP99         time.Duration `json:"latency_p99"`
	ErrorRate          float64       `json:"error_rate"`
}

// AuditEvent represents a single audit trail event
type AuditEvent struct {
	Timestamp   time.Time              `json:"timestamp"`
	EventType   string                 `json:"event_type"`
	Component   string                 `json:"component"`
	Action      string                 `json:"action"`
	Details     map[string]interface{} `json:"details"`
	Severity    string                 `json:"severity"`
	ComplianceTag string               `json:"compliance_tag"`
}

// LegalComputationContext provides legal-specific tracking
type LegalComputationContext struct {
	CaseID           string   `json:"case_id"`
	DocumentTypes    []string `json:"document_types"`
	JurisdictionCode string   `json:"jurisdiction_code"`
	PracticeAreas    []string `json:"practice_areas"`
	ConfidentialityLevel string `json:"confidentiality_level"`
	RetentionPolicy  string   `json:"retention_policy"`
	AccessPermissions []string `json:"access_permissions"`
	DataClassification string  `json:"data_classification"`
}

// ComputationAnalytics provides analytics and reporting capabilities
type ComputationAnalytics struct {
	TotalExecutions    int64         `json:"total_executions"`
	SuccessfulExecutions int64       `json:"successful_executions"`
	FailedExecutions   int64         `json:"failed_executions"`
	AverageExecutionTime time.Duration `json:"average_execution_time"`
	MostUsedGlyphs     []GlyphUsageStats `json:"most_used_glyphs"`
	ResourceTrends     *ResourceTrends   `json:"resource_trends"`
	ErrorPatterns      []ErrorPattern    `json:"error_patterns"`
}

// GlyphUsageStats tracks glyph usage statistics
type GlyphUsageStats struct {
	GlyphID       string    `json:"glyph_id"`
	ExecutionCount int64    `json:"execution_count"`
	LastUsed      time.Time `json:"last_used"`
	SuccessRate   float64   `json:"success_rate"`
}

// ResourceTrends tracks resource usage trends over time
type ResourceTrends struct {
	CPUTrend    []TrendPoint `json:"cpu_trend"`
	MemoryTrend []TrendPoint `json:"memory_trend"`
	GPUTrend    []TrendPoint `json:"gpu_trend"`
}

// TrendPoint represents a data point in a trend analysis
type TrendPoint struct {
	Timestamp time.Time `json:"timestamp"`
	Value     float64   `json:"value"`
}

// ErrorPattern identifies common error patterns
type ErrorPattern struct {
	ErrorType    string    `json:"error_type"`
	Frequency    int64     `json:"frequency"`
	LastOccurred time.Time `json:"last_occurred"`
	CommonCause  string    `json:"common_cause"`
}

// NewComputationHistoryTracker creates a new computation history tracker
func NewComputationHistoryTracker(pgPool *pgxpool.Pool) *ComputationHistoryTracker {
	return &ComputationHistoryTracker{
		pgPool: pgPool,
	}
}

// StartExecution records the start of a computation execution
func (cht *ComputationHistoryTracker) StartExecution(ctx context.Context, exec *ComputationExecution) error {
	exec.StartTime = time.Now()
	exec.Status = StatusRunning
	
	// Add initial audit event
	exec.AuditTrail = append(exec.AuditTrail, AuditEvent{
		Timestamp: time.Now(),
		EventType: "execution_started",
		Component: "glyph_engine",
		Action:    exec.ExecutionType,
		Details: map[string]interface{}{
			"glyph_id": exec.GlyphID,
			"user_id":  exec.UserID,
		},
		Severity:      "info",
		ComplianceTag: "SOX_AUDIT",
	})
	
	query := `
		INSERT INTO computation_executions (
			id, glyph_id, glyph_version, user_id, session_id, 
			execution_type, start_time, status, input_parameters,
			legal_context, audit_trail
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	
	inputParamsJSON, _ := json.Marshal(exec.InputParameters)
	legalContextJSON, _ := json.Marshal(exec.LegalContext)
	auditTrailJSON, _ := json.Marshal(exec.AuditTrail)
	
	_, err := cht.pgPool.Exec(ctx, query,
		exec.ID, exec.GlyphID, exec.GlyphVersion, exec.UserID, exec.SessionID,
		exec.ExecutionType, exec.StartTime, exec.Status, string(inputParamsJSON),
		string(legalContextJSON), string(auditTrailJSON),
	)
	
	if err != nil {
		return fmt.Errorf("failed to start execution tracking: %v", err)
	}
	
	log.Printf("Started tracking execution %s for glyph %s", exec.ID, exec.GlyphID)
	return nil
}

// CompleteExecution records the completion of a computation execution
func (cht *ComputationHistoryTracker) CompleteExecution(ctx context.Context, execID string, results map[string]interface{}, resourceUsage *ResourceUsage, metrics *PerformanceMetrics) error {
	endTime := time.Now()
	
	// Get start time to calculate duration
	var startTime time.Time
	err := cht.pgPool.QueryRow(ctx, "SELECT start_time FROM computation_executions WHERE id = $1", execID).Scan(&startTime)
	if err != nil {
		return fmt.Errorf("failed to get execution start time: %v", err)
	}
	
	duration := endTime.Sub(startTime)
	
	// Create completion audit event
	auditEvent := AuditEvent{
		Timestamp: endTime,
		EventType: "execution_completed",
		Component: "glyph_engine",
		Action:    "complete",
		Details: map[string]interface{}{
			"execution_id": execID,
			"duration":     duration.String(),
			"success":      true,
		},
		Severity:      "info",
		ComplianceTag: "PERFORMANCE_AUDIT",
	}
	
	query := `
		UPDATE computation_executions SET
			end_time = $1,
			duration = $2,
			status = $3,
			output_results = $4,
			resource_usage = $5,
			performance_metrics = $6,
			audit_trail = audit_trail || $7::jsonb
		WHERE id = $8
	`
	
	outputResultsJSON, _ := json.Marshal(results)
	resourceUsageJSON, _ := json.Marshal(resourceUsage)
	metricsJSON, _ := json.Marshal(metrics)
	auditEventJSON, _ := json.Marshal([]AuditEvent{auditEvent})
	
	_, err = cht.pgPool.Exec(ctx, query,
		endTime, duration, StatusCompleted,
		string(outputResultsJSON), string(resourceUsageJSON), string(metricsJSON),
		string(auditEventJSON), execID,
	)
	
	if err != nil {
		return fmt.Errorf("failed to complete execution tracking: %v", err)
	}
	
	log.Printf("Completed execution %s (duration: %v)", execID, duration)
	return nil
}

// FailExecution records a failed computation execution
func (cht *ComputationHistoryTracker) FailExecution(ctx context.Context, execID string, errorDetails string, resourceUsage *ResourceUsage) error {
	endTime := time.Now()
	
	// Create failure audit event
	auditEvent := AuditEvent{
		Timestamp: endTime,
		EventType: "execution_failed",
		Component: "glyph_engine",
		Action:    "fail",
		Details: map[string]interface{}{
			"execution_id": execID,
			"error":        errorDetails,
		},
		Severity:      "error",
		ComplianceTag: "ERROR_AUDIT",
	}
	
	query := `
		UPDATE computation_executions SET
			end_time = $1,
			status = $2,
			error_details = $3,
			resource_usage = $4,
			audit_trail = audit_trail || $5::jsonb
		WHERE id = $6
	`
	
	resourceUsageJSON, _ := json.Marshal(resourceUsage)
	auditEventJSON, _ := json.Marshal([]AuditEvent{auditEvent})
	
	_, err := cht.pgPool.Exec(ctx, query,
		endTime, StatusFailed, errorDetails, string(resourceUsageJSON),
		string(auditEventJSON), execID,
	)
	
	if err != nil {
		return fmt.Errorf("failed to record execution failure: %v", err)
	}
	
	log.Printf("Recorded execution failure %s: %s", execID, errorDetails)
	return nil
}

// AddAuditEvent adds an audit event to an existing execution
func (cht *ComputationHistoryTracker) AddAuditEvent(ctx context.Context, execID string, event AuditEvent) error {
	event.Timestamp = time.Now()
	
	query := `
		UPDATE computation_executions 
		SET audit_trail = audit_trail || $1::jsonb 
		WHERE id = $2
	`
	
	eventJSON, _ := json.Marshal([]AuditEvent{event})
	
	_, err := cht.pgPool.Exec(ctx, query, string(eventJSON), execID)
	if err != nil {
		return fmt.Errorf("failed to add audit event: %v", err)
	}
	
	return nil
}

// GetExecutionHistory retrieves execution history with filtering
func (cht *ComputationHistoryTracker) GetExecutionHistory(ctx context.Context, filters map[string]interface{}, limit int, offset int) ([]ComputationExecution, error) {
	baseQuery := `
		SELECT id, glyph_id, glyph_version, user_id, session_id, execution_type,
			   start_time, end_time, duration, status, input_parameters, 
			   output_results, error_details, resource_usage, legal_context,
			   performance_metrics, audit_trail
		FROM computation_executions
	`
	
	var whereConditions []string
	var args []interface{}
	argIndex := 1
	
	// Apply filters
	if glyphID, exists := filters["glyph_id"]; exists {
		whereConditions = append(whereConditions, fmt.Sprintf("glyph_id = $%d", argIndex))
		args = append(args, glyphID)
		argIndex++
	}
	
	if userID, exists := filters["user_id"]; exists {
		whereConditions = append(whereConditions, fmt.Sprintf("user_id = $%d", argIndex))
		args = append(args, userID)
		argIndex++
	}
	
	if status, exists := filters["status"]; exists {
		whereConditions = append(whereConditions, fmt.Sprintf("status = $%d", argIndex))
		args = append(args, status)
		argIndex++
	}
	
	if startTime, exists := filters["start_time_after"]; exists {
		whereConditions = append(whereConditions, fmt.Sprintf("start_time >= $%d", argIndex))
		args = append(args, startTime)
		argIndex++
	}
	
	if len(whereConditions) > 0 {
		baseQuery += " WHERE " + fmt.Sprintf("%s", whereConditions[0])
		for _, condition := range whereConditions[1:] {
			baseQuery += " AND " + condition
		}
	}
	
	baseQuery += fmt.Sprintf(" ORDER BY start_time DESC LIMIT $%d OFFSET $%d", argIndex, argIndex+1)
	args = append(args, limit, offset)
	
	rows, err := cht.pgPool.Query(ctx, baseQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query execution history: %v", err)
	}
	defer rows.Close()
	
	var executions []ComputationExecution
	
	for rows.Next() {
		var exec ComputationExecution
		var endTime *time.Time
		var duration *string
		var inputParamsJSON, outputResultsJSON, errorDetails, resourceUsageJSON string
		var legalContextJSON, metricsJSON, auditTrailJSON string
		
		err := rows.Scan(
			&exec.ID, &exec.GlyphID, &exec.GlyphVersion, &exec.UserID, &exec.SessionID,
			&exec.ExecutionType, &exec.StartTime, &endTime, &duration, &exec.Status,
			&inputParamsJSON, &outputResultsJSON, &errorDetails, &resourceUsageJSON,
			&legalContextJSON, &metricsJSON, &auditTrailJSON,
		)
		if err != nil {
			continue
		}
		
		exec.EndTime = endTime
		if duration != nil {
			if d, err := time.ParseDuration(*duration); err == nil {
				exec.Duration = &d
			}
		}
		if errorDetails != "" {
			exec.ErrorDetails = &errorDetails
		}
		
		// Parse JSON fields
		json.Unmarshal([]byte(inputParamsJSON), &exec.InputParameters)
		json.Unmarshal([]byte(outputResultsJSON), &exec.OutputResults)
		json.Unmarshal([]byte(resourceUsageJSON), &exec.ResourceUsage)
		json.Unmarshal([]byte(legalContextJSON), &exec.LegalContext)
		json.Unmarshal([]byte(metricsJSON), &exec.PerformanceMetrics)
		json.Unmarshal([]byte(auditTrailJSON), &exec.AuditTrail)
		
		executions = append(executions, exec)
	}
	
	return executions, nil
}

// GetComputationAnalytics provides analytics and insights
func (cht *ComputationHistoryTracker) GetComputationAnalytics(ctx context.Context, timeRange time.Duration) (*ComputationAnalytics, error) {
	cutoffTime := time.Now().Add(-timeRange)
	
	analytics := &ComputationAnalytics{}
	
	// Get basic execution statistics
	query := `
		SELECT 
			COUNT(*) as total,
			COUNT(*) FILTER (WHERE status = 'completed') as successful,
			COUNT(*) FILTER (WHERE status = 'failed') as failed,
			AVG(EXTRACT(epoch FROM duration)) as avg_duration
		FROM computation_executions 
		WHERE start_time >= $1
	`
	
	var avgDurationSecs *float64
	err := cht.pgPool.QueryRow(ctx, query, cutoffTime).Scan(
		&analytics.TotalExecutions,
		&analytics.SuccessfulExecutions,
		&analytics.FailedExecutions,
		&avgDurationSecs,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get basic analytics: %v", err)
	}
	
	if avgDurationSecs != nil {
		analytics.AverageExecutionTime = time.Duration(*avgDurationSecs * float64(time.Second))
	}
	
	// Get most used glyphs
	glyphQuery := `
		SELECT glyph_id, COUNT(*) as execution_count, MAX(start_time) as last_used,
			   (COUNT(*) FILTER (WHERE status = 'completed')::float / COUNT(*)::float) as success_rate
		FROM computation_executions 
		WHERE start_time >= $1
		GROUP BY glyph_id
		ORDER BY execution_count DESC
		LIMIT 10
	`
	
	rows, err := cht.pgPool.Query(ctx, glyphQuery, cutoffTime)
	if err != nil {
		return nil, fmt.Errorf("failed to get glyph usage stats: %v", err)
	}
	defer rows.Close()
	
	for rows.Next() {
		var stat GlyphUsageStats
		err := rows.Scan(&stat.GlyphID, &stat.ExecutionCount, &stat.LastUsed, &stat.SuccessRate)
		if err == nil {
			analytics.MostUsedGlyphs = append(analytics.MostUsedGlyphs, stat)
		}
	}
	
	// Get error patterns
	errorQuery := `
		SELECT 
			COALESCE(error_details, 'unknown') as error_type,
			COUNT(*) as frequency,
			MAX(start_time) as last_occurred
		FROM computation_executions 
		WHERE status = 'failed' AND start_time >= $1
		GROUP BY error_details
		ORDER BY frequency DESC
		LIMIT 10
	`
	
	errorRows, err := cht.pgPool.Query(ctx, errorQuery, cutoffTime)
	if err != nil {
		return nil, fmt.Errorf("failed to get error patterns: %v", err)
	}
	defer errorRows.Close()
	
	for errorRows.Next() {
		var pattern ErrorPattern
		err := errorRows.Scan(&pattern.ErrorType, &pattern.Frequency, &pattern.LastOccurred)
		if err == nil {
			pattern.CommonCause = cht.categorizeError(pattern.ErrorType)
			analytics.ErrorPatterns = append(analytics.ErrorPatterns, pattern)
		}
	}
	
	return analytics, nil
}

// categorizeError provides common cause analysis for error patterns
func (cht *ComputationHistoryTracker) categorizeError(errorType string) string {
	// Simple error categorization - could be enhanced with ML
	switch {
	case strings.Contains(errorType, "timeout"):
		return "performance_degradation"
	case strings.Contains(errorType, "memory"):
		return "resource_exhaustion"
	case strings.Contains(errorType, "connection"):
		return "network_connectivity"
	case strings.Contains(errorType, "permission"):
		return "access_control"
	case strings.Contains(errorType, "validation"):
		return "input_validation"
	default:
		return "system_error"
	}
}

// GetLegalComplianceReport generates compliance reports
func (cht *ComputationHistoryTracker) GetLegalComplianceReport(ctx context.Context, caseID string, startDate, endDate time.Time) (map[string]interface{}, error) {
	report := make(map[string]interface{})
	
	// Get all executions for the case
	query := `
		SELECT id, glyph_id, execution_type, start_time, end_time, status,
			   audit_trail, legal_context
		FROM computation_executions 
		WHERE legal_context->>'case_id' = $1 
		AND start_time >= $2 AND start_time <= $3
		ORDER BY start_time ASC
	`
	
	rows, err := cht.pgPool.Query(ctx, query, caseID, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("failed to generate compliance report: %v", err)
	}
	defer rows.Close()
	
	var executions []map[string]interface{}
	var auditEvents []AuditEvent
	
	for rows.Next() {
		var id, glyphID, execType, status string
		var startTime, endTime time.Time
		var auditTrailJSON, legalContextJSON string
		
		err := rows.Scan(&id, &glyphID, &execType, &startTime, &endTime, &status,
			&auditTrailJSON, &legalContextJSON)
		if err != nil {
			continue
		}
		
		execution := map[string]interface{}{
			"id":             id,
			"glyph_id":       glyphID,
			"execution_type": execType,
			"start_time":     startTime,
			"end_time":       endTime,
			"status":         status,
		}
		
		var legalContext map[string]interface{}
		json.Unmarshal([]byte(legalContextJSON), &legalContext)
		execution["legal_context"] = legalContext
		
		var executionAuditTrail []AuditEvent
		json.Unmarshal([]byte(auditTrailJSON), &executionAuditTrail)
		auditEvents = append(auditEvents, executionAuditTrail...)
		
		executions = append(executions, execution)
	}
	
	report["case_id"] = caseID
	report["report_period"] = map[string]interface{}{
		"start_date": startDate,
		"end_date":   endDate,
	}
	report["total_executions"] = len(executions)
	report["executions"] = executions
	report["audit_events"] = auditEvents
	report["compliance_status"] = "compliant" // Could add more sophisticated compliance checking
	report["generated_at"] = time.Now()
	
	return report, nil
}

// CreateComputationHistoryTables creates all necessary database tables
func (cht *ComputationHistoryTracker) CreateComputationHistoryTables(ctx context.Context) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS computation_executions (
			id VARCHAR(255) PRIMARY KEY,
			glyph_id VARCHAR(255) NOT NULL,
			glyph_version VARCHAR(50) DEFAULT 'latest',
			user_id VARCHAR(255) NOT NULL,
			session_id VARCHAR(255) NOT NULL,
			execution_type VARCHAR(50) NOT NULL,
			start_time TIMESTAMP WITH TIME ZONE NOT NULL,
			end_time TIMESTAMP WITH TIME ZONE,
			duration INTERVAL,
			status VARCHAR(20) NOT NULL,
			input_parameters JSONB DEFAULT '{}',
			output_results JSONB DEFAULT '{}',
			error_details TEXT,
			resource_usage JSONB DEFAULT '{}',
			legal_context JSONB DEFAULT '{}',
			performance_metrics JSONB DEFAULT '{}',
			compliance_flags TEXT[] DEFAULT '{}',
			audit_trail JSONB DEFAULT '[]',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
			
			CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'timeout', 'cancelled')),
			CONSTRAINT valid_execution_type CHECK (execution_type IN ('generate', 'transpile', 'execute'))
		)`,
		
		// Indexes for optimal performance
		`CREATE INDEX IF NOT EXISTS idx_computation_glyph_id ON computation_executions (glyph_id)`,
		`CREATE INDEX IF NOT EXISTS idx_computation_user_id ON computation_executions (user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_computation_start_time ON computation_executions (start_time DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_computation_status ON computation_executions (status)`,
		`CREATE INDEX IF NOT EXISTS idx_computation_legal_context ON computation_executions USING GIN (legal_context)`,
		`CREATE INDEX IF NOT EXISTS idx_computation_audit_trail ON computation_executions USING GIN (audit_trail)`,
		
		// Performance analytics view
		`CREATE OR REPLACE VIEW computation_performance_summary AS
		SELECT 
			glyph_id,
			COUNT(*) as total_executions,
			COUNT(*) FILTER (WHERE status = 'completed') as successful_executions,
			COUNT(*) FILTER (WHERE status = 'failed') as failed_executions,
			AVG(EXTRACT(epoch FROM duration)) as avg_duration_seconds,
			MIN(start_time) as first_execution,
			MAX(start_time) as last_execution
		FROM computation_executions
		GROUP BY glyph_id`,
	}
	
	for i, query := range queries {
		_, err := cht.pgPool.Exec(ctx, query)
		if err != nil {
			return fmt.Errorf("failed to execute query %d: %v", i+1, err)
		}
	}
	
	log.Println("Computation history tables created successfully")
	return nil
}