/**
 * Performance Benchmark Suite for GPU-Accelerated JSON Parser
 * Tests parsing performance against native JSON.parse and other libraries
 */
import { GpuAcceleratedJsonParser, } from "./gpu-json-parser";
/**
 * Comprehensive benchmark suite for JSON parsing performance
 */
export class JsonParserBenchmark {
    parser;
    testData = {};
    constructor() {
        this.parser = new GpuAcceleratedJsonParser();
        this.generateTestData();
    }
    /**
     * Generate various test JSON data sets
     */
    generateTestData() {
        // Small JSON object
        this.testData.small = JSON.stringify({
            id: 1,
            name: "Test Object",
            active: true,
            value: 42.5,
        });
        // Medium JSON object with nested structures
        this.testData.medium = JSON.stringify({
            user: {
                id: 12345,
                profile: {
                    firstName: "John",
                    lastName: "Doe",
                    email: "john.doe@example.com",
                    preferences: {
                        theme: "dark",
                        language: "en",
                        notifications: {
                            email: true,
                            push: false,
                            sms: true,
                        },
                    },
                },
                metadata: {
                    created: "2024-01-01T00:00:00Z",
                    updated: "2024-01-15T12:30:00Z",
                    version: "1.2.3",
                },
            },
            permissions: ["read", "write", "admin"],
            tags: ["important", "verified", "premium"],
        });
        // Large JSON array
        this.testData.large = JSON.stringify({
            data: Array.from({ length: 1000 }, (_, i) => ({
                id: i,
                name: `Item ${i}`,
                category: `Category ${i % 10}`,
                price: Math.random() * 100,
                inStock: Math.random() > 0.5,
                tags: [`tag${i % 5}`, `tag${i % 7}`, `tag${i % 11}`],
                metadata: {
                    created: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
                    score: Math.random(),
                    region: `Region ${i % 20}`,
                },
            })),
            meta: {
                total: 1000,
                page: 1,
                pageSize: 1000,
                hasMore: false,
            },
        });
        // Very large JSON with deep nesting
        const createDeepObject = (depth) => {
            if (depth === 0) {
                return {
                    value: Math.random(),
                    text: `Depth ${depth}`,
                    array: [1, 2, 3, 4, 5],
                };
            }
            return {
                level: depth,
                data: Array.from({ length: 5 }, () => createDeepObject(depth - 1)),
                metadata: {
                    depth,
                    timestamp: Date.now(),
                    random: Math.random(),
                },
            };
        };
        this.testData.huge = JSON.stringify({
            document: createDeepObject(8),
            summary: {
                totalDepth: 8,
                generated: new Date().toISOString(),
                size: "huge",
            },
        });
    }
    /**
     * Measure memory usage during operation
     */
    measureMemory() {
        if (typeof performance !== "undefined" && "memory" in performance) {
            return performance.memory.usedJSHeapSize;
        }
        return 0;
    }
    /**
     * Run benchmark for a specific parser function
     */
    async runBenchmark(name, parseFunction, testJson, iterations = 100) {
        const times = [];
        let errors = 0;
        let totalTime = 0;
        const startMemory = this.measureMemory();
        for (let i = 0; i < iterations; i++) {
            try {
                const start = performance.now();
                await parseFunction(testJson);
                const end = performance.now();
                const time = end - start;
                times.push(time);
                totalTime += time;
            }
            catch (error) {
                errors++;
            }
        }
        const endMemory = this.measureMemory();
        const averageTime = totalTime / iterations;
        const operationsPerSecond = 1000 / averageTime;
        return {
            name,
            totalTime,
            averageTime,
            operationsPerSecond,
            memoryUsage: endMemory - startMemory,
            errors,
        };
    }
    /**
     * Compare WebAssembly parser vs native JSON.parse
     */
    async comparePerformance(testName, iterations = 100) {
        const testJson = this.testData[testName];
        if (!testJson) {
            throw new Error(`Test data '${testName}' not found`);
        }
        console.log(`🏃 Running comparison benchmark: ${testName} (${iterations} iterations)`);
        // Clear cache for fair comparison
        await this.parser.clearCache();
        // Benchmark WebAssembly parser
        const wasmResult = await this.runBenchmark(`WASM ${testName}`, (json) => this.parser.parse(json, { useCache: true }), testJson, iterations);
        // Benchmark native JSON.parse
        const nativeResult = await this.runBenchmark(`Native ${testName}`, JSON.parse, testJson, iterations);
        // Get cache statistics
        const cacheStats = await this.parser.getCacheStats();
        const speedup = nativeResult.averageTime / wasmResult.averageTime;
        const efficiency = (wasmResult.operationsPerSecond / nativeResult.operationsPerSecond) * 100;
        return {
            wasmResult,
            nativeResult,
            speedup,
            efficiency,
            cacheHitRate: cacheStats.hitRate,
        };
    }
    /**
     * Run comprehensive benchmark suite
     */
    async runFullBenchmark() {
        console.log("🚀 Starting comprehensive JSON parser benchmark...");
        const results = {};
        const testNames = Object.keys(this.testData);
        for (const testName of testNames) {
            try {
                results[testName] = await this.comparePerformance(testName, 100);
                console.log(`✅ Completed benchmark: ${testName}`);
            }
            catch (error) {
                console.error(`❌ Failed benchmark: ${testName}`, error);
            }
        }
        return results;
    }
    /**
     * Test batch parsing performance
     */
    async benchmarkBatchParsing() {
        console.log("🔄 Benchmarking batch parsing...");
        // Create batch of mixed test data
        const batchData = [
            this.testData.small,
            this.testData.medium,
            this.testData.large,
            this.testData.small,
            this.testData.medium,
        ];
        // Benchmark WebAssembly batch parsing
        const wasmBatch = await this.runBenchmark("WASM Batch", (jsonArray) => this.parser.parseBatch(jsonArray, { useWorker: true }), batchData, 50);
        // Benchmark sequential parsing
        const sequential = await this.runBenchmark("Sequential", async (jsonArray) => {
            const results = [];
            for (const json of jsonArray) {
                results.push(await this.parser.parse(json, { useCache: true }));
            }
            return results;
        }, batchData, 50);
        return {
            wasmBatch,
            sequential,
            speedup: sequential.averageTime / wasmBatch.averageTime,
        };
    }
    /**
     * Test GPU validation performance
     */
    async benchmarkGpuValidation() {
        console.log("🎮 Benchmarking GPU validation...");
        const testJson = this.testData.large;
        const gpuAvailable = "gpu" in navigator;
        // Benchmark GPU validation
        const gpuValidation = await this.runBenchmark("GPU Validation", (json) => this.parser.validateWithGpu(json), testJson, 20);
        // Benchmark CPU validation (fallback)
        const cpuValidation = await this.runBenchmark("CPU Validation", (json) => this.parser.validate(json), testJson, 20);
        return {
            gpuValidation,
            cpuValidation,
            gpuAvailable,
            speedup: cpuValidation.averageTime / gpuValidation.averageTime,
        };
    }
    /**
     * Test cache effectiveness
     */
    async benchmarkCacheEffectiveness() {
        console.log("💾 Benchmarking cache effectiveness...");
        const testJson = this.testData.medium;
        // Clear cache
        await this.parser.clearCache();
        // Benchmark with cache (multiple parses of same JSON)
        const withCache = await this.runBenchmark("With Cache", (json) => this.parser.parse(json, { useCache: true }), testJson, 200);
        // Clear cache again
        await this.parser.clearCache();
        // Benchmark without cache
        const withoutCache = await this.runBenchmark("Without Cache", (json) => this.parser.parse(json, { useCache: false }), testJson, 200);
        const cacheStats = await this.parser.getCacheStats();
        return {
            withCache,
            withoutCache,
            cacheStats,
            speedup: withoutCache.averageTime / withCache.averageTime,
        };
    }
    /**
     * Generate benchmark report
     */
    generateReport(results) {
        let report = "# GPU-Accelerated JSON Parser Benchmark Report\n\n";
        report += `Generated: ${new Date().toISOString()}\n\n`;
        report += "## Performance Comparison\n\n";
        report +=
            "| Test Case | WASM Time (ms) | Native Time (ms) | Speedup | Cache Hit Rate |\n";
        report +=
            "|-----------|----------------|------------------|---------|----------------|\n";
        for (const [testName, result] of Object.entries(results)) {
            report += `| ${testName} | ${result.wasmResult.averageTime.toFixed(2)} | ${result.nativeResult.averageTime.toFixed(2)} | ${result.speedup.toFixed(2)}x | ${(result.cacheHitRate * 100).toFixed(1)}% |\n`;
        }
        report += "\n## Detailed Results\n\n";
        for (const [testName, result] of Object.entries(results)) {
            report += `### ${testName}\n\n`;
            report += `- **WebAssembly Parser:**\n`;
            report += `  - Average time: ${result.wasmResult.averageTime.toFixed(2)}ms\n`;
            report += `  - Operations/sec: ${result.wasmResult.operationsPerSecond.toFixed(0)}\n`;
            report += `  - Memory usage: ${(result.wasmResult.memoryUsage || 0) / 1024}KB\n`;
            report += `  - Errors: ${result.wasmResult.errors}\n\n`;
            report += `- **Native JSON.parse:**\n`;
            report += `  - Average time: ${result.nativeResult.averageTime.toFixed(2)}ms\n`;
            report += `  - Operations/sec: ${result.nativeResult.operationsPerSecond.toFixed(0)}\n`;
            report += `  - Memory usage: ${(result.nativeResult.memoryUsage || 0) / 1024}KB\n`;
            report += `  - Errors: ${result.nativeResult.errors}\n\n`;
            report += `- **Performance:**\n`;
            report += `  - Speedup: ${result.speedup.toFixed(2)}x\n`;
            report += `  - Efficiency: ${result.efficiency.toFixed(1)}%\n`;
            report += `  - Cache hit rate: ${(result.cacheHitRate * 100).toFixed(1)}%\n\n`;
        }
        return report;
    }
    /**
     * Run stress test with large datasets
     */
    async runStressTest(iterations = 1000) {
        console.log(`💪 Running stress test with ${iterations} iterations...`);
        const startMemory = this.measureMemory();
        const times = [];
        let errors = 0;
        await this.parser.clearCache();
        for (let i = 0; i < iterations; i++) {
            try {
                const testData = this.testData[Object.keys(this.testData)[i % 4]];
                const start = performance.now();
                await this.parser.parse(testData, { useCache: true });
                const end = performance.now();
                times.push(end - start);
            }
            catch (error) {
                errors++;
            }
            // Log progress every 100 iterations
            if (i % 100 === 0) {
                console.log(`Progress: ${i}/${iterations}`);
            }
        }
        const endMemory = this.measureMemory();
        const cacheStats = await this.parser.getCacheStats();
        return {
            memoryGrowth: endMemory - startMemory,
            averageTime: times.reduce((a, b) => a + b, 0) / times.length,
            errors,
            cacheEfficiency: cacheStats.hitRate,
        };
    }
    /**
     * Cleanup resources
     */
    dispose() {
        this.parser.dispose();
    }
}
/**
 * Run benchmark from command line or programmatically
 */
export async function runBenchmark() {
    const benchmark = new JsonParserBenchmark();
    try {
        console.log("🏁 Starting GPU-Accelerated JSON Parser Benchmark Suite\n");
        // Run full benchmark
        const results = await benchmark.runFullBenchmark();
        // Run additional benchmarks
        const batchResults = await benchmark.benchmarkBatchParsing();
        const gpuResults = await benchmark.benchmarkGpuValidation();
        const cacheResults = await benchmark.benchmarkCacheEffectiveness();
        // Generate and display report
        const report = benchmark.generateReport(results);
        console.log("\n" + report);
        // Display additional results
        console.log("## Additional Benchmarks\n");
        console.log("### Batch Parsing");
        console.log(`- Batch speedup: ${batchResults.speedup.toFixed(2)}x`);
        console.log(`- WASM batch time: ${batchResults.wasmBatch.averageTime.toFixed(2)}ms`);
        console.log(`- Sequential time: ${batchResults.sequential.averageTime.toFixed(2)}ms\n`);
        console.log("### GPU Validation");
        console.log(`- GPU available: ${gpuResults.gpuAvailable}`);
        console.log(`- GPU speedup: ${gpuResults.speedup.toFixed(2)}x`);
        console.log(`- GPU time: ${gpuResults.gpuValidation.averageTime.toFixed(2)}ms`);
        console.log(`- CPU time: ${gpuResults.cpuValidation.averageTime.toFixed(2)}ms\n`);
        console.log("### Cache Effectiveness");
        console.log(`- Cache speedup: ${cacheResults.speedup.toFixed(2)}x`);
        console.log(`- With cache: ${cacheResults.withCache.averageTime.toFixed(2)}ms`);
        console.log(`- Without cache: ${cacheResults.withoutCache.averageTime.toFixed(2)}ms\n`);
        // Run stress test
        console.log("Running stress test...");
        const stressResults = await benchmark.runStressTest(500);
        console.log("### Stress Test");
        console.log(`- Memory growth: ${(stressResults.memoryGrowth / 1024).toFixed(2)}KB`);
        console.log(`- Average time: ${stressResults.averageTime.toFixed(2)}ms`);
        console.log(`- Errors: ${stressResults.errors}`);
        console.log(`- Cache efficiency: ${(stressResults.cacheEfficiency * 100).toFixed(1)}%`);
        console.log("\n🎉 Benchmark completed successfully!");
    }
    catch (error) {
        console.error("💥 Benchmark failed:", error);
    }
    finally {
        benchmark.dispose();
    }
}
// Auto-run if called directly
if (typeof window !== "undefined" &&
    window.location.search.includes("benchmark=true")) {
    runBenchmark();
}
