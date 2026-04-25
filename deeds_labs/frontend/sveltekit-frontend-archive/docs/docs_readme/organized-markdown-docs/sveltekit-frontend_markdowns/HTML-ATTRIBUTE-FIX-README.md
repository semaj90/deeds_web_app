# 🔧 Svelte HTML Attribute Fix

## The Problem

You're getting thousands of HTML errors because React syntax has been mixed into your Svelte files. The main issues are:

1. **`className` instead of `class`** - React uses `className`, Svelte uses `class`
2. **Template placeholders `${1}`** - These weren't replaced with actual CSS classes
3. **React event handlers** - `onClick` instead of `on:click`
4. **JSX syntax in Svelte files**

## Quick Fix (Choose One)

### Option 1: Double-click Fix (Easiest)

```bash
# Just double-click this file:
FIX-HTML-ATTRIBUTES.bat
```

### Option 2: NPM Command

```bash
npm run fix:html
```

### Option 3: Manual Node Command

```bash
node fix-html-attributes.mjs
```

## What Gets Fixed

### Attribute Conversions

- `className=` → `class=`
- `htmlFor=` → `for=`

### Event Handler Conversions

- `onClick=` → `on:click=`
- `onChange=` → `on:change=`
- `onSubmit=` → `on:submit=`
- `onFocus=` → `on:focus=`
- `onBlur=` → `on:blur=`
- `onInput=` → `on:input=`
- `onKeyDown=` → `on:keydown=`
- `onKeyUp=` → `on:keyup=`
- `onMouseEnter=` → `on:mouseenter=`
- `onMouseLeave=` → `on:mouseleave=`

### Template Placeholders

- `className="${1}"` → `class="mx-auto px-4 max-w-7xl"`
- `class="${1}"` → `class="container"`

### Smart CSS Class Replacements

- Empty `class="container"` → `class="mx-auto px-4 max-w-7xl"`
- Empty `class="header"` → `class="bg-blue-600 text-white p-4"`
- Empty `class="card"` → `class="bg-white rounded-lg shadow-md p-6"`
- Empty `class="button"` → `class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"`

## Specific Fixes

### ui-demo Page

The `src/routes/ui-demo/+page.svelte` file has been completely rebuilt with:

- ✅ Proper Svelte syntax
- ✅ TailwindCSS classes
- ✅ Working component structure
- ✅ Responsive design
- ✅ Clean styling

## Safety Features

### Automatic Backups

- Creates `.backup` files for all changed files
- You can restore from backups if needed

### Dry Run Mode

To see what would be changed without making changes:

```javascript
// Edit fix-html-attributes.mjs and change:
const config = {
  dryRun: true, // Set to true for preview mode
};
```

## After Running the Fix

1. **Check the output** - The script shows exactly what was changed
2. **Test your app** - Run `npm run dev` to make sure everything works
3. **Review changes** - Use your Git diff to see what was modified
4. **Remove backups** - Delete `.backup` files once you're satisfied

## Common Before/After Examples

### Before (React-style)

```svelte
<div className="${1}">
  <button onClick={handleClick} className="button">
    Click me
  </button>
</div>
```

### After (Svelte-style)

```svelte
<div class="mx-auto px-4 max-w-7xl">
  <button on:click={handleClick} class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
    Click me
  </button>
</div>
```

## Troubleshooting

### If errors persist:

1. Run the fix again: `npm run fix:html`
2. Check for any remaining `className` instances manually
3. Look for other React-specific syntax
4. Clear Svelte cache: `rm -rf .svelte-kit`

### Manual search for remaining issues:

```bash
# Search for remaining className instances
grep -r "className" src/

# Search for React event handlers
grep -r "onClick\|onChange\|onSubmit" src/
```

## Prevention

To avoid this in the future:

1. **Don't copy React code directly into Svelte files**
2. **Use Svelte syntax**: `class` not `className`, `on:click` not `onClick`
3. **Fill in template placeholders** instead of leaving `${1}`
4. **Use proper CSS classes** instead of placeholder values

---

## ✅ Ready to Fix Your 8k HTML Errors!

Run the fix script and your Svelte app will use proper HTML attributes! 🎉
