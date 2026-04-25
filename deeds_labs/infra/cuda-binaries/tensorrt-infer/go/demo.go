package main

import (
	"fmt"
	"log"
	"math/rand"

	"tensorrt-infer/trt"
)

func main() {
	fmt.Println("🎮 CH-ROM97 Multimodal Memory Demo")
	fmt.Println("===================================")

	// Initialize GPU processor
	processor, err := trt.NewGPUTileProcessor()
	if err != nil {
		log.Fatalf("Failed to initialize GPU processor: %v", err)
	}
	defer processor.Close()

	fmt.Println("✅ GPU processor initialized")

	// Generate sample tiles (32x32 grayscale)
	const numTiles = 26
	const tileSize = 32 * 32
	const tensorDim = 128

	tiles := make([][]byte, numTiles)
	for i := 0; i < numTiles; i++ {
		tiles[i] = make([]byte, tileSize)
		for j := 0; j < tileSize; j++ {
			// Create simple patterns for each "rune"
			if i < 10 {
				// Numbers 0-9: diagonal patterns
				x, y := j%32, j/32
				if x == y || x == (31-y) {
					tiles[i][j] = 255
				} else {
					tiles[i][j] = uint8(rand.Intn(128))
				}
			} else {
				// Letters A-Z: circular patterns
				x, y := j%32-16, j/32-16
				dist := x*x + y*y
				if dist < 100 && dist > 50 {
					tiles[i][j] = 255
				} else {
					tiles[i][j] = uint8(rand.Intn(100))
				}
			}
		}
	}

	fmt.Printf("✅ Generated %d sample tiles\n", numTiles)

	// Flatten tiles for GPU processing
	tileAtlas := make([]byte, 0, numTiles*tileSize)
	for _, tile := range tiles {
		tileAtlas = append(tileAtlas, tile...)
	}

	// Process tiles on GPU
	fmt.Println("🔄 Processing tiles on GPU...")
	tensors, err := processor.ProcessTiles(tileAtlas, tensorDim)
	if err != nil {
		log.Fatalf("Failed to process tiles: %v", err)
	}

	fmt.Printf("✅ Processed %d tiles into %dD tensors\n", len(tensors), len(tensors[0]))

	// Project to 4D manifold
	fmt.Println("🔄 Projecting to 4D manifold...")
	manifoldCoords, err := processor.ProjectManifold(tensors)
	if err != nil {
		log.Fatalf("Failed to project manifold: %v", err)
	}

	fmt.Printf("✅ Projected to 4D manifold coordinates\n")
	for i, coords := range manifoldCoords[:5] { // Show first 5
		fmt.Printf("   Rune %d: [%.3f, %.3f, %.3f, %.3f]\n", i, coords[0], coords[1], coords[2], coords[3])
	}

	// Quantize to INT4
	fmt.Println("🔄 Quantizing tensors to INT4...")
	quantized, err := processor.QuantizeTensors(tensors)
	if err != nil {
		log.Fatalf("Failed to quantize tensors: %v", err)
	}

	fmt.Printf("✅ Quantized to INT4 latents (%d bytes per tensor)\n", len(quantized[0]))

	// Create sample graph (circular connections)
	fmt.Println("🔄 Building sample graph...")
	offsets := make([]uint32, numTiles+1)
	edges := make([]uint32, numTiles)

	offset := uint32(0)
	for i := 0; i < numTiles; i++ {
		offsets[i] = offset
		edges[i] = uint32((i + 1) % numTiles) // Connect to next
		offset++
	}
	offsets[numTiles] = offset

	fmt.Printf("✅ Created circular graph with %d nodes, %d edges\n", numTiles, len(edges))

	// Process graph on GPU
	fmt.Println("🔄 Processing graph on GPU...")
	processedFeatures, err := processor.ProcessGraph(offsets, edges, tensors)
	if err != nil {
		log.Fatalf("Failed to process graph: %v", err)
	}

	fmt.Printf("✅ Processed graph with feature aggregation\n")

	// Show some results
	fmt.Println("\n📊 Processing Results:")
	fmt.Println("======================")

	for i := 0; i < min(5, len(tensors)); i++ {
		fmt.Printf("Rune %d:\n", i)
		fmt.Printf("  Original tensor[0:3]: [%.3f, %.3f, %.3f]\n",
			tensors[i][0], tensors[i][1], tensors[i][2])
		fmt.Printf("  Manifold coords: [%.3f, %.3f, %.3f, %.3f]\n",
			manifoldCoords[i][0], manifoldCoords[i][1], manifoldCoords[i][2], manifoldCoords[i][3])
		fmt.Printf("  Processed features[0:3]: [%.3f, %.3f, %.3f]\n",
			processedFeatures[i][0], processedFeatures[i][1], processedFeatures[i][2])
		fmt.Println()
	}

	fmt.Println("🎉 CH-ROM97 GPU processing demo complete!")
	fmt.Println("\nNext steps:")
	fmt.Println("1. Build complete CH-ROM97 cartridge with chr97.mjs")
	fmt.Println("2. Integrate with Neo4j KAG loader")
	fmt.Println("3. Add SvelteKit glyph viewer")
	fmt.Println("4. Connect to RAG + VAG retriever")
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}