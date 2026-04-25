#!/usr/bin/env python3
"""
Start Triton Legal AI Server
============================
Production-ready script to start the Gemma3 Legal AI with Triton optimizations
"""

import os
import sys
import subprocess
import time
import requests
import signal
from pathlib import Path

def check_dependencies():
    """Check if required dependencies are available"""
    print("🔍 Checking dependencies...")

    try:
        import torch
        print(f"✅ PyTorch: {torch.__version__}")

        if torch.cuda.is_available():
            print(f"✅ CUDA: {torch.cuda.get_device_name()}")
            print(f"💾 GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f}GB")
        else:
            print("⚠️ CUDA not available - using CPU fallback")

    except ImportError:
        print("❌ PyTorch not available")
        return False

    try:
        import triton
        print(f"✅ Triton: {triton.__version__}")
    except ImportError:
        print("⚠️ Triton not available - using PyTorch optimizations")

    try:
        import transformers
        print(f"✅ Transformers: {transformers.__version__}")
    except ImportError:
        print("❌ Transformers not available")
        return False

    # Check model files
    model_path = "/home/james/gemma3_awq4_working"
    if Path(model_path).exists():
        print(f"✅ AWQ4 model found: {model_path}")

        config_file = Path(model_path) / "config.json"
        model_file = Path(model_path) / "model.safetensors"

        if config_file.exists() and model_file.exists():
            size_gb = model_file.stat().st_size / (1024**3)
            print(f"✅ Model files verified ({size_gb:.1f}GB)")
        else:
            print("❌ Model files incomplete")
            return False
    else:
        print(f"❌ AWQ4 model not found: {model_path}")
        return False

    return True

def install_missing_packages():
    """Install missing packages if needed"""
    packages = [
        "fastapi",
        "uvicorn",
        "pydantic",
    ]

    for package in packages:
        try:
            __import__(package)
        except ImportError:
            print(f"📦 Installing {package}...")
            subprocess.run([sys.executable, "-m", "pip", "install", package], check=True)

def start_triton_server():
    """Start the Triton inference server"""
    print("🚀 Starting Triton Legal AI Server...")

    # Check if server is already running
    try:
        response = requests.get("http://localhost:8000/health", timeout=5)
        if response.status_code == 200:
            print("⚠️ Server already running on port 8000")
            return None
    except requests.exceptions.RequestException:
        pass

    # Start server
    script_path = Path(__file__).parent / "gemma3_triton_inference.py"
    if not script_path.exists():
        print(f"❌ Server script not found: {script_path}")
        return None

    env = os.environ.copy()
    env['PYTHONUNBUFFERED'] = '1'
    env['CUDA_VISIBLE_DEVICES'] = '0'

    process = subprocess.Popen(
        [sys.executable, str(script_path)],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    print("⏳ Waiting for server to start...")

    # Wait for server to be ready
    max_attempts = 60  # 1 minute
    for attempt in range(max_attempts):
        try:
            response = requests.get("http://localhost:8000/health", timeout=5)
            if response.status_code == 200:
                print("✅ Triton Legal AI Server is ready!")
                print("🌐 Server URL: http://localhost:8000")
                print("📚 API Documentation: http://localhost:8000/docs")
                return process
        except requests.exceptions.RequestException:
            pass

        time.sleep(1)

        # Check if process died
        if process.poll() is not None:
            print("❌ Server process died")
            output = process.stdout.read()
            print(f"Output: {output}")
            return None

    print("❌ Server failed to start within 60 seconds")
    process.terminate()
    return None

def test_server():
    """Test the server with a sample request"""
    print("\n🧪 Testing server with sample request...")

    test_request = {
        "prompt": "What are the key elements of a valid contract?",
        "max_tokens": 100,
        "temperature": 0.3
    }

    try:
        response = requests.post(
            "http://localhost:8000/generate",
            json=test_request,
            timeout=30
        )

        if response.status_code == 200:
            result = response.json()
            print("✅ Test successful!")
            print(f"📝 Response: {result['text'][:200]}...")
            print(f"⚡ Tokens: {result['tokens_generated']}")
            print(f"⏱️ Time: {result['inference_time']:.2f}s")
            print(f"🏷️ Model: {result['model_used']}")
            return True
        else:
            print(f"❌ Test failed: {response.status_code}")
            print(f"Error: {response.text}")
            return False

    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

def main():
    """Main entry point"""
    print("🎯 Gemma3 Legal AI - Triton Server Launcher")
    print("=" * 50)

    # Check dependencies
    if not check_dependencies():
        print("❌ Dependency check failed")
        return 1

    # Install missing packages
    try:
        install_missing_packages()
    except Exception as e:
        print(f"⚠️ Failed to install packages: {e}")

    # Start server
    server_process = start_triton_server()
    if not server_process:
        print("❌ Failed to start server")
        return 1

    # Test server
    if not test_server():
        print("⚠️ Server test failed, but server is running")

    print("\n🎉 Triton Legal AI Server is ready for production!")
    print("💡 Integration with SvelteKit:")
    print("   - Update TRITON_SERVER_URL=http://localhost:8000 in .env")
    print("   - The legal AI API will automatically use Triton optimizations")
    print("   - AWQ4 quantization provides 3x memory efficiency")
    print("   - Mixed precision enables faster inference on RTX 3060 Ti")

    try:
        # Keep running and show logs
        print("\n📋 Server logs (Ctrl+C to stop):")
        print("-" * 40)

        while True:
            line = server_process.stdout.readline()
            if line:
                print(line.rstrip())
            elif server_process.poll() is not None:
                break
            time.sleep(0.1)

    except KeyboardInterrupt:
        print("\n🛑 Shutting down server...")
        server_process.terminate()
        server_process.wait()
        print("✅ Server stopped")

    return 0

if __name__ == "__main__":
    sys.exit(main())