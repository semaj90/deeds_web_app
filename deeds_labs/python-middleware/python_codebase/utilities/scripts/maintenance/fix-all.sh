#!/bin/bash
# Comprehensive error fixing script for Windows

echo "🔧 Starting comprehensive error fix process..."

# Create logs directory if it doesn't exist
mkdir -p logs

# Step 1: Install missing dependencies
echo "📦 Installing missing dependencies..."
cd sveltekit-frontend
npm install fuse.js glob @types/glob
cd ..

# Step 2: Run the specific error fixes
echo "🔨 Running specific error fixes..."
node fix-specific-errors.mjs

# Step 3: Fix TypeScript imports
echo "📝 Fixing TypeScript imports..."
node fix-all-typescript-imports.mjs

# Step 4: Run comprehensive fix
echo "🛠️ Running comprehensive fixes..."
node fix-all-errors.mjs

# Step 5: Format code
echo "✨ Formatting code..."
cd sveltekit-frontend && npm run format || true
cd ..

# Step 6: Final check and log
echo "📋 Running final check..."
cd sveltekit-frontend
npm run check 2>&1 | tee ../logs/final-check-$(date +%Y%m%d-%H%M%S).log

echo "✅ Fix process complete! Check logs directory for details."
