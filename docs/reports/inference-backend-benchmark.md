# 📊 Model Inference Backend Performance Report

*Compiled on: 5/16/2026 at 11:52:43 PM*

This report audits and evaluates local inference performance between **TurboQuant** (`llama-server.exe` on port 8090) and **Ollama** (on port 11434).

---

## 🚀 Performance Overview

| Backend | Port | Status | Tokens/Sec | Time-to-First-Token (TTFT) | Total Time | VRAM Delta |
|---------|------|--------|------------|---------------------------|------------|------------|
| **TurboQuant** | `8090` | ❌ Standby / Offline | N/A | N/A | N/A | N/A |
| **Ollama** | `11434` | ✅ Online | **59.57** | `555ms` | `3.73s` | `-9MB` |

---

## 🧠 Environmental Context
* **Base Model**: `models/gemma4-rotorquant:latest-iq4xs-direct.gguf` (~5.09 GB)
* **Vision Plugin**: `models/mmproj-F16.gguf` (~990 MB) (loaded only when VLM mode is toggled)
* **VLM Mode**: `DISABLED`

---

## 🔎 Detailed Transcripts

### 📄 Ollama Output Sample
```text
Here's a thinking process to construct the suggested response:

1.  **Analyze the Request:**
    *   **Topic:** Security audit guidelines.
    *   **Target Technology:** Svelte 5 runes context state management.
    *   **Constraint 1:** List 8 core guidelines.
    *   **Constraint 2:** Keep it extremely concise.
    *   **Constraint 3 (Implicit/Mandatory):** Maintain the persona of a legal AI assistant fine-tuned on U.S. law, citing statutes/case law (even if the topic is technical, the *format* must adhere to the persona).

2.  **Determine Feasibility & Scope Conflict:**
    *   *Conflict:* Svelte 5 runes context state management is a front-end, software engineering topic. It does not inherently involve U.S. federal or state statutes (like HIPAA, GDPR, CFAA, etc.) or case law directly.
    *   *Resolution:* I must address the technical request while maintaining the legal framework. I will frame the technical guidelines through a *security/compliance lens* (e.g., data integrity, access control, input validation) and then apply the legal citation
```

