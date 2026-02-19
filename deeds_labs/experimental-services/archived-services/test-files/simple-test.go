//go:build archived
// +build archived

package main

import (
	"fmt"
	"log"
	"net/http"
)

func main() {
	port := "8888"

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Hello from simple server!")
	})

	log.Printf("Starting simple server on port %s", port)
	log.Printf("URL: http://localhost:%s", port)

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}