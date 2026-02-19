//go:build !metrics_full
// +build !metrics_full

package main

// Minimal standalone Prometheus metrics HTTP exporter.
// (All previous gRPC / proto code removed; enable full version by building with -tags metrics_full.)

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	metricRequests = prometheus.NewCounterVec(
		prometheus.CounterOpts{Name: "legal_ai_metrics_requests_total", Help: "Total metric requests"},
		[]string{"endpoint"},
	)
	metricStartup = prometheus.NewGauge(prometheus.GaugeOpts{Name: "legal_ai_metrics_startup_timestamp", Help: "Unix time when metrics server started"})
)

func init() {
	prometheus.MustRegister(metricRequests, metricStartup)
	metricStartup.Set(float64(time.Now().Unix()))
}

func main() {
	addr := getenv("METRICS_ADDR", ":9109")
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		metricRequests.WithLabelValues("/healthz").Inc()
		w.Write([]byte("ok"))
	})
	log.Printf("metrics server listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil { log.Fatal(err) }
}

func getenv(k, d string) string {
	if v := os.Getenv(k); v != "" { return v }
	return d
}