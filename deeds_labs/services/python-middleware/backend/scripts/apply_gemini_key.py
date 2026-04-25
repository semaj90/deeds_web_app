#!/usr/bin/env python3
"""
Apply New Gemini API Key with Web Search Free Tier
Usage: python apply_gemini_key.py <your_new_api_key>
"""

import sys
import os
from pathlib import Path

def update_env_file(api_key: str):
    """Update .env files with new Gemini API key"""

    # Update root .env
    root_env = Path(__file__).parent.parent.parent / ".env"
    if root_env.exists():
        with open(root_env, "r", encoding="utf-8") as f:
            lines = f.readlines()

        with open(root_env, "w", encoding="utf-8") as f:
            for line in lines:
                if line.startswith("GEMINI_API_KEY="):
                    f.write(f"GEMINI_API_KEY={api_key}\n")
                    print(f"✅ Updated root .env")
                else:
                    f.write(line)

    # Update sveltekit-frontend .env
    frontend_env = Path(__file__).parent.parent.parent / "sveltekit-frontend" / ".env"
    if frontend_env.exists():
        with open(frontend_env, "r", encoding="utf-8") as f:
            lines = f.readlines()

        with open(frontend_env, "w", encoding="utf-8") as f:
            for line in lines:
                if line.startswith("GEMINI_API_KEY="):
                    f.write(f"GEMINI_API_KEY={api_key}\n")
                    print(f"✅ Updated sveltekit-frontend .env")
                else:
                    f.write(line)

def main():
    print("=" * 70)
    print("🔑 Gemini API Key Updater - Free Tier Web Search")
    print("=" * 70)
    print()

    if len(sys.argv) < 2:
        print("❌ Usage: python apply_gemini_key.py <your_api_key>")
        print()
        print("📋 Steps:")
        print("   1. Visit: https://aistudio.google.com/apikey")
        print("   2. Sign in with Google account")
        print("   3. Click 'Get API key' → 'Create API key'")
        print("   4. Copy the key")
        print("   5. Run: python backend/scripts/apply_gemini_key.py <paste_key_here>")
        print()
        return

    api_key = sys.argv[1].strip()

    if len(api_key) < 30:
        print("❌ Invalid API key (too short)")
        print("   Gemini API keys are typically 39 characters")
        return

    print(f"🔑 API Key: {api_key[:10]}...{api_key[-4:]} ({len(api_key)} chars)")
    print()

    # Update .env files
    update_env_file(api_key)

    print()
    print("=" * 70)
    print("✅ Gemini API Key Updated!")
    print("=" * 70)
    print()
    print("📋 Free Tier Limits:")
    print("   • 15 requests per minute")
    print("   • 1,000,000 tokens per minute")
    print("   • 1,500 requests per day")
    print("   • Model: gemini-2.0-flash-exp")
    print("   • Web search grounding: Included! 🎉")
    print()
    print("🧪 Test the API:")
    print("   python backend/scripts/test_gemini_api.py")
    print()
    print("🚀 Run FastMCP Integration:")
    print("   python backend/scripts/test_fastmcp_core.py")
    print()

if __name__ == "__main__":
    main()
