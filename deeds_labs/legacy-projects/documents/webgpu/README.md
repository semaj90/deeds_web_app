# deeds-web WebGPU demo

This directory contains a WebGPU demo used by the deeds-web app.

Prerequisites
- A modern browser with WebGPU support (Chrome Canary or recent Chromium builds with the appropriate flags).
- Node.js (for running a local static server) or any static file server.

Quick start
1. From the repository root (or this directory), serve the files over localhost (WebGPU requires a secure context). Example using a simple static server:
   - Using npm package `serve`: `npx serve .`
   - Using Python 3: `python -m http.server 8000`
2. Open http://localhost:5000 (or the port used by your server) in a WebGPU-capable browser.
3. Consult the source files in this folder for the demo implementation and any build steps.

Notes
- If the app depends on build steps (TypeScript, bundlers, etc.), run the project-level build/install commands (e.g., `npm install` and `npm run build`) before serving.
- Check browser flags and enable experimental WebGPU if required.
