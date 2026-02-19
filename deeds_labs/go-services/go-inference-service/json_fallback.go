//go:build !simdjson
// +build !simdjson

package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
)

// parseJSONSIMD falls back to standard json when simdjson build tag is disabled.
func parseJSONSIMD[T any](ctx context.Context, r *http.Request, out *T) error {
	if r.Body == nil {
		return errors.New("empty body")
	}
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	return dec.Decode(out)
}

// helper for simd build file
func jsonUnmarshal(b []byte, out any) error { return json.Unmarshal(b, out) }
