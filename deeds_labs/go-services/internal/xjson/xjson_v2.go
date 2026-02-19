//go:build jsonv2

package xjson

// Experimental json v2 wrapper.
// Limited to Marshal / Unmarshal only to avoid breakage from evolving streaming APIs.
// Build with: go build -tags jsonv2

import (
	expjson "github.com/go-json-experiment/json"
)

// Marshal wraps experimental json Marshal.
func Marshal(v any) ([]byte, error) { return expjson.Marshal(v) }

// Unmarshal wraps experimental json Unmarshal.
func Unmarshal(data []byte, v any) error { return expjson.Unmarshal(data, v) }
