package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/redis/go-redis/v9"
)

func TestResolveEmbeddingCapabilityV2BindsImmutableOwners(t *testing.T) {
	t.Setenv("EMBEDDING_SERVICE_BUILD_REVISION", "sha256:"+strings.Repeat("a", 64))
	t.Setenv("EMBEDDING_TOKENIZER_REVISION", "sha256:"+strings.Repeat("c", 64))
	t.Setenv("EMBEDDING_INPUT_POLICY_REVISION", "no-truncate-1800-v1")
	t.Setenv("EMBEDDING_CONTENT_SELECTION_REVISIONS", "symbol-window-v2,whole-file-v2")
	modelDigest := strings.Repeat("b", 64)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/tags":
			fmt.Fprintf(w, `{"models":[{"name":"embeddinggemma:latest","digest":"%s","details":{"embedding_length":768}}]}`, modelDigest)
		case "/api/version":
			fmt.Fprint(w, `{"version":"0.34.4"}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	cfg := config{OllamaURL: server.URL, EmbedModel: "embeddinggemma:latest"}
	first, err := resolveEmbeddingCapabilityV2(context.Background(), cfg, "symbol-window-v2", "no-truncate-1800-v1")
	if err != nil {
		t.Fatalf("resolve capability: %v", err)
	}
	if first.Schema != embeddingCapabilitySchemaV2 || first.OllamaModelDigest != "sha256:"+modelDigest ||
		first.GGUFArtifactDigest != nil || first.GGUFArtifactBindingStatus != "UNAVAILABLE_NOT_PROVEN" ||
		first.TokenizerBindingStatus != "CONFIGURED_REVISION_NOT_RUNTIME_ATTESTED" {
		t.Fatalf("identity not retained: %+v", first)
	}
	if !strings.HasPrefix(first.TokenizerRevision, "sha256:") || !strings.HasPrefix(first.RepresentationRevision, "sha256:") {
		t.Fatalf("missing revisions: %+v", first)
	}
	changedPolicy, err := resolveEmbeddingCapabilityV2(context.Background(), cfg, "whole-file-v2", "no-truncate-1800-v1")
	if err != nil {
		t.Fatalf("resolve changed policy: %v", err)
	}
	if changedPolicy.RepresentationRevision == first.RepresentationRevision {
		t.Fatal("content selection revision must change representation identity")
	}
}

func TestResolveEmbeddingCapabilityV2FailsClosedWithoutBuildIdentity(t *testing.T) {
	t.Setenv("EMBEDDING_SERVICE_BUILD_REVISION", "")
	t.Setenv("EMBEDDING_INPUT_POLICY_REVISION", "input-v1")
	t.Setenv("EMBEDDING_CONTENT_SELECTION_REVISIONS", "selection-v1")
	_, err := resolveEmbeddingCapabilityV2(context.Background(), config{EmbedModel: "embeddinggemma:latest"}, "selection-v1", "input-v1")
	if err == nil || !strings.Contains(err.Error(), "EMBEDDING_CAPABILITY_IDENTITY_INCOMPLETE") {
		t.Fatalf("expected fail-closed build identity error, got %v", err)
	}
}

func TestResolveEmbeddingCapabilityV2FailsClosedWithoutTokenizerRevision(t *testing.T) {
	t.Setenv("EMBEDDING_SERVICE_BUILD_REVISION", "sha256:"+strings.Repeat("a", 64))
	t.Setenv("EMBEDDING_TOKENIZER_REVISION", "")
	t.Setenv("EMBEDDING_INPUT_POLICY_REVISION", "input-v1")
	t.Setenv("EMBEDDING_CONTENT_SELECTION_REVISIONS", "selection-v1")
	_, err := resolveEmbeddingCapabilityV2(context.Background(), config{EmbedModel: "embeddinggemma:latest"}, "selection-v1", "input-v1")
	if err == nil || !strings.Contains(err.Error(), "TOKENIZER_REVISION_UNQUALIFIED") {
		t.Fatalf("expected fail-closed tokenizer revision error, got %v", err)
	}
}

func TestEmbeddingCacheKeyV2SeparatesRepresentationAndInput(t *testing.T) {
	k1 := embeddingCacheKeyV2("sha256:"+strings.Repeat("a", 64), "sha256:"+strings.Repeat("b", 64), "sha256:"+strings.Repeat("d", 64))
	kModel := embeddingCacheKeyV2("sha256:"+strings.Repeat("c", 64), "sha256:"+strings.Repeat("b", 64), "sha256:"+strings.Repeat("d", 64))
	kArtifact := embeddingCacheKeyV2("sha256:"+strings.Repeat("a", 64), "sha256:"+strings.Repeat("e", 64), "sha256:"+strings.Repeat("d", 64))
	kInput := embeddingCacheKeyV2("sha256:"+strings.Repeat("a", 64), "sha256:"+strings.Repeat("b", 64), "sha256:"+strings.Repeat("f", 64))
	if !strings.HasPrefix(k1, "embed:v2:") || k1 == kModel || k1 == kArtifact || k1 == kInput {
		t.Fatalf("cache key does not separate identity coordinates: %q %q %q %q", k1, kModel, kArtifact, kInput)
	}
}

func TestEmbeddingCapabilityCacheEligibilityV2RequiresIndependentBindings(t *testing.T) {
	digest := "sha256:" + strings.Repeat("a", 64)
	base := embeddingCapabilityV2{
		GGUFArtifactDigest:        &digest,
		GGUFArtifactBindingStatus: "INDEPENDENT_READBACK_VERIFIED",
		TokenizerBindingStatus:    "INDEPENDENT_READBACK_VERIFIED",
	}
	if !embeddingCapabilityCacheEligibleV2(base) {
		t.Fatal("independently read-back artifact and tokenizer bindings should permit cache access")
	}

	cases := []struct {
		name   string
		mutate func(*embeddingCapabilityV2)
	}{
		{name: "missing artifact digest", mutate: func(c *embeddingCapabilityV2) { c.GGUFArtifactDigest = nil }},
		{name: "invalid artifact digest", mutate: func(c *embeddingCapabilityV2) { invalid := "sha256:unknown"; c.GGUFArtifactDigest = &invalid }},
		{name: "unverified artifact", mutate: func(c *embeddingCapabilityV2) { c.GGUFArtifactBindingStatus = "UNAVAILABLE_NOT_PROVEN" }},
		{name: "unverified tokenizer", mutate: func(c *embeddingCapabilityV2) { c.TokenizerBindingStatus = "CONFIGURED_REVISION_NOT_RUNTIME_ATTESTED" }},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			capability := base
			testCase.mutate(&capability)
			if embeddingCapabilityCacheEligibleV2(capability) {
				t.Fatal("cache access must remain disabled without both independent bindings")
			}
		})
	}
}

func TestStrictEmbeddingHandlerV2EmitsBoundReceiptWithoutCanonicalAuthority(t *testing.T) {
	t.Setenv("EMBEDDING_SERVICE_BUILD_REVISION", "sha256:"+strings.Repeat("a", 64))
	t.Setenv("EMBEDDING_TOKENIZER_REVISION", "sha256:"+strings.Repeat("c", 64))
	t.Setenv("EMBEDDING_INPUT_POLICY_REVISION", "no-truncate-1800-v1")
	t.Setenv("EMBEDDING_CONTENT_SELECTION_REVISIONS", "symbol-window-v2")
	modelDigest := strings.Repeat("b", 64)
	vector := make([]float32, embeddingDimensionV2)
	for i := range vector {
		vector[i] = float32(1 / math.Sqrt(float64(embeddingDimensionV2)))
	}
	encodedVector, err := json.Marshal([][]float32{vector})
	if err != nil {
		t.Fatal(err)
	}
	ollama := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/tags":
			fmt.Fprintf(w, `{"models":[{"name":"embeddinggemma:latest","digest":"%s","details":{"embedding_length":768}}]}`, modelDigest)
		case "/api/version":
			fmt.Fprint(w, `{"version":"0.34.4"}`)
		case "/api/ps":
			fmt.Fprintf(w, `{"models":[{"name":"embeddinggemma:latest","model":"embeddinggemma:latest","digest":"%s"}]}`, modelDigest)
		case "/api/embed":
			var received struct {
				Model string   `json:"model"`
				Input []string `json:"input"`
			}
			if err := json.NewDecoder(r.Body).Decode(&received); err != nil || received.Model != "embeddinggemma:latest" || len(received.Input) != 1 || received.Input[0] != "exact admitted input bytes" {
				t.Errorf("embed executor did not receive exact admitted input: %+v err=%v", received, err)
				http.Error(w, "wrong embedding input", http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"model":"embeddinggemma:latest","embeddings":%s}`, encodedVector)
		default:
			http.NotFound(w, r)
		}
	}))
	defer ollama.Close()
	var cacheDialAttempts atomic.Int64
	cache := redis.NewClient(&redis.Options{
		Addr: "127.0.0.1:6379",
		Dialer: func(context.Context, string, string) (net.Conn, error) {
			cacheDialAttempts.Add(1)
			return nil, errors.New("unexpected cache access in unqualified embedding test")
		},
	})
	defer cache.Close()

	text := "exact admitted input bytes"
	input := strictEmbeddingRequestV2{
		Text: text, InputChecksum: sha256PrefixedV2([]byte(text)),
		InputArtifactChecksum:    sha256PrefixedV2([]byte("compiler artifact")),
		ContentSelectionRevision: "symbol-window-v2", InputPolicyRevision: "no-truncate-1800-v1",
	}
	requestBody, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/embed/v2", strings.NewReader(string(requestBody)))
	response := httptest.NewRecorder()
	httpStrictEmbedHandlerV2(&embeddingServer{cfg: config{OllamaURL: ollama.URL, EmbedModel: "embeddinggemma:latest"}, rdb: cache})(response, req)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var decoded strictEmbeddingResponseV2
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Status != "OBSERVATION_ONLY" || decoded.Receipt == nil || decoded.Capability == nil {
		t.Fatalf("missing observation-only receipt/capability: %+v", decoded)
	}
	if cacheDialAttempts.Load() != 0 || decoded.Capability.GGUFArtifactBindingStatus != "UNAVAILABLE_NOT_PROVEN" || decoded.Capability.TokenizerBindingStatus != "CONFIGURED_REVISION_NOT_RUNTIME_ATTESTED" {
		t.Fatalf("unqualified response touched cache or overstated binding: cache_dials=%d capability=%+v", cacheDialAttempts.Load(), decoded.Capability)
	}
	if decoded.Receipt.CanonicalAuthority || decoded.Receipt.InputChecksum != input.InputChecksum ||
		decoded.Receipt.InputArtifactChecksum != input.InputArtifactChecksum ||
		decoded.Receipt.ContentSelectionRevision != input.ContentSelectionRevision ||
		decoded.Receipt.VectorChecksum == "" || decoded.Capability.Dimensions != embeddingDimensionV2 {
		t.Fatalf("receipt did not bind required identity coordinates: %+v", decoded)
	}
	if decoded.Receipt.OllamaModelDigest != "sha256:"+modelDigest || decoded.Receipt.GGUFArtifactDigest != nil ||
		decoded.Receipt.RuntimeBindingStatus != "OBSERVED_PRE_POST_RESIDENT_DIGEST_STABLE" ||
		decoded.Receipt.ResidentModelDigestBefore != "sha256:"+modelDigest ||
		decoded.Receipt.ResidentModelDigestAfter != "sha256:"+modelDigest ||
		decoded.Receipt.ResponseModelName != "embeddinggemma:latest" || decoded.Receipt.AtomicPerCallModelBinding {
		t.Fatalf("runtime observations overstated or conflated model identity: %+v", decoded.Receipt)
	}
}

func TestStrictEmbeddingHandlerV2FailsClosedWhenModelAliasChangesDuringInference(t *testing.T) {
	t.Setenv("EMBEDDING_SERVICE_BUILD_REVISION", "sha256:"+strings.Repeat("a", 64))
	t.Setenv("EMBEDDING_TOKENIZER_REVISION", "sha256:"+strings.Repeat("c", 64))
	t.Setenv("EMBEDDING_INPUT_POLICY_REVISION", "no-truncate-1800-v1")
	t.Setenv("EMBEDDING_CONTENT_SELECTION_REVISIONS", "symbol-window-v2")
	firstDigest := strings.Repeat("b", 64)
	secondDigest := strings.Repeat("d", 64)
	tagReads := 0
	vector := make([]float32, embeddingDimensionV2)
	for i := range vector {
		vector[i] = float32(1 / math.Sqrt(float64(embeddingDimensionV2)))
	}
	encodedVector, err := json.Marshal([][]float32{vector})
	if err != nil {
		t.Fatal(err)
	}
	ollama := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/tags":
			tagReads++
			digest := firstDigest
			if tagReads > 1 {
				digest = secondDigest
			}
			fmt.Fprintf(w, `{"models":[{"name":"embeddinggemma:latest","digest":"%s","details":{"embedding_length":768}}]}`, digest)
		case "/api/version":
			fmt.Fprint(w, `{"version":"0.34.4"}`)
		case "/api/ps":
			fmt.Fprintf(w, `{"models":[{"name":"embeddinggemma:latest","model":"embeddinggemma:latest","digest":"%s"}]}`, firstDigest)
		case "/api/embed":
			fmt.Fprintf(w, `{"model":"embeddinggemma:latest","embeddings":%s}`, encodedVector)
		default:
			http.NotFound(w, r)
		}
	}))
	defer ollama.Close()

	text := "exact admitted input bytes"
	input := strictEmbeddingRequestV2{
		Text: text, InputChecksum: sha256PrefixedV2([]byte(text)),
		InputArtifactChecksum:    sha256PrefixedV2([]byte("compiler artifact")),
		ContentSelectionRevision: "symbol-window-v2", InputPolicyRevision: "no-truncate-1800-v1",
	}
	requestBody, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	httpStrictEmbedHandlerV2(&embeddingServer{cfg: config{OllamaURL: ollama.URL, EmbedModel: "embeddinggemma:latest"}})(response, httptest.NewRequest(http.MethodPost, "/embed/v2", strings.NewReader(string(requestBody))))
	if response.Code != http.StatusConflict || !strings.Contains(response.Body.String(), "MODEL_IDENTITY_CHANGED_DURING_REQUEST") {
		t.Fatalf("expected alias-drift fail-closed response; status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestStrictEmbeddingHandlerV2RejectsLoadedModelDigestDrift(t *testing.T) {
	t.Setenv("EMBEDDING_SERVICE_BUILD_REVISION", "sha256:"+strings.Repeat("a", 64))
	t.Setenv("EMBEDDING_TOKENIZER_REVISION", "sha256:"+strings.Repeat("c", 64))
	t.Setenv("EMBEDDING_INPUT_POLICY_REVISION", "no-truncate-1800-v1")
	t.Setenv("EMBEDDING_CONTENT_SELECTION_REVISIONS", "symbol-window-v2")
	expectedDigest := strings.Repeat("b", 64)
	loadedDigest := strings.Repeat("d", 64)
	vector := make([]float32, embeddingDimensionV2)
	for i := range vector {
		vector[i] = float32(1 / math.Sqrt(float64(embeddingDimensionV2)))
	}
	encodedVector, err := json.Marshal([][]float32{vector})
	if err != nil {
		t.Fatal(err)
	}
	ollama := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/tags":
			fmt.Fprintf(w, `{"models":[{"name":"embeddinggemma:latest","digest":"%s","details":{"embedding_length":768}}]}`, expectedDigest)
		case "/api/version":
			fmt.Fprint(w, `{"version":"0.34.4"}`)
		case "/api/embed":
			fmt.Fprintf(w, `{"embeddings":%s}`, encodedVector)
		case "/api/ps":
			fmt.Fprintf(w, `{"models":[{"name":"embeddinggemma:latest","model":"embeddinggemma:latest","digest":"%s"}]}`, loadedDigest)
		default:
			http.NotFound(w, r)
		}
	}))
	defer ollama.Close()

	text := "exact admitted input bytes"
	input := strictEmbeddingRequestV2{
		Text: text, InputChecksum: sha256PrefixedV2([]byte(text)),
		InputArtifactChecksum:    sha256PrefixedV2([]byte("compiler artifact")),
		ContentSelectionRevision: "symbol-window-v2", InputPolicyRevision: "no-truncate-1800-v1",
	}
	requestBody, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	httpStrictEmbedHandlerV2(&embeddingServer{cfg: config{OllamaURL: ollama.URL, EmbedModel: "embeddinggemma:latest"}})(response, httptest.NewRequest(http.MethodPost, "/embed/v2", strings.NewReader(string(requestBody))))
	if response.Code != http.StatusConflict || !strings.Contains(response.Body.String(), "OLLAMA_ACTIVE_MODEL_DIGEST_MISMATCH") {
		t.Fatalf("expected loaded model digest mismatch rejection; status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestStrictEmbeddingHandlerV2RejectsPostInferenceResidentDigestDrift(t *testing.T) {
	t.Setenv("EMBEDDING_SERVICE_BUILD_REVISION", "sha256:"+strings.Repeat("a", 64))
	t.Setenv("EMBEDDING_TOKENIZER_REVISION", "sha256:"+strings.Repeat("c", 64))
	t.Setenv("EMBEDDING_INPUT_POLICY_REVISION", "no-truncate-1800-v1")
	t.Setenv("EMBEDDING_CONTENT_SELECTION_REVISIONS", "symbol-window-v2")
	expectedDigest := strings.Repeat("b", 64)
	changedDigest := strings.Repeat("d", 64)
	psReads := 0
	embedCalls := 0
	vector := make([]float32, embeddingDimensionV2)
	for i := range vector {
		vector[i] = float32(1 / math.Sqrt(float64(embeddingDimensionV2)))
	}
	encodedVector, err := json.Marshal([][]float32{vector})
	if err != nil {
		t.Fatal(err)
	}
	ollama := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/tags":
			fmt.Fprintf(w, `{"models":[{"name":"embeddinggemma:latest","digest":"%s","details":{"embedding_length":768}}]}`, expectedDigest)
		case "/api/version":
			fmt.Fprint(w, `{"version":"0.34.4"}`)
		case "/api/ps":
			psReads++
			digest := expectedDigest
			if psReads > 1 {
				digest = changedDigest
			}
			fmt.Fprintf(w, `{"models":[{"name":"embeddinggemma:latest","model":"embeddinggemma:latest","digest":"%s"}]}`, digest)
		case "/api/embed":
			embedCalls++
			fmt.Fprintf(w, `{"model":"embeddinggemma:latest","embeddings":%s}`, encodedVector)
		default:
			http.NotFound(w, r)
		}
	}))
	defer ollama.Close()

	text := "exact admitted input bytes"
	input := strictEmbeddingRequestV2{
		Text: text, InputChecksum: sha256PrefixedV2([]byte(text)),
		InputArtifactChecksum:    sha256PrefixedV2([]byte("compiler artifact")),
		ContentSelectionRevision: "symbol-window-v2", InputPolicyRevision: "no-truncate-1800-v1",
	}
	requestBody, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	httpStrictEmbedHandlerV2(&embeddingServer{cfg: config{OllamaURL: ollama.URL, EmbedModel: "embeddinggemma:latest"}})(response, httptest.NewRequest(http.MethodPost, "/embed/v2", strings.NewReader(string(requestBody))))
	if response.Code != http.StatusConflict || !strings.Contains(response.Body.String(), "OLLAMA_ACTIVE_MODEL_DIGEST_MISMATCH") || psReads != 2 || embedCalls != 1 {
		t.Fatalf("expected post-inference digest drift rejection; status=%d psReads=%d embedCalls=%d body=%s", response.Code, psReads, embedCalls, response.Body.String())
	}
}

func TestStrictEmbeddingHandlerV2RejectsResponseModelMismatch(t *testing.T) {
	t.Setenv("EMBEDDING_SERVICE_BUILD_REVISION", "sha256:"+strings.Repeat("a", 64))
	t.Setenv("EMBEDDING_TOKENIZER_REVISION", "sha256:"+strings.Repeat("c", 64))
	t.Setenv("EMBEDDING_INPUT_POLICY_REVISION", "no-truncate-1800-v1")
	t.Setenv("EMBEDDING_CONTENT_SELECTION_REVISIONS", "symbol-window-v2")
	digest := strings.Repeat("b", 64)
	vector := make([]float32, embeddingDimensionV2)
	for i := range vector {
		vector[i] = float32(1 / math.Sqrt(float64(embeddingDimensionV2)))
	}
	encodedVector, err := json.Marshal([][]float32{vector})
	if err != nil {
		t.Fatal(err)
	}
	ollama := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/tags":
			fmt.Fprintf(w, `{"models":[{"name":"embeddinggemma:latest","digest":"%s","details":{"embedding_length":768}}]}`, digest)
		case "/api/version":
			fmt.Fprint(w, `{"version":"0.34.4"}`)
		case "/api/ps":
			fmt.Fprintf(w, `{"models":[{"name":"embeddinggemma:latest","model":"embeddinggemma:latest","digest":"%s"}]}`, digest)
		case "/api/embed":
			fmt.Fprintf(w, `{"model":"different-model:latest","embeddings":%s}`, encodedVector)
		default:
			http.NotFound(w, r)
		}
	}))
	defer ollama.Close()

	text := "exact admitted input bytes"
	input := strictEmbeddingRequestV2{
		Text: text, InputChecksum: sha256PrefixedV2([]byte(text)),
		InputArtifactChecksum:    sha256PrefixedV2([]byte("compiler artifact")),
		ContentSelectionRevision: "symbol-window-v2", InputPolicyRevision: "no-truncate-1800-v1",
	}
	requestBody, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	httpStrictEmbedHandlerV2(&embeddingServer{cfg: config{OllamaURL: ollama.URL, EmbedModel: "embeddinggemma:latest"}})(response, httptest.NewRequest(http.MethodPost, "/embed/v2", strings.NewReader(string(requestBody))))
	if response.Code != http.StatusBadGateway || !strings.Contains(response.Body.String(), "OLLAMA_RESPONSE_MODEL_MISMATCH") {
		t.Fatalf("expected response model mismatch rejection; status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestStrictEmbeddingHandlerV2RejectsInputChecksumMismatchBeforeUpstream(t *testing.T) {
	called := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		http.Error(w, "unexpected upstream call", http.StatusInternalServerError)
	}))
	defer upstream.Close()
	input := strictEmbeddingRequestV2{
		Text: "changed after artifact compilation", InputChecksum: sha256PrefixedV2([]byte("different text")),
		InputArtifactChecksum:    sha256PrefixedV2([]byte("artifact")),
		ContentSelectionRevision: "selection-v1", InputPolicyRevision: "input-v1",
	}
	requestBody, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/embed/v2", strings.NewReader(string(requestBody)))
	response := httptest.NewRecorder()
	httpStrictEmbedHandlerV2(&embeddingServer{cfg: config{OllamaURL: upstream.URL, EmbedModel: "embeddinggemma:latest"}})(response, req)
	if response.Code != http.StatusBadRequest || called {
		t.Fatalf("expected local rejection without upstream call; status=%d called=%t body=%s", response.Code, called, response.Body.String())
	}
}

func TestVectorReceiptV2BindsInputAndExactVectorBytes(t *testing.T) {
	vector := make([]float32, embeddingDimensionV2)
	for i := range vector {
		vector[i] = float32(1 / math.Sqrt(float64(embeddingDimensionV2)))
	}
	capability := embeddingCapabilityV2{
		TokenizerRevision:      "sha256:" + strings.Repeat("1", 64),
		RepresentationRevision: "sha256:" + strings.Repeat("2", 64),
		OllamaModelDigest:      "sha256:" + strings.Repeat("3", 64),
		ServiceBuildRevision:   "sha256:" + strings.Repeat("4", 64),
	}
	receipt, err := vectorReceiptV2("exact input", vector, capability)
	if err != nil {
		t.Fatalf("receipt: %v", err)
	}
	if receipt.CanonicalAuthority || !receipt.Normalized || receipt.Dimensions != 768 {
		t.Fatalf("invalid authority or vector metadata: %+v", receipt)
	}
	if !strings.HasPrefix(receipt.InputChecksum, "sha256:") || !strings.HasPrefix(receipt.VectorChecksum, "sha256:") {
		t.Fatalf("missing checksums: %+v", receipt)
	}
	vector[0] += 0.01
	changed, err := vectorReceiptV2("exact input", vector, capability)
	if err == nil && changed.VectorChecksum == receipt.VectorChecksum {
		t.Fatal("changed vector bytes retained the old checksum")
	}
}

func TestVectorReceiptV2RejectsUnqualifiedVectors(t *testing.T) {
	if _, err := vectorReceiptV2("input", make([]float32, 767), embeddingCapabilityV2{}); err == nil {
		t.Fatal("expected dimension mismatch")
	}
	bad := make([]float32, 768)
	if _, err := vectorReceiptV2("input", bad, embeddingCapabilityV2{}); err == nil || !strings.Contains(err.Error(), "VECTOR_NOT_UNIT_NORMALIZED") {
		t.Fatalf("expected non-normalized rejection, got %v", err)
	}
	bad[0] = float32(math.NaN())
	if _, err := vectorReceiptV2("input", bad, embeddingCapabilityV2{}); err == nil || !strings.Contains(err.Error(), "VECTOR_NON_FINITE") {
		t.Fatalf("expected non-finite rejection, got %v", err)
	}
}
