GPU SOM Test Page

This is a minimal dev-only page to exercise the GPU SOM implementation in the browser.

How to run

1. Start the SvelteKit dev server for the frontend (from project root):

```powershell
cd sveltekit-frontend
npm i
npm run dev
```

2. Open a WebGPU-capable browser (Chrome Canary or Chromium with --enable-unsafe-webgpu) and navigate to:

http://localhost:5173/dev/gpu-som-test

3. Open the browser console (F12) to see detailed logs. The page will also show compact logs.

What it does

- Initializes the `GPUSOMEmbeddings` class.
- Trains a small batch of synthetic embeddings.
- Reads back SOM nodes and computes a best-cluster for a sample embedding.

Notes

- WebGPU support is required for full GPU execution. If WebGPU is not available the code may throw; the SOM class contains runtime guards but this test is intended for dev environments with WebGPU enabled.
- This is a dev/test harness only; it doesn't persist results to the server or database.
