package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// SvelteDocsSearchRequest for searching Svelte 5 documentation
type SvelteDocsSearchRequest struct {
	Query      string   `json:"query"`
	Sources    []string `json:"sources,omitempty"`    // ["svelte", "sveltekit", "codebase", "bits-ui"]
	MaxResults int      `json:"max_results,omitempty"` // default 20
	Context    int      `json:"context,omitempty"`     // lines of context (default 3)
}

// SvelteDocsSearchResponse returns matched documentation snippets
type SvelteDocsSearchResponse struct {
	Results   []SvelteDocResult `json:"results"`
	Query     string            `json:"query"`
	Sources   []string          `json:"sources"`
	Timestamp string            `json:"timestamp"`
	Meta      map[string]any    `json:"meta,omitempty"`
}

// SvelteDocResult represents a single documentation match
type SvelteDocResult struct {
	Source   string `json:"source"`   // "svelte.txt", "sveltekit.txt", "src/routes/+page.svelte"
	Line     int    `json:"line"`
	Match    string `json:"match"`
	Context  string `json:"context"`  // surrounding lines
	Snippet  string `json:"snippet"`  // clean snippet for LLM
	Category string `json:"category"` // "rune", "api", "component", "store", etc.
}

// SvelteDocsSearch handles documentation search for Svelte 5/SvelteKit 2
func (h *Handlers) SvelteDocsSearch(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	var req SvelteDocsSearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
		return
	}

	if req.Query == "" {
		http.Error(w, "query is required", http.StatusBadRequest)
		return
	}

	if req.MaxResults == 0 {
		req.MaxResults = 20
	}
	if req.Context == 0 {
		req.Context = 3
	}
	if len(req.Sources) == 0 {
		req.Sources = []string{"svelte", "sveltekit", "codebase"}
	}

	start := time.Now()
	results := []SvelteDocResult{}

	// Search paths - allow override via env var
	workspaceRoot := os.Getenv("WORKSPACE_ROOT")
	if workspaceRoot == "" {
		workspaceRoot = "C:\\Users\\james\\Videos\\deeds-web-app"
	}
	docsBase := filepath.Join(workspaceRoot, "sveltekit-frontend", "data", "svelte-docs")
	codebaseBase := filepath.Join(workspaceRoot, "sveltekit-frontend", "src")

	for _, source := range req.Sources {
		switch source {
		case "svelte":
			hits := h.ripgrepSearch(ctx, req.Query, filepath.Join(docsBase, "svelte.txt"), req.Context, req.MaxResults-len(results))
			for _, hit := range hits {
				results = append(results, SvelteDocResult{
					Source:   "svelte.txt",
					Line:     hit.Line,
					Match:    hit.Match,
					Context:  hit.Context,
					Snippet:  cleanSnippet(hit.Context),
					Category: categorizeSnippet(hit.Match),
				})
			}

		case "sveltekit":
			hits := h.ripgrepSearch(ctx, req.Query, filepath.Join(docsBase, "sveltekit.txt"), req.Context, req.MaxResults-len(results))
			for _, hit := range hits {
				results = append(results, SvelteDocResult{
					Source:   "sveltekit.txt",
					Line:     hit.Line,
					Match:    hit.Match,
					Context:  hit.Context,
					Snippet:  cleanSnippet(hit.Context),
					Category: categorizeSnippet(hit.Match),
				})
			}

		case "codebase":
			// Search for Svelte 5 patterns in codebase
			patterns := []string{
				`\$state\(`,
				`\$derived\(`,
				`\$effect\(`,
				`\$props\(`,
				`\.svelte\.ts`,
				`import.*bits-ui`,
			}
			for _, pattern := range patterns {
				hits := h.ripgrepSearch(ctx, pattern, codebaseBase, req.Context, 5)
				for _, hit := range hits {
					results = append(results, SvelteDocResult{
						Source:   hit.File,
						Line:     hit.Line,
						Match:    hit.Match,
						Context:  hit.Context,
						Snippet:  cleanSnippet(hit.Context),
						Category: "codebase-example",
					})
				}
			}

		case "bits-ui":
			// Search bits-ui imports and usage
			hits := h.ripgrepSearch(ctx, `bits-ui|@bits-ui`, codebaseBase, req.Context, req.MaxResults-len(results))
			for _, hit := range hits {
				results = append(results, SvelteDocResult{
					Source:   hit.File,
					Line:     hit.Line,
					Match:    hit.Match,
					Context:  hit.Context,
					Snippet:  cleanSnippet(hit.Context),
					Category: "bits-ui",
				})
			}
		}

		if len(results) >= req.MaxResults {
			break
		}
	}

	response := SvelteDocsSearchResponse{
		Results:   results,
		Query:     req.Query,
		Sources:   req.Sources,
		Timestamp: time.Now().Format(time.RFC3339),
		Meta: map[string]any{
			"total_results": len(results),
			"duration_ms":   time.Since(start).Milliseconds(),
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ripgrepHit represents a single ripgrep match
type ripgrepHit struct {
	File    string
	Line    int
	Match   string
	Context string
}

// ripgrepSearch executes ripgrep and returns matches
func (h *Handlers) ripgrepSearch(ctx context.Context, pattern, path string, contextLines, maxResults int) []ripgrepHit {
	args := []string{
		"-i", // case-insensitive
		"--line-number",
		"--context", fmt.Sprintf("%d", contextLines),
		"--max-count", fmt.Sprintf("%d", maxResults),
		"--no-heading",
		"--with-filename",
		pattern,
		path,
	}

	cmd := exec.CommandContext(ctx, "rg", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	log.Printf("[DEBUG] Running ripgrep: rg %v", strings.Join(args, " "))

	if err := cmd.Run(); err != nil {
		// rg returns exit code 1 if no matches, which is not an error
		if exitErr, ok := err.(*exec.ExitError); !ok || exitErr.ExitCode() != 1 {
			log.Printf("[ERROR] ripgrep failed: %v, stderr: %s", err, stderr.String())
			return nil
		}
		// Exit code 1 = no matches found, return empty
		log.Printf("[DEBUG] ripgrep: no matches found for pattern: %s", pattern)
		return nil
	}

	output := stdout.String()
	log.Printf("[DEBUG] ripgrep output length: %d bytes", len(output))

	return parseRipgrepOutput(output)
}

// parseRipgrepOutput parses ripgrep output into structured hits
func parseRipgrepOutput(output string) []ripgrepHit {
	lines := strings.Split(output, "\n")
	hits := []ripgrepHit{}
	var currentHit *ripgrepHit
	var contextBuffer []string

	for _, line := range lines {
		if line == "" || line == "--" {
			if currentHit != nil && len(contextBuffer) > 0 {
				currentHit.Context = strings.Join(contextBuffer, "\n")
				hits = append(hits, *currentHit)
				currentHit = nil
				contextBuffer = nil
			}
			continue
		}

		// Parse line format: "file:line:content" or "file-line-content" (context)
		parts := strings.SplitN(line, ":", 3)
		if len(parts) < 3 {
			parts = strings.SplitN(line, "-", 3)
		}

		if len(parts) == 3 {
			file := parts[0]
			lineNum := 0
			fmt.Sscanf(parts[1], "%d", &lineNum)
			content := parts[2]

			if strings.Contains(line, ":") && !strings.HasPrefix(line, "-") {
				// This is a match line
				if currentHit != nil && len(contextBuffer) > 0 {
					currentHit.Context = strings.Join(contextBuffer, "\n")
					hits = append(hits, *currentHit)
				}

				currentHit = &ripgrepHit{
					File:  file,
					Line:  lineNum,
					Match: content,
				}
				contextBuffer = []string{content}
			} else {
				// This is context
				if currentHit != nil {
					contextBuffer = append(contextBuffer, content)
				}
			}
		}
	}

	// Add final hit
	if currentHit != nil && len(contextBuffer) > 0 {
		currentHit.Context = strings.Join(contextBuffer, "\n")
		hits = append(hits, *currentHit)
	}

	return hits
}

// cleanSnippet removes extra whitespace and formats for LLM consumption
func cleanSnippet(text string) string {
	lines := strings.Split(text, "\n")
	cleaned := []string{}
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			cleaned = append(cleaned, trimmed)
		}
	}
	return strings.Join(cleaned, "\n")
}

// categorizeSnippet determines the category based on content
func categorizeSnippet(text string) string {
	text = strings.ToLower(text)

	if strings.Contains(text, "$state") {
		return "rune:state"
	}
	if strings.Contains(text, "$derived") {
		return "rune:derived"
	}
	if strings.Contains(text, "$effect") {
		return "rune:effect"
	}
	if strings.Contains(text, "$props") {
		return "rune:props"
	}
	if strings.Contains(text, ".svelte.ts") {
		return "typescript-module"
	}
	if strings.Contains(text, "load(") || strings.Contains(text, "+page.server") {
		return "sveltekit:load"
	}
	if strings.Contains(text, "actions") || strings.Contains(text, "+page.server") {
		return "sveltekit:actions"
	}
	if strings.Contains(text, "bits-ui") {
		return "bits-ui:component"
	}
	if strings.Contains(text, "import") {
		return "import"
	}

	return "general"
}
