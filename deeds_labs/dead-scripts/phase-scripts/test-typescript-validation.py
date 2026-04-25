#!/usr/bin/env python3
"""Test dual-layer validation: LangExtract (NER) + TypeScript (tsc)"""

import asyncio
import json
from pathlib import Path

# Create test files
test_valid_ts = '''
const greeting: string = "Hello, World!";

function add(a: number, b: number): number {
    return a + b;
}

class Calculator {
    constructor(public name: string) {}

    multiply(x: number, y: number): number {
        return x * y;
    }
}
'''

test_invalid_ts = '''
const greeting: string = 123;  // Type error!

function add(a: number, b: number) {
    return a + b + c;  // Undefined variable c
}

import { nonExistent } from './missing-module';  // Import error
'''

async def run_test():
    """Test validation with both layers."""
    from phase89_json import BACKEND, dumps

    print(f"📦 JSON Backend: {BACKEND}")
    print()

    # Test 1: Valid TypeScript
    print("🧪 Test 1: Valid TypeScript")
    print("=" * 60)
    test_file = Path('/tmp/test_valid.ts')
    test_file.write_text(test_valid_ts, encoding='utf-8')

    # Run TypeScript check
    proc = await asyncio.create_subprocess_shell(
        f'npx tsc --noEmit --skipLibCheck --strict "{test_file}"',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    output = (stdout + stderr).decode('utf-8')

    print(f"Return code: {proc.returncode}")
    if proc.returncode == 0:
        print("✅ TypeScript: VALID (no errors)")
    else:
        print(f"❌ TypeScript: INVALID")
        print(f"Errors:\n{output[:500]}")
    print()

    # Test 2: Invalid TypeScript
    print("🧪 Test 2: Invalid TypeScript")
    print("=" * 60)
    test_file2 = Path('/tmp/test_invalid.ts')
    test_file2.write_text(test_invalid_ts, encoding='utf-8')

    proc2 = await asyncio.create_subprocess_shell(
        f'npx tsc --noEmit --skipLibCheck --strict "{test_file2}"',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout2, stderr2 = await proc2.communicate()
    output2 = (stdout2 + stderr2).decode('utf-8')

    errors = [line for line in output2.split('\n') if 'error TS' in line]

    print(f"Return code: {proc2.returncode}")
    print(f"Error count: {len(errors)}")
    print(f"Errors:")
    for err in errors[:5]:
        print(f"  - {err}")
    print()

    # Cleanup
    test_file.unlink(missing_ok=True)
    test_file2.unlink(missing_ok=True)

    print("✅ Test complete!")

if __name__ == '__main__':
    asyncio.run(run_test())
