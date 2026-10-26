# verify — sveltekit-frontend (ACE ask route)

Runtime verification recipe for changes that reach `POST /api/ace/ask`. Verified 2026-10-20.

## Launch

- Dev server: `npx vite dev --port 5173 --strictPort` from `sveltekit-frontend/`.
- Port 5173 may already be held by another `vite dev` process. Check first with `netstat -ano | grep :5173`. Do not kill a process you did not start.
- Ready in about 4 seconds. Auth is bypassed in this dev setup: the route answers without a session cookie.

## Drive

- Benign query: `curl -H 'content-type: application/json' -d '{"query":"In one sentence, what is a deed of trust?"}' http://127.0.0.1:5173/api/ace/ask`. Expect HTTP 200 with a `result` synthesis from llama-server `:8090`.
- Empty or non-string query: returns HTTP 500 with body status 400 (see gotchas).
- Shell-metacharacter query: the error body includes `packet-<sha256(query)>.json`. Compare that hash with `sha256sum` of the exact query string. A match proves the script received the query verbatim.
- Oversized query (40k chars): HTTP 500 with `spawn ENAMETOOLONG`.

## Gotchas

- Validation failures come back as HTTP 500, not 400. `safeValidateRequest` throws, and the route does not map it.
- Error bodies include `details: err.message`, which exposes the absolute Windows script path and the command line.
- Oversized queries fail at process spawn. Windows limits the command-line length.
- `ask-gemma4.mjs` needs `.tmp/ace/packet-<hash>.json` to exist first. Run `scripts/ace/build-packet.mjs` for the query before asking, or the ask fails with "ACE packet not found".
