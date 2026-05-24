# Post Write Memory

After a write/edit, log the action to JSONL memory.

Run:
```powershell
node scripts/agent/log-subagent.mjs "$AGENT" "$SUBAGENT" "$TASK" "$STATUS" "$REASON"
```

Never store runtime history in AGENTS.md.