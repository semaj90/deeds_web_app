# Building the C++ BVH Accelerator to WebAssembly (Windows)

This small guide explains how to build the KD-tree/BVH C++ accelerator into WebAssembly using Emscripten on Windows. The repository includes a PowerShell script `build-wasm.ps1` which wraps a basic `emcc` invocation. You will need Emscripten (emsdk) installed.

Prerequisites
- Git for Windows (optional)
- Emscripten SDK (emsdk): https://emscripten.org/docs/getting_started/downloads.html
  - Recommended: use WSL/Ubuntu or Git Bash for an easier environment, but PowerShell will work if you run `emsdk_env.bat` to set environment variables.

Quick steps (PowerShell)
1. Open a PowerShell where `emcc` is available. If you installed emsdk, run:

```powershell
cd C:\path\to\emsdk
.\emsdk_env.bat
```

2. From this repo, run the provided script:

```powershell
cd C:\Users\james\Desktop\deeds-web\deeds-web-app\cyber-elephant\accelerator-cpp
.\build-wasm.ps1
```

3. The script writes `dist/bvh_accelerator.js` and `dist/bvh_accelerator.wasm`.

Placement for the frontend
- Copy both `bvh_accelerator.js` and `bvh_accelerator.wasm` into your frontend static folder so the dev server can serve them. Example path used by the frontend code:

```
sveltekit-frontend/static/wasm/bvh_accelerator.js
sveltekit-frontend/static/wasm/bvh_accelerator.wasm
```

How the frontend loads the module
- The frontend expects to dynamically import `/wasm/bvh_accelerator.js` (Module-ized Emscripten build with MODULARIZE=1 and EXPORT_NAME=createBVHModule). The module factory will be called to produce an instantiated Module object, and the exported C functions (`build_index`, `knn_search`, `free_index`) are expected.

Notes and troubleshooting
- If `emcc` isn't found in PowerShell, try running `emsdk_env.bat` or open a shell where emsdk has been activated.
- On Windows path quoting can be tricky; if the PowerShell script fails, try using WSL or Git Bash and run the equivalent command:

```bash
emcc bvh.cpp -O3 -s MODULARIZE=1 -s EXPORT_NAME="createBVHModule" -s EXPORTED_FUNCTIONS=["_build_index","_knn_search","_free_index"] -s EXTRA_EXPORTED_RUNTIME_METHODS=["cwrap","getValue","setValue","allocate","ALLOC_NORMAL"] -o dist/bvh_accelerator.js
```

If you want me to add a small Node-based test harness to verify the generated module (once built), I can add that file and a short README snippet.

Browser & Node test harness
---------------------------------
I added two small test files under `accelerator-cpp/test/`:

- `browser-test.html` — Opens the generated `dist/bvh_accelerator.js` in the browser (open this file with a simple local HTTP server or within the repo structure after running the build script). It will create a module instance, build a small index, run a k-NN query, and print results.

- `node-test.js` — Node-based test which `require()`s the Modularize JS file in `dist/` and runs the same sample test.

How to run tests (after building):

PowerShell example:

```powershell
cd cyber-elephant/accelerator-cpp
.\build-wasm.ps1
node test/node-test.js
```

Browser test (using a simple static server):

```powershell
cd cyber-elephant/accelerator-cpp
# start a simple Python HTTP server in the folder so relative import ../dist/... resolves
python -m http.server 8000
# then open http://localhost:8000/test/browser-test.html
```

