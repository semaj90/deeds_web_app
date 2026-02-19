#!/usr/bin/env python3
"""
Test GGUF model loading and validate repo structure
"""

import os
import sys
from pathlib import Path

def test_gguf_loading():
    """Test different methods to load GGUF model"""

    gguf_path = "C:/Users/james/Videos/deeds-web-app/gemma3Q4_K_M/mohf16-Q4_K_M.gguf"

    print(f"🔍 Testing GGUF loading: {gguf_path}")

    # Check if file exists
    if not os.path.exists(gguf_path):
        print(f"❌ GGUF file not found: {gguf_path}")
        return False

    file_size_gb = os.path.getsize(gguf_path) / (1024**3)
    print(f"📁 File size: {file_size_gb:.2f} GB")

    # Test 1: Try llama-cpp-python
    try:
        from llama_cpp import Llama
        print("🔄 Testing llama-cpp-python loading...")

        # Load with minimal settings
        llm = Llama(
            model_path=gguf_path,
            n_ctx=512,      # Small context for testing
            n_batch=256,    # Small batch size
            n_threads=4,    # Use 4 threads
            verbose=False
        )
        print("✅ llama-cpp-python: Successfully loaded GGUF!")

        # Test a simple inference
        response = llm("Hello", max_tokens=10, echo=False)
        print(f"🧪 Test output: {response['choices'][0]['text'][:50]}...")

        del llm  # Free memory
        return True

    except ImportError:
        print("⚠️  llama-cpp-python not installed")
    except Exception as e:
        print(f"❌ llama-cpp-python error: {e}")

    # Test 2: Try direct GGUF reading
    try:
        import struct
        print("🔄 Testing direct GGUF file validation...")

        with open(gguf_path, 'rb') as f:
            # Read GGUF magic number
            magic = f.read(4)
            if magic == b'GGUF':
                print("✅ Valid GGUF magic number found")

                # Read version
                version = struct.unpack('<I', f.read(4))[0]
                print(f"📋 GGUF version: {version}")

                # Read tensor count
                tensor_count = struct.unpack('<Q', f.read(8))[0]
                print(f"📊 Tensor count: {tensor_count}")

                # Read metadata count
                metadata_count = struct.unpack('<Q', f.read(8))[0]
                print(f"📝 Metadata count: {metadata_count}")

                print("✅ GGUF file structure appears valid")
                return True
            else:
                print(f"❌ Invalid GGUF magic: {magic}")

    except Exception as e:
        print(f"❌ Direct GGUF reading error: {e}")

    # Test 3: Try Ollama loading
    try:
        print("🔄 Testing Ollama compatibility...")
        # Check if Ollama is available
        import subprocess
        result = subprocess.run(['ollama', 'list'], capture_output=True, text=True)
        if result.returncode == 0:
            print("✅ Ollama is available")
            print("💡 You can try: ollama create legal-gemma -f Modelfile")
            print("   Where Modelfile contains: FROM " + gguf_path)
        else:
            print("⚠️  Ollama not available")

    except Exception as e:
        print(f"⚠️  Ollama check failed: {e}")

    return False

def create_modelfile():
    """Create an Ollama Modelfile for the GGUF"""

    gguf_path = "C:/Users/james/Videos/deeds-web-app/gemma3Q4_K_M/mohf16-Q4_K_M.gguf"
    modelfile_path = "C:/Users/james/Videos/deeds-web-app/Modelfile.legal-gemma"

    modelfile_content = f"""# Legal AI Gemma3 Model
FROM {gguf_path}

# Set the template (Gemma3 format)
TEMPLATE \"\"\"{{{{ if .System }}}}<|start_header_id|>system<|end_header_id|>

{{{{ .System }}}}<|eot_id|>{{{{ end }}}}{{{{ if .Prompt }}}}<|start_header_id|>user<|end_header_id|>

{{{{ .Prompt }}}}<|eot_id|><|start_header_id|>assistant<|end_header_id|>

{{{{ end }}}}{{{{ .Response }}}}<|eot_id|>\"\"\"

# Set parameters optimized for legal AI
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER repeat_penalty 1.1
PARAMETER repeat_last_n 64
PARAMETER num_ctx 4096
PARAMETER num_batch 512
PARAMETER num_thread 8

# System prompt for legal AI
SYSTEM \"\"\"You are a specialized legal AI assistant with expertise in legal document analysis, case law research, and legal reasoning. You provide accurate, well-researched legal information while maintaining appropriate disclaimers about not providing legal advice.\"\"\"
"""

    try:
        with open(modelfile_path, 'w') as f:
            f.write(modelfile_content)
        print(f"✅ Created Modelfile: {modelfile_path}")
        print("💡 To use with Ollama: ollama create legal-gemma -f Modelfile.legal-gemma")
        return True
    except Exception as e:
        print(f"❌ Failed to create Modelfile: {e}")
        return False

def main():
    print("=== GGUF Model Loading Test ===\n")

    # Test GGUF loading
    success = test_gguf_loading()

    print("\n" + "="*50)

    # Create Modelfile for Ollama
    create_modelfile()

    print("\n" + "="*50)
    print("🔧 Troubleshooting Tips:")
    print("1. Install llama-cpp-python: pip install llama-cpp-python")
    print("2. Install Ollama: https://ollama.ai/download")
    print("3. For repo validation errors, ensure GGUF file is complete")
    print("4. Try different quantization levels if loading fails")

    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())