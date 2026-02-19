//go:build !jsonv2

package xjson

import (
	stdjson "encoding/json"
	"io"
)

// Marshal marshals using encoding/json (std path)
func Marshal(v any) ([]byte, error) { return stdjson.Marshal(v) }

// Unmarshal unmarshals using encoding/json
func Unmarshal(data []byte, v any) error { return stdjson.Unmarshal(data, v) }

// Decoder wraps std json.Decoder
type Decoder struct { *stdjson.Decoder }
func NewDecoder(r io.Reader) *Decoder { return &Decoder{stdjson.NewDecoder(r)} }
func (d *Decoder) More() bool { return d.Decoder.More() }
func (d *Decoder) Decode(v any) error { return d.Decoder.Decode(v) }

// Encoder wraps std json.Encoder
type Encoder struct { *stdjson.Encoder }
func NewEncoder(w io.Writer) *Encoder { return &Encoder{stdjson.NewEncoder(w)} }
func (e *Encoder) Encode(v any) error { return e.Encoder.Encode(v) }
