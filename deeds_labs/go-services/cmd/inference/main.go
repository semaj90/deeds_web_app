package main

import (
	"log"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
	// import the library package
)

func main() {
	// Determine port from env or default
	port := 11435
	if p := os.Getenv("PORT"); p != "" {
		if v, err := strconv.Atoi(p); err == nil {
			port = v
		}
	}

	// Start the inference server in a goroutine
	go func() {
		inference.Start(port)
	}()

	// Wait for termination signals to let the library clean up if needed
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	// give a short grace period for cleanup
	time.Sleep(500 * time.Millisecond)
	log.Println("shutting down")
}
