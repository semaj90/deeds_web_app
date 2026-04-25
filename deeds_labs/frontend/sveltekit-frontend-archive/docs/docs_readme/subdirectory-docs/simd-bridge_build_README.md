SIMD Bridge - local native addon build

This folder provides a minimal node-gyp-based scaffold to build a tiny native addon used for SIMD bridging experiments.

Prerequisites (Windows):
- Node.js (LTS)
- Python 3.x (for node-gyp)
- Visual Studio Build Tools with "Desktop development with C++" workload
- windows-build-tools (optional helper)

Quick steps:
1. npm install
2. npm run build
3. npm run start (or npm run run)

If node-gyp is not found, install it globally or run via npx: `npx node-gyp configure build`.

Troubleshooting:
- If compilation fails due to missing headers like napi.h, ensure `node-addon-api` is installed and the include path in `binding.gyp` is correct.
- On Windows, make sure the right Visual Studio toolset is selected (x64 vs x86) matching your Node build.
