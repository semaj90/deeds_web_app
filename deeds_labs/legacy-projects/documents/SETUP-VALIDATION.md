# Setup Validation for Your Project

**Goal:** Prevent TypeScript errors from entering your codebase automatically

---

## 📋 Option 1: Pre-commit Hooks (Recommended - Start Here!)

### What You'll Get
Every time you run `git commit`, TypeScript will automatically check your code BEFORE committing. If there are errors, the commit is blocked until you fix them.

### Setup Steps

#### Step 1: Install Husky (Pre-commit Hook Manager)

```bash
cd /c/Users/james/Videos/deeds-web-app/sveltekit-frontend

# Install husky
npm install --save-dev husky

# Initialize husky
npx husky init
```

#### Step 2: Create Pre-commit Hook

```bash
# Create the hook file
npx husky add .husky/pre-commit "npm run check:typescript"

# Or create manually:
echo '#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🔍 Running TypeScript check before commit..."
cd sveltekit-frontend
npm run check:typescript

if [ $? -ne 0 ]; then
  echo "❌ TypeScript check failed! Fix errors before committing."
  exit 1
fi

echo "✅ TypeScript check passed!"
' > .husky/pre-commit

chmod +x .husky/pre-commit
```

#### Step 3: Test It

```bash
# Make a change with an error
echo "const x: number = 'string';" >> test.ts
git add test.ts
git commit -m "Test commit"

# Should see:
# 🔍 Running TypeScript check before commit...
# ❌ TypeScript check failed! Fix errors before committing.
# Commit blocked!
```

### What Happens Now

```
You:  git commit -m "Add feature"
      ↓
Hook: "⏳ Running TypeScript check..."
      ↓
      ✅ No errors? → Commit succeeds
      ❌ Has errors? → Commit BLOCKED, shows errors
```

---

## 📋 Option 2: CI/CD with GitHub Actions (For Team Projects)

### What You'll Get
Every time you push code to GitHub, it automatically:
- Runs TypeScript checks
- Runs tests
- Shows ✅ or ❌ next to your commit on GitHub
- Prevents merging if checks fail

### Setup Steps

#### Step 1: Create GitHub Actions Workflow

Create file: `.github/workflows/typescript-check.yml`

```yaml
name: TypeScript Check

on:
  push:
    branches: [ main, develop, typescript-fixes-* ]
  pull_request:
    branches: [ main ]

jobs:
  typescript-check:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
        cache-dependency-path: sveltekit-frontend/package-lock.json

    - name: Install dependencies
      working-directory: ./sveltekit-frontend
      run: npm ci

    - name: Run TypeScript check
      working-directory: ./sveltekit-frontend
      run: npm run check:typescript

    - name: Run build test
      working-directory: ./sveltekit-frontend
      run: npm run build
```

#### Step 2: Commit and Push

```bash
git add .github/workflows/typescript-check.yml
git commit -m "ci: Add TypeScript validation workflow"
git push
```

#### Step 3: View Results

1. Go to your GitHub repository
2. Click "Actions" tab
3. See workflow runs with ✅ or ❌

### What Happens Now

```
You:    git push
        ↓
GitHub: "⏳ Running workflows..."
        - TypeScript check
        - Build test
        ↓
        ✅ All pass? → Green checkmark on GitHub
        ❌ Any fail? → Red X, shows errors

Team:   Can see if commit is safe before pulling
```

---

## 📋 Option 3: Simple npm Script (Quick Start)

### What You'll Get
A command you manually run before committing.

### Setup Steps

Add to `sveltekit-frontend/package.json`:

```json
{
  "scripts": {
    "precommit": "npm run check:typescript && echo '✅ Ready to commit!'"
  }
}
```

### Usage

```bash
# Before committing, run:
npm run precommit

# If it passes:
git commit -m "Your message"
```

**Pros:** Simple, no dependencies
**Cons:** Easy to forget to run it

---

## 🧪 Test Your Setup

### Test Pre-commit Hook

```bash
cd sveltekit-frontend

# Create a file with an error
echo "const x: number = 'string';" > test-error.ts

# Try to commit
git add test-error.ts
git commit -m "Test"

# Should BLOCK the commit ✅
```

### Test CI/CD (GitHub Actions)

```bash
# Push a commit
git commit -m "test: Trigger CI/CD"
git push

# Go to GitHub → Actions tab
# Should see workflow running ✅
```

---

## 🎯 Recommended Setup for Your Project

Given your situation (solo developer, 50k errors):

### Phase 1: Start Simple (Today)
```bash
# Add npm script to package.json
"precommit": "npm run check:typescript"

# Run before each commit
npm run precommit
git commit -m "..."
```

### Phase 2: Add Pre-commit Hook (This Week)
```bash
cd sveltekit-frontend
npm install --save-dev husky
npx husky init
npx husky add .husky/pre-commit "npm run check:typescript"
```

### Phase 3: Add CI/CD (When Errors Are Fixed)
```bash
# Create .github/workflows/typescript-check.yml
# Push to GitHub
```

---

## 📊 Impact Comparison

| Method | Setup Time | Effectiveness | When to Use |
|--------|------------|---------------|-------------|
| **npm script** | 2 min | Manual (easy to forget) | Solo, quick start |
| **Pre-commit hook** | 10 min | Automatic (enforced locally) | Solo or small team |
| **CI/CD** | 30 min | Automatic (enforced remotely) | Team projects |

---

## 🚨 Important Notes

### Don't Enable Hooks Until Errors Are Fixed!

If you enable pre-commit hooks NOW (with 50k errors), you won't be able to commit ANYTHING until all errors are fixed.

**Recommended Order:**
1. Fix errors first (delete unused files, consolidate)
2. Get error count down to reasonable level (< 100)
3. THEN enable pre-commit hooks
4. THEN enable CI/CD

### Temporary Disable Hook (If Needed)

```bash
# Skip pre-commit hook once (emergency only!)
git commit --no-verify -m "Emergency fix"

# Disable hook temporarily
mv .husky/pre-commit .husky/pre-commit.disabled

# Re-enable
mv .husky/pre-commit.disabled .husky/pre-commit
```

---

## 📝 Summary

**Pre-commit Hooks:** Stops bad commits on YOUR machine
**CI/CD:** Stops bad commits on GITHUB (for team)
**find-unused-services.sh:** Finds files you can DELETE instead of FIX

**Best practice:** Use ALL THREE!
1. Pre-commit hooks catch errors immediately
2. CI/CD catches what slips through
3. Cleanup scripts prevent accumulation

---

## 🎓 Learn More

- **Husky:** https://typicode.github.io/husky/
- **GitHub Actions:** https://docs.github.com/en/actions
- **Pre-commit Hooks:** https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks

---

**Created:** 2025-10-19
**For Project:** Legal AI Platform TypeScript Validation
