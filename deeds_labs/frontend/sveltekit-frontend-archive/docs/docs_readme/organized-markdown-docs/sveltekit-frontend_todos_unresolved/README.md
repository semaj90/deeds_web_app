# Unresolved TODOs & LLM Misfires

This directory automatically captures LLM failures, TypeScript errors, and unresolved issues for automated review.

## Structure

```
todos/
├── unresolved/
│   ├── llm-misfires/     # LLM timeout/error logs
│   ├── typescript/       # TS compilation errors
│   ├── runtime/          # Runtime exceptions
│   └── performance/      # Memory/GPU issues
├── autogen/              # AutoGen task queues
└── crewai/               # CrewAI review results
```

## Auto-Review Process

1. **Capture**: System automatically logs issues
2. **Categorize**: Sort by type (LLM, TS, runtime, etc.)
3. **Review**: Claude/CrewAI agents analyze and suggest fixes
4. **Resolve**: Automated or manual resolution

## Usage

- Issues auto-populate during development
- Run `npm run review-todos` to trigger AI review
- Check `resolved/` for completed fixes