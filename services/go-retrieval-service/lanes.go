package main

// lanes.go — Lane-separated retrieval types and Searcher interface.
//
// Go Retrieval is a concurrent candidate generator only.
// TypeScript SearchRuntime is the fusion authority.
// Do NOT merge or rank across lanes here.

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"
)

// Lane identifies a single retrieval modality.
type Lane string

const (
	LaneExact Lane = "exact"
	LaneBM25  Lane = "bm25"
	LaneBM42  Lane = "bm42" // experimental — BM25 is canonical sparse baseline
	LaneDense Lane = "dense"
	LaneAST   Lane = "ast"
	LaneGraph Lane = "graph"
)

// LaneRequest is the per-search input passed to every Searcher.
type LaneRequest struct {
	Query         string            `json:"query"`
	WorkspaceID   string            `json:"workspace_id"`
	CorpusVersion string            `json:"corpus_version"` // used for cache key isolation
	Lanes         []Lane            `json:"lanes"`
	LimitPerLane  int               `json:"limit_per_lane"`
	Filters       map[string]string `json:"filters,omitempty"`
}

// LaneCandidate is a single result returned by a Searcher.
// Scores are lane-local; do NOT compare across lanes.
type LaneCandidate struct {
	PacketKey     string         `json:"packet_key"`
	SourceRef     string         `json:"source_ref"`
	Lane          Lane           `json:"lane"`
	Score         float32        `json:"score"`
	Rank          int            `json:"rank"`
	QdrantPointID string         `json:"qdrant_point_id,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

// LaneResult holds a completed lane's candidates plus timing diagnostics.
type LaneResult struct {
	Lane       Lane            `json:"lane"`
	Candidates []LaneCandidate `json:"candidates"`
	Duration   time.Duration   `json:"duration_ms"`
	CacheHit   bool            `json:"cache_hit"`
	Error      string          `json:"error,omitempty"`
}

// LaneResponse is returned to callers (TypeScript SearchRuntime).
// Results are lane-separated; fusion happens upstream.
type LaneResponse struct {
	RequestID string               `json:"request_id"`
	Results   map[Lane]LaneResult  `json:"results"`
	StartedAt time.Time            `json:"started_at"`
	Duration  time.Duration        `json:"duration_ms"`
}

// Searcher is the interface every lane adapter must implement.
type Searcher interface {
	Lane() Lane
	Search(ctx context.Context, req LaneRequest) ([]LaneCandidate, error)
}

// LaneService fans out requests to registered Searchers concurrently.
// It does not fuse scores; it returns lane-separated maps.
type LaneService struct {
	Searchers map[Lane]Searcher
	Cache     LaneCache
}

// Search runs all requested lanes in parallel and collects results.
// Timeout: 1500 ms total (per architecture contract).
func (s *LaneService) Search(ctx context.Context, req LaneRequest) (LaneResponse, error) {
	if req.Query == "" {
		return LaneResponse{}, fmt.Errorf("empty query")
	}
	if req.LimitPerLane <= 0 {
		req.LimitPerLane = 40
	}

	started := time.Now()
	reqID := newLaneRequestID()

	ctx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
	defer cancel()

	lanes := uniqueLanes(req.Lanes)
	results := make(chan LaneResult, len(lanes))
	var wg sync.WaitGroup

	for _, lane := range lanes {
		searcher, ok := s.Searchers[lane]
		if !ok {
			results <- LaneResult{Lane: lane, Error: "unsupported lane"}
			continue
		}

		wg.Add(1)
		go func(l Lane, sr Searcher) {
			defer wg.Done()

			laneStart := time.Now()
			candidates, cacheHit, err := s.searchWithCache(ctx, sr, req)

			res := LaneResult{
				Lane:       l,
				Candidates: candidates,
				Duration:   time.Since(laneStart),
				CacheHit:   cacheHit,
			}
			if err != nil {
				res.Error = err.Error()
			}

			select {
			case results <- res:
			case <-ctx.Done():
			}
		}(lane, searcher)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	resp := LaneResponse{
		RequestID: reqID,
		Results:   make(map[Lane]LaneResult, len(lanes)),
		StartedAt: started,
	}
	for r := range results {
		resp.Results[r.Lane] = r
	}
	resp.Duration = time.Since(started)
	return resp, nil
}

func (s *LaneService) searchWithCache(
	ctx context.Context,
	searcher Searcher,
	req LaneRequest,
) ([]LaneCandidate, bool, error) {
	if s.Cache == nil {
		candidates, err := searcher.Search(ctx, req)
		return candidates, false, err
	}

	key, err := laneRetrievalCacheKey(req, searcher.Lane())
	if err != nil {
		candidates, err2 := searcher.Search(ctx, req)
		return candidates, false, err2
	}

	var cached []LaneCandidate
	if found, _ := s.Cache.Get(ctx, key, &cached); found {
		return cached, true, nil
	}

	candidates, err := searcher.Search(ctx, req)
	if err != nil {
		return nil, false, err
	}

	// Cache candidate IDs and scores only — not hydrated documents.
	_ = s.Cache.Set(ctx, key, candidates, 10*time.Minute)
	return candidates, false, nil
}

// LaneCache is the minimal interface required by LaneService.
// Backed by Redis in production; nil disables caching.
type LaneCache interface {
	Get(ctx context.Context, key string, dest any) (found bool, err error)
	Set(ctx context.Context, key string, value any, ttl time.Duration) error
	DeleteByPrefix(ctx context.Context, prefix string) error
}

// laneRetrievalCacheKey builds a stable, collision-resistant cache key.
// Changing workspaceID, corpusVersion, lane, query, filters, or limit
// produces a different key — no cross-contamination between corpus snapshots.
func laneRetrievalCacheKey(req LaneRequest, lane Lane) (string, error) {
	normalized := strings.ToLower(
		strings.Join(strings.Fields(req.Query), " "),
	)

	payload := struct {
		WorkspaceID   string
		CorpusVersion string
		Lane          Lane
		Query         string
		Filters       map[string]string
		Limit         int
	}{
		WorkspaceID:   req.WorkspaceID,
		CorpusVersion: req.CorpusVersion,
		Lane:          lane,
		Query:         normalized,
		Filters:       req.Filters,
		Limit:         req.LimitPerLane,
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	sum := sha256.Sum256(data)
	return fmt.Sprintf(
		"atlas:retrieval:v1:%s:%s:%x",
		req.WorkspaceID,
		lane,
		sum[:],
	), nil
}

// clampLaneLimit keeps per-lane result counts within safe bounds.
func clampLaneLimit(n int) int {
	if n <= 0 {
		return 40
	}
	if n > 200 {
		return 200
	}
	return n
}

func uniqueLanes(lanes []Lane) []Lane {
	seen := make(map[Lane]struct{}, len(lanes))
	out := make([]Lane, 0, len(lanes))
	for _, l := range lanes {
		if _, ok := seen[l]; !ok {
			seen[l] = struct{}{}
			out = append(out, l)
		}
	}
	return out
}

func newLaneRequestID() string {
	b := make([]byte, 8)
	// Use time-based ID; crypto/rand is overkill for request tracing.
	t := time.Now().UnixNano()
	for i := range b {
		b[i] = byte(t >> (i * 8))
	}
	return fmt.Sprintf("req_%x", b)
}
