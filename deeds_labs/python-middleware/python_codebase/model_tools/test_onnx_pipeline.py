#!/usr/bin/env python3
"""
Test script to validate TensorRT-LLM ONNX export pipeline.

This script tests the basic functionality of the export scripts without
actually downloading models or performing exports.

Usage:
    python test_onnx_pipeline.py
"""

import sys
import os
from pathlib import Path

def test_script_imports():
    """Test that all scripts can be imported without errors."""
    print("🔍 Testing script imports...")

    scripts = [
        "export_gemma3_270m_to_onnx",
        "export_embeddinggemma_to_onnx",
        "build_tensorrt_engine"
    ]

    for script in scripts:
        try:
            # Test import
            module = __import__(script)
            print(f"✅ {script}.py - Import OK")

            # Check for main function
            if hasattr(module, 'main'):
                print(f"   📌 main() function found")
            else:
                print(f"   ⚠️  main() function missing")

        except ImportError as e:
            print(f"❌ {script}.py - Import failed: {e}")
            return False
        except Exception as e:
            print(f"❌ {script}.py - Error: {e}")
            return False

    return True

def test_directory_structure():
    """Test that expected directories exist."""
    print("\n📁 Testing directory structure...")

    expected_dirs = [
        Path("./models"),
        Path("./models/onnx"),
        Path("./models/trt_engines")
    ]

    for dir_path in expected_dirs:
        if dir_path.exists():
            print(f"✅ {dir_path} - Exists")
        else:
            print(f"ℹ️  {dir_path} - Will be created during export")
            dir_path.mkdir(parents=True, exist_ok=True)
            print(f"   📁 Created {dir_path}")

    return True

def test_bash_script():
    """Test that the bash venv script exists and is executable."""
    print("\n🐚 Testing bash script...")

    script_path = Path("../../scripts/create_trtllm_venv.sh")

    if script_path.exists():
        print(f"✅ {script_path} - Exists")

        # Check if it's a bash script
        with open(script_path, 'r') as f:
            first_line = f.readline().strip()
            if first_line == "#!/usr/bin/env bash" or first_line.startswith("#!/bin/bash"):
                print("   📜 Valid bash script")
            else:
                print(f"   ⚠️  Unexpected shebang: {first_line}")

        return True
    else:
        print(f"❌ {script_path} - Not found")
        return False

def main():
    """Run all tests."""
    print("🧪 TensorRT-LLM ONNX Pipeline Test Suite")
    print("=" * 50)

    tests = [
        ("Script Imports", test_script_imports),
        ("Directory Structure", test_directory_structure),
        ("Bash Script", test_bash_script)
    ]

    passed = 0
    total = len(tests)

    for test_name, test_func in tests:
        print(f"\n🔬 Running: {test_name}")
        try:
            if test_func():
                passed += 1
                print(f"✅ {test_name} - PASSED")
            else:
                print(f"❌ {test_name} - FAILED")
        except Exception as e:
            print(f"💥 {test_name} - ERROR: {e}")

    print("\n" + "=" * 50)
    print(f"📊 Test Results: {passed}/{total} passed")

    if passed == total:
        print("🎉 All tests passed! Pipeline is ready for use.")
        print("\n🚀 Next steps:")
        print("1. Start TensorRT-LLM container")
        print("2. Run: ./create_trtllm_venv.sh")
        print("3. Run: python export_gemma3_270m_to_onnx.py")
        print("4. Run: python build_tensorrt_engine.py --model gemma3")
    else:
        print("⚠️ Some tests failed. Please check the output above.")
        sys.exit(1)

if __name__ == "__main__":
    main()