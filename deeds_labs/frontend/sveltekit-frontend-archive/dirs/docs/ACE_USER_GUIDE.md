# ACE Agent User Guide

## Overview
The ACE (Agentic Coding Environment) Agent is a self-improving repair pipeline for the Legal AI Platform. It uses RAG (Retrieval-Augmented Generation) and LLMs to automatically detect, cluster, and fix errors in the codebase.

## Quick Start

1.  **Setup Environment**:
    ```powershell
    ./deploy-ace.ps1
    ```
    This will create your `.env` file and install dependencies.

2.  **Configure `.env`**:
    Edit `.env` and ensure your `OLLAMA_URL` and `DATABASE_URL` are correct.
    Set `GEMINI_API_KEY` if you want to use Gemini for advanced reasoning.

3.  **Start Services**:
    Ensure Docker Desktop is running, or start your local services (Postgres, Redis, Qdrant, Ollama).

4.  **Run the Pipeline**:
    To start the full self-repair loop:
    ```bash
    npm run phase78:full
    ```

## Pipeline Stages

1.  **Collect**: Runs `svelte-check` and `tsc` to gather errors.
2.  **Cluster**: Groups similar errors using K-means clustering on embeddings.
3.  **Suggest**: Uses LLMs (Gemma 3 Legal) to generate fixes for error clusters.
4.  **Apply**: Safely applies fixes (Snapshot -> Apply -> Verify -> Rollback).

## Troubleshooting

*   **Services not running**: Run `.kiro/specs/ace-contextual-web-ingestion/test-services.ps1` to check health.
*   **Database errors**: Ensure `legal_admin` has permissions. The pipeline uses `fix-clusters-schema.mjs` to manage schema updates.
*   **Ollama errors**: Ensure `gemma3-legal:latest` and `embeddinggemma:latest` are pulled.

## Advanced Configuration

*   `TIER`: Set to `1` for safe, deterministic fixes. `2` for AI-suggested fixes.
*   `MAX_FIXES`: Limit the number of fixes per run.
