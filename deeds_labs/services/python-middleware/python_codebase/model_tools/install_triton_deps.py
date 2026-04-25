#!/usr/bin/env python3
"""
Install Triton dependencies for Gemma3 Legal AI
================================================
"""

import subprocess
import sys
import os

def run_command(cmd, description):
    """Run a command and handle errors"""
    print(f"🔄 {description}...")
    try:
        result = subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed: {e}")
        print(f"STDOUT: {e.stdout}")
        print(f"STDERR: {e.stderr}")
        return False

def main():
    """Install all required dependencies"""
    print("🚀 Installing Triton dependencies for Gemma3 Legal AI")

    # Essential packages for Triton inference
    packages = [
        "triton",
        "torch>=2.0.0",
        "transformers>=4.35.0",
        "accelerate",
        "fastapi",
        "uvicorn",
        "pydantic",
        "numpy",
        "flash-attn --no-build-isolation",
        "autoawq",
        "bitsandbytes",
    ]

    success_count = 0
    total_packages = len(packages)

    for package in packages:
        cmd = f"pip install {package}"
        if run_command(cmd, f"Installing {package}"):
            success_count += 1

    print(f"\n📊 Installation Summary:")
    print(f"✅ Successful: {success_count}/{total_packages}")
    print(f"❌ Failed: {total_packages - success_count}/{total_packages}")

    if success_count == total_packages:
        print("🎉 All dependencies installed successfully!")
        return True
    else:
        print("⚠️ Some packages failed to install")
        return False

if __name__ == "__main__":
    main()