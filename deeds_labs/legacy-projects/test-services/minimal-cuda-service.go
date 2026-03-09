package main

import (
	"fmt"
	"log"
	"net/http"
	"time"
)

func main() {
	log.Println("🎯 Starting Minimal CUDA Test Service")

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		response := `{"status":"healthy","service":"minimal-cuda-service","timestamp":` + fmt.Sprintf("%d", time.Now().Unix()) + `}`
		w.Write([]byte(response))
	})

	http.HandleFunc("/search", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		if r.Method == "POST" {
			response := `{"results":[{"id":"test-1","content":"Mock search result","score":0.95,"metadata":"source:mock"}],"total":1}`
			w.Write([]byte(response))
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	log.Println("🚀 Minimal CUDA Service starting on port 8081")
	if err := http.ListenAndServe(":8081", nil); err != nil {
		log.Fatalf("❌ Failed to start service: %v", err)
	}
}