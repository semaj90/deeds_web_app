# WASM build (Emscripten)

- Emscripten (emsdk) is a local SDK; do not commit it. See .gitignore for `src/lib/wasm/deps/emsdk/`.
- Ship only the resulting `.wasm` and minimal `.js` loader glue per module.

## Example build outline (optional)

1. Install emsdk locally (outside git):
   - Windows PowerShell:
     - git clone https://github.com/emscripten-core/emsdk.git
     - .\emsdk\emsdk.bat install latest
     - .\emsdk\emsdk.bat activate latest
2. Open an emsdk environment shell and build:

```sh
emcc src/native/rapid_json_parser.cpp -O3 -sMODULARIZE -sEXPORT_ES6 -sENVIRONMENT=web,worker,node -o dist/rapid-json-parser.js
# Produces dist/rapid-json-parser.js + dist/rapid-json-parser.wasm
```

## Minimal loader snippet

```js
// src/lib/wasm/load-rapid-json-parser.ts
export async function loadRapidParser() {
  const createModule = (await import("../../dist/rapid-json-parser.js"))
    .default;
  const module = await createModule({});
  return module; // exposes cwrap/callMain or exported funcs
}
```

Notes:

- Keep source C/C++ under `src/lib/wasm/src/native/` and outputs under `src/lib/wasm/dist/` (ignored as needed).
- For Node usage, ensure `-sENVIRONMENT=web,worker,node` and use dynamic import.
- No runtime DLLs are required for browser/Node to run these `.wasm` modules.
