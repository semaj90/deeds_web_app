package main

import (
	"context"
	"sync"
	"testing"
	"time"
)

type testSearcher struct {
	lane  Lane
	start chan struct{}
	gate  <-chan struct{}
	mu    sync.Mutex
	seen  LaneRequest
}

func (s *testSearcher) Lane() Lane { return s.lane }

func (s *testSearcher) Search(ctx context.Context, req LaneRequest) ([]LaneCandidate, error) {
	s.mu.Lock()
	s.seen = req
	s.mu.Unlock()
	if s.start != nil {
		s.start <- struct{}{}
	}
	if s.gate != nil {
		select {
		case <-s.gate:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return []LaneCandidate{{PacketKey: string(s.lane), Lane: s.lane, Rank: 1}}, nil
}

func TestLaneServiceSearchFansOutAndKeepsLanesSeparate(t *testing.T) {
	started := make(chan struct{}, 2)
	gate := make(chan struct{})

	bm25 := &testSearcher{lane: LaneBM25, start: started, gate: gate}
	dense := &testSearcher{lane: LaneDense, start: started, gate: gate}
	service := &LaneService{Searchers: map[Lane]Searcher{
		LaneBM25:  bm25,
		LaneDense: dense,
	}}

	resultCh := make(chan LaneResponse, 1)
	go func() {
		result, err := service.Search(context.Background(), LaneRequest{
			Query:        "graphify",
			Lanes:        []Lane{LaneBM25, LaneDense},
			LimitPerLane: 8,
		})
		if err != nil {
			t.Errorf("Search() error = %v", err)
			return
		}
		resultCh <- result
	}()

	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("first lane did not start")
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("second lane did not start concurrently")
	}
	close(gate)

	select {
	case result := <-resultCh:
		if len(result.Results) != 2 {
			t.Fatalf("result lanes = %d, want 2", len(result.Results))
		}
		if result.Results[LaneBM25].Candidates[0].Lane != LaneBM25 {
			t.Errorf("BM25 result lane = %q", result.Results[LaneBM25].Candidates[0].Lane)
		}
		if result.Results[LaneDense].Candidates[0].Lane != LaneDense {
			t.Errorf("dense result lane = %q", result.Results[LaneDense].Candidates[0].Lane)
		}
	case <-time.After(time.Second):
		t.Fatal("fan-out did not complete")
	}
}

func TestLaneServiceSearchDefaultsLimitAndReportsUnsupportedLane(t *testing.T) {
	searcher := &testSearcher{lane: LaneBM25}
	service := &LaneService{Searchers: map[Lane]Searcher{LaneBM25: searcher}}

	result, err := service.Search(context.Background(), LaneRequest{
		Query: "terms",
		Lanes: []Lane{LaneBM25, LaneAST},
	})
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}
	if result.Results[LaneAST].Error != "unsupported lane" {
		t.Fatalf("AST error = %q, want unsupported lane", result.Results[LaneAST].Error)
	}
	searcher.mu.Lock()
	defer searcher.mu.Unlock()
	if searcher.seen.LimitPerLane != 40 {
		t.Fatalf("LimitPerLane = %d, want default 40", searcher.seen.LimitPerLane)
	}
}

func TestLaneServiceSearchRejectsEmptyQuery(t *testing.T) {
	service := &LaneService{}
	if _, err := service.Search(context.Background(), LaneRequest{Lanes: []Lane{LaneBM25}}); err == nil {
		t.Fatal("Search() error = nil, want empty-query error")
	}
}
