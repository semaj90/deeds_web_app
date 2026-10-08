package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHealthAndStatsReportModelMetadataAndResidency(t *testing.T) {
	digestA := "sha256:" + strings.Repeat("a", 64)
	digestB := "sha256:" + strings.Repeat("b", 64)
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
			tagsBody:      `{"models":[{"name":"embeddinggemma:latest","digest":"` + digestA + `","details":{"embedding_length":768}}]}`,
			processList:   `{"models":[]}`,
			wantBackend:   true,
			wantAvailable: true,
			wantDimension: 768,
			wantArtifact:  digestA,
		},
		{
			name:          "configured model is resident on GPU",
			tagsStatus:    http.StatusOK,
			tagsBody:      `{"models":[{"name":"embeddinggemma:latest","digest":"` + digestA + `","details":{"embedding_length":768}}]}`,
			processList:   `{"models":[{"name":"embeddinggemma:latest","model":"embeddinggemma:latest","digest":"` + digestA + `","size_vram":1024}]}`,
			wantBackend:   true,
			wantAvailable: true,
			wantLoaded:    true,
			wantDimension: 768,
			wantArtifact:  digestA,
			wantGPUActive: true,
		},
		{
			name:          "different model is resident",
			tagsStatus:    http.StatusOK,
			tagsBody:      `{"models":[{"name":"embeddinggemma:latest","digest":"` + digestA + `","details":{"embedding_length":768}}]}`,
			processList:   `{"models":[{"name":"other:latest","model":"other:latest","digest":"sha256:other","size_vram":1024}]}`,
			wantBackend:   true,
			wantAvailable: true,
			wantDimension: 768,
			wantArtifact:  digestA,
		},
		{
			name:          "same model name with different artifact is resident",
			tagsStatus:    http.StatusOK,
			tagsBody:      `{"models":[{"name":"embeddinggemma:latest","digest":"` + digestA + `","details":{"embedding_length":768}}]}`,
			processList:   `{"models":[{"name":"embeddinggemma:latest","model":"embeddinggemma:latest","digest":"` + digestB + `","size_vram":1024}]}`,
			wantBackend:   true,
			wantAvailable: true,
			wantDimension: 768,
			wantArtifact:  digestA,
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
				ServiceBuildRevision  string `json:"service_build_revision"`
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
			if health.Status != wantStatus || health.ServiceBuildRevision != compiledServiceBuildRevisionV1 || health.ModelLoaded != wantLoadedString ||
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

func TestReadyEndpointUsesReadOnlyExactRuntimeBinding(t *testing.T) {
	digestA := strings.Repeat("a", 64)
	digestB := strings.Repeat("b", 64)
	tests := []struct {
		name            string
		tags            string
		processes       string
		wantStatus      int
		wantReady       bool
		wantReason      string
		wantArtifact    string
		wantModelLoaded bool
	}{
		{
			name:            "exact resident 768-dimensional model",
			tags:            `{"models":[{"name":"embeddinggemma:latest","digest":"` + digestA + `","details":{"embedding_length":768}}]}`,
			processes:       `{"models":[{"name":"embeddinggemma:latest","model":"embeddinggemma:latest","digest":"` + digestA + `","size_vram":0}]}`,
			wantStatus:      http.StatusOK,
			wantReady:       true,
			wantArtifact:    digestA,
			wantModelLoaded: true,
		},
		{
			name:         "installed model is not resident",
			tags:         `{"models":[{"name":"embeddinggemma:latest","digest":"` + digestA + `","details":{"embedding_length":768}}]}`,
			processes:    `{"models":[]}`,
			wantStatus:   http.StatusServiceUnavailable,
			wantReason:   "MODEL_NOT_RESIDENT_OR_DIGEST_MISMATCH",
			wantArtifact: digestA,
		},
		{
			name:         "resident model digest differs",
			tags:         `{"models":[{"name":"embeddinggemma:latest","digest":"` + digestA + `","details":{"embedding_length":768}}]}`,
			processes:    `{"models":[{"name":"embeddinggemma:latest","model":"embeddinggemma:latest","digest":"` + digestB + `"}]}`,
			wantStatus:   http.StatusServiceUnavailable,
			wantReason:   "RESIDENT_MODEL_DIGEST_MISMATCH",
			wantArtifact: digestA,
		},
		{
			name:       "duplicate model tags are ambiguous",
			tags:       `{"models":[{"name":"embeddinggemma:latest","digest":"` + digestA + `","details":{"embedding_length":768}},{"name":"embeddinggemma:latest","digest":"` + digestB + `","details":{"embedding_length":768}}]}`,
			processes:  `{"models":[]}`,
			wantStatus: http.StatusServiceUnavailable,
			wantReason: "MODEL_IDENTITY_UNQUALIFIED",
		},
		{
			name:            "wrong vector dimension is unavailable",
			tags:            `{"models":[{"name":"embeddinggemma:latest","digest":"` + digestA + `","details":{"embedding_length":384}}]}`,
			processes:       `{"models":[{"name":"embeddinggemma:latest","model":"embeddinggemma:latest","digest":"` + digestA + `"}]}`,
			wantStatus:      http.StatusServiceUnavailable,
			wantReason:      "SEMANTIC_768_DIMENSION_REQUIRED",
			wantArtifact:    digestA,
			wantModelLoaded: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			postRequests := 0
			ollama := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodGet {
					postRequests++
					http.Error(w, "unexpected mutating readiness request", http.StatusMethodNotAllowed)
					return
				}
				switch r.URL.Path {
				case "/api/tags":
					_, _ = fmt.Fprint(w, test.tags)
				case "/api/ps":
					_, _ = fmt.Fprint(w, test.processes)
				default:
					t.Errorf("unexpected backend path %s", r.URL.Path)
					http.NotFound(w, r)
				}
			}))
			defer ollama.Close()

			server := &embeddingServer{
				cfg:       config{OllamaURL: ollama.URL, EmbedModel: "embeddinggemma:latest"},
				startTime: time.Now(),
			}
			response := httptest.NewRecorder()
			httpReadyHandler(server).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/ready", nil))
			var result readyProbeResult
			if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
				t.Fatalf("decode GET /ready: %v", err)
			}
			if response.Code != test.wantStatus || result.Ready != test.wantReady || result.UnavailableReason != test.wantReason ||
				result.ModelArtifact != test.wantArtifact || result.ModelLoaded != test.wantModelLoaded {
				t.Fatalf("ready readback = status %d, %+v", response.Code, result)
			}
			if result.WarmupSucceeded || result.Normalized || postRequests != 0 {
				t.Fatalf("readiness performed inference or claimed unobserved vector properties: %+v, POSTs=%d", result, postRequests)
			}
		})
	}
}
