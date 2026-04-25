#!/bin/bash
# Status check for Gemma3 12B TensorRT-LLM build pipeline

echo "=== Gemma3 12B TensorRT-LLM Build Status ==="
echo ""

# Check checkpoint
echo "📁 Checkpoint Status:"
if [ -f "input/rank0.safetensors" ]; then
    echo "  ✅ rank0.safetensors found ($(du -h input/rank0.safetensors | cut -f1))"
else
    echo "  ❌ rank0.safetensors missing"
fi

if [ -f "input/config.json" ]; then
    echo "  ✅ config.json found"
else
    echo "  ⚠️  config.json missing (optional)"
fi
echo ""

# Check scripts
echo "🔧 Build Scripts:"
scripts=("scripts/convert_checkpoint.py" "scripts/verify_custom_shapes.py" "scripts/build_tensorrt_engine_int4.sh" "scripts/docker_build_tensorrt_engine.sh")
for script in "${scripts[@]}"; do
    if [ -f "$script" ]; then
        echo "  ✅ $script"
    else
        echo "  ❌ $script missing"
    fi
done
echo ""

# Check configuration
echo "⚙️  Configuration:"
if [ -f "input/custom_build.json" ]; then
    echo "  ✅ custom_build.json found"
    # Check if JSON is valid
    if python3 -c "import json; json.load(open('input/custom_build.json'))" 2>/dev/null; then
        echo "  ✅ custom_build.json is valid JSON"
    else
        echo "  ❌ custom_build.json has JSON errors"
    fi
else
    echo "  ❌ custom_build.json missing"
fi
echo ""

# Check disk space
echo "💾 Disk Space:"
if command -v df >/dev/null 2>&1; then
    df -h . | tail -1 | awk '{print "  Available: " $4 " / " $2 " (" $5 " used)"}'
elif command -v wmic >/dev/null 2>&1; then
    # Windows fallback
    free_mb=$(wmic logicaldisk get freespace,caption | grep C: | awk '{print int($2/1024/1024)}')
    echo "  Available: ~${free_mb}MB on C:"
else
    echo "  Unable to check disk space"
fi
echo ""

# Summary
echo "🎯 Build Strategy:"
echo "  - Direct checkpoint usage (no conversion due to disk space)"
echo "  - Custom weight mappings for Gemma3 tensor names"
echo "  - INT4 AWQ quantization optimized for RTX 3060 Ti"
echo "  - Memory-optimized settings (batch_size=1, seq_len=4096)"
echo ""

echo "🚀 Next Steps:"
echo "  1. Ensure checkpoint files are in input/ directory"
echo "  2. Run: bash scripts/docker_build_tensorrt_engine.sh"
echo "  3. Monitor build progress (15-25 minutes)"
echo "  4. Engine will be saved to output/engine/"
echo ""

echo "📊 Expected Results:"
echo "  - Engine size: ~3.5GB"
echo "  - VRAM usage: ~4.5GB peak"
echo "  - Performance: 50-80 tokens/sec (batch=1)"
echo ""

echo "=== Status Check Complete ==="