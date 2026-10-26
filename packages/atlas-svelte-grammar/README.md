# Atlas Svelte 2026 Tree-sitter Grammar: Evaluation & Packaging Note

## Why Not Just Download the Fork?

1. **Source-Only Distribution**:
   The upstream 2026 fork (`sveltejs/tree-sitter-svelte`) is distributed as source code (`grammar.js`, `src/parser.c`, `src/scanner.c`). Upstream does not publish precompiled native dynamic libraries (`.so` or `.dll`) for arbitrary OS/libc/ABI configurations.
2. **ast-grep & Tree-sitter C ABI Requirement**:
   To load a grammar into `ast-grep` via `customLanguages` or into Python via `tree_sitter.Language(ptr)`, the grammar must be compiled into a native dynamic library exporting the exact C function `tree_sitter_svelte()`.
3. **Reproducibility vs. Quick Evaluation**:
   - For **immediate evaluation**, we compiled `tree-sitter-svelte.so` directly in WSL using GCC 13.3.0 in under 1 second. This enabled instant zero-overhead testing on the 10 baseline components.
   - The **multi-stage Dockerfile** exists purely as a reproducible, immutable packaging recipe. It pins the exact commit (`29886944d756e6eeebe38c09db87b17efdc93e93`) and compiler environment for automated CI builds without requiring build tools (gcc, binutils, git) in the production `:8095` sidecar or production images.
4. **Current Status**:
   - Pinned source commit: `29886944d756e6eeebe38c09db87b17efdc93e93`
   - Linux binary: `dist/linux-x64/tree-sitter-svelte.so` (SHA-256: `5137f7e98bcdb8de2cedf62f26befe94b44a609600a74b7cfb08030a2780b133`)
   - Windows binary: pending Visual Studio SDK developer prompt.
   - Evaluation: 10/10 element count agreement on the baseline; `svelte:*` excluded; status remains `PARTIAL`.
