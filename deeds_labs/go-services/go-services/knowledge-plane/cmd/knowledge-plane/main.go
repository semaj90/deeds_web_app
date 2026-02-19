package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/api"
	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/infra/compat"
)

func main() {
	cfg := compat.LoadConfig()
	log := compat.NewLogger(cfg)

	// Dependencies (reuse existing infra)
	redis := compat.NewRedis(cfg, log)
	db := compat.NewPostgres(cfg, log)

	// Build handlers
	h := api.New(cfg, log, redis, db)

	// Router
	mux := api.Routes(h)

	// Server wrapper with middleware
	srv := compat.NewHTTPServer(cfg, log, mux, compat.HTTPOpts{
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	})

	// Graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()

	log.Info("knowledge-plane up", "addr", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Error("server failed", "err", err)
		os.Exit(1)
	}
}
