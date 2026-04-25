WebTransport (HTTP/3 / QUIC) — Local dev notes

Overview
- This project prefers WebTransport (HTTP/3/QUIC) when available, with fallbacks to WebSocket and finally to an HTTP POST proxy endpoint (/api/realtime/send).
- WebTransport requires HTTP/3 and TLS. Browsers only expose WebTransport when the connection is secure and served over HTTP/3.

Quick dev options
1) Use the built-in script (recommended)
   - npm run dev:quic
   - This will attempt to start the repo's QUIC proxy and Vite dev server. Several variants exist:
     - npm run dev:quic            # starts local QUIC helper script
     - npm run dev:quic:concurrent # starts Caddy QUIC proxy + Vite concurrently
     - npm run dev:quic:local     # runs Vite with QUIC-enabled env (for advanced setups)

2) Use Caddy as an HTTP/3 TLS proxy
   - The repo includes docker-compose.caddy-only.yml and Caddyfile variants.
   - Start Caddy: npm run caddy:start
   - Then run Vite: npm run dev:solo or npm run dev:gpu
   - Caddy will proxy /webtransport endpoints to the frontend dev server over HTTP/3 and present TLS to the browser.

Why this matters
- WebTransport gives lower latency and supports unidirectional/bidirectional streams and datagrams — useful for token-level LLM streaming and realtime telemetry.
- If you can't enable HTTP/3 in your environment, the system falls back to WebSocket (widely supported) or the simple HTTP POST proxy (/api/realtime/send).

Troubleshooting
- If WebTransport isn't detected in the browser, confirm DevTools shows HTTP/3 for the proxied origin and TLS (https://localhost:5178 for example).
- On Windows: if using Docker-based Caddy, ensure the container has network access to the frontend port and you trust the Caddy TLS certificate in your browser.
- If you see connection errors, check the Caddy logs: npm run caddy:logs

Notes
- Production must use an HTTP/3-capable fronting proxy with valid TLS certificates to surface WebTransport to real clients.
- The frontend includes a fallback endpoint at /api/realtime/send which proxies requests to /api/gpu-chat when realtime transports aren't available.

