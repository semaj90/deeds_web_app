# OpenCode System Behavior Rules (Context Compaction & Navigation)

This document enforces strict file discovery and context handling protocols for all agent interactions to prevent context leaks and ensure efficient token management.

## Context Compaction Principle
Context must be compacted *before* being sent to the model if the raw input context exceeds the `HARD_INPUT_CAP` (default 24000 tokens). The goal is to preserve task state (goal, completed work, active files, errors, chunk IDs, ACE weights, next action) rather than raw history.

**Flow:**
1. OpenCode Request $\rightarrow$ Count Tokens.
2. If `inputTokens > HARD_INPUT_CAP`:
    a. Summarize History $\rightarrow$ `summarizeHistory()`.
    b. Drop low-weight chunks.
    c. Call ACE compact packet service.
    d. Cap MCP/tool output.
3. $\rightarrow$ Send compact prompt to Gemma4.

## Core Behavioral Guardrails for File Discovery (Mandatory)
When navigating the codebase, **always** use `rg` (ripgrep) first.

**File Discovery Sequence:**
1. Run `pwd` to confirm the current working directory.
2. Run `rg --files | rg "<filename>$"` to verify file existence before reading or editing.
3. **Search Content:** Use `rg "<pattern>" <known-active-root>` for content searching.

**Preferred Search Paths:**
*   Prefer the active application root: `sveltekit-frontend/`.
*   Do not assume `src/` exists at the repository root.

**Error Handling:**
*   Do not ask the user for a path until `rg` confirms no match is found.

**Example Searches:**
*   **File Search:** `rg --files | rg "context-assembler\.ts$"`
*   **Content Search:** `rg "buildACEPromptCached|getAdaptiveTopK|ACP_MAX_RESULTS|top_k" sveltekit-frontend/src/lib/server/ace`

## Environment Variable Management
Ensure the following environment variables are set when running tooling:
*   `OPENAI_HARD_INPUT_CAP`: Defines the token limit that triggers compaction (default 24000).
*   `TURBO_CTX_SIZE`: Target context window size for the model (e.g., 64k).
*   `ACE_PACKET_TOKEN_CAP`: Maximum allowed token count for the compacted ACE packet (e.g., 3500).
*   `MCP_RESULT_TOKEN_CAP`: Token cap for MCP results (e.g., 800).

## Telemetry Reporting (For Diagnostic Runs)
When reporting on a context build, always include the following metadata in the log:
*   `budgetGuardTriggered` (Boolean)
*   `availableContextTokens`
*   `stablePrefixHash`
*   `kvPacketTaskId`
*   Include raw-path input token metadata for diagnostic/raw passthrough responses.