package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/go-redis/redis/v8"
)

type CUDAJob struct {
	JobID     string                 `json:"job_id"`
	Type      string                 `json:"type"`
	Data      map[string]interface{} `json:"data"`
	Priority  int                    `json:"priority"`
	CreatedAt time.Time              `json:"created_at"`
}

func main() {
	ctx := context.Background()
	
	// Connect to Redis
	redisClient := redis.NewClient(&redis.Options{
		Addr: "127.0.0.1:6379",
		Password: "redis",
	})

	// Test batch embedding job
	embeddingJob := CUDAJob{
		JobID:     "test-cuda-embedding-001",
		Type:      "batch_embedding",
		Data:      map[string]interface{}{"message_ids": []float64{1}},
		Priority:  1,
		CreatedAt: time.Now(),
	}

	jobJSON, _ := json.Marshal(embeddingJob)
	fmt.Printf("🚀 Sending CUDA embedding job: %s\n", string(jobJSON))
	
	err := redisClient.LPush(ctx, "cuda:jobs", jobJSON).Err()
	if err != nil {
		log.Fatalf("❌ Failed to send job: %v", err)
	}
	fmt.Println("✅ CUDA embedding job queued")

	// Test batch similarity job  
	time.Sleep(2 * time.Second)
	
	// Create a test query vector (768 dimensions like Gemma)
	queryVector := make([]float64, 768)
	for i := range queryVector {
		queryVector[i] = float64(i) / 768.0
	}

	similarityJob := CUDAJob{
		JobID:     "test-cuda-similarity-001", 
		Type:      "batch_similarity",
		Data: map[string]interface{}{
			"query_vector": queryVector,
			"limit":        5,
			"threshold":    0.7,
		},
		Priority:  1,
		CreatedAt: time.Now(),
	}

	jobJSON2, _ := json.Marshal(similarityJob)
	fmt.Printf("🚀 Sending CUDA similarity job: %s\n", string(jobJSON2[:200])+"...")
	
	err = redisClient.LPush(ctx, "cuda:jobs", jobJSON2).Err()
	if err != nil {
		log.Fatalf("❌ Failed to send similarity job: %v", err)
	}
	fmt.Println("✅ CUDA similarity job queued")

	// Subscribe to events
	fmt.Println("🔄 Listening for CUDA events...")
	pubsub := redisClient.Subscribe(ctx, "events:cuda")
	defer pubsub.Close()

	ch := pubsub.Channel()
	timeout := time.After(30 * time.Second)

	for {
		select {
		case msg := <-ch:
			fmt.Printf("📡 CUDA Event: %s\n", msg.Payload)
		case <-timeout:
			fmt.Println("⏰ Test timeout reached")
			return
		}
	}
}