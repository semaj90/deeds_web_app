#!/bin/bash
cd sveltekit-frontend
count=0
# Fix pattern: { word word: → { word, word:
find src/lib/components/ui -name "*.svelte" -type f | while read file; do
  if grep -q '{\s*\w\+\s\+\w\+:' "$file" 2>/dev/null; then
    sed -i 's/{\s*\(\w\+\)\s\+\(\w\+:\)/{ \1, \2/g' "$file" 2>/dev/null && ((count++))
  fi
done
echo "Fixed destructuring in files"
