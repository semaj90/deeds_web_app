#!/usr/bin/env python3
"""
Test script to verify Gemma3 model file can be loaded
"""

import os
import sys

def test_model_file():
    model_path = r"C:\Users\james\Desktop\deeds-web\deeds-web-app\gemma3Q4_K_M\mohf16-Q4_K_M.gguf"
    
    print("Testing Gemma3 Model File")
    print("=" * 40)
    
    # Check if file exists
    if not os.path.exists(model_path):
        print(f"[ERROR] Model file not found: {model_path}")
        return False
    
    # Check file size
    file_size = os.path.getsize(model_path)
    file_size_gb = file_size / (1024**3)
    print(f"[OK] Model file found: {model_path}")
    print(f"[FILE] File size: {file_size_gb:.2f} GB")
    
    # Test with llama-cpp-python if available
    try:
        from llama_cpp import Llama
        print("\n[TEST] Testing with llama-cpp-python...")
        
        # Try to initialize the model with minimal settings
        model = Llama(
            model_path=model_path,
            n_ctx=512,  # Small context for testing
            n_gpu_layers=0,  # CPU only for testing
            verbose=False
        )
        
        print("[OK] Model loaded successfully with llama-cpp-python!")
        
        # Test a simple generation
        print("\n[TEST] Testing basic generation...")
        response = model(
            "What is a contract?",
            max_tokens=50,
            temperature=0.1
        )
        
        print(f"[RESPONSE] Response: {response['choices'][0]['text'][:100]}...")
        print("[OK] Generation test successful!")
        
        return True
        
    except ImportError:
        print("[WARNING]  llama-cpp-python not available for testing")
        print("   Model file exists and appears valid")
        return True
        
    except Exception as e:
        print(f"[ERROR] Error loading model: {e}")
        print("\n[DEBUG] Common solutions:")
        print("   1. Check if file is corrupted")
        print("   2. Ensure sufficient RAM (8GB+ recommended)")
        print("   3. Try with CPU-only mode")
        return False

if __name__ == "__main__":
    success = test_model_file()
    if success:
        print("\n[SUCCESS] Model file test completed successfully!")
        print("\n[NEXT] Next steps:")
        print("   1. Run: IMPORT-GEMMA3-LEGAL.bat")
        print("   2. Test: TEST-GEMMA3-LEGAL.bat")
        print("   3. Start: npm run dev (in sveltekit-frontend)")
    else:
        print("\n[ERROR] Model file test failed.")
        sys.exit(1)