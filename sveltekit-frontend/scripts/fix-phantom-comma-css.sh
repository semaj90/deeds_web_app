#!/bin/bash

# Fix phantom semicolon-comma pattern in all git-tracked files
# Pattern: ;, → ;

echo "🔧 Fixing phantom comma pattern (;,) in git-tracked files..."

files_fixed=0
patterns_fixed=0

# Get all git-tracked TypeScript and Svelte files
git ls-files "src/**/*.ts" "src/**/*.svelte" | while read -r file; do
  if [ -f "$file" ]; then
    # Count occurrences before
    before=$(grep -c ";," "$file" 2>/dev/null || echo "0")
    
    if [ "$before" -gt 0 ]; then
      # Fix the pattern: ;, → ; (with space preservation)
      sed -i 's/;,\s*/ /g' "$file"
      
      # Count occurrences after
      after=$(grep -c ";," "$file" 2>/dev/null || echo "0")
      fixed=$((before - after))
      
      if [ "$fixed" -gt 0 ]; then
        echo "✅ $file: fixed $fixed patterns"
        files_fixed=$((files_fixed + 1))
        patterns_fixed=$((patterns_fixed + fixed))
      fi
    fi
  fi
done

echo ""
echo "📊 Summary:"
echo "  Files fixed: $files_fixed"
echo "  Patterns fixed: $patterns_fixed"
echo ""
echo "✅ Done! Run 'npm run check' to verify."
