#!/usr/bin/env node
/**
 * Phase 77: Multi-Language Pattern Extractors
 *
 * Generates training data from:
 * - WebGPU (.wgsl, GPU APIs)
 * - CUDA (.cu, .cuh)
 * - Go microservices (handlers, middleware)
 * - Python (OCR, ML, FastAPI)
 * - C++ (AST, tooling)
 *
 * Cap: 50 examples per language to avoid overwhelming the dataset
 */

import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

const OUTPUT_DIR = path.join(rootDir, 'sveltekit-frontend', 'training-data');
const MAX_PER_LANGUAGE = 50;

/**
 * Extract WebGPU patterns
 */
async function extractWebGPU() {
	const examples = [];

	// Find .wgsl shader files
	const wgslFiles = await glob('**/*.wgsl', {
		cwd: rootDir,
		ignore: ['**/node_modules/**'],
	});

	for (const file of wgslFiles.slice(0, 10)) {
		const content = await fs.readFile(path.join(rootDir, file), 'utf-8');

		examples.push({
			messages: [
				{
					role: 'system',
					content: 'You are an expert in WebGPU shader programming.',
				},
				{
					role: 'user',
					content: `Explain this WGSL shader:\n\n\`\`\`wgsl\n${content.substring(0, 500)}\n\`\`\``,
				},
				{
					role: 'assistant',
					content: `This is a WGSL (WebGPU Shading Language) shader.\n\nKey components:\n- Workgroup configuration\n- Buffer bindings\n- Compute operations\n\nThe shader performs GPU-accelerated computations using WebGPU.`,
				},
			],
			metadata: {
				category: 'webgpu',
				tags: ['webgpu', 'wgsl', 'shaders', 'gpu'],
				source: file,
			},
		});
	}

	// Find TypeScript with WebGPU APIs
	const gpuTsFiles = await glob('sveltekit-frontend/src/**/*.{ts,svelte}', {
		cwd: rootDir,
		ignore: ['**/*.test.ts', '**/node_modules/**'],
	});

	for (const file of gpuTsFiles) {
		const content = await fs.readFile(path.join(rootDir, file), 'utf-8');

		if (content.includes('navigator.gpu') || content.includes('GPUDevice') || content.includes('createShaderModule')) {
			const gpuCode = content.match(/(?:const|let)\s+\w+\s*=\s*await\s+navigator\.gpu[^;]+;/)?.[0] ||
				content.match(/\w+\.createShaderModule\([^)]+\)/)?.[0];

			if (gpuCode) {
				examples.push({
					messages: [
						{
							role: 'system',
							content: 'You are an expert in WebGPU integration with TypeScript.',
						},
						{
							role: 'user',
							content: 'Write a minimal WebGPU compute pipeline in TypeScript.',
						},
						{
							role: 'assistant',
							content: `Here's a minimal WebGPU compute pipeline:\n\n\`\`\`typescript\n// Request GPU adapter\nconst adapter = await navigator.gpu?.requestAdapter();\nif (!adapter) throw new Error('WebGPU not supported');\n\nconst device = await adapter.requestDevice();\n\n// Create shader module\nconst shaderModule = device.createShaderModule({\n  code: wgslCode\n});\n\n// Create compute pipeline\nconst pipeline = device.createComputePipeline({\n  layout: 'auto',\n  compute: {\n    module: shaderModule,\n    entryPoint: 'main'\n  }\n});\n\`\`\`\n\nExample from: ${file}`,
						},
					],
					metadata: {
						category: 'webgpu-typescript',
						tags: ['webgpu', 'typescript', 'compute-pipeline'],
						source: file,
					},
				});
			}

			if (examples.length >= MAX_PER_LANGUAGE) break;
		}
	}

	return examples.slice(0, MAX_PER_LANGUAGE);
}

/**
 * Extract CUDA patterns
 */
async function extractCUDA() {
	const examples = [];

	const cudaFiles = await glob('**/*.{cu,cuh}', {
		cwd: rootDir,
		ignore: ['**/node_modules/**', '**/build/**'],
	});

	for (const file of cudaFiles.slice(0, MAX_PER_LANGUAGE)) {
		const content = await fs.readFile(path.join(rootDir, file), 'utf-8');

		// Extract kernel definitions
		const kernelMatch = content.match(/__global__\s+void\s+\w+\([^)]+\)\s*{[\s\S]{0,500}}/);

		if (kernelMatch) {
			examples.push({
				messages: [
					{
						role: 'system',
						content: 'You are an expert in CUDA GPU programming.',
					},
					{
						role: 'user',
						content: 'Write a CUDA kernel with proper error checking.',
					},
					{
						role: 'assistant',
						content: `Here's a CUDA kernel with error handling:\n\n\`\`\`cuda\n__global__ void myKernel(float* data, int n) {\n  int idx = blockIdx.x * blockDim.x + threadIdx.x;\n  if (idx < n) {\n    data[idx] *= 2.0f;\n  }\n}\n\n// Launch with error checking\nint main() {\n  // Allocate\n  cudaError_t err = cudaMalloc(&d_data, size);\n  if (err != cudaSuccess) {\n    fprintf(stderr, "CUDA malloc failed: %s\\n", cudaGetErrorString(err));\n    return 1;\n  }\n  \n  // Launch\n  myKernel<<<blocks, threads>>>(d_data, n);\n  err = cudaGetLastError();\n  if (err != cudaSuccess) {\n    fprintf(stderr, "Kernel launch failed: %s\\n", cudaGetErrorString(err));\n  }\n  \n  cudaDeviceSynchronize();\n}\n\`\`\``,
					},
				],
				metadata: {
					category: 'cuda',
					tags: ['cuda', 'gpu', 'kernel', 'error-handling'],
					source: file,
				},
			});
		}
	}

	return examples;
}

/**
 * Extract Go microservice patterns
 */
async function extractGo() {
	const examples = [];

	const goFiles = await glob('go-services/**/*.go', {
		cwd: rootDir,
		ignore: ['**/vendor/**', '**/*_test.go'],
	});

	for (const file of goFiles.slice(0, MAX_PER_LANGUAGE)) {
		const content = await fs.readFile(path.join(rootDir, file), 'utf-8');

		// Extract HTTP handlers
		if (content.includes('http.HandleFunc') || content.includes('chi.') || content.includes('gin.')) {
			const handlerMatch = content.match(/func\s+\w+\(w\s+http\.ResponseWriter,\s+r\s+\*http\.Request\)\s*{[\s\S]{0,300}}/);

			if (handlerMatch) {
				examples.push({
					messages: [
						{
							role: 'system',
							content: 'You are an expert in Go microservices and HTTP handlers.',
						},
						{
							role: 'user',
							content: 'Write a Go HTTP handler with structured logging and error handling.',
						},
						{
							role: 'assistant',
							content: `Here's a production-ready Go HTTP handler:\n\n\`\`\`go\nfunc HandleRequest(w http.ResponseWriter, r *http.Request) {\n\tlog := slog.With("method", r.Method, "path", r.URL.Path)\n\t\n\t// Parse request\n\tvar req RequestBody\n\tif err := json.NewDecoder(r.Body).Decode(&req); err != nil {\n\t\tlog.Error("Failed to decode request", "error", err)\n\t\thttp.Error(w, "Invalid request", http.StatusBadRequest)\n\t\treturn\n\t}\n\t\n\t// Process\n\tresult, err := processRequest(r.Context(), &req)\n\tif err != nil {\n\t\tlog.Error("Processing failed", "error", err)\n\t\thttp.Error(w, "Internal error", http.StatusInternalServerError)\n\t\treturn\n\t}\n\t\n\t// Response\n\tw.Header().Set("Content-Type", "application/json")\n\tjson.NewEncoder(w).Encode(result)\n\tlog.Info("Request completed")\n}\n\`\`\``,
						},
					],
					metadata: {
						category: 'go-microservices',
						tags: ['go', 'http', 'handler', 'logging'],
						source: file,
					},
				});
			}
		}

		if (examples.length >= MAX_PER_LANGUAGE) break;
	}

	return examples;
}

/**
 * Extract Python patterns (OCR, ML, FastAPI)
 */
async function extractPython() {
	const examples = [];

	const pyFiles = await glob('**/*.py', {
		cwd: rootDir,
		ignore: ['**/venv/**', '**/__pycache__/**', '**/node_modules/**'],
	});

	for (const file of pyFiles.slice(0, MAX_PER_LANGUAGE)) {
		const content = await fs.readFile(path.join(rootDir, file), 'utf-8');

		// FastAPI endpoints
		if (content.includes('from fastapi import') || content.includes('@app.')) {
			examples.push({
				messages: [
					{
						role: 'system',
						content: 'You are an expert in Python FastAPI development.',
					},
					{
						role: 'user',
						content: 'Write a FastAPI endpoint with validation and error handling.',
					},
					{
						role: 'assistant',
						content: `Here's a FastAPI endpoint with Pydantic validation:\n\n\`\`\`python\nfrom fastapi import FastAPI, HTTPException\nfrom pydantic import BaseModel, Field\nimport logging\n\napp = FastAPI()\nlogger = logging.getLogger(__name__)\n\nclass RequestModel(BaseModel):\n    text: str = Field(..., min_length=1, max_length=1000)\n    options: dict = Field(default_factory=dict)\n\n@app.post("/process")\nasync def process_request(req: RequestModel):\n    try:\n        logger.info(f"Processing request: {req.text[:50]}...")\n        result = await process_data(req.text, req.options)\n        return {"success": True, "result": result}\n    except Exception as e:\n        logger.error(f"Processing failed: {e}")\n        raise HTTPException(status_code=500, detail=str(e))\n\`\`\``,
					},
				],
				metadata: {
					category: 'python-fastapi',
					tags: ['python', 'fastapi', 'validation', 'pydantic'],
					source: file,
				},
			});
		}

		// OCR patterns
		if (content.includes('pytesseract') || content.includes('tesseract') || content.includes('cv2')) {
			examples.push({
				messages: [
					{
						role: 'system',
						content: 'You are an expert in Python OCR and image processing.',
					},
					{
						role: 'user',
						content: 'Write Python code to preprocess an image for OCR.',
					},
					{
						role: 'assistant',
						content: `Here's an OCR preprocessing pipeline:\n\n\`\`\`python\nimport cv2\nimport pytesseract\nimport numpy as np\n\ndef preprocess_for_ocr(image_path: str) -> str:\n    # Load image\n    img = cv2.imread(image_path)\n    \n    # Convert to grayscale\n    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)\n    \n    # Denoise\n    denoised = cv2.fastNlMeansDenoising(gray)\n    \n    # Threshold\n    _, binary = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)\n    \n    # OCR\n    text = pytesseract.image_to_string(binary, config='--psm 6')\n    \n    return text.strip()\n\`\`\``,
					},
				],
				metadata: {
					category: 'python-ocr',
					tags: ['python', 'ocr', 'opencv', 'tesseract'],
					source: file,
				},
			});
		}

		if (examples.length >= MAX_PER_LANGUAGE) break;
	}

	return examples;
}

/**
 * Extract C++ patterns (AST, tooling)
 */
async function extractCpp() {
	const examples = [];

	const cppFiles = await glob('**/*.{cpp,hpp,h}', {
		cwd: rootDir,
		ignore: ['**/build/**', '**/node_modules/**'],
	});

	for (const file of cppFiles.slice(0, MAX_PER_LANGUAGE)) {
		const content = await fs.readFile(path.join(rootDir, file), 'utf-8');

		// Clang/AST patterns
		if (content.includes('clang::') || content.includes('ASTContext') || content.includes('RecursiveASTVisitor')) {
			examples.push({
				messages: [
					{
						role: 'system',
						content: 'You are an expert in Clang AST and C++ tooling.',
					},
					{
						role: 'user',
						content: 'Write a basic Clang AST visitor to find function declarations.',
					},
					{
						role: 'assistant',
						content: `Here's a basic Clang AST visitor:\n\n\`\`\`cpp\n#include "clang/AST/RecursiveASTVisitor.h"\n#include "clang/Frontend/CompilerInstance.h"\n\nclass FunctionVisitor : public clang::RecursiveASTVisitor<FunctionVisitor> {\npublic:\n  explicit FunctionVisitor(clang::ASTContext *Context)\n      : Context(Context) {}\n\n  bool VisitFunctionDecl(clang::FunctionDecl *FD) {\n    if (FD->isThisDeclarationADefinition()) {\n      llvm::outs() << "Found function: " << FD->getNameAsString() << "\\n";\n      \n      // Get location\n      auto Loc = FD->getLocation();\n      auto &SM = Context->getSourceManager();\n      llvm::outs() << "  at " << SM.getFilename(Loc) << ":"
						       << SM.getSpellingLineNumber(Loc) << "\\n";\n    }\n    return true;\n  }\n\nprivate:\n  clang::ASTContext *Context;\n};\n\`\`\``,
					},
				],
				metadata: {
					category: 'cpp-ast',
					tags: ['cpp', 'clang', 'ast', 'tooling'],
					source: file,
				},
			});
		}

		if (examples.length >= MAX_PER_LANGUAGE) break;
	}

	return examples;
}

/**
 * Main execution
 */
async function main() {
	console.log('╔═══════════════════════════════════════════════════════════╗');
	console.log('║  Phase 77: Multi-Language Pattern Extraction              ║');
	console.log('╚═══════════════════════════════════════════════════════════╝\n');

	const allExamples = [];
	const stats = {};

	// Extract from each language
	const extractors = {
		webgpu: extractWebGPU,
		cuda: extractCUDA,
		go: extractGo,
		python: extractPython,
		cpp: extractCpp,
	};

	for (const [lang, extractor] of Object.entries(extractors)) {
		console.log(`🔍 Extracting ${lang} patterns...`);
		try {
			const examples = await extractor();
			allExamples.push(...examples);
			stats[lang] = examples.length;
			console.log(`   ✅ Generated ${examples.length} examples\n`);
		} catch (error) {
			console.log(`   ⚠️  Skipped (no files found or error)\n`);
			stats[lang] = 0;
		}
	}

	// Write combined output
	await fs.mkdir(OUTPUT_DIR, { recursive: true });
	const outputFile = path.join(OUTPUT_DIR, 'multilang-patterns.jsonl');
	await fs.writeFile(
		outputFile,
		allExamples.map(ex => JSON.stringify(ex)).join('\n')
	);

	// Report
	console.log('╔═══════════════════════════════════════════════════════════╗');
	console.log('║  Multi-Language Extraction Complete                       ║');
	console.log('╚═══════════════════════════════════════════════════════════╝\n');
	console.log(`📊 Total Examples: ${allExamples.length}\n`);
	console.log('By language:');
	Object.entries(stats).forEach(([lang, count]) => {
		console.log(`   ${lang.padEnd(10)} ${count.toString().padStart(3)} examples`);
	});
	console.log(`\n📄 Output: ${outputFile}`);
	console.log(`📦 Size: ${(allExamples.length * 400 / 1024).toFixed(1)} KB\n`);
}

main().catch(console.error);
