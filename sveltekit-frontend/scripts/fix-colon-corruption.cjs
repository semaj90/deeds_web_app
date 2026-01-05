/**
 * Comprehensive Colon-Corruption Fixer for TypeScript/WebGPU/LangChain Files
 * Fixes the pattern where colons are used instead of spaces throughout
 * Based on latest WebGPU, LangChain.js 0.3, and TypeScript 5.5 best practices
 */

const fs = require('fs');
const path = require('path');

const targetFiles = [
    'src/lib/services/webgpu-simd-accelerator.ts',
    'src/lib/ai.bak/qlora-integration-analyzer.ts',
    'src/lib/ai.bak/qlora-topology-predictor.ts',
    'src/lib/wasm/qlora-wasm-loader.ts',
    'src/lib/orchestration/qlora-ollama-orchestrator.ts',
    'src/lib/server/webgpu-langchain-bridge.ts',
    'src/lib/services/wasm-ranking-cache-service.ts',
    'src/lib/integrations/redis-webgpu-simd-integration.ts',
    'src/lib/services/error-analysis/ErrorClustering.ts',
    'src/lib/state/evidenceCustodyMachine.ts',
    'src/lib/services/gguf-runtime.ts',
];

function fixColonCorruption(content) {
    let fixed = content;

    // Fix import statements: `import: { x } from: 'y'` -> `import { x } from 'y'`
    fixed = fixed.replace(/import:\s*\{/g, 'import {');
    fixed = fixed.replace(/\}\s*from:\s*['"`]/g, "} from '");
    fixed = fixed.replace(/from:\s*(['"`])/g, "from $1");

    // Fix type imports: `import type: { x }` -> `import type { x }`
    fixed = fixed.replace(/import type:\s*\{/g, 'import type {');

    // Fix interface declarations: `interface Foo: {` -> `interface Foo {`
    fixed = fixed.replace(/interface\s+(\w+):\s*\{/g, 'interface $1 {');

    // Fix class declarations: `export class Foo: {` -> `export class Foo {`
    fixed = fixed.replace(/class\s+(\w+):\s*\{/g, 'class $1 {');

    // Fix function return types with colons after closing paren
    // `async foo(): Promise<void>` is correct, but `async foo(), Promise<void>` is wrong
    fixed = fixed.replace(/\)\s*,\s*(Promise|void|string|number|boolean|any|unknown|null|undefined|Array|Record|Map|Set|object)/g, '): $1');

    // Fix property declarations with comma instead of colon
    // `property, type;` -> `property: type;`
    fixed = fixed.replace(/(\w+)\s*,\s*(GPUDevice|GPUQueue|string|number|boolean|WebGPUSIMDConfig|AccelerationResult)\s*[;|]/g, '$1: $2;');

    // Fix object property assignments: `key, value` -> `key: value`
    // Be careful with this one - only in specific contexts
    fixed = fixed.replace(/enableWebGPU\s*,\s*true/g, 'enableWebGPU: true');
    fixed = fixed.replace(/enableSIMD\s*,\s*true/g, 'enableSIMD: true');
    fixed = fixed.replace(/enableRedisCache\s*,\s*true/g, 'enableRedisCache: true');
    fixed = fixed.replace(/maxBatchSize\s*,\s*(\d+)/g, 'maxBatchSize: $1');
    fixed = fixed.replace(/gpuMemoryLimit\s*,\s*(\d+)/g, 'gpuMemoryLimit: $1');
    fixed = fixed.replace(/workgroupSize\s*,\s*(\d+)/g, 'workgroupSize: $1');

    // Fix return type annotations: `): Promise<X> {` should stay, but `, Promise<X> {` is wrong
    fixed = fixed.replace(/\)\s*,\s*(Promise<[^>]+>)\s*\{/g, '): $1 {');

    // Fix parameter types in function signatures
    // `param, string` -> `param: string`
    fixed = fixed.replace(/(\w+)\s*,\s*(string|number|boolean|any|unknown|ParseMode|GPUDevice|AccelerationResult)\b(?!\s*[,\)\]])/g, function(match, p1, p2) {
        // Avoid changing array elements
        if (/^\s*$/.test(p1)) return match;
        return `${p1}: ${p2}`;
    });

    // Fix try/catch: `try: {` -> `try {`
    fixed = fixed.replace(/try\s*:\s*\{/g, 'try {');
    fixed = fixed.replace(/catch\s*:\s*\{/g, 'catch {');
    fixed = fixed.replace(/else\s*:\s*\{/g, 'else {');

    // Fix return statements with object: `return: {` -> `return {`
    fixed = fixed.replace(/return\s*:\s*\{/g, 'return {');

    // Fix standalone semicolons after various keywords
    fixed = fixed.replace(/\};\n\s*;/g, '}\n');
    fixed = fixed.replace(/;\r?\n\s*;/g, ';\n');

    // Fix weird `\r;` line endings
    fixed = fixed.replace(/\r;/g, '\r\n');
    fixed = fixed.replace(/;\n\s*;/g, ';\n');

    // Fix double semicolons
    fixed = fixed.replace(/;;/g, ';');

    // Fix WGSL shader template: `var<storage, read>` should have commas, that's correct
    // But `input, array<u32>` should be `input: array<u32>`
    fixed = fixed.replace(/(\w+)\s*,\s*(array<[^>]+>)/g, '$1: $2');
    fixed = fixed.replace(/(\w+)\s*,\s*(vec3<[^>]+>)/g, '$1: $2');

    // Fix method definitions: `private async foo(` is correct
    // But `private shouldUseWebGPU(jsonString, string):,` is wrong
    fixed = fixed.replace(/:\s*,\s*\n/g, ' {\n');
    fixed = fixed.replace(/\)\s*,\s*\n\s*boolean\s*:\s*\{/g, '): boolean {');
    fixed = fixed.replace(/\)\s*,\s*\n\s*string\s*:\s*\{/g, '): string {');
    fixed = fixed.replace(/\)\s*,\s*\n\s*number\s*:\s*\{/g, '): number {');
    fixed = fixed.replace(/\)\s*,\s*\n\s*void\s*:\s*\{/g, '): void {');

    // Fix `data, JSON.parse(json` -> `data: JSON.parse(json)`
    fixed = fixed.replace(/data\s*,\s*JSON\.parse/g, 'data: JSON.parse');
    fixed = fixed.replace(/data\s*,\s*result\.data/g, 'data: result.data');
    fixed = fixed.replace(/data\s*,\s*cached/g, 'data: cached');
    fixed = fixed.replace(/data\s*,\s*r\.data/g, 'data: r.data');

    // Fix processing_time_ms patterns
    fixed = fixed.replace(/processing_time_ms\s*,\s*performance\.now\(\)/g, 'processing_time_ms: performance.now()');
    fixed = fixed.replace(/processing_time_ms\s*,\s*0/g, 'processing_time_ms: 0');

    // Fix simd_backend patterns
    fixed = fixed.replace(/simd_backend\s*,\s*'/g, "simd_backend: '");
    fixed = fixed.replace(/simd_backend\s*,\s*r\./g, 'simd_backend: r.');

    // Fix gpu_memory_used patterns
    fixed = fixed.replace(/gpu_memory_used\s*,\s*Math\.round/g, 'gpu_memory_used: Math.round');
    fixed = fixed.replace(/gpu_memory_used\s*,\s*0/g, 'gpu_memory_used: 0');

    // Fix performance_gain patterns
    fixed = fixed.replace(/performance_gain\s*,\s*this\./g, 'performance_gain: this.');
    fixed = fixed.replace(/performance_gain\s*,\s*(\d+)/g, 'performance_gain: $1');

    // Fix cache_status patterns
    fixed = fixed.replace(/cache_status\s*,\s*'/g, "cache_status: '");

    // Fix buffer/usage patterns: `size, inputData` -> `size: inputData`
    fixed = fixed.replace(/size\s*,\s*inputData/g, 'size: inputData');
    fixed = fixed.replace(/size\s*,\s*outputSize/g, 'size: outputSize');
    fixed = fixed.replace(/usage\s*,\s*GPUBufferUsage/g, 'usage: GPUBufferUsage');

    // Fix code, module patterns
    fixed = fixed.replace(/code\s*,\s*shaderCode/g, 'code: shaderCode');
    fixed = fixed.replace(/module\s*,\s*computeShader/g, 'module: computeShader');
    fixed = fixed.replace(/layout\s*,\s*bindGroupLayout/g, 'layout: bindGroupLayout');
    fixed = fixed.replace(/buffer\s*,\s*inputBuffer/g, 'buffer: inputBuffer');
    fixed = fixed.replace(/buffer\s*,\s*outputBuffer/g, 'buffer: outputBuffer');

    // Fix powerPreference pattern
    fixed = fixed.replace(/powerPreference\s*,\s*this\./g, 'powerPreference: this.');

    // Fix result patterns
    fixed = fixed.replace(/result\s*,\s*AccelerationResult/g, 'result: AccelerationResult');

    // Fix method declarations with returns
    fixed = fixed.replace(/private async checkRedisCache\(jsonString\s*,\s*string\s*,\s*\n\s*ParseMode\)\s*,\s*Promise/g,
        'private async checkRedisCache(jsonString: string, mode: ParseMode): Promise');
    fixed = fixed.replace(/private async cacheResult\(jsonString\s*,\s*string\s*,\s*\n\s*mode\s*,\s*ParseMode\s*,\s*ParseMode\)\s*,\s*Promise/g,
        'private async cacheResult(jsonString: string, mode: ParseMode, data: any): Promise');

    // Clean up remaining issues
    fixed = fixed.replace(/\s*;\s*$/gm, ';');
    fixed = fixed.replace(/\{\s*,\s*/g, '{ ');
    fixed = fixed.replace(/,\s*\}/g, ' }');

    return fixed;
}

// Process each file
let totalFixed = 0;
for (const relPath of targetFiles) {
    const fullPath = path.join(process.cwd(), relPath);
    if (!fs.existsSync(fullPath)) {
        console.log(`⚠️ File not found: ${relPath}`);
        continue;
    }

    const original = fs.readFileSync(fullPath, 'utf-8');
    const fixed = fixColonCorruption(original);

    if (original !== fixed) {
        // Create backup
        fs.writeFileSync(fullPath + '.colon-backup', original);
        fs.writeFileSync(fullPath, fixed);
        console.log(`✅ Fixed: ${relPath}`);
        totalFixed++;
    } else {
        console.log(`⏭️ No changes needed: ${relPath}`);
    }
}

console.log(`\n🎉 Fixed ${totalFixed} files`);
