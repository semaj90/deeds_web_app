package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	redis "github.com/redis/go-redis/v9"
)

// Simple latency stats
type stats struct { values []float64 }
func (s *stats) add(v float64) { s.values = append(s.values, v) }
func percentile(sorted []float64, p float64) float64 {
    if len(sorted) == 0 { return 0 }
    i := int(math.Ceil(p*float64(len(sorted)))) - 1
    if i < 0 { i = 0 }
    if i >= len(sorted) { i = len(sorted)-1 }
    return sorted[i]
}
func (s *stats) finalize() (min, max, avg, p50, p95, p99, p999 float64) {
    if len(s.values) == 0 { return }
    sort.Float64s(s.values)
    min = s.values[0]
    max = s.values[len(s.values)-1]
    var sum float64
    for _, v := range s.values { sum += v }
    avg = sum / float64(len(s.values))
    p50 = percentile(s.values, 0.50)
    p95 = percentile(s.values, 0.95)
    p99 = percentile(s.values, 0.99)
    p999 = percentile(s.values, 0.999)
    return
}

func main() {
    var (
        addr = flag.String("addr", "http://localhost:8099", "Base address of cognitive service")
        redisAddr = flag.String("redis", getenv("REDIS_ADDR", "127.0.0.1:4005"), "Redis address")
        docKey = flag.String("key", "loadtest:doc1", "Redis key id (doc:<id>) for test document")
        workers = flag.Int("c", 4, "Concurrent clients")
        total = flag.Int("n", 50, "Total requests")
        contentSize = flag.Int("size", 1200, "Approx content size (bytes) for synthetic document")
        warm = flag.Int("warm", 2, "Warmup requests (not counted)")
        prefix = flag.String("prefix", getenv("DOC_PREFIX", "doc:"), "Document key prefix")
        csvPath = flag.String("csv", "", "Optional CSV output path (writes per-request latency ms)")
        ramp = flag.Bool("ramp", false, "Enable ramp mode (ignores -c and -n; uses ramp flags)")
        rampStart = flag.Int("rampStart", 1, "Ramp start concurrency")
        rampMax = flag.Int("rampMax", 8, "Ramp max concurrency")
        rampStep = flag.Int("rampStep", 1, "Ramp concurrency increment")
        stepRequests = flag.Int("stepRequests", 50, "Requests per ramp step")
        rampSummaryCsv = flag.String("rampCsv", "", "Optional ramp summary CSV (one line per step)")
    )
    flag.Parse()

    rdb := redis.NewClient(&redis.Options{Addr: *redisAddr, Password: "redis"})
    ctx := context.Background()

    // Pre-populate test doc
    content := strings.Repeat("Lorem ipsum dolor sit amet, ", (*contentSize)/28+1)
    doc := map[string]any{"id": *docKey, "title": "Load Test Document", "content": content[:*contentSize]}
    b, _ := json.Marshal(doc)
    if err := rdb.Set(ctx, *prefix+*docKey, string(b), 0).Err(); err != nil {
        fmt.Println("redis set error:", err); os.Exit(1)
    }

    if *ramp {
        if *rampStep <= 0 { fmt.Println("rampStep must be > 0"); os.Exit(1) }
        if *rampMax < *rampStart { fmt.Println("rampMax must be >= rampStart"); os.Exit(1) }
    var rows []summaryRow
        for c := *rampStart; c <= *rampMax; c += *rampStep {
            fmt.Printf("\n== Ramp step concurrency=%d ==\n", c)
            res, _ := runSingle(*addr, *docKey, c, *stepRequests, *warm)
            fmt.Printf("[c=%d] RPS=%.2f p95=%.1f p99=%.1f p99.9=%.1f err=%.2f%%\n", c, res.RPS, res.P95, res.P99, res.P999, res.ErrorRate)
            rows = append(rows, summaryRow{c, res.RPS, res.P95, res.P99, res.P999, res.ErrorRate})
        }
        if *rampSummaryCsv != "" { if err := writeRampSummary(*rampSummaryCsv, rows); err != nil { fmt.Println("ramp summary csv error:", err) } else { fmt.Println("Ramp summary CSV:", *rampSummaryCsv) } }
        return
    }

    res, perLatencies := runSingle(*addr, *docKey, *workers, *total, *warm)
    fmt.Printf("Requests: %d Success: %d Errors: %d ErrRate: %.2f%% Concurrency: %d\n", res.Requests, res.Success, res.Errors, res.ErrorRate, res.Concurrency)
    fmt.Printf("Duration: %.2fs RPS: %.2f\n", res.DurationSec, res.RPS)
    fmt.Printf("Latency ms -> min:%.1f avg:%.1f p50:%.1f p95:%.1f p99:%.1f p99.9:%.1f max:%.1f\n", res.Min, res.Avg, res.P50, res.P95, res.P99, res.P999, res.Max)
    if *csvPath != "" { if err := writeCSV(*csvPath, perLatencies, uint64(res.Success), uint64(res.Errors), res.Concurrency); err != nil { fmt.Println("csv write error:", err) } else { fmt.Println("CSV written:", *csvPath) } }
}

type runResult struct {
    Concurrency int
    Requests int
    Success int
    Errors int
    DurationSec float64
    RPS float64
    Min float64
    Avg float64
    P50 float64
    P95 float64
    P99 float64
    P999 float64
    Max float64
    ErrorRate float64
}

func runSingle(addr, docKey string, concurrency, total, warm int) (runResult, []float64) {
    for i := 0; i < warm; i++ { _, _ = oneRequest(addr + "/process/key/" + docKey) }
    var wg sync.WaitGroup
    var lat stats
    var success uint64
    var errors uint64
    perLatencies := make([]float64, total)
    start := time.Now()
    reqCh := make(chan int)
    for i := 0; i < concurrency; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for idx := range reqCh {
                t, err := oneRequest(addr + "/process/key/" + docKey)
                ms := t.Seconds()*1000
                if err == nil { atomic.AddUint64(&success, 1); lat.add(ms) } else { atomic.AddUint64(&errors, 1) }
                perLatencies[idx] = ms
            }
        }()
    }
    for i := 0; i < total; i++ { reqCh <- i }
    close(reqCh)
    wg.Wait()
    elapsed := time.Since(start).Seconds()
    min,max,avg,p50,p95,p99,p999 := lat.finalize()
    errRate := 0.0
    if total > 0 { errRate = float64(errors)/float64(total)*100 }
    res := runResult{Concurrency: concurrency, Requests: total, Success: int(success), Errors: int(errors), DurationSec: elapsed, RPS: float64(total)/elapsed, Min: min, Avg: avg, P50: p50, P95: p95, P99: p99, P999: p999, Max: max, ErrorRate: errRate}
    return res, perLatencies
}

type summaryRow struct { C int; RPS float64; P95 float64; P99 float64; P999 float64; Err float64 }

func writeRampSummary(path string, rows []summaryRow) error {
    f, err := os.Create(path)
    if err != nil { return err }
    defer f.Close()
    w := csv.NewWriter(f)
    defer w.Flush()
    w.Write([]string{"concurrency","rps","p95_ms","p99_ms","p99_9_ms","error_rate_percent"})
    for _, r := range rows {
        w.Write([]string{fmt.Sprintf("%d", r.C), fmt.Sprintf("%.2f", r.RPS), fmt.Sprintf("%.1f", r.P95), fmt.Sprintf("%.1f", r.P99), fmt.Sprintf("%.1f", r.P999), fmt.Sprintf("%.2f", r.Err)})
    }
    return w.Error()
}

func oneRequest(url string) (time.Duration, error) {
    t0 := time.Now()
    req, _ := http.NewRequest("GET", url, nil)
    resp, err := http.DefaultClient.Do(req)
    if err != nil { return 0, err }
    defer resp.Body.Close()
    if resp.StatusCode != 200 { return time.Since(t0), fmt.Errorf("status %d", resp.StatusCode) }
    // We ignore body decode; endpoint work is done server-side
    return time.Since(t0), nil
}

func getenv(k, d string) string { if v := os.Getenv(k); v != "" { return v }; return d }

func writeCSV(path string, lats []float64, success, errors uint64, conc int) error {
    f, err := os.Create(path)
    if err != nil { return err }
    defer f.Close()
    w := csv.NewWriter(f)
    defer w.Flush()
    // header
    w.Write([]string{"index","latency_ms"})
    for i, v := range lats { if v > 0 { w.Write([]string{fmt.Sprintf("%d", i), fmt.Sprintf("%.3f", v)}) } }
    w.Write([]string{"summary",""})
    w.Write([]string{"success", fmt.Sprintf("%d", success)})
    w.Write([]string{"errors", fmt.Sprintf("%d", errors)})
    w.Write([]string{"concurrency", fmt.Sprintf("%d", conc)})
    return w.Error()
}
