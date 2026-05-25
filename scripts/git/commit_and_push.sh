#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$REPO_ROOT"

echo "Repository root: $REPO_ROOT"

echo -e "\n1) Listing any files >10MB (will be skipped):"
find . -type f -size +10485760c -print || true

echo -e "\n2) Preparing to stage modified/untracked files under 10MB only"
# Use null-separated porcelain to handle spaces
git status --porcelain -z > .git_status_porcelain || true

# Stage safe files
while IFS= read -r -d '' entry; do
  # entry format: XY<space>path
  status=${entry:0:2}
  file=${entry:3}
  # Only consider added/modified/untracked files
  if [ -z "$file" ] || [ ! -f "$file" ]; then
    continue
  fi
  # get file size robustly (stat -c%s or stat -f%z)
  if size=$(stat -c%s "$file" 2>/dev/null); then :; elif size=$(stat -f%z "$file" 2>/dev/null); then :; else size=0; fi
  if [ "$size" -le 10485760 ]; then
    git add -- "$file" && echo "Staged: $file ($size bytes)"
  else
    echo "Skipping large file: $file ($size bytes)"
  fi
done < .git_status_porcelain
rm -f .git_status_porcelain

echo -e "\n3) Show staged changes summary:"
git diff --cached --name-only || true

# If nothing staged, abort
if [ -z "$(git diff --cached --name-only)" ]; then
  echo -e "\nNo files staged for commit. Aborting commit." >&2
  exit 2
fi

COMMIT_MSG="Increase Bifrost timeouts; add strict Bifrost smoke and ACE timing probes"

echo -e "\n4) Committing with message: $COMMIT_MSG"
git commit -m "$COMMIT_MSG" || { echo 'Commit failed'; exit 3; }

echo -e "\n5) Pushing to origin main"
# Ensure origin exists
if git remote get-url origin >/dev/null 2>&1; then
  git push origin main
else
  echo 'Remote origin not configured; aborting push' >&2
  exit 4
fi

echo -e "\nDone."