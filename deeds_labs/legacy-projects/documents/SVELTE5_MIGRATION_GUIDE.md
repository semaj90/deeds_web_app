# Svelte 5 Migration Guide

## ✅ Migration Status
Your SvelteKit app is already running on Svelte 5! The migration tool has updated the core configuration. Now you need to manually refactor components to use the new runes API.

## 🔄 Key Changes: Svelte 4 → Svelte 5

### 1. Reactive Variables → State Rune
```javascript
// ❌ Svelte 4
let count = 0;

// ✅ Svelte 5
let count = $state(0);
```

### 2. Props → Props Rune
```javascript
// ❌ Svelte 4
export let name = 'default';
export let age;

// ✅ Svelte 5
let { name = 'default', age } = $props();

// With TypeScript
let { 
  name = 'default', 
  age 
}: { 
  name?: string; 
  age: number;
} = $props();
```

### 3. Reactive Statements → Derived/Effect Runes
```javascript
// ❌ Svelte 4
$: doubled = count * 2;
$: console.log('count changed:', count);

// ✅ Svelte 5
let doubled = $derived(count * 2);
$effect(() => {
  console.log('count changed:', count);
});
```

### 4. Two-way Binding → Bindable Props
```javascript
// ❌ Svelte 4 (parent)
<Component bind:value={myValue} />

// ❌ Svelte 4 (child)
export let value;

// ✅ Svelte 5 (child)
let { value = $bindable() } = $props();
```

### 5. Stores → State Rune
```javascript
// ❌ Svelte 4
import { writable } from 'svelte/store';
const count = writable(0);
// In component: $count

// ✅ Svelte 5 (can use state directly)
let count = $state(0);
// Use directly: count
```

### 6. Event Handlers
```javascript
// ❌ Svelte 4
<button on:click={handleClick}>

// ✅ Svelte 5
<button onclick={handleClick}>
```

### 7. Slots → Snippets
```javascript
// ❌ Svelte 4
<slot name="header" />

// ✅ Svelte 5
{@render header?.()}

// Parent component
{#snippet header()}
  <h1>Title</h1>
{/snippet}
```

## 📋 Migration Checklist

### Phase 1: Preparation (✅ Complete)
- [x] Update to Svelte 5 in package.json
- [x] Run `npx sv migrate svelte-5`
- [x] Verify app still runs

### Phase 2: Component Migration (In Progress)
Start with leaf components (no children) and work your way up:

1. **Simple Components** (no stores, minimal reactivity)
   - [ ] Convert props: `export let` → `$props()`
   - [ ] Convert state: `let` → `$state()`
   - [ ] Convert reactive: `$:` → `$derived()` or `$effect()`

2. **Components with Stores**
   - [ ] Convert store subscriptions to state
   - [ ] Update store imports
   - [ ] Replace `$storeName` with direct state access

3. **Components with Slots**
   - [ ] Convert `<slot>` to snippets
   - [ ] Update parent components to use `{#snippet}`

4. **Complex Components**
   - [ ] Handle two-way bindings with `$bindable()`
   - [ ] Update event handlers
   - [ ] Refactor complex reactive logic

## 🛠️ Practical Examples

### Example 1: Simple Component
```svelte
<!-- Before (Svelte 4) -->
<script>
  export let title = 'Default';
  export let count = 0;
  
  $: doubled = count * 2;
</script>

<!-- After (Svelte 5) -->
<script>
  let { title = 'Default', count = 0 } = $props();
  let doubled = $derived(count * 2);
</script>
```

### Example 2: Component with State
```svelte
<!-- Before (Svelte 4) -->
<script>
  let isOpen = false;
  
  $: if (isOpen) {
    console.log('Modal opened');
  }
</script>

<!-- After (Svelte 5) -->
<script>
  let isOpen = $state(false);
  
  $effect(() => {
    if (isOpen) {
      console.log('Modal opened');
    }
  });
</script>
```

### Example 3: Form Component
```svelte
<!-- Before (Svelte 4) -->
<script>
  export let value = '';
  
  function handleInput(e) {
    value = e.target.value;
  }
</script>
<input {value} on:input={handleInput} />

<!-- After (Svelte 5) -->
<script>
  let { value = $bindable('') } = $props();
</script>
<input bind:value />
```

## 🚀 Quick Start Commands

```bash
# Check for TypeScript errors
npm run check:ultra-fast

# Run development server
npm run dev

# Run Svelte check
npm run check:svelte
```

## 📝 Component Migration Tracker

Track your progress by checking off components as you migrate them:

### High Priority (Core UI)
- [ ] Button.svelte
- [ ] Input.svelte  
- [ ] Modal.svelte
- [ ] Card.svelte

### Medium Priority (Features)
- [ ] AIAssistant.svelte
- [ ] FileUpload.svelte
- [ ] ChatInterface.svelte

### Low Priority (Rarely Used)
- [ ] Legacy components
- [ ] Admin panels
- [ ] Debug tools

## ⚠️ Common Pitfalls

1. **Don't mix paradigms** - Use either runes or classic syntax, not both
2. **State must be declared with $state()** - Regular `let` won't be reactive
3. **Effects run on mount** - Unlike `$:` which only runs on change
4. **Props are readonly by default** - Use `$bindable()` for two-way binding

## 📚 Resources

- [Official Svelte 5 Docs](https://svelte.dev/docs/svelte/v5-migration-guide)
- [Runes API Reference](https://svelte.dev/docs/svelte/runes)
- [Interactive Tutorial](https://learn.svelte.dev/tutorial/welcome-to-svelte)

## 🎯 Next Steps

1. Start with one simple component
2. Test thoroughly after each migration
3. Commit changes frequently
4. Use TypeScript for better type safety with props

Remember: Your app works now! Migration to runes is optional but recommended for:
- Better performance
- Cleaner code
- Better TypeScript support
- Future compatibility