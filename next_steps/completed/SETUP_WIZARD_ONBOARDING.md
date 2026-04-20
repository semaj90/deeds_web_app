# Setup Wizard — Interactive Onboarding Tutorial

## Status: ✅ COMPLETE — All items done. Archive candidate.
## Priority: High
## Created: 2026-03-16

---

## Overview

First-time user onboarding wizard that guides new users through the Legal AI Platform
using modal-based tutorial steps with spotlight CSS effects and SvelteKit 2 animations.

## Features

1. **Spotlight Overlay**: CSS spotlight effect highlighting UI areas while dimming the rest
2. **Step-by-step Modals**: Modal dialogs explaining each feature area
3. **Progress Tracking**: Track which steps user has completed (localStorage + DB)
4. **Model Download**: Guide user to download required AI models (Ollama)
5. **AI Assistant Integration**: Contextual help from the AI chat assistant
6. **HTML5 Animations**: Smooth transitions between tutorial steps
7. **Skip/Resume**: Users can skip and resume the tutorial later

## Tutorial Steps

1. **Welcome** — Overview of the Legal AI Platform
2. **Dashboard** — Explain the main dashboard metrics and navigation
3. **Cases** — How to create and manage legal cases
4. **Evidence** — Upload, analyze, and organize evidence
5. **AI Assistant** — How to use the AI chat for legal research
6. **Search** — Global search with GPU-accelerated reranking
7. **Models** — Download and configure AI models (Ollama setup)
8. **Settings** — Customize your workspace

## Technical Approach

- **Component**: `SetupWizard.svelte` in `src/lib/components/onboarding/`
- **Trigger**: First login detection via `locals.user.onboardingComplete` flag
- **Spotlight**: CSS `mix-blend-mode` + `clip-path` for area highlighting
- **Animations**: Svelte 5 `transition:` directives + CSS keyframes
- **State**: `$state` for current step, `$effect` for scroll-to-element
- **Persistence**: `localStorage` for client, DB flag for server
- **Integration**: Injected in root `+layout.svelte` or dashboard `+page.svelte`
