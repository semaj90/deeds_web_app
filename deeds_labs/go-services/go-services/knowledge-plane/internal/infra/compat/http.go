package compat

import (
	"net/http"
	"time"
)

// HTTPOpts contains HTTP server options
type HTTPOpts struct {
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	IdleTimeout  time.Duration
}

// NewHTTPServer creates a new HTTP server with middleware
// TODO: Replace with your existing HTTP server wrapper
func NewHTTPServer(cfg *Config, log *Logger, handler http.Handler, opts HTTPOpts) *http.Server {
	// Apply middleware stack
	wrapped := applyMiddleware(handler, log)

	return &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      wrapped,
		ReadTimeout:  opts.ReadTimeout,
		WriteTimeout: opts.WriteTimeout,
		IdleTimeout:  opts.IdleTimeout,
	}
}

// applyMiddleware wraps the handler with common middleware
func applyMiddleware(h http.Handler, log *Logger) http.Handler {
	// Request ID
	h = requestIDMiddleware(h)
	// Recover from panics
	h = recoverMiddleware(h, log)
	// Access logging
	h = accessLogMiddleware(h, log)
	return h
}

func requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Simple request ID generation
		// TODO: Use your existing request ID middleware
		next.ServeHTTP(w, r)
	})
}

func recoverMiddleware(next http.Handler, log *Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Error("panic recovered", "error", err, "path", r.URL.Path)
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func accessLogMiddleware(next http.Handler, log *Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"duration", time.Since(start),
		)
	})
}

// After discovery, this should become:
// func NewHTTPServer(cfg *Config, log *Logger, handler http.Handler, opts HTTPOpts) *http.Server {
//     return myexistingpackage.NewServer(cfg, log, handler, opts)
// }
