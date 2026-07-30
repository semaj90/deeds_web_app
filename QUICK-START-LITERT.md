# LiteRT Dev — Quick Start

## One-Line Startup

```bash
npm run dev:litert:full
```

Done. That's it.

## What This Does

1. ✅ Starts `npm run dev:gpu` with LiteRT-LM backend on :8070
2. ✅ Waits for startup (3 seconds)
3. ✅ Opens LiteRT.js-Mocap workspace in new VS Code window
4. ✅ Displays service summary

## Access Points

Once running:

| What | Where |
|------|-------|
| Frontend | http://localhost:5173 |
| LLM API | http://127.0.0.1:8070/v1 |
| LiteRT.js | New VS Code window |

## Alternatives

### If npm command doesn't work:
```bash
cd sveltekit-frontend
DEV_GPU_LLM_BACKEND=litert npm run dev:gpu
# Then manually: code ~/Downloads/LiteRT.js-Mocap-main --new-window
```

### From VS Code (GUI):
- Press `Ctrl+Shift+P`
- Type: `Tasks: Run Task`
- Select: **🚀 LiteRT Dev Startup**

### Just the LiteRT backend (no Mocap):
```bash
DEV_GPU_LLM_BACKEND=litert npm run dev:gpu
```

### Just llama-server (default):
```bash
npm run dev:gpu
```

## Stop

- Press `Ctrl+C` in terminal (kills both dev:gpu and orchestrator)
- Or close VS Code windows normally

## Test It Works

```bash
# In a new terminal, test LLM API
curl -X POST http://127.0.0.1:8070/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma-4-E2B-it.litertlm",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 100
  }' | jq '.choices[0].message.content'
```

Should return a response from Gemma4.

## Still Have Issues?

See full guides:
- `LITERT-SETUP-SUMMARY.md` — Overview + troubleshooting
- `LITERT-VSCODE-STARTUP.md` — Detailed guide + all options
- `LITERT-DEV-GPU-USAGE.md` — Backend switching reference

---

**That's all you need to know to get started! 🚀**
