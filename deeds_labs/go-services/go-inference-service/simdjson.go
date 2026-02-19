//go:build simdjson
// +build simdjson

package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"

	simd "github.com/minio/simdjson-go"
)

// parseJSONSIMD parses a JSON payload using simdjson-go when simdjson build tag is enabled.
func parseJSONSIMD[T any](ctx context.Context, r *http.Request, out *T) error {
	if r.Body == nil {
		return errors.New("empty body")
	}
	defer r.Body.Close()
	buf, err := io.ReadAll(r.Body)
	if err != nil {
		return fmt.Errorf("read body: %w", err)
	}
	var pj simd.ParsedJson
	if err := pj.Parse(buf, nil); err != nil {
		return fmt.Errorf("simdjson parse: %w", err)
	}
	// simdjson-go provides iter API; marshal back to std lib for simplicity here.
	// In hot paths you should walk the pj DOM directly into fields.
	b, err := pj.MarshalJSON()
	if err != nil {
		return fmt.Errorf("marshal rejson: %w", err)
	}
	return jsonUnmarshal(b, out)
}
