---
description: Run bounded Parent Atlas local deep research through the atlas-ldr MCP tool
model: llama-server/ornith-1.5-9b
---

Use the `atlas-ldr` MCP server and call `atlas_deep_research` for this research goal:

$ARGUMENTS

Rules:
- Treat the returned research receipt as non-authoritative context only.
- Do not bypass AtlasTaskKernel or call canonical stores directly.
- Do not edit files or execute mutation tools from the research loop.
- Prefer the returned `cards`, `sourceRef`, `evidenceRefs`, and `researchChecksum` when synthesizing.
- If the receipt status is `LDR_INSUFFICIENT_EVIDENCE`, say the evidence is insufficient instead of inventing an answer.
