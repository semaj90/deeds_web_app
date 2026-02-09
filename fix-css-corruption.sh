#!/bin/bash
cd sveltekit-frontend
count=0
for file in $(find src/lib/components/ui -name "*.svelte" -type f); do
  if grep -q ', \w\+:' "$file" 2>/dev/null; then
    # Fix pattern: ", word:" -> " word:"
    sed -i 's/, \([a-z-]\+:\)/ \1/g' "$file" 2>/dev/null && ((count++))
  fi
done
echo "Fixed CSS corruption in $count files"
