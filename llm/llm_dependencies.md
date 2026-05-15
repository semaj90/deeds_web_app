# llm dependencies

## Verified entrypoints

- Dev and check commands live in `sveltekit-frontend/package.json`
- Public llms routes live under `sveltekit-frontend/src/routes/.well-known/`
- Existing agent instructions are still rooted at `AGENTS.md`

## External services referenced by the repo

- PostgreSQL
- Redis
- Qdrant
- Ollama

## Guardrails

- Use env-backed service URLs.
- Prefer executable config over README prose when they disagree.
- Keep the docs hub independent from generated artifacts.
