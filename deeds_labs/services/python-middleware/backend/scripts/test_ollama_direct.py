#!/usr/bin/env python3
"""Test Ollama API directly"""

import requests

models_to_test = [
    "gemma3-legal:latest",
    "gemma3-legal",
    "gemma3:270m"
]

url = "http://localhost:11434/api/generate"

for model in models_to_test:
    print(f"\n{'='*60}")
    print(f"Testing: {model}")
    print('='*60)

    payload = {"model": model, "prompt": "Hello", "stream": False}

    try:
        r = requests.post(url, json=payload, timeout=30)
        print(f"Status: {r.status_code}")

        if r.status_code == 200:
            data = r.json()
            print(f"✅ SUCCESS!")
            print(f"Response: {data.get('response', '')[:150]}")
            print(f"\n🎯 Working model: {model}")
            break
        else:
            print(f"❌ Failed: {r.text}")

    except Exception as e:
        print(f"❌ Exception: {e}")
