#!/usr/bin/env python3
"""
Test Polygraphy accessibility
"""
import subprocess
import sys

def test_polygraphy():
    cmd = ["/usr/local/bin/polygraphy", "convert", "--help"]
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True, env={
            "LD_LIBRARY_PATH": "/usr/local/tensorrt/targets/x86_64-linux-gnu/lib:$LD_LIBRARY_PATH"
        })
        print("SUCCESS: Polygraphy is accessible")
        print("First few lines of help:")
        print("\n".join(result.stdout.split("\n")[:5]))
        return True
    except subprocess.CalledProcessError as e:
        print(f"ERROR: Polygraphy test failed with exit code {e.returncode}")
        print(f"STDOUT: {e.stdout}")
        print(f"STDERR: {e.stderr}")
        return False

if __name__ == "__main__":
    success = test_polygraphy()
    sys.exit(0 if success else 1)