# Colab MCP Server Setup — Remote GPU Training from CLI

Use the [Google Colab MCP Server](https://github.com/googlecolab/colab-mcp) to execute training notebooks on Colab GPU runtimes directly from local AI agents (Claude Code, Gemini CLI).

## Install

```bash
pip install uv
```

## Configure for Claude Code

Add to `~/.claude/settings.json` → `mcpServers`:

```json
{
  "colab": {
    "command": "uvx",
    "args": ["--from", "git+https://github.com/googlecolab/colab-mcp", "mcp-server-colab"]
  }
}
```

## Two Operating Modes

### Session Proxy Mode (Default)
- Opens a WebSocket bridge between your browser Colab notebook and your local agent
- Agent creates cells, writes code, executes it, retrieves results inside your open notebook
- **Best for**: Interactive fine-tuning sessions, debugging training loops

### Runtime Mode
- Direct programmatic access to Jupyter kernels on Colab VMs
- No browser needed — fully headless
- **Best for**: Scheduled training runs, batch jobs

## Usage: Fine-Tune Gemma 4 E4B

1. Open `scripts/unsloth-training/Gemma4_E4B_Legal_QLoRA.ipynb` in Colab
2. Connect A100 runtime
3. From local CLI, the agent can:
   - Execute training cells remotely
   - Monitor loss/reward curves
   - Download merged LoRA adapters
   - Convert to GGUF and deploy to Ollama

## References

- [googlecolab/colab-mcp](https://github.com/googlecolab/colab-mcp)
- [Colab MCP Announcement](https://developers.googleblog.com/announcing-the-colab-mcp-server-connect-any-ai-agent-to-google-colab/)
- [Colab MCP Agent Design Guide](https://www.marktechpost.com/2026/03/23/how-to-design-a-production-ready-ai-agent-that-automates-google-colab-workflows-using-colab-mcp-mcp-tools-fastmcp-and-kernel-execution/)
- [Colab MCP Setup Guide](https://gemilab.net/en/articles/gemini-dev/google-colab-mcp-server-ai-agent-guide)
