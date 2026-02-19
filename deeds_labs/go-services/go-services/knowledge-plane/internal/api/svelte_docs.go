package api

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// SvelteDocsRequest for searching Svelte 5 documentation
type SvelteDocsRequest struct {
	Query   string `json:"query"`
	MaxHits int    `json:"max_hits"`
}

// SvelteDocsResponse contains matched documentation chunks
type SvelteDocsResponse struct {
	Hits []DocHit `json:"hits"`
}

type DocHit struct {
	Source  string `json:"source"`
	Content string `json:"content"`
	Score   float64 `json:"score"`
}

// handleSvelteDocs searches local Svelte 5/SvelteKit 2/bits-ui documentation
func (h *Handler) handleSvelteDocs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SvelteDocsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if req.MaxHits == 0 {
		req.MaxHits = 10
	}

	// Search local documentation files
	docsPath := filepath.Join("sveltekit-frontend", "data", "svelte-docs")

	hits := []DocHit{}

	// Search svelte.txt
	svelteHits := h.ripgrepSearch(filepath.Join(docsPath, "svelte.txt"), req.Query, req.MaxHits)
	hits = append(hits, svelteHits...)

	// Search sveltekit.txt
	sveltekitHits := h.ripgrepSearch(filepath.Join(docsPath, "sveltekit.txt"), req.Query, req.MaxHits)
	hits = append(hits, sveltekitHits...)

	// Search codebase for real-world examples
	codebaseHits := h.searchCodebasePatterns(req.Query, req.MaxHits)
	hits = append(hits, codebaseHits...)

	// Limit total hits
	if len(hits) > req.MaxHits {
		hits = hits[:req.MaxHits]
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SvelteDocsResponse{Hits: hits})
}

// ripgrepSearch uses ripgrep to search documentation files
func (h *Handler) ripgrepSearch(filePath, query string, maxHits int) []DocHit {
	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		h.log.Warn("doc file not found", "path", filePath)
		return nil
	}

	// Use ripgrep for fast searching
	// -C 3: 3 lines of context before/after
	// -i: case insensitive
	// --max-count: limit matches per file
	cmd := exec.Command("rg", "-C", "3", "-i", "--max-count", string(rune(maxHits)), query, filePath)
	output, err := cmd.Output()
	if err != nil {
		// rg returns exit code 1 if no matches (not an error)
		if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() == 1 {
			return nil
		}
		h.log.Error("ripgrep failed", "error", err, "file", filePath)
		return nil
	}

	// Parse output into hits
	hits := []DocHit{}
	chunks := strings.Split(string(output), "--\n")

	for i, chunk := range chunks {
		if strings.TrimSpace(chunk) == "" {
			continue
		}

		hits = append(hits, DocHit{
			Source:  filepath.Base(filePath),
			Content: chunk,
			Score:   1.0 - (float64(i) / float64(len(chunks))), // Descending score
		})
	}

	return hits
}

// searchCodebasePatterns searches for real Svelte 5/SvelteKit 2/bits-ui patterns
func (h *Handler) searchCodebasePatterns(query string, maxHits int) []DocHit {
	patterns := []string{
		// Svelte 5 runes
		`\$state`,
		`\$derived`,
		`\$effect`,
		`\$props`,
		// SvelteKit 2 patterns
		`export let data`,
		`export const load`,
		`+page.svelte`,
		`+layout.svelte`,
		// bits-ui patterns
		`from "bits-ui"`,
		`<Dialog.`,
		`<Popover.`,
	}

	hits := []DocHit{}

	// Search for specific patterns if query matches
	queryLower := strings.ToLower(query)
	for _, pattern := range patterns {
		if strings.Contains(queryLower, strings.ToLower(pattern)) ||
		   strings.Contains(strings.ToLower(pattern), queryLower) {

			// Search .svelte files
			cmd := exec.Command("rg", "-t", "svelte", "-C", "2", "--max-count", "5", pattern, "sveltekit-frontend/src")
			output, err := cmd.Output()

			if err == nil && len(output) > 0 {
				hits = append(hits, DocHit{
					Source:  "codebase",
					Content: string(output),
					Score:   0.9,
				})
			}
		}
	}

	return hits
}

// handleErrorVisualization returns error map visualization data
func (h *Handler) handleErrorVisualization(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Query error statistics from database
	errorStats, err := h.getErrorStatistics(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Get file dependency graph
	fileGraph, err := h.getFileDependencyGraph(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Combine into visualization data
	vizData := map[string]interface{}{
		"error_stats": errorStats,
		"file_graph":  fileGraph,
		"timestamp":   "2025-12-28",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(vizData)
}

// getErrorStatistics retrieves error patterns and counts
func (h *Handler) getErrorStatistics(ctx context.Context) (map[string]interface{}, error) {
	query := `
		SELECT
			error_code,
			COUNT(*) as count,
			COUNT(DISTINCT file_path) as affected_files,
			AVG(impact_score) as avg_impact
		FROM ts_errors
		WHERE status = 'open'
		GROUP BY error_code
		ORDER BY count DESC
		LIMIT 20
	`

	rows, err := h.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stats := []map[string]interface{}{}
	for rows.Next() {
		var code string
		var count, affectedFiles int
		var avgImpact float64

		if err := rows.Scan(&code, &count, &affectedFiles, &avgImpact); err != nil {
			continue
		}

		stats = append(stats, map[string]interface{}{
			"code":           code,
			"count":          count,
			"affected_files": affectedFiles,
			"avg_impact":     avgImpact,
		})
	}

	return map[string]interface{}{
		"top_errors": stats,
	}, nil
}

// getFileDependencyGraph builds a dependency graph from error patterns
func (h *Handler) getFileDependencyGraph(ctx context.Context) (map[string]interface{}, error) {
	// Query files with errors
	query := `
		SELECT DISTINCT file_path, error_code, COUNT(*) as error_count
		FROM ts_errors
		WHERE status = 'open'
		GROUP BY file_path, error_code
		ORDER BY error_count DESC
		LIMIT 100
	`

	rows, err := h.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	nodes := []map[string]interface{}{}
	edges := []map[string]interface{}{}

	nodeSet := make(map[string]bool)

	for rows.Next() {
		var filePath, errorCode string
		var errorCount int

		if err := rows.Scan(&filePath, &errorCode, &errorCount); err != nil {
			continue
		}

		// Add file node if not exists
		if !nodeSet[filePath] {
			nodes = append(nodes, map[string]interface{}{
				"id":    filePath,
				"type":  "file",
				"size":  errorCount,
			})
			nodeSet[filePath] = true
		}

		// Add error code node
		errorNodeID := "error:" + errorCode
		if !nodeSet[errorNodeID] {
			nodes = append(nodes, map[string]interface{}{
				"id":   errorNodeID,
				"type": "error_code",
				"label": errorCode,
			})
			nodeSet[errorNodeID] = true
		}

		// Add edge from file to error
		edges = append(edges, map[string]interface{}{
			"from":   filePath,
			"to":     errorNodeID,
			"weight": errorCount,
		})
	}

	return map[string]interface{}{
		"nodes": nodes,
		"edges": edges,
	}, nil
}
