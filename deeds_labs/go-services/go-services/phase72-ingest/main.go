package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
)

// Error represents a parsed svelte-check error
type Error struct {
	File    string `json:"file"`
	Line    int32  `json:"line"`
	Column  int32  `json:"column"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ParseResponse is the response from /phase72/parse
type ParseResponse struct {
	Errors []Error `json:"errors"`
	Count  int     `json:"count"`
}

// HealthResponse is the response from /health
type HealthResponse struct {
	Status string `json:"status"`
	Ready  bool   `json:"ready"`
}

// runSvelteCheck executes svelte-check and returns raw output
func runSvelteCheck() (string, error) {
	cmd := exec.Command("npx", "svelte-check", "--output", "machine")
	cmd.Dir = os.Getenv("PROJECT_ROOT")
	if cmd.Dir == "" {
		cmd.Dir = "."
	}

	out, err := cmd.CombinedOutput()
	return string(out), err
}

// parseSvelteCheckOutput parses raw svelte-check output
// Filters out PostCSS/Vite noise, only accepts well-formed JSON
func parseSvelteCheckOutput(raw string) []Error {
	var errors []Error
	lines := strings.Split(raw, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Skip empty lines
		if line == "" {
			continue
		}

		// Skip non-JSON lines (PostCSS, Vite, etc.)
		if !strings.HasPrefix(line, "{") && !strings.HasPrefix(line, "[") {
			continue
		}

		// Try to parse as JSON
		var obj map[string]interface{}
		if err := json.Unmarshal([]byte(line), &obj); err != nil {
			continue
		}

		// Validate required fields
		if obj["type"] != "error" {
			continue
		}

		filename, ok := obj["filename"].(string)
		if !ok || filename == "" {
			continue
		}

		// Extract start position
		var line32, col32 int32
		if start, ok := obj["start"].(map[string]interface{}); ok {
			if l, ok := start["line"].(float64); ok {
				line32 = int32(l)
			}
			if c, ok := start["character"].(float64); ok {
				col32 = int32(c)
			}
		}

		// Extract code and message
		code := "UNKNOWN"
		if c, ok := obj["code"].(string); ok {
			code = c
		}

		message := ""
		if m, ok := obj["text"].(string); ok {
			message = m
		}

		errors = append(errors, Error{
			File:    filename,
			Line:    line32,
			Column:  col32,
			Code:    code,
			Message: message,
		})
	}

	return errors
}

// parseHandler handles POST /phase72/parse
func parseHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Run svelte-check
	raw, err := runSvelteCheck()
	if err != nil {
		log.Printf("svelte-check error: %v", err)
		// Continue anyway, we might have partial output
	}

	// Parse output
	errors := parseSvelteCheckOutput(raw)

	// Return JSON response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ParseResponse{
		Errors: errors,
		Count:  len(errors),
	})
}

// healthHandler handles GET /health
func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(HealthResponse{
		Status: "ok",
		Ready:  true,
	})
}

func main() {
	http.HandleFunc("/phase72/parse", parseHandler)
	http.HandleFunc("/health", healthHandler)

	port := os.Getenv("PHASE72_INGEST_PORT")
	if port == "" {
		port = "8089"
	}

	addr := fmt.Sprintf(":%s", port)
	log.Printf("Phase72 ingest service listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
