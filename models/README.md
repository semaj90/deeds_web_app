# Gemma 4 Legal E4B Model Setup Package

**Production-Grade Windows Automation for Ollama Deployment**

---

## Quick Start

```bash
# Option 1: Double-click (easiest)
setup.bat

# Option 2: PowerShell
.\setup.ps1

# Option 3: Python directly
python gemma4_setup.py
```

**Time:** 60-90 minutes
**Space:** 20GB free minimum
**Result:** `gemma4-rotorquant:latest:e4b` model ready in Ollama

---

## What This Does

Fully automated pipeline:
1. ✅ Downloads Gemma 4 E4B base model (7.5GB)
2. ✅ Downloads legal GRPO adapter (140MB)
3. ✅ Merges LoRA weights
4. ✅ Converts to GGUF Q4_K_M (~2.5GB)
5. ✅ Imports to Ollama
6. ✅ Runs validation test

---

## Prerequisites

### Required
- **Python 3.9+** - https://www.python.org/downloads/
- **Git** - https://git-scm.com/download/win
- **Ollama** - https://ollama.com/download
- **Visual Studio Build Tools** (for C++ compilation)

### System
- **RAM:** 16GB minimum, 32GB recommended
- **Disk:** 20GB free minimum
- **GPU:** Optional (CUDA speeds up processing)

---

## Files

| File | Purpose |
|------|---------|
| `setup.bat` | 🚀 **Start here** - Double-click launcher |
| `setup.ps1` | PowerShell launcher with prereq checks |
| `gemma4_setup.py` | Main Python automation (1000+ lines) |
| `config.json` | Configuration (model IDs, paths) |
| `SETUP_GUIDE.md` | 📖 Complete documentation |
| `README.md` | This file |

---

## After Setup

### Test the Model

```bash
ollama run gemma4-rotorquant:latest:e4b "What is hearsay evidence?"
```

### Use in Code

```typescript
import { bifrostChat } from '$lib/server/ollama.js';

const response = await bifrostChat(
  [{ role: 'user', content: 'Analyze this contract...' }],
  'gemma4-rotorquant:latest:e4b',
  { temperature: 0.3 }
);
```

---

## Features

### Production Quality
- ✅ Real-time progress bars (tqdm)
- ✅ Automatic error recovery with retry
- ✅ Download resume capability
- ✅ GPU detection (CUDA check)
- ✅ Disk space validation
- ✅ Comprehensive logging to `gemma4_setup.log`
- ✅ Step-by-step progress tracking (9 steps)

### Smart Error Handling
- Validates Python/Git/Ollama before starting
- Checks disk space (20GB minimum)
- Auto-resumes interrupted downloads
- Retries failed operations
- Clear error messages with solutions

### Progress Tracking
- Package installation: 8 packages with progress bar
- Model download: Live download progress
- Merge/convert: Step completion status
- Each step: ✓ on success, ✗ on failure

---

## Troubleshooting

### "Python not found"
Install Python 3.9+ with "Add to PATH" checked
https://www.python.org/downloads/

### "Git not found"
Install Git for Windows
https://git-scm.com/download/win

### "Ollama not found"
Install Ollama
https://ollama.com/download

### "Insufficient disk space"
Need 20GB free. Run Disk Cleanup or delete temp files.

### "Out of memory"
Close other applications. Need 16GB+ RAM for CPU mode.

### "CMake not found"
Install Visual Studio Build Tools with C++ workload
https://visualstudio.microsoft.com/downloads/

**Full troubleshooting guide:** See `SETUP_GUIDE.md`

---

## Logs

All operations logged to `gemma4_setup.log`:
- Timestamps
- Step completion status
- Error details
- System info (GPU, RAM, disk)

```bash
# View log
type gemma4_setup.log

# Tail log in real-time
Get-Content gemma4_setup.log -Wait
```

---

## Model Details

**Base:** `unsloth/gemma-4-E4B-it` (Gemma 4 E4B, 4B parameters)
**Adapter:** `Semaj90/gemma4-e4b-legal-grpo` (10,214 GRPO steps)
**Quantization:** Q4_K_M (4-bit with K-means, <5% quality loss)
**Size:** ~2.5GB GGUF
**Context:** 8192 tokens

**Performance (RTX 3060 Ti):**
- Inference: ~25 tokens/sec
- VRAM: ~4GB
- Quality: Legal domain fine-tuned

---

## Configuration

Edit `config.json` to customize:

```json
{
  "base_model": "unsloth/gemma-4-E4B-it",
  "adapter": "Semaj90/gemma4-e4b-legal-grpo",
  "quantization": "q4_k_m",
  "min_disk_space_gb": 20
}
```

**Quantization options:**
- `q4_k_m` - 4-bit (default, ~2.5GB)
- `q5_k_m` - 5-bit (~3.0GB, better quality)
- `q8_0` - 8-bit (~5GB, near-lossless)
- `f16` - 16-bit (~8GB, full precision)

---

## Cleanup

After successful import to Ollama:

```powershell
# Delete merged model (saves ~15GB)
Remove-Item -Recurse gemma4-rotorquant:latest-merged-full

# Delete llama.cpp (saves ~500MB)
Remove-Item -Recurse llama.cpp

# Keep GGUF file for manual re-import
```

---

## Support

**Documentation:** `SETUP_GUIDE.md` (14,000+ words)
**Logs:** `gemma4_setup.log`
**Issues:** Check logs first, then see troubleshooting guide

---

## License

Part of Legal AI Platform project.
- Gemma 4 E4B: Gemma Terms of Use
- Legal adapter: Apache 2.0

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `setup.bat` | Start setup (double-click) |
| `.\setup.ps1` | PowerShell launcher |
| `python gemma4_setup.py` | Python directly |
| `ollama run gemma4-rotorquant:latest:e4b` | Test model |
| `ollama list` | List installed models |
| `ollama rm gemma4-rotorquant:latest:e4b` | Remove model |
| `type gemma4_setup.log` | View logs |

---

**Ready? Just double-click `setup.bat` and wait 60-90 minutes!**