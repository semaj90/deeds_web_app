#!/usr/bin/env python3
"""
Start TensorRT-LLM Inference Service for Legal AI
"""

import os
import sys
import subprocess
from pathlib import Path

def main():
    script_dir = Path(__file__).parent
    service_script = script_dir / "tensorrt_inference_service.py"

    if not service_script.exists():
        print(f"❌ Service script not found: {service_script}")
        return 1

    print("🚀 Starting TensorRT-LLM Inference Service")
    print("=" * 50)
    print(f"Service: {service_script}")
    print("Port: 8099")
    print("Endpoint: http://localhost:8099")
    print()

    # Set environment variables
    env = os.environ.copy()
    env["TENSORRT_PORT"] = "8099"

    try:
        # Run the service
        subprocess.run([
            sys.executable, str(service_script)
        ], env=env, check=True)

    except KeyboardInterrupt:
        print("\n🛑 Service stopped by user")
    except subprocess.CalledProcessError as e:
        print(f"❌ Service failed: {e}")
        return 1

    return 0

if __name__ == "__main__":
    sys.exit(main())