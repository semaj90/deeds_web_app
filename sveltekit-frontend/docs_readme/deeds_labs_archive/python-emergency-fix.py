#!/usr/bin/env python3
import re
import os

def fix_type_definitions(content):
    """Fix corrupted type definitions with misplaced commas"""
    # Fix: type UserRow = { id: string;\n, email => type UserRow = { id: string;\n  email
    content = re.sub(r'(type\s+\w+\s*=\s*{\s*id:\s*string;)\s*,\s*(\w+:)', r'\1 \2', content)
    
    # Fix: { query: {\n, users => { query: {\n  users
    content = re.sub(r'({\s*query:\s*{)\s*,\s*(\w+:)', r'\1 \2', content)
    
    # Fix: findFirst: (opts: {\n, columns => findFirst: (opts: {\n  columns
    content = re.sub(r'(\(opts:\s*{)\s*,\s*(\w+:)', r'\1 \2', content)
    
    return content

def fix_unterminated_strings(content):
    """Fix mismatched quotes and backticks"""
    # Fix: error: 'message` => error: 'message'
    content = re.sub(r"error:\s*'([^']+)`", r"error: '\1'", content)
    
    # Fix: error: `message' => error: `message`
    content = re.sub(r"error:\s*`([^`]+)'", r"error: `\1`", content)
    
    return content

def main():
    print("🔧 Python Emergency Fixer\n")
    
    files_to_fix = [
        'src/routes/(auth)/profile/+page.server.ts',
        'src/routes/auth/register/+page.server.ts',
        'src/routes/(evidence)/main/upload/+page.server.ts',
        'src/routes/(legal)/cases/[id]/+page.server.ts',
    ]
    
    total_fixed = 0
    
    for filepath in files_to_fix:
        if not os.path.exists(filepath):
            print(f"⚠️  Not found: {filepath}")
            continue
            
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                original = f.read()
            
            fixed = original
            fixed = fix_type_definitions(fixed)
            fixed = fix_unterminated_strings(fixed)
            
            if fixed != original:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(fixed)
                print(f"✅ Fixed: {filepath}")
                total_fixed += 1
            else:
                print(f"ℹ️  No changes: {filepath}")
                
        except Exception as e:
            print(f"❌ Error with {filepath}: {e}")
    
    print(f"\n✅ Complete: {total_fixed} files fixed\n")

if __name__ == '__main__':
    main()
