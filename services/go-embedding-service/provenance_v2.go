package main

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
)

const (
	embeddingCapabilitySchemaV2 = "atlas.embedding-capability.v2"
	embeddingReceiptSchemaV2    = "atlas.embedding-receipt.v2"
	embeddingDimensionV2        = 768
	embeddingDTypeV2            = "float32-le"
	normalizationPolicyV2       = "verify-unit-l2-v1"
	preprocessingPolicyV2       = "ollama-api-embed-direct-text-v1"
)

type ollamaTagsV2 struct {
	Models []struct {
		Name    string `json:"name"`
		Digest  string `json:"digest"`
		Details struct {
			EmbeddingLength int `json:"embedding_length"`
		} `json:"details"`
	} `json:"models"`
}

type ollamaVersionV2 struct {
	Version string `json:"version"`
}

type ollamaPsV2 struct {
	Models []struct {
		Name     string `json:"name"`
		Model    string `json:"model"`
		Digest   string `json:"digest"`
		SizeVRAM int64  `json:"size_vram"`
	} `json:"models"`
}

type embeddingCapabilityV2 struct {
	Schema                      string  `json:"schema"`
	ServiceBuildRevision        string  `json:"serviceBuildRevision"`
	ModelName                   string  `json:"modelName"`
	OllamaModelDigest           string  `json:"ollamaModelDigest"`
	GGUFArtifactDigest          *string `json:"ggufArtifactDigest"`
	GGUFArtifactBindingStatus   string  `json:"ggufArtifactBindingStatus"`
	BackendRuntimeRevision      string  `json:"backendRuntimeRevision"`
	TokenizerRevision           string  `json:"tokenizerRevision"`
	TokenizerBindingStatus      string  `json:"tokenizerBindingStatus"`
	Dimensions                  int     `json:"dimensions"`
	DType                       string  `json:"dtype"`
	NormalizationPolicyRevision string  `json:"normalizationPolicyRevision"`
	PreprocessingPolicyRevision string  `json:"preprocessingPolicyRevision"`
	RepresentationRevision      string  `json:"representationRevision"`
}

func embeddingCapabilityCacheEligibleV2(capability embeddingCapabilityV2) bool {
	return capability.GGUFArtifactDigest != nil &&
		isSHA256PrefixedV2(*capability.GGUFArtifactDigest) &&
		capability.GGUFArtifactBindingStatus == "INDEPENDENT_READBACK_VERIFIED" &&
		capability.TokenizerBindingStatus == "INDEPENDENT_READBACK_VERIFIED"
}

type embeddingReceiptV2 struct {
	Schema                    string  `json:"schema"`
	InputChecksum             string  `json:"inputChecksum"`
	InputArtifactChecksum     string  `json:"inputArtifactChecksum"`
	ContentSelectionRevision  string  `json:"contentSelectionRevision"`
	InputPolicyRevision       string  `json:"inputPolicyRevision"`
	TokenizerRevision         string  `json:"tokenizerRevision"`
	RepresentationRevision    string  `json:"representationRevision"`
	OllamaModelDigest         string  `json:"ollamaModelDigest"`
	GGUFArtifactDigest        *string `json:"ggufArtifactDigest"`
	ServiceBuildRevision      string  `json:"serviceBuildRevision"`
	RuntimeBindingStatus      string  `json:"runtimeBindingStatus"`
	ResidentModelDigestBefore string  `json:"residentModelDigestBefore,omitempty"`
	ResidentModelDigestAfter  string  `json:"residentModelDigestAfter,omitempty"`
	ResponseModelName         string  `json:"responseModelName,omitempty"`
	AtomicPerCallModelBinding bool    `json:"atomicPerCallModelBinding"`
	Dimensions                int     `json:"dimensions"`
	DType                     string  `json:"dtype"`
	Normalized                bool    `json:"normalized"`
	L2Norm                    float64 `json:"l2Norm"`
	VectorChecksum            string  `json:"vectorChecksum"`
	CacheKeyRevision          string  `json:"cacheKeyRevision"`
	CacheHit                  bool    `json:"cacheHit"`
	CanonicalAuthority        bool    `json:"canonicalAuthority"`
}

type ollamaEmbedResponseV2 struct {
	Model      string      `json:"model"`
	Embeddings [][]float32 `json:"embeddings"`
}

func ollamaEmbedWithModelV2(ctx context.Context, ollamaURL, model, text string) ([][]float32, string, error) {
	body, err := json.Marshal(struct {
		Model string   `json:"model"`
		Input []string `json:"input"`
	}{Model: model, Input: []string{text}})
	if err != nil {
		return nil, "", fmt.Errorf("marshal: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(ollamaURL, "/")+"/api/embed", strings.NewReader(string(body)))
	if err != nil {
		return nil, "", fmt.Errorf("request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("ollama: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("ollama status %d", resp.StatusCode)
	}
	var result ollamaEmbedResponseV2
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, "", fmt.Errorf("decode: %w", err)
	}
	if !strings.EqualFold(strings.TrimSpace(result.Model), strings.TrimSpace(model)) {
		return nil, result.Model, fmt.Errorf("OLLAMA_RESPONSE_MODEL_MISMATCH")
	}
	if len(result.Embeddings) != 1 {
		return nil, result.Model, fmt.Errorf("expected 1 embedding, got %d", len(result.Embeddings))
	}
	return result.Embeddings, result.Model, nil
}

func strictJSONGetV2(ctx context.Context, url string, target any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("upstream status %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		return err
	}
	return nil
}

func verifyLoadedOllamaModelV2(ctx context.Context, baseURL, requestedModel, expectedDigest string) (string, error) {
	var running ollamaPsV2
	if err := strictJSONGetV2(ctx, strings.TrimRight(baseURL, "/")+"/api/ps", &running); err != nil {
		return "", fmt.Errorf("OLLAMA_ACTIVE_MODEL_IDENTITY_UNAVAILABLE: %w", err)
	}
	matched := 0
	var observedDigest string
	for _, model := range running.Models {
		if model.Name != requestedModel && model.Model != requestedModel {
			continue
		}
		matched++
		observedDigest = "sha256:" + strings.TrimPrefix(strings.ToLower(strings.TrimSpace(model.Digest)), "sha256:")
		if observedDigest != strings.ToLower(expectedDigest) {
			return "", fmt.Errorf("OLLAMA_ACTIVE_MODEL_DIGEST_MISMATCH")
		}
	}
	if matched != 1 {
		return "", fmt.Errorf("OLLAMA_ACTIVE_MODEL_IDENTITY_UNRESOLVED")
	}
	return observedDigest, nil
}

func resolveEmbeddingServiceBuildRevisionV2(configuredRevision, compiledRevision string) string {
	configuredRevision = strings.TrimSpace(configuredRevision)
	compiledRevision = strings.TrimSpace(compiledRevision)
	if compiledRevision != "" {
		if !isSHA256PrefixedV2(compiledRevision) || configuredRevision != "" && configuredRevision != compiledRevision {
			return ""
		}
		return compiledRevision
	}
	if isSHA256PrefixedV2(configuredRevision) {
		return configuredRevision
	}
	return ""
}

func resolveEmbeddingCapabilityV2(ctx context.Context, cfg config, contentSelectionRevision, inputPolicyRevision string) (embeddingCapabilityV2, error) {
	buildRevision := resolveEmbeddingServiceBuildRevisionV2(envOr("EMBEDDING_SERVICE_BUILD_REVISION", ""), compiledServiceBuildRevisionV1)
	if !isSHA256PrefixedV2(buildRevision) || strings.TrimSpace(contentSelectionRevision) == "" || strings.TrimSpace(inputPolicyRevision) == "" {
		return embeddingCapabilityV2{}, fmt.Errorf("EMBEDDING_CAPABILITY_IDENTITY_INCOMPLETE")
	}
	configuredInputPolicy := strings.TrimSpace(envOr("EMBEDDING_INPUT_POLICY_REVISION", ""))
	if configuredInputPolicy == "" || inputPolicyRevision != configuredInputPolicy {
		return embeddingCapabilityV2{}, fmt.Errorf("INPUT_POLICY_REVISION_UNAUTHORIZED")
	}
	allowedSelections := strings.Split(envOr("EMBEDDING_CONTENT_SELECTION_REVISIONS", ""), ",")
	selectionAllowed := false
	for _, allowed := range allowedSelections {
		if strings.TrimSpace(allowed) == contentSelectionRevision {
			selectionAllowed = true
			break
		}
	}
	if !selectionAllowed {
		return embeddingCapabilityV2{}, fmt.Errorf("CONTENT_SELECTION_REVISION_UNAUTHORIZED")
	}
	tokenizerRevision := strings.TrimSpace(envOr("EMBEDDING_TOKENIZER_REVISION", ""))
	if !isSHA256PrefixedV2(tokenizerRevision) {
		return embeddingCapabilityV2{}, fmt.Errorf("TOKENIZER_REVISION_UNQUALIFIED")
	}
	base := strings.TrimRight(cfg.OllamaURL, "/")
	var tags ollamaTagsV2
	if err := strictJSONGetV2(ctx, base+"/api/tags", &tags); err != nil {
		return embeddingCapabilityV2{}, fmt.Errorf("OLLAMA_TAGS_UNAVAILABLE: %w", err)
	}
	var modelDigest string
	var modelDimensions int
	for _, model := range tags.Models {
		if model.Name == cfg.EmbedModel {
			modelDigest = strings.ToLower(strings.TrimSpace(model.Digest))
			modelDimensions = model.Details.EmbeddingLength
			break
		}
	}
	if len(modelDigest) != 64 || modelDimensions != embeddingDimensionV2 {
		return embeddingCapabilityV2{}, fmt.Errorf("OLLAMA_MODEL_IDENTITY_UNQUALIFIED")
	}
	if _, err := hex.DecodeString(modelDigest); err != nil {
		return embeddingCapabilityV2{}, fmt.Errorf("OLLAMA_MODEL_DIGEST_INVALID")
	}
	var backend ollamaVersionV2
	if err := strictJSONGetV2(ctx, base+"/api/version", &backend); err != nil || strings.TrimSpace(backend.Version) == "" {
		return embeddingCapabilityV2{}, fmt.Errorf("OLLAMA_RUNTIME_IDENTITY_UNQUALIFIED")
	}

	identity := struct {
		Schema                      string  `json:"schema"`
		ServiceBuildRevision        string  `json:"serviceBuildRevision"`
		OllamaModelDigest           string  `json:"ollamaModelDigest"`
		GGUFArtifactDigest          *string `json:"ggufArtifactDigest"`
		GGUFArtifactBindingStatus   string  `json:"ggufArtifactBindingStatus"`
		BackendRuntimeRevision      string  `json:"backendRuntimeRevision"`
		TokenizerRevision           string  `json:"tokenizerRevision"`
		TokenizerBindingStatus      string  `json:"tokenizerBindingStatus"`
		ContentSelectionRevision    string  `json:"contentSelectionRevision"`
		InputPolicyRevision         string  `json:"inputPolicyRevision"`
		Dimensions                  int     `json:"dimensions"`
		DType                       string  `json:"dtype"`
		NormalizationPolicyRevision string  `json:"normalizationPolicyRevision"`
		PreprocessingPolicyRevision string  `json:"preprocessingPolicyRevision"`
	}{
		"atlas.semantic-representation-identity.v2", buildRevision, "sha256:" + modelDigest,
		nil, "UNAVAILABLE_NOT_PROVEN", backend.Version, tokenizerRevision,
		"CONFIGURED_REVISION_NOT_RUNTIME_ATTESTED", contentSelectionRevision,
		inputPolicyRevision, embeddingDimensionV2, embeddingDTypeV2,
		normalizationPolicyV2, preprocessingPolicyV2,
	}
	identityJSON, _ := json.Marshal(identity)

	return embeddingCapabilityV2{
		Schema: embeddingCapabilitySchemaV2, ServiceBuildRevision: buildRevision,
		ModelName: cfg.EmbedModel, OllamaModelDigest: "sha256:" + modelDigest,
		GGUFArtifactDigest: nil, GGUFArtifactBindingStatus: "UNAVAILABLE_NOT_PROVEN",
		BackendRuntimeRevision: backend.Version, TokenizerRevision: tokenizerRevision,
		TokenizerBindingStatus: "CONFIGURED_REVISION_NOT_RUNTIME_ATTESTED",
		Dimensions:             embeddingDimensionV2, DType: embeddingDTypeV2,
		NormalizationPolicyRevision: normalizationPolicyV2,
		PreprocessingPolicyRevision: preprocessingPolicyV2,
		RepresentationRevision:      sha256PrefixedV2(identityJSON),
	}, nil
}

func sha256PrefixedV2(data []byte) string {
	sum := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func embeddingCacheKeyV2(representationRevision, inputArtifactChecksum, inputChecksum string) string {
	return fmt.Sprintf("embed:v2:%s:%s:%s", strings.TrimPrefix(representationRevision, "sha256:"), strings.TrimPrefix(inputArtifactChecksum, "sha256:"), strings.TrimPrefix(inputChecksum, "sha256:"))
}

func vectorReceiptV2(inputText string, vector []float32, capability embeddingCapabilityV2) (embeddingReceiptV2, error) {
	if len(vector) != embeddingDimensionV2 {
		return embeddingReceiptV2{}, fmt.Errorf("VECTOR_DIMENSION_MISMATCH")
	}
	inputChecksum := sha256PrefixedV2([]byte(inputText))
	vectorBytes := make([]byte, len(vector)*4)
	var squaredNorm float64
	for index, value := range vector {
		if math.IsNaN(float64(value)) || math.IsInf(float64(value), 0) {
			return embeddingReceiptV2{}, fmt.Errorf("VECTOR_NON_FINITE")
		}
		binary.LittleEndian.PutUint32(vectorBytes[index*4:], math.Float32bits(value))
		squaredNorm += float64(value) * float64(value)
	}
	norm := math.Sqrt(squaredNorm)
	if norm < 0.99 || norm > 1.01 {
		return embeddingReceiptV2{}, fmt.Errorf("VECTOR_NOT_UNIT_NORMALIZED")
	}
	return embeddingReceiptV2{
		Schema: embeddingReceiptSchemaV2, InputChecksum: inputChecksum,
		TokenizerRevision:         capability.TokenizerRevision,
		RepresentationRevision:    capability.RepresentationRevision,
		OllamaModelDigest:         capability.OllamaModelDigest,
		GGUFArtifactDigest:        capability.GGUFArtifactDigest,
		ServiceBuildRevision:      capability.ServiceBuildRevision,
		RuntimeBindingStatus:      "NOT_OBSERVED",
		AtomicPerCallModelBinding: false,
		Dimensions:                embeddingDimensionV2, DType: embeddingDTypeV2,
		Normalized: true, L2Norm: norm,
		VectorChecksum:   sha256PrefixedV2(vectorBytes),
		CacheKeyRevision: "v2", CanonicalAuthority: false,
	}, nil
}

type strictEmbeddingCacheEntryV2 struct {
	Schema                   string             `json:"schema"`
	InputChecksum            string             `json:"inputChecksum"`
	InputArtifactChecksum    string             `json:"inputArtifactChecksum"`
	ContentSelectionRevision string             `json:"contentSelectionRevision"`
	InputPolicyRevision      string             `json:"inputPolicyRevision"`
	RepresentationRevision   string             `json:"representationRevision"`
	Embedding                []float32          `json:"embedding"`
	Receipt                  embeddingReceiptV2 `json:"receipt"`
}

type strictEmbeddingRequestV2 struct {
	Text                     string `json:"text"`
	InputChecksum            string `json:"inputChecksum"`
	InputArtifactChecksum    string `json:"inputArtifactChecksum"`
	ContentSelectionRevision string `json:"contentSelectionRevision"`
	InputPolicyRevision      string `json:"inputPolicyRevision"`
}

type strictEmbeddingResponseV2 struct {
	Schema     string                 `json:"schema"`
	Status     string                 `json:"status"`
	Embedding  []float32              `json:"embedding"`
	Capability *embeddingCapabilityV2 `json:"capability"`
	Receipt    *embeddingReceiptV2    `json:"receipt"`
	Error      string                 `json:"error"`
}

func isSHA256PrefixedV2(value string) bool {
	if len(value) != len("sha256:")+64 || !strings.HasPrefix(value, "sha256:") {
		return false
	}
	_, err := hex.DecodeString(strings.TrimPrefix(value, "sha256:"))
	return err == nil
}

func writeStrictEmbeddingResponseV2(w http.ResponseWriter, statusCode int, response strictEmbeddingResponseV2) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(response)
}

// httpStrictEmbedHandlerV2 is additive. The legacy /embed route and its key are unchanged.
func httpStrictEmbedHandlerV2(srv *embeddingServer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeStrictEmbeddingResponseV2(w, http.StatusMethodNotAllowed, strictEmbeddingResponseV2{Schema: "atlas.embedding-response.v2", Status: "REJECTED", Error: "METHOD_NOT_ALLOWED"})
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 12*1024*1024)
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		var input strictEmbeddingRequestV2
		if err := decoder.Decode(&input); err != nil {
			writeStrictEmbeddingResponseV2(w, http.StatusBadRequest, strictEmbeddingResponseV2{Schema: "atlas.embedding-response.v2", Status: "REJECTED", Error: "INVALID_REQUEST"})
			return
		}
		var trailing any
		if err := decoder.Decode(&trailing); err != io.EOF {
			writeStrictEmbeddingResponseV2(w, http.StatusBadRequest, strictEmbeddingResponseV2{Schema: "atlas.embedding-response.v2", Status: "REJECTED", Error: "MULTIPLE_OR_INVALID_JSON_VALUES"})
			return
		}
		if strings.TrimSpace(input.Text) == "" || strings.TrimSpace(input.ContentSelectionRevision) == "" || strings.TrimSpace(input.InputPolicyRevision) == "" ||
			!isSHA256PrefixedV2(input.InputArtifactChecksum) || !isSHA256PrefixedV2(input.InputChecksum) ||
			sha256PrefixedV2([]byte(input.Text)) != input.InputChecksum {
			writeStrictEmbeddingResponseV2(w, http.StatusBadRequest, strictEmbeddingResponseV2{Schema: "atlas.embedding-response.v2", Status: "REJECTED", Error: "INPUT_IDENTITY_INVALID"})
			return
		}

		capability, err := resolveEmbeddingCapabilityV2(r.Context(), srv.cfg, input.ContentSelectionRevision, input.InputPolicyRevision)
		if err != nil {
			writeStrictEmbeddingResponseV2(w, http.StatusServiceUnavailable, strictEmbeddingResponseV2{Schema: "atlas.embedding-response.v2", Status: "BLOCKED", Error: err.Error()})
			return
		}
		cacheKey := embeddingCacheKeyV2(capability.RepresentationRevision, input.InputArtifactChecksum, input.InputChecksum)
		if srv.rdb != nil && embeddingCapabilityCacheEligibleV2(capability) {
			if cached, getErr := srv.rdb.Get(r.Context(), cacheKey).Bytes(); getErr == nil && len(cached) > 0 {
				var entry strictEmbeddingCacheEntryV2
				if json.Unmarshal(cached, &entry) == nil && entry.Schema == "atlas.embedding-cache-entry.v2" &&
					entry.InputChecksum == input.InputChecksum && entry.InputArtifactChecksum == input.InputArtifactChecksum &&
					entry.ContentSelectionRevision == input.ContentSelectionRevision && entry.InputPolicyRevision == input.InputPolicyRevision &&
					entry.RepresentationRevision == capability.RepresentationRevision {
					receipt, receiptErr := vectorReceiptV2(input.Text, entry.Embedding, capability)
					if receiptErr == nil && receipt.VectorChecksum == entry.Receipt.VectorChecksum {
						receipt.InputArtifactChecksum = input.InputArtifactChecksum
						receipt.ContentSelectionRevision = input.ContentSelectionRevision
						receipt.InputPolicyRevision = input.InputPolicyRevision
						receipt.CacheHit = true
						receipt.RuntimeBindingStatus = "CACHE_HIT_NO_MODEL_EXECUTION"
						srv.stats.cacheHits.Add(1)
						writeStrictEmbeddingResponseV2(w, http.StatusOK, strictEmbeddingResponseV2{Schema: "atlas.embedding-response.v2", Status: "OBSERVATION_ONLY", Embedding: entry.Embedding, Capability: &capability, Receipt: &receipt})
						return
					}
				}
			}
			srv.stats.cacheMisses.Add(1)
		}

		residentDigestBefore, residentErr := verifyLoadedOllamaModelV2(r.Context(), srv.cfg.OllamaURL, srv.cfg.EmbedModel, capability.OllamaModelDigest)
		if residentErr != nil {
			statusCode := http.StatusServiceUnavailable
			if strings.Contains(residentErr.Error(), "DIGEST_MISMATCH") {
				statusCode = http.StatusConflict
			}
			writeStrictEmbeddingResponseV2(w, statusCode, strictEmbeddingResponseV2{Schema: "atlas.embedding-response.v2", Status: "BLOCKED", Error: residentErr.Error()})
			return
		}
		vectors, responseModelName, err := ollamaEmbedWithModelV2(r.Context(), srv.cfg.OllamaURL, srv.cfg.EmbedModel, input.Text)
		if err != nil || len(vectors) != 1 {
			errorCode := "EMBEDDING_EXECUTOR_FAILED"
			if err != nil && strings.Contains(err.Error(), "OLLAMA_RESPONSE_MODEL_MISMATCH") {
				errorCode = "OLLAMA_RESPONSE_MODEL_MISMATCH"
			}
			writeStrictEmbeddingResponseV2(w, http.StatusBadGateway, strictEmbeddingResponseV2{Schema: "atlas.embedding-response.v2", Status: "BLOCKED", Error: errorCode})
			return
		}
		// Re-resolve after inference so an alias move during the request cannot
		// silently bind a vector to the pre-inference model digest.
		postCapability, postErr := resolveEmbeddingCapabilityV2(r.Context(), srv.cfg, input.ContentSelectionRevision, input.InputPolicyRevision)
		if postErr != nil || postCapability.RepresentationRevision != capability.RepresentationRevision {
			writeStrictEmbeddingResponseV2(w, http.StatusConflict, strictEmbeddingResponseV2{Schema: "atlas.embedding-response.v2", Status: "BLOCKED", Error: "MODEL_IDENTITY_CHANGED_DURING_REQUEST"})
			return
		}
		residentDigestAfter, residentErr := verifyLoadedOllamaModelV2(r.Context(), srv.cfg.OllamaURL, srv.cfg.EmbedModel, capability.OllamaModelDigest)
		if residentErr != nil {
			statusCode := http.StatusServiceUnavailable
			if strings.Contains(residentErr.Error(), "DIGEST_MISMATCH") {
				statusCode = http.StatusConflict
			}
			writeStrictEmbeddingResponseV2(w, statusCode, strictEmbeddingResponseV2{Schema: "atlas.embedding-response.v2", Status: "BLOCKED", Error: residentErr.Error()})
			return
		}
		receipt, err := vectorReceiptV2(input.Text, vectors[0], capability)
		if err != nil {
			writeStrictEmbeddingResponseV2(w, http.StatusUnprocessableEntity, strictEmbeddingResponseV2{Schema: "atlas.embedding-response.v2", Status: "REJECTED", Capability: &capability, Error: err.Error()})
			return
		}
		receipt.InputArtifactChecksum = input.InputArtifactChecksum
		receipt.ContentSelectionRevision = input.ContentSelectionRevision
		receipt.InputPolicyRevision = input.InputPolicyRevision
		receipt.RuntimeBindingStatus = "OBSERVED_PRE_POST_RESIDENT_DIGEST_STABLE"
		receipt.ResidentModelDigestBefore = residentDigestBefore
		receipt.ResidentModelDigestAfter = residentDigestAfter
		receipt.ResponseModelName = responseModelName
		if srv.rdb != nil && embeddingCapabilityCacheEligibleV2(capability) {
			entry := strictEmbeddingCacheEntryV2{
				Schema: "atlas.embedding-cache-entry.v2", InputChecksum: input.InputChecksum,
				InputArtifactChecksum:    input.InputArtifactChecksum,
				ContentSelectionRevision: input.ContentSelectionRevision,
				InputPolicyRevision:      input.InputPolicyRevision,
				RepresentationRevision:   capability.RepresentationRevision,
				Embedding:                vectors[0], Receipt: receipt,
			}
			if data, marshalErr := json.Marshal(entry); marshalErr == nil {
				_ = srv.rdb.Set(r.Context(), cacheKey, data, srv.cfg.CacheTTL).Err()
			}
		}
		writeStrictEmbeddingResponseV2(w, http.StatusOK, strictEmbeddingResponseV2{Schema: "atlas.embedding-response.v2", Status: "OBSERVATION_ONLY", Embedding: vectors[0], Capability: &capability, Receipt: &receipt})
	}
}
