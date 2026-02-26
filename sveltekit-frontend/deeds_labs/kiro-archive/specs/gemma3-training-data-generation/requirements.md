# Requirements Document: Gemma3-Legal Training Data Generation System

## Introduction

A comprehensive training data generation system that extracts patterns, examples, and best practices from the full-stack legal AI codebase to create high-quality JSONL training datasets for fine-tuning gemma3-legal:latest. The system must cover all technology layers including frontend (SvelteKit/Svelte 5), backend (Go microservices, Python AI services), infrastructure (CUDA, WebGPU), and data layers (TypeScript, JSON, C++).

## Glossary

- **JSONL**: JSON Lines format where each line is a valid JSON object containing training examples
- **Training Example**: A structured object with instruction, input, and output fields for model fine-tuning
- **Pattern Extraction**: Automated code analysis to identify reusable patterns and best practices
- **Gemma3-Legal**: Fine-tuned language model specialized for legal AI applications
- **Full-Stack**: Complete technology stack from frontend UI to backend services to GPU acceleration
- **Quality Gate**: Automated verification that generated examples compile/pass tests
- **Barrel Export**: Index file that re-exports module APIs for cleaner imports

---

## Requirements

### Requirement 1: Multi-Language Pattern Extraction

**User Story:** As a model trainer, I want to extract training examples from all programming languages in the codebase, so that the fine-tuned model understands the complete tech stack.

#### Acceptance Criteria

1. WHEN the system scans the codebase THEN it SHALL extract patterns from TypeScript, JavaScript, Svelte, Go, Python, C++, CUDA, and WGSL files
2. WHEN processing each language THEN the system SHALL identify language-specific patterns (API routes, components, kernels, shaders, microservices)
3. WHEN a file matches multiple pattern categories THEN the system SHALL generate examples for each applicable category
4. WHEN extraction completes THEN the system SHALL report file counts and example counts per language
5. WHEN a language has zero files THEN the system SHALL log a warning but continue processing other languages

### Requirement 2: SvelteKit Full-Stack Pattern Extraction

**User Story:** As a frontend developer, I want training examples that demonstrate SvelteKit patterns including routes, layouts, server endpoints, and Svelte 5 runes, so that the model can generate correct SvelteKit code.

#### Acceptance Criteria

1. WHEN scanning SvelteKit routes THEN the system SHALL extract patterns from +page.svelte, +layout.svelte, +server.ts, and +page.server.ts files
2. WHEN processing Svelte 5 components THEN the system SHALL identify $state, $derived, $effect, $props, and $bindable usage
3. WHEN finding API endpoints THEN the system SHALL extract GET, POST, PUT, DELETE, and PATCH handlers with request/response types
4. WHEN detecting form actions THEN the system SHALL extract form validation, error handling, and success flows
5. WHEN processing layouts THEN the system SHALL capture nested layout patterns and slot usage

### Requirement 3: TypeScript Service Pattern Extraction

**User Story:** As a backend developer, I want training examples from TypeScript services including database access, caching, vector search, and API clients, so that the model generates type-safe service code.

#### Acceptance Criteria

1. WHEN scanning TypeScript services THEN the system SHALL extract patterns from files containing Drizzle ORM, Redis, Qdrant, and fetch API usage
2. WHEN finding database operations THEN the system SHALL capture query patterns, transactions, and error handling
3. WHEN detecting caching logic THEN the system SHALL extract cache-aside patterns, TTL management, and invalidation strategies
4. WHEN processing vector search THEN the system SHALL capture embedding generation, similarity search, and reranking patterns
5. WHEN identifying API clients THEN the system SHALL extract request builders, response parsing, and retry logic

### Requirement 4: Go Microservice Pattern Extraction

**User Story:** As a backend engineer, I want training examples from Go microservices including HTTP handlers, gRPC services, and QUIC protocols, so that the model generates idiomatic Go code.

#### Acceptance Criteria

1. WHEN scanning Go files THEN the system SHALL extract patterns from main.go, cmd/, internal/, and pkg/ directories
2. WHEN finding HTTP handlers THEN the system SHALL capture routing, middleware, request validation, and response formatting
3. WHEN detecting gRPC services THEN the system SHALL extract service definitions, streaming patterns, and error handling
4. WHEN processing QUIC implementations THEN the system SHALL capture connection management, multiplexing, and low-latency patterns
5. WHEN identifying Go tests THEN the system SHALL extract table-driven tests, mocking patterns, and benchmark examples

### Requirement 5: Python AI Service Pattern Extraction

**User Story:** As an ML engineer, I want training examples from Python services including model inference, OCR pipelines, and async processing, so that the model generates correct Python AI code.

#### Acceptance Criteria

1. WHEN scanning Python files THEN the system SHALL extract patterns from files containing FastAPI, asyncio, TensorRT, and PyTorch usage
2. WHEN finding model inference THEN the system SHALL capture model loading, batching, GPU memory management, and result post-processing
3. WHEN detecting OCR pipelines THEN the system SHALL extract preprocessing, Tesseract/TrOCR usage, and confidence scoring
4. WHEN processing async patterns THEN the system SHALL capture async/await usage, task queues, and concurrent processing
5. WHEN identifying AI utilities THEN the system SHALL extract embedding generation, reranking, and vector normalization

### Requirement 6: CUDA/WebGPU Acceleration Pattern Extraction

**User Story:** As a performance engineer, I want training examples from GPU acceleration code including CUDA kernels and WebGPU shaders, so that the model generates optimized GPU code.

#### Acceptance Criteria

1. WHEN scanning CUDA files THEN the system SHALL extract patterns from .cu and .cuh files including kernel launches, memory management, and error checking
2. WHEN finding WebGPU code THEN the system SHALL capture shader creation, buffer management, compute pipelines, and fallback logic
3. WHEN detecting GPU memory operations THEN the system SHALL extract allocation patterns, transfer strategies, and synchronization
4. WHEN processing compute shaders THEN the system SHALL capture workgroup sizing, shared memory usage, and atomic operations
5. WHEN identifying optimization patterns THEN the system SHALL extract coalesced access, occupancy tuning, and precision management

### Requirement 7: C++ AST and Infrastructure Pattern Extraction

**User Story:** As a systems programmer, I want training examples from C++ code including AST exporters, CMake configurations, and native integrations, so that the model generates correct C++ build and integration code.

#### Acceptance Criteria

1. WHEN scanning C++ files THEN the system SHALL extract patterns from files using Clang LibTooling, vcpkg, and CMake
2. WHEN finding AST processing THEN the system SHALL capture AST traversal, node serialization, and type extraction
3. WHEN detecting CMake configurations THEN the system SHALL extract target definitions, dependency management, and toolchain setup
4. WHEN processing native integrations THEN the system SHALL capture FFI patterns, memory safety, and error propagation
5. WHEN identifying build patterns THEN the system SHALL extract compile flags, linking strategies, and cross-platform handling

### Requirement 8: Quality Gate Verification

**User Story:** As a dataset curator, I want generated examples to be verified for correctness, so that the training data only includes valid, compilable code.

#### Acceptance Criteria

1. WHEN the system generates examples THEN it SHALL support a --verify flag to enable quality gates
2. WHEN verification is enabled for TypeScript THEN the system SHALL run tsc --noEmit and only keep examples that pass
3. WHEN verification is enabled for Svelte THEN the system SHALL run svelte-check and only keep examples that pass
4. WHEN verification is enabled for Go THEN the system SHALL run go test and golangci-lint
5. WHEN verification is enabled for Python THEN the system SHALL run pytest and ruff check
6. WHEN verification is enabled for C++ THEN the system SHALL run cmake --build and verify compilation
7. WHEN a quality gate fails THEN the system SHALL log the failure reason and exclude that example from output

### Requirement 9: Example Format and Metadata

**User Story:** As a model trainer, I want training examples in a consistent JSONL format with rich metadata, so that I can filter, analyze, and fine-tune effectively.

#### Acceptance Criteria

1. WHEN generating examples THEN each SHALL be a JSON object with instruction, input, output, category, language, and source_file fields
2. WHEN creating instructions THEN they SHALL be diverse (explain, implement, fix, refactor, test, optimize)
3. WHEN extracting input THEN it SHALL be minimal context (function signature, error message, or requirement)
4. WHEN generating output THEN it SHALL be complete, correct code with comments explaining key decisions
5. WHEN adding metadata THEN it SHALL include tags for filtering (phase72, ace, rag, embeddings, gpu, etc.)

### Requirement 10: Batch Processing and Caps

**User Story:** As a system operator, I want to control generation batch sizes and set caps per category, so that I can manage dataset size and balance.

#### Acceptance Criteria

1. WHEN running extraction THEN the system SHALL support --max-per-category flag to cap examples per category
2. WHEN processing large codebases THEN the system SHALL use streaming/batching to avoid memory exhaustion
3. WHEN a category reaches its cap THEN the system SHALL stop processing that category but continue others
4. WHEN extraction completes THEN the system SHALL report total examples, examples per category, and total size in KB
5. WHEN combining datasets THEN the system SHALL support merging multiple JSONL files while preserving metadata

### Requirement 11: Svelte 5 Documentation Integration

**User Story:** As a documentation curator, I want to extract training examples from official Svelte 5 documentation, so that the model learns canonical patterns directly from the source.

#### Acceptance Criteria

1. WHEN processing svelte-complete.txt THEN the system SHALL parse sections by headers and content
2. WHEN a section contains code examples THEN the system SHALL extract them with surrounding explanation
3. WHEN matching patterns THEN the system SHALL use flexible keyword matching (title OR body content)
4. WHEN no specific pattern matches THEN the system SHALL generate doc summary examples as fallback
5. WHEN extraction completes THEN the system SHALL generate at least 80 examples from 164 parsed sections

### Requirement 12: Bits-UI Component Pattern Extraction

**User Story:** As a UI developer, I want training examples demonstrating Bits-UI component usage, so that the model generates accessible, headless component code.

#### Acceptance Criteria

1. WHEN scanning for Bits-UI usage THEN the system SHALL search for imports from "bits-ui", "$lib/components/ui", and "/components/ui/"
2. WHEN finding Bits-UI components THEN the system SHALL extract composition patterns, prop usage, and accessibility features
3. WHEN detecting custom UI components THEN the system SHALL capture wrapper patterns and style integration
4. WHEN no Bits-UI usage is found THEN the system SHALL log a warning and skip this category
5. WHEN Bits-UI patterns exist THEN the system SHALL generate examples showing component composition and customization

### Requirement 13: Output Organization and Reporting

**User Story:** As a dataset manager, I want organized output with clear reporting, so that I can track progress and understand dataset composition.

#### Acceptance Criteria

1. WHEN generation starts THEN the system SHALL create a training-data/ directory if it doesn't exist
2. WHEN generating category datasets THEN the system SHALL create separate JSONL files per category (svelte5-runes.jsonl, typescript-patterns.jsonl, etc.)
3. WHEN generation completes THEN the system SHALL create a combined fullstack-training-combined.jsonl file
4. WHEN writing output THEN the system SHALL create a README.md with dataset statistics, category breakdown, and usage instructions
5. WHEN reporting progress THEN the system SHALL show real-time counts of files scanned and examples generated per category

### Requirement 14: Error Handling and Robustness

**User Story:** As a system operator, I want robust error handling and clear diagnostics, so that extraction failures don't corrupt the dataset or halt processing.

#### Acceptance Criteria

1. WHEN a file fails to parse THEN the system SHALL log the error with file path and continue processing other files
2. WHEN a pattern extractor throws an exception THEN the system SHALL catch it, log details, and continue with other extractors
3. WHEN file system operations fail THEN the system SHALL provide clear error messages with suggested fixes
4. WHEN running on Windows THEN the system SHALL handle path separators and line endings correctly
5. WHEN the system encounters MODULE_NOT_FOUND THEN it SHALL provide diagnostic information about working directory and expected paths

---

## Success Criteria

- [ ] System extracts 500+ training examples from the full codebase
- [ ] All 8 language categories (TS, Svelte, Go, Python, CUDA, WebGPU, C++, JSON) produce examples
- [ ] Quality gates verify at least 90% of generated examples compile/pass tests
- [ ] Combined JSONL dataset is ready for Ollama/Colab fine-tuning
- [ ] Documentation clearly explains dataset composition and usage
- [ ] System runs without errors on Windows PowerShell
- [ ] Extraction completes in under 5 minutes for full codebase scan

---

**Last Updated:** December 20, 2025
