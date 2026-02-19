package core

import (
	"context"
	"encoding/json"
	"fmt"
)

// ErrorAnalysis represents agentic error analysis with embeddings
type ErrorAnalysis struct {
	ErrorID      int64             `json:"error_id"`
	ErrorCode    string            `json:"error_code"`
	FilePath     string            `json:"file_path"`
	Message      string            `json:"message"`
	Classification string          `json:"classification"` // missing_module, missing_void, syntax, type_mismatch
	Embedding    []float64         `json:"embedding,omitempty"`
	SimilarErrors []SimilarError   `json:"similar_errors,omitempty"`
	FixSuggestions []FixSuggestion `json:"fix_suggestions,omitempty"`
}

type SimilarError struct {
	ErrorID  int64   `json:"error_id"`
	FilePath string  `json:"file_path"`
	Similarity float64 `json:"similarity"`
}

type FixSuggestion struct {
	Strategy   string  `json:"strategy"`
	Confidence float64 `json:"confidence"`
	Source     string  `json:"source"` // "pattern_match", "llm", "kag"
}

// ClassifyError uses pattern matching and embeddings to classify error types
func ClassifyError(ctx context.Context, errorMsg, code string) string {
	// Pattern-based classification
	patterns := map[string][]string{
		"missing_module": {
			"Cannot find module",
			"Module not found",
			"could not find declaration file",
		},
		"missing_void": {
			"'void' only refers to a type",
			"cannot be used as a value",
			"is a type",
		},
		"syntax": {
			"expected",
			"Unexpected token",
			"';' expected",
			"',' expected",
		},
		"type_mismatch": {
			"Type.*is not assignable to type",
			"Argument of type.*is not assignable",
		},
	}

	for class, patternList := range patterns {
		for _, pattern := range patternList {
			if contains(errorMsg, pattern) || contains(code, pattern) {
				return class
			}
		}
	}

	return "unknown"
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || findSubstring(s, substr))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		match := true
		for j := 0; j < len(substr); j++ {
			if s[i+j] != substr[j] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

// AnalysisGraph represents the error dependency graph
type AnalysisGraph struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

type GraphNode struct {
	ID         string                 `json:"id"`
	Type       string                 `json:"type"` // file, error, module, symbol
	Label      string                 `json:"label"`
	ErrorCount int                    `json:"error_count,omitempty"`
	Properties map[string]interface{} `json:"properties,omitempty"`
}

type GraphEdge struct {
	From   string  `json:"from"`
	To     string  `json:"to"`
	Type   string  `json:"type"` // imports, causes, fixes, depends_on
	Weight float64 `json:"weight"`
}

// BuildErrorGraph constructs a graph from error patterns and file dependencies
func BuildErrorGraph(ctx context.Context, errors []ErrorAnalysis) *AnalysisGraph {
	graph := &AnalysisGraph{
		Nodes: []GraphNode{},
		Edges: []GraphEdge{},
	}

	nodeSet := make(map[string]bool)

	for _, err := range errors {
		// Add file node
		fileID := "file:" + err.FilePath
		if !nodeSet[fileID] {
			graph.Nodes = append(graph.Nodes, GraphNode{
				ID:    fileID,
				Type:  "file",
				Label: err.FilePath,
			})
			nodeSet[fileID] = true
		}

		// Add error node
		errorID := fmt.Sprintf("error:%s:%d", err.ErrorCode, err.ErrorID)
		if !nodeSet[errorID] {
			graph.Nodes = append(graph.Nodes, GraphNode{
				ID:    errorID,
				Type:  "error",
				Label: err.ErrorCode,
				Properties: map[string]interface{}{
					"classification": err.Classification,
					"message":        err.Message,
				},
			})
			nodeSet[errorID] = true
		}

		// Add edge: file -> error
		graph.Edges = append(graph.Edges, GraphEdge{
			From:   fileID,
			To:     errorID,
			Type:   "has_error",
			Weight: 1.0,
		})

		// Add edges to similar errors (KAG)
		for _, similar := range err.SimilarErrors {
			similarID := fmt.Sprintf("error:%d", similar.ErrorID)
			if nodeSet[similarID] {
				graph.Edges = append(graph.Edges, GraphEdge{
					From:   errorID,
					To:     similarID,
					Type:   "similar_to",
					Weight: similar.Similarity,
				})
			}
		}
	}

	return graph
}

// VisualizationData for D3.js/vis.js rendering
type VisualizationData struct {
	Graph      *AnalysisGraph          `json:"graph"`
	Statistics map[string]interface{}  `json:"statistics"`
	Timestamp  string                  `json:"timestamp"`
}

func (g *AnalysisGraph) ToJSON() (string, error) {
	data, err := json.Marshal(g)
	return string(data), err
}
