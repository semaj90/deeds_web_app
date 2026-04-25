#!/bin/bash
# Fix common syntax errors that block Prettier

cd "$(dirname "$0")/../sveltekit-frontend"

echo "Fixing common syntax errors..."

# Count initial errors
echo "Initial TypeScript errors:"
npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | wc -l

# Run Prettier which will fix most formatting
echo "Running Prettier..."
npx prettier --write "src/**/*.{ts,js,svelte}" --log-level=error 2>&1 | grep "Formatted" | wc -l

# Count remaining errors
echo "Remaining TypeScript errors:"
npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | wc -l

echo "Done!"
