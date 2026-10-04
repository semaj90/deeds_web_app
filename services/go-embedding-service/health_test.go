package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	pb "github.com/deeds-web-app/services/go-embedding-service/proto/embedding"
)

func TestHealthReportsLoadedModelFromRunningModelList(t *testing.T) {
	tests := []struct {
		name        string
		processList string
		wantLoaded  string
	}{
		{name: "model installed but not loaded", processList: `{"models":[]}`, wantLoaded: "false"},
		{name: "configured model loaded", processList: `{"models":[{"name":"embeddinggemma:latest","model":"embeddinggemma:latest"}]}`, wantLoaded: "true"},
		{name: "different model loaded", processList: `{"models":[{"name":"other:latest","model":"other:latest"}]}`, wantLoaded: "false"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ollama := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/api/tags":
					w.WriteHeader(http.StatusOK)
				case "/api/ps":
					_, _ = fmt.Fprint(w, test.processList)
				default:
					http.NotFound(w, r)
				}
			}))
			defer ollama.Close()

			server := &embeddingServer{cfg: config{OllamaURL: ollama.URL, EmbedModel: "embeddinggemma:latest"}}
			response := httptest.NewRecorder()
			httpHealthHandler(server).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/health", nil))
			if response.Code != http.StatusOK {
				t.Fatalf("GET /health status = %d; want %d", response.Code, http.StatusOK)
			}
			var result pb.HealthResponse
			if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
				t.Fatalf("decode GET /health: %v", err)
			}
			if result.Status != "healthy" || result.ModelLoaded != test.wantLoaded {
				t.Fatalf("Health = status %q, model_loaded %q; want healthy, %q", result.Status, result.ModelLoaded, test.wantLoaded)
			}
		})
	}
}
