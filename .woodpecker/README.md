# Woodpecker CI configs

This directory contains Woodpecker CI pipeline definitions for running CI on a self-hosted machine.

- `cheap-ci.yml` — lightweight checks that run on every commit: `npm ci`, `npm run check`, `lint`, unit tests, and lightweight startup guards.
- `local-gpu-heavy.yml` — GPU- and model-heavy steps gated behind an explicit `ALLOW_GPU_RUN=1` environment variable. Intended to run only on demand on the local Windows/GPU machine.

Notes and recommendations:

- These pipelines are intended for a self-hosted Woodpecker runner (container-based). They are not GitHub Actions workflows — see the project README to switch CI providers.
- To run locally for quick validation of GitHub-style workflows, consider using `act` (Docker required). `act` is a simulator and does not replace a real Woodpecker server.
- Do NOT enable `ALLOW_GPU_RUN` on every push; gate heavy jobs to prevent accidental long runs.

Quick start (Woodpecker server + local runner):

1. Install Woodpecker (see https://woodpecker-ci.org/docs/)
2. Register the runner on this machine and point it at the repo
3. Ensure Docker is available for pipeline steps that run in containers
4. Use the Woodpecker web UI to manually trigger the `local-gpu-heavy` pipeline or set `ALLOW_GPU_RUN=1` for a run
