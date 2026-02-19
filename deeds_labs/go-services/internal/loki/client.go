package loki

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

// Entry represents a single log line for Loki.
type Entry struct {
  Timestamp time.Time       `json:"ts"`
  Line      string          `json:"line"`
  Labels    map[string]string `json:"labels,omitempty"`
}

// Batch pushes multiple entries sharing a label set.
type Batch struct { Entries []Entry }

// Client minimal Loki HTTP client (push API).
type Client struct {
  Endpoint string
  HTTP     *http.Client
  StaticLabels map[string]string
}

func New(endpoint string, static map[string]string) *Client {
  return &Client{Endpoint: endpoint, HTTP: &http.Client{Timeout: 5 * time.Second}, StaticLabels: static}
}

// Push converts entries into Loki /loki/api/v1/push schema.
func (c *Client) Push(batch Batch) error {
  streams := []map[string]interface{}{}
  grouped := map[string][][2]string{}
  for _, e := range batch.Entries {
    labels := map[string]string{}
    for k,v := range c.StaticLabels { labels[k] = v }
    for k,v := range e.Labels { labels[k] = v }
    // Serialize label set into Loki's {k="v",...}
    labelStr := "{"
    first := true
    for k,v := range labels { if !first { labelStr += "," }; first = false; labelStr += k+"=\""+v+"\"" }
    labelStr += "}"
    ts := e.Timestamp.UTC().UnixNano()
    grouped[labelStr] = append(grouped[labelStr], [2]string{formatNano(ts), e.Line})
  }
  for l, values := range grouped { streams = append(streams, map[string]interface{}{"stream": l, "values": values}) }
  body := map[string]interface{}{"streams": streams}
  buf := &bytes.Buffer{}
  gz := gzip.NewWriter(buf)
  if err := json.NewEncoder(gz).Encode(body); err != nil { return err }
  if err := gz.Close(); err != nil { return err }
  req, _ := http.NewRequest("POST", c.Endpoint+"/loki/api/v1/push", buf)
  req.Header.Set("Content-Type", "application/json")
  req.Header.Set("Content-Encoding", "gzip")
  resp, err := c.HTTP.Do(req)
  if err != nil { return err }
  resp.Body.Close()
  return nil
}

func formatNano(n int64) string { return strconv.FormatInt(n,10) }
