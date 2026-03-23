#!/bin/bash # Find Unused Service Files # Identifies service files that are not imported anywhere in the codebase echo
"╔═══════════════════════════════════════════════════════════════════════════╗" echo "║ Finding Unused Service Files ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝" echo "" cd "$(dirname "$0")"
UNUSED_COUNT=0 USED_COUNT=0 TOTAL_COUNT=0 echo "Scanning 429 service files..." echo "This may take a few minutes..."
echo "" for file in src/lib/services/*.ts; do TOTAL_COUNT=$((TOTAL_COUNT + 1)) # Get filename without path and extension
basename=$(basename "$file" .ts) # Search for imports of this file (excluding the file itself) # Look for: import ...
from './filename' or from '$lib/services/filename' count=$(grep -r "from.*['\"].*${basename}['\"]" src \
--include="*.ts" \ --include="*.svelte" \ --exclude-dir=node_modules \ --exclude="$file" \ 2>/dev/null | wc -l) if [
"$count" -eq "0" ]; then echo "❌ UNUSED: $(basename $file)" UNUSED_COUNT=$((UNUSED_COUNT + 1)) else
USED_COUNT=$((USED_COUNT + 1)) fi # Progress indicator every 50 files if [ $((TOTAL_COUNT % 50)) -eq 0 ]; then echo "
... processed $TOTAL_COUNT files ..." fi done echo "" echo
"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" echo "SUMMARY" echo
"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" echo "Total service files: $TOTAL_COUNT" echo
"Used (imported): $USED_COUNT" echo "Unused (candidates): $UNUSED_COUNT" echo "" if [ "$UNUSED_COUNT" -gt 0 ]; then
PERCENTAGE=$((UNUSED_COUNT * 100 / TOTAL_COUNT)) echo "⚠️ $PERCENTAGE% of service files appear unused!" echo "" echo
"RECOMMENDATION:" echo "1. Review unused files manually (they might be entry points)" echo "2. Move unused files to
archived-services/ directory" echo "3. Delete if confirmed unused" echo "" echo "Expected error reduction if deleted:
~$((UNUSED_COUNT * 120)) errors" else echo "✅ All service files are imported somewhere!" fi echo "" echo "NOTE: This
script checks for import statements only." echo "Some files might be entry points (not imported but used directly)."
echo "Always verify before deleting!" echo ""
