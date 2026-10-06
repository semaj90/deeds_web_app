package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHealthAndStatsReportModelMetadataAndResidency(t *testing.T) {
	tests := []struct {
		name          string
		tagsStatus    int
		tagsBody      string
		processList   string
		wantBackend   bool
		wantAvailable bool
		wantLoaded    bool
		wantDimension int
		wantArtifact  string
		wantGPUActive bool
	}{
		{
			name:          "installed model is not resident",
			tagsStatus:    http.StatusOK,
			tagsBody:      `{"models":[{"name":"embeddinggemma:latest","digest":"sha256:model-a","details":{"embedding_length":768}}]}`,
			processList:   `{"models":[]}`,
			wantBackend:   true,
			wantAvailable: true,
			wantDimension: 768,
			wantArtifact:  "sha256:model-a",
		},
		{
			name:          "configured model is resident on GPU",
			tagsStatus:    http.StatusOK,
			tagsBody:      `{"models":[{"name":"embeddinggemma:latest","digest":"sha256:model-a","details":{"embedding_length":768}}]}`,
			processList:   `{"models":[{"name":"embeddinggemma:latest","model":"embeddinggemma:latest","digest":"sha256:model-a","size_vram":1024}]}`,
			wantBackend:   true,
			wantAvailable: true,
			wantLoaded:    true,
			wantDimension: 768,
			wantArtifact:  "sha256:model-a",
			wantGPUActive: true,
		},
		{
			name:          "different model is resident",
			tagsStatus:    http.StatusOK,
			tagsBody:      `{"models":[{"name":"embeddinggemma:latest","digest":"sha256:model-a","details":{"embedding_length":768}}]}`,
			processList:   `{"models":[{"name":"other:latest","model":"other:latest","digest":"sha256:other","size_vram":1024}]}`,
			wantBackend:   true,
			wantAvailable: true,
			wantDimension: 768,
			wantArtifact:  "sha256:model-a",
		},
		{
			name:          "same model name with different artifact is resident",
			tagsStatus:    http.StatusOK,
			tagsBody:      `{"models":[{"name":"embeddinggemma:latest","digest":"sha256:model-a","details":{"embedding_length":768}}]}`,
			processList:   `{"models":[{"name":"embeddinggemma:latest","model":"embeddinggemma:latest","digest":"sha256:model-b","size_vram":1024}]}`,
			wantBackend:   true,
			wantAvailable: true,
			wantDimension: 768,
			wantArtifact:  "sha256:model-a",
		},
		{
			name:        "model is unavailable",
			tagsStatus:  http.StatusOK,
			tagsBody:    `{"models":[]}`,
			processList: `{"models":[]}`,
			wantBackend: true,
		},
		{
			name:        "backend is unreachable",
			tagsStatus:  http.StatusServiceUnavailable,
			wantBackend: false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ollama := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/api/tags":
					w.WriteHeader(test.tagsStatus)
					_, _ = fmt.Fprint(w, test.tagsBody)
				case "/api/ps":
					_, _ = fmt.Fprint(w, test.processList)
				default:
					t.Errorf("unexpected backend request %s", r.URL.Path)
					http.NotFound(w, r)
				}
			}))
			defer ollama.Close()

			server := &embeddingServer{
				cfg:       config{OllamaURL: ollama.URL, EmbedModel: "embeddinggemma:latest"},
				startTime: time.Now(),
			}
			response := httptest.NewRecorder()
			httpHealthHandler(server).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/health", nil))
			if response.Code != http.StatusOK {
				t.Fatalf("GET /health status = %d; want %d", response.Code, http.StatusOK)
			}

			var health struct {
				Status                string `json:"status"`
				ModelLoaded           string `json:"model_loaded"`
				Device                string `json:"device"`
				BackendReachable      bool   `json:"backend_reachable"`
				ModelAvailable        bool   `json:"model_available"`
				RequestedModelLoaded  bool   `json:"requested_model_loaded"`
				ModelID               string `json:"model_id"`
				ModelArtifactRevision string `json:"model_artifact_revision"`
				EmbeddingDimension    int    `json:"embedding_dimension"`
				Provider              string `json:"provider"`
				GPUActive             bool   `json:"gpu_active"`
			}
			if err := json.NewDecoder(response.Body).Decode(&health); err != nil {
				t.Fatalf("decode GET /health: %v", err)
			}
			wantStatus := "healthy"
			if !test.wantBackend {
				wantStatus = "unhealthy"
			}
			wantLoadedString := fmt.Sprintf("%v", test.wantLoaded)
			if health.Status != wantStatus || health.ModelLoaded != wantLoadedString ||
				health.BackendReachable != test.wantBackend || health.ModelAvailable != test.wantAvailable ||
				health.RequestedModelLoaded != test.wantLoaded || health.ModelID != "embeddinggemma:latest" ||
				health.ModelArtifactRevision != test.wantArtifact || health.EmbeddingDimension != test.wantDimension ||
				health.Provider != "ollama" || health.GPUActive != test.wantGPUActive {
				t.Fatalf("health readback = %+v", health)
			}

			stats, err := server.GetStats(t.Context(), nil)
			if err != nil {
				t.Fatalf("GetStats: %v", err)
			}
			if stats.IsLoaded != test.wantLoaded || int(stats.EmbeddingDimension) != test.wantDimension || stats.GpuAvailable != test.wantGPUActive {
				t.Fatalf("stats residency = loaded %v, dimension %d, GPU active %v", stats.IsLoaded, stats.EmbeddingDimension, stats.GpuAvailable)
			}
		})
	}
}
