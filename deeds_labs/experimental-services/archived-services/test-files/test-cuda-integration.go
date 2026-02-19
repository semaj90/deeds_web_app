//go:build archived
// +build archived

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"legal-ai-production/go-microservice/internal/cuda"
	"legal-ai-production/go-microservice/internal/payload"
)

// Test runner for CUDA integration with Phase 5-7 binary protocol
func main() {
	fmt.Println("🧪 CUDA Integration Test Suite - Phase 5-7")
	fmt.Println("============================================")

	// Test 1: CUDA Environment Discovery
	fmt.Println("\n1️⃣  Testing CUDA Environment Discovery...")
	testCudaDiscovery()

	// Test 2: Payload Envelope Handling
	fmt.Println("\n2️⃣  Testing Payload Envelope Handling...")
	testPayloadHandling()

	// Test 3: Health Check with CUDA Information
	fmt.Println("\n3️⃣  Testing Health Check...")
	testHealthCheck()

	// Test 4: Performance Baseline Test
	fmt.Println("\n4️⃣  Testing Performance Baseline...")
	testPerformanceBaseline()

	// Test 5: Worker Integration (if available)
	fmt.Println("\n5️⃣  Testing CUDA Worker Integration...")
	testWorkerIntegration()

	fmt.Println("\n✅ Test suite completed!")
}

func testCudaDiscovery() {
	config, err := cuda.GetCUDAConfig()
	if err != nil {
		fmt.Printf("❌ CUDA discovery failed: %v\n", err)
		return
	}

	fmt.Printf("✅ CUDA Configuration:\n")
	fmt.Printf("   - Available: %t\n", config.Available)
	fmt.Printf("   - CUDA Path: %s\n", config.CUDAPath)
	fmt.Printf("   - Version: %s\n", config.Version)
	fmt.Printf("   - GPU Count: %d\n", config.DeviceCount)
	fmt.Printf("   - Architecture: %s\n", config.Architecture)
	fmt.Printf("   - Worker Paths Found: %d\n", len(config.WorkerPaths))

	for i, path := range config.WorkerPaths {
		fmt.Printf("     %d. %s\n", i+1, path)
	}
}

func testPayloadHandling() {
	// Test JSON payload
	testData := map[string]interface{}{
		"operation": "embedding",
		"data": map[string]interface{}{
			"texts": []string{
				"Test legal document analysis",
				"Contract clause interpretation",
			},
			"model": "embeddinggemma",
			"quantization": true,
		},
		"metadata": map[string]string{
			"source": "test_suite",
			"version": "1.0",
		},
	}

	// Create JSON envelope
	jsonEnvelope := payload.CreateJSONEnvelope("test-json", "embedding", testData)
	jsonData, err := jsonEnvelope.DecodePayload()
	if err != nil {
		fmt.Printf("❌ JSON envelope test failed: %v\n", err)
		return
	}
	fmt.Printf("✅ JSON Envelope: %d bytes decoded successfully\n", len(jsonData))

	// Create Binary envelope
	jsonBytes, _ := json.Marshal(testData)
	binaryEnvelope := payload.CreateBinaryEnvelope("test-binary", "embedding", "json", jsonBytes)
	binaryData, err := binaryEnvelope.DecodePayload()
	if err != nil {
		fmt.Printf("❌ Binary envelope test failed: %v\n", err)
		return
	}
	fmt.Printf("✅ Binary Envelope: %d bytes decoded successfully\n", len(binaryData))

	// Create Protobuf envelope (mock)
	mockProtobuf := []byte{0x08, 0x96, 0x01, 0x12, 0x04, 0x08, 0xaf, 0x02}
	protobufEnvelope := payload.CreateProtobufEnvelope("test-protobuf", "embedding", mockProtobuf)
	protobufData, err := protobufEnvelope.DecodePayload()
	if err != nil {
		fmt.Printf("❌ Protobuf envelope test failed: %v\n", err)
		return
	}
	fmt.Printf("✅ Protobuf Envelope: %d bytes decoded successfully\n", len(protobufData))
}

func testHealthCheck() {
	health := cuda.CreateHealthCheck()

	fmt.Printf("🏥 Health Check Results:\n")
	fmt.Printf("   - Status: %s\n", health.Status)
	fmt.Printf("   - CUDA Available: %t\n", health.CudaAvailable)
	fmt.Printf("   - CUDA Path: %s\n", health.CudaPath)
	fmt.Printf("   - Worker Paths: %d found\n", len(health.WorkerPaths))
	fmt.Printf("   - GPU Count: %d\n", health.GPUCount)
	fmt.Printf("   - CUDA Version: %s\n", health.CudaVersion)
	fmt.Printf("   - Timestamp: %s\n", health.Timestamp)

	// Verify worker paths
	for i, path := range health.WorkerPaths {
		if _, err := os.Stat(path); err == nil {
			fmt.Printf("   ✅ Worker %d exists: %s\n", i+1, path)
		} else {
			fmt.Printf("   ❌ Worker %d missing: %s\n", i+1, path)
		}
	}
}

func testPerformanceBaseline() {
	// Phase 5-7 performance targets
	targets := map[string]struct {
		baselineMs int64
		targetMs   int64
		improvement float32
	}{
		"Authentication": {108, 43, 60.0},
		"Case Scoring":   {325, 130, 60.0},
		"Evidence Stream": {217, 87, 60.0},
	}

	fmt.Printf("📊 Phase 5-7 Performance Targets:\n")
	for operation, target := range targets {
		fmt.Printf("   - %s: %dms → %dms (%.1f%% improvement)\n",
			operation, target.baselineMs, target.targetMs, target.improvement)
	}

	// Simulate current performance
	fmt.Printf("\n🔬 Simulating Current Performance:\n")
	for operation, target := range targets {
		// Mock current performance (in real testing, measure actual performance)
		mockCurrentMs := target.baselineMs - int64(float64(target.baselineMs)*0.4) // 40% improvement
		actualImprovement := float32(target.baselineMs-mockCurrentMs) / float32(target.baselineMs) * 100

		status := "🔶"
		if mockCurrentMs <= target.targetMs {
			status = "✅"
		} else if actualImprovement >= target.improvement*0.8 {
			status = "🔶"
		} else {
			status = "❌"
		}

		fmt.Printf("   %s %s: %dms (%.1f%% improvement)\n",
			status, operation, mockCurrentMs, actualImprovement)
	}
}

func testWorkerIntegration() {
	config, err := cuda.GetCUDAConfig()
	if err != nil || !config.Available || len(config.WorkerPaths) == 0 {
		fmt.Printf("⚠️  No CUDA workers available for integration testing\n")
		return
	}

	workerPath := config.WorkerPaths[0]
	fmt.Printf("🔧 Testing worker: %s\n", workerPath)

	// Test cases for different operations
	testCases := []struct {
		name      string
		operation string
		data      interface{}
	}{
		{
			"Echo Test",
			"echo",
			map[string]interface{}{
				"message": "Hello from CUDA integration test!",
				"timestamp": time.Now().Unix(),
			},
		},
		{
			"Embedding Test",
			"embedding",
			map[string]interface{}{
				"texts": []string{
					"Legal contract analysis with quantized embeddings",
					"Case law research using binary protocol",
				},
				"model": "embeddinggemma",
				"quantization": true,
				"compression": "zstd",
			},
		},
		{
			"Inference Test",
			"inference",
			map[string]interface{}{
				"prompt": "Analyze this legal document for compliance issues",
				"model": "gemma3-legal:latest",
				"max_tokens": 500,
				"temperature": 0.7,
			},
		},
	}

	for _, tc := range testCases {
		fmt.Printf("\n   Testing %s...\n", tc.name)
		startTime := time.Now()

		payload := map[string]interface{}{
			"operation": tc.operation,
			"data":      tc.data,
			"timestamp": time.Now().Unix(),
		}

		result, err := cuda.RunExternalCudaWorker(workerPath, payload)
		duration := time.Since(startTime)

		if err != nil {
			fmt.Printf("   ❌ %s failed: %v\n", tc.name, err)
			continue
		}

		if result == nil {
			fmt.Printf("   ❌ %s returned nil result\n", tc.name)
			continue
		}

		// Check result structure
		success, hasSuccess := result["success"]
		if hasSuccess {
			fmt.Printf("   ✅ %s completed: success=%v, duration=%v\n", tc.name, success, duration)
		} else {
			fmt.Printf("   ✅ %s completed: duration=%v\n", tc.name, duration)
		}

		// Log sample of result (first 200 chars)
		if resultJSON, err := json.Marshal(result); err == nil {
			resultStr := string(resultJSON)
			if len(resultStr) > 200 {
				resultStr = resultStr[:200] + "..."
			}
			fmt.Printf("   📄 Result sample: %s\n", resultStr)
		}
	}
}

// Helper function to check if file exists
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}