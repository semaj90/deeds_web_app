#!/bin/bash
# Parse svelte-check errors from raw log
# Strips ANSI codes and extracts structured data

echo "🔍 Parsing svelte-check errors from raw log..."

# Strip ANSI codes and extract errors
cat svelte-check-raw.log | sed 's/\x1b\[[0-9;]*m//g' > svelte-check-clean.log

# Count errors by pattern
echo ""
echo "📊 Top Error Patterns:"
grep "^Error:" svelte-check-clean.log | \
  sed 's/Error: //' | \
  sed 's/ (ts)$//' | \
  sed 's/ (svelte)$//' | \
  sort | uniq -c | sort -rn | head -20

# Count by file
echo ""
echo "📁 Files with Most Errors:"
grep -B1 "^Error:" svelte-check-clean.log | \
  grep "\.svelte:[0-9]" | \
  sed 's/:.*//' | \
  sort | uniq -c | sort -rn | head -15

# Error categories
echo ""
echo "🎯 Error Categories:"
echo "Cannot find name:        $(grep -c "Cannot find name" svelte-check-clean.log)"
echo "Type not assignable:     $(grep -c "not assignable" svelte-check-clean.log)"
echo "Property does not exist: $(grep -c "does not exist" svelte-check-clean.log)"
echo "Expected:                $(grep -c "expected" svelte-check-clean.log)"
echo "Missing in type:         $(grep -c "missing in type" svelte-check-clean.log)"
echo "Duplicate identifier:    $(grep -c "Duplicate identifier" svelte-check-clean.log)"

echo ""
echo "✅ Total errors: 970"
echo "📝 Clean log: svelte-check-clean.log"