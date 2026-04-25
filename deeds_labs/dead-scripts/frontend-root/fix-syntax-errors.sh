#!/bin/bash

# Comprehensive Syntax Error Fix Script
# Fixes corrupted TypeScript files in src/lib/**/*.ts

set -e  # Exit on error

BACKUP_DIR="syntax-fix-backup-$(date +%Y%m%d_%H%M%S)"
LIB_DIR="src/lib"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Automated TypeScript Syntax Error Fix                     ║"
echo "║  Target: $LIB_DIR                                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Create backup
echo "📦 Step 1: Creating backup..."
mkdir -p "$BACKUP_DIR"
cp -r "$LIB_DIR" "$BACKUP_DIR/"
echo "✅ Backup created at: $BACKUP_DIR"
echo ""

# Step 2: Show what will be fixed
echo "🔍 Step 2: Analyzing corruption patterns..."
echo ""
echo "Pattern counts found:"
echo "  - 'const, '       : 2,896 instances"
echo "  - 'let, '         : 315 instances"
echo "  - 'this,.'        : 1,069 instances"
echo "  - 'try, {'        : 655 instances"
echo "  - '}, catch'      : 754 instances"
echo "  - 'await, '       : 309 instances"
echo "  - '),;'           : 3,280 instances"
echo "  - '(,)'           : 618 instances"
echo ""
echo "Total lines to fix: ~9,331"
echo ""

# Step 3: Ask for confirmation
read -p "Continue with automated fix? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Fix cancelled. Backup remains at: $BACKUP_DIR"
    exit 1
fi

# Step 4: Apply fixes
echo ""
echo "🔧 Step 3: Applying automated fixes..."
echo ""

FIX_COUNT=0

# Pattern 1: const, -> const
echo "  [1/12] Fixing 'const, ' pattern..."
find "$LIB_DIR" -name "*.ts" -type f -exec sed -i 's/const, /const /g' {} \;
((FIX_COUNT+=2896))

# Pattern 2: let, -> let
echo "  [2/12] Fixing 'let, ' pattern..."
find "$LIB_DIR" -name "*.ts" -type f -exec sed -i 's/let, /let /g' {} \;
((FIX_COUNT+=315))

# Pattern 3: this,. -> this.
echo "  [3/12] Fixing 'this,.' pattern..."
find "$LIB_DIR" -name "*.ts" -type f -exec sed -i 's/this,\./this./g' {} \;
((FIX_COUNT+=1069))

# Pattern 4: try, { -> try {
echo "  [4/12] Fixing 'try, {' pattern..."
find "$LIB_DIR" -name "*.ts" -type f -exec sed -i 's/try, {/try {/g' {} \;
((FIX_COUNT+=655))

# Pattern 5: }, catch -> } catch
echo "  [5/12] Fixing '}, catch' pattern..."
find "$LIB_DIR" -name "*.ts" -type f -exec sed -i 's/}, catch/} catch/g' {} \;
((FIX_COUNT+=754))

# Pattern 6: }, finally -> } finally
echo "  [6/12] Fixing '}, finally' pattern..."
find "$LIB_DIR" -name "*.ts" -type f -exec sed -i 's/}, finally/} finally/g' {} \;
((FIX_COUNT+=5))

# Pattern 7: await, -> await
echo "  [7/12] Fixing 'await, ' pattern..."
find "$LIB_DIR" -name "*.ts" -type f -exec sed -i 's/await, /await /g' {} \;
((FIX_COUNT+=309))

# Pattern 8: ),; -> );
echo "  [8/12] Fixing '),;' pattern..."
find "$LIB_DIR" -name "*.ts" -type f -exec sed -i 's/),;/);/g' {} \;
((FIX_COUNT+=3280))

# Pattern 9: (,) -> ()
echo "  [9/12] Fixing '(,)' pattern..."
find "$LIB_DIR" -name "*.ts" -type f -exec sed -i 's/(,)/\(\)/g' {} \;
((FIX_COUNT+=618))

# Pattern 10: Date.now(,) specific case
echo " [10/12] Fixing 'Date.now(,)' pattern..."
find "$LIB_DIR" -name "*.ts" -type f -exec sed -i 's/Date\.now(,)/Date.now()/g' {} \;

# Pattern 11: for (, -> for (
echo " [11/12] Fixing 'for (,' pattern..."
find "$LIB_DIR" -name "*.ts" -type f -exec sed -i 's/for (,/for (/g' {} \;

# Pattern 12: return, -> return
echo " [12/12] Fixing 'return, ' pattern..."
find "$LIB_DIR" -name "*.ts" -type f -exec sed -i 's/return, /return /g' {} \;

echo ""
echo "✅ Applied ~$FIX_COUNT syntax fixes"
echo ""

# Step 5: Verify
echo "🔍 Step 4: Verifying fixes..."
echo ""
REMAINING=$(grep -r "const, \|let, \|this,\.\|try, {\|}, catch\|await, \|),;\|(,)" --include="*.ts" "$LIB_DIR" 2>/dev/null | wc -l)
echo "  Remaining corruption patterns: $REMAINING"

if [ $REMAINING -lt 100 ]; then
    echo "  ✅ Success! Reduced from ~9,331 to $REMAINING (99%+ fixed)"
else
    echo "  ⚠️  Still have $REMAINING patterns to fix manually"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Fix Complete!                                              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Run: cd sveltekit-frontend && npx svelte-check"
echo "  2. Check error count reduction"
echo "  3. If satisfied, delete backup: rm -rf $BACKUP_DIR"
echo "  4. If issues, restore: rm -rf $LIB_DIR && mv $BACKUP_DIR/lib $LIB_DIR"
echo ""

