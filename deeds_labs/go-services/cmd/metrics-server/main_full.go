//go:build metrics_full
// +build metrics_full

package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"legal-ai-cuda/internal/metrics/server"
	"legal-ai-cuda/internal/observability/tracing"
)

func getenv(k, d string) string { if v:=os.Getenv(k); v!="" { return v }; return d }

func main() {
	cfg := server.Config{
		GRPCAddr:    getenv("METRICS_GRPC_ADDR", ":9309"),
		HTTPAddr:    getenv("METRICS_HTTP_ADDR", ":9109"),
		QueueSize:   2048,
		Workers:     4,
		Cardinality: 5000,
	}
	rootCtx := context.Background()
	shutdownTracer, err := tracing.Init(rootCtx, "metrics-server-full")
	if err != nil { log.Printf("tracing init error: %v", err) }
	ms := server.New(cfg)
	ctx, cancel := context.WithCancel(rootCtx)
	go func(){
		c := make(chan os.Signal,1)
		signal.Notify(c, syscall.SIGINT, syscall.SIGTERM)
		<-c
		log.Println("metrics_full shutdown requested")
		ms.Stop(); cancel()
	}()
	if err := ms.Start(ctx); err != nil { log.Fatalf("metrics server error: %v", err) }
	if shutdownTracer != nil {
		ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel2()
		_ = shutdownTracer(ctx2)
	}
}
