# 🔍 VS Code Search Patterns for Svelte Error Detection

## How to Use This Guide
1. Open VS Code in your web-app directory
2. Press `Ctrl+Shift+F` (Windows) or `Cmd+Shift+F` (Mac) to open global search
3. Enable regex mode (.*) button in search box
4. Copy-paste patterns below

---

## 🚨 HIGH PRIORITY PATTERNS

### 1. Navigation Issues - Button with href
**Search Pattern:**
```regex
<Button[^>]*href=
```
**What to look for:** Button components with href attributes
**Fix:** Replace with `<a>` tags with proper classes

### 2. TabIndex Type Issues
**Search Pattern:**
```regex
tabindex="[^"]*"
```
**Found in:** `+Header.svelte` (line ~46)
**Fix:** Change `tabindex="0"` to `tabindex={0}`

### 3. Component Prop Types
**Search Pattern:**
```regex
export let \w+: string
```
**What to look for:** Generic string type props
**Fix:** Use union types like `"sm" | "md" | "lg"`

---

## 🟡 MEDIUM PRIORITY PATTERNS

### 4. Self-Closing Tags
**Search Pattern:**
```regex
<(canvas|textarea|div|button)[^>]*/>
```
**Fix:** Use proper closing tags: `<canvas></canvas>`

### 5. Boolean Props as Strings
**Search Pattern:**
```regex
(disabled|readonly|checked)="(true|false)"
```
**Fix:** Use `disabled={true}` instead of `disabled="true"`

### 6. Clickable Elements Missing Roles
**Search Pattern:**
```regex
<div[^>]*on:click[^>]*>
```
**Check for:** Missing `role="button"`, `tabindex`, keyboard handlers
**Fix Example:**
```svelte
<div 
  role="button" 
  tabindex={0}
  on:click={handleClick}
  on:keydown={(e) => e.key === 'Enter' && handleClick()}
>
```

### 7. Form Labels Without Controls
**Search Pattern:**
```regex
<label[^>]*>.*</label>
```
**Check for:** Missing `for` attribute
**Fix:** Add `for="inputId"` and matching `id="inputId"`

---

## 📦 IMPORT/EXPORT PATTERNS

### 8. Circular Import Issues
**Search Pattern:**
```regex
import.*from.*\$lib/components/ui/
```
**Fix:** Use barrel imports from `$lib/components/ui`

### 9. Incorrect Library Imports
**Search Pattern:**
```regex
from "fuse"
```
**Fix:** Use `from "fuse.js"`

---

## 🔧 ADVANCED REGEX PATTERNS

Enable regex mode in VS Code search for these:

### Find all export let with string types
```regex
export let \w+: string
```

### Find self-closing non-void elements
```regex
<(div|canvas|textarea|button)[^>]*/>
```

### Find tabindex with quotes
```regex
tabindex="[^"]*"
```

### Find disabled as string
```regex
disabled="(true|false)"
```

### Find missing aria-labels on interactive elements
```regex
<(button|div|a)[^>]*on:(click|keydown)[^>]*>(?![^<]*aria-label)
```

---

## 📝 QUICK REPLACEMENT PATTERNS

### Replace tabindex quotes with numbers
- **Find:** `tabindex="(\d+)"`
- **Replace:** `tabindex={$1}`

### Replace boolean string props
- **Find:** `(disabled|readonly|checked)="(true|false)"`
- **Replace:** `$1={$2}`

### Replace Button href with anchor tags
- **Find:** `<Button([^>]*)href="([^"]*)"([^>]*)>`
- **Replace:** `<a$1href="$2" class="btn"$3>`

---

## 🎯 COPILOT CONTEXT PROMPT

When working in VS Code, use this context for Copilot:

```
Fix Svelte TypeScript issues:
1. Use tabindex={0} not tabindex="0"
2. Use union types for props not string
3. Add proper accessibility to clickable divs
4. Associate labels with form controls
5. Use boolean values not string "true"/"false"
```

---

## 🚀 AUTOMATION SCRIPT

Run the PowerShell script to auto-fix critical issues:
```powershell
.\fix-critical-errors.ps1
```

---

## ✅ VERIFICATION CHECKLIST

After applying fixes:
- [ ] No tabindex with quotes
- [ ] All boolean props use curly braces
- [ ] Clickable divs have proper accessibility
- [ ] All labels associated with controls
- [ ] No self-closing non-void elements
- [ ] TypeScript compilation succeeds
- [ ] No accessibility warnings in browser
- [ ] Keyboard navigation works

---

## 📊 FILES TO PRIORITIZE

Based on analysis:
1. **+Header.svelte** - Has tabindex quote issue
2. **+Modal.svelte** - Check accessibility patterns
3. **All +*.svelte files** - Verify prop types
4. **Form components** - Verify label associations

---

**Last Updated:** $(Get-Date -Format "yyyy-MM-dd HH:mm")
**Total Patterns:** 9 high/medium priority
**Auto-fixable:** 3 patterns
