# Store Consolidation Plan - SvelteKit 2 + Svelte 5
**Date**: October 15, 2025
**Goal**: Eliminate duplicate stores, standardize on Svelte 5 runes pattern, reduce TypeScript errors

## 📊 Analysis Summary

### Current Duplication Crisis
- **Auth stores**: 5 versions (auth.ts, auth.svelte.ts, auth-store.ts, auth-store.svelte.ts, authStore.ts)
- **AI Assistant stores**: 3 versions (ai-assistant.ts, ai-assistant.svelte.ts, ai-assistant-unified.svelte.ts)
- **Chat stores**: 6 versions (chat.ts, chat.svelte.ts, chat-store.ts, chatStore.ts, chatMachine.ts, chat-history.ts)

### File Analysis (by size and date)

| File | Size | Last Modified | Pattern | Keep? |
|------|------|---------------|---------|-------|
| **AUTH STORES** |
| `auth.svelte.ts` | 13,588 bytes | Oct 13 (newer) | ✅ Svelte 5 runes + Lucia | **KEEP** |
| `auth-store.svelte.ts` | 12,565 bytes | Oct 13 | ✅ Svelte 5 runes | DELETE |
| `authStore.ts` | 11,291 bytes | Oct 13 | ❌ Old writable() | DELETE |
| `auth-store.ts` | 12,146 bytes | Oct 13 | ❌ Old writable() | DELETE |
| `auth.ts` | 3,512 bytes | Oct 13 | ❌ Old writable() | DELETE |
| **AI ASSISTANT STORES** |
| `ai-assistant-unified.svelte.ts` | 22,995 bytes | **Oct 15** (newest) | ✅ Svelte 5 runes + multi-backend | **KEEP** |
| `ai-assistant.svelte.ts` | 20,542 bytes | Oct 13 | ✅ Svelte 5 runes | DELETE |
| `ai-assistant.ts` | 5,654 bytes | Oct 15 | ❌ Old interfaces only | DELETE |
| **CHAT STORES** |
| `chatMachine.ts` | 11,554 bytes | Oct 13 | ✅ XState v5 machine | **KEEP** |
| `chatStore.ts` | 20,811 bytes | Oct 13 | ✅ XState + Svelte integration | **KEEP** (merge with chatMachine) |
| `chat-store.ts` | 12,703 bytes | Oct 13 | ❌ Old writable() | DELETE |
| `chat.svelte.ts` | 9,243 bytes | Oct 13 | ✅ Svelte 5 wrapper | **TRANSFORM** |
| `chat.ts` | 1,192 bytes | Oct 13 | ❌ Old types only | DELETE |
| `chat-history.ts` | 614 bytes | Oct 13 | ❌ Minimal utility | DELETE |

## 🎯 Canonical Store Architecture (Final State)

```
src/lib/stores/
├── index.ts                          # ✅ Barrel exports
│
├── auth.svelte.ts                    # ✅ KEEP - Auth with Lucia v3 + Svelte 5
│   └── Features: login, logout, session management, Lucia integration
│
├── ai-assistant.svelte.ts            # ✅ RENAME from ai-assistant-unified.svelte.ts
│   └── Features: Multi-backend (vLLM, Ollama, WASM, Go), streaming, acceleration
│
├── chat.svelte.ts                    # ✅ MERGE chatMachine.ts + chatStore.ts
│   └── Features: XState v5 machine + Svelte 5 wrapper for Gemma3 chat
│
├── cases.svelte.ts                   # ✅ Existing (check for duplicates)
├── evidence.svelte.ts                # ✅ Existing (check for duplicates)
├── types.ts                          # ✅ Shared TypeScript interfaces
└── machines/                         # ✅ XState machines directory
    ├── chatMachine.ts                # XState machine logic
    ├── sessionMachine.ts             # Session state machine
    └── agentShellMachine.ts          # Agent orchestration
```

## 🔧 Migration Steps

### Phase 1: Rename and Consolidate (SAFE)

#### Step 1.1: Rename AI Assistant Store
```bash
# Rename the unified version to canonical name
mv src/lib/stores/ai-assistant-unified.svelte.ts src/lib/stores/ai-assistant.svelte.ts.NEW
```

#### Step 1.2: Create Consolidated Chat Store
```typescript
// src/lib/stores/chat.svelte.ts.NEW
// Merge chatMachine.ts (XState logic) + chatStore.ts (Svelte integration)
```

### Phase 2: Update Barrel Exports (index.ts)

**Current imports causing issues:**
```typescript
// ❌ Multiple conflicting exports
export { default as authStore } from './auth';           // OLD
export { authService } from './auth.svelte';              // NEW
export { authStore } from './auth-store';                 // DUPLICATE
export { aiAssistant } from './ai-assistant-unified.svelte'; // LONG NAME
export { chatStore } from './chatStore';                  // MIXED
```

**New canonical exports:**
```typescript
// ✅ Single source of truth per domain
export { auth, authActions, type User, type AuthState } from './auth.svelte';
export { aiAssistant, aiActions, type AIMessage, type Backend } from './ai-assistant.svelte';
export { chat, chatActions, type ChatMessage, type ChatSettings } from './chat.svelte';
```

### Phase 3: Update Component Imports (27 files to update)

**Import migration map:**

| Old Import | New Import | Files Affected |
|------------|------------|----------------|
| `from '$lib/stores/authStore'` | `from '$lib/stores/auth.svelte'` | 3 files |
| `from '$lib/stores/auth-store.svelte'` | `from '$lib/stores/auth.svelte'` | 5 files |
| `from '$lib/stores/auth'` | `from '$lib/stores/auth.svelte'` | 2 files |
| `from '$lib/stores/ai-assistant-unified.svelte'` | `from '$lib/stores/ai-assistant.svelte'` | 4 files |
| `from '$lib/stores/ai-assistant'` | `from '$lib/stores/ai-assistant.svelte'` | 2 files |
| `from '$lib/stores/chatStore'` | `from '$lib/stores/chat.svelte'` | 5 files |
| `from '$lib/stores/chat'` | `from '$lib/stores/chat.svelte'` | 1 file |

**Automated find-replace commands:**
```bash
# Auth store updates
find src -name "*.svelte" -type f -exec sed -i "s|from '\$lib/stores/authStore'|from '\$lib/stores/auth.svelte'|g" {} +
find src -name "*.svelte" -type f -exec sed -i "s|from '\$lib/stores/auth-store.svelte'|from '\$lib/stores/auth.svelte'|g" {} +

# AI Assistant updates
find src -name "*.svelte" -type f -exec sed -i "s|from '\$lib/stores/ai-assistant-unified.svelte'|from '\$lib/stores/ai-assistant.svelte'|g" {} +

# Chat store updates
find src -name "*.svelte" -type f -exec sed -i "s|from '\$lib/stores/chatStore'|from '\$lib/stores/chat.svelte'|g" {} +
```

### Phase 4: Safe Deletion (After Verification)

**Files to delete (11 total):**
```bash
# Auth duplicates (4 files)
rm src/lib/stores/auth.ts
rm src/lib/stores/auth-store.ts
rm src/lib/stores/auth-store.svelte.ts
rm src/lib/stores/authStore.ts

# AI Assistant duplicates (2 files)
rm src/lib/stores/ai-assistant.ts
rm src/lib/stores/ai-assistant.svelte.ts  # OLD version

# Chat duplicates (5 files)
rm src/lib/stores/chat.ts
rm src/lib/stores/chat-store.ts
rm src/lib/stores/chat-history.ts
rm src/lib/stores/chatMachine.ts  # Merged into chat.svelte.ts
rm src/lib/stores/chatStore.ts    # Merged into chat.svelte.ts
```

## 📝 Expected Impact

### TypeScript Error Reduction
- **Before**: 54,566 errors
- **After consolidation**: ~53,800 errors (est. -700+ errors)
- **Reasons**:
  - Eliminates conflicting type definitions (5 different `AuthState` interfaces)
  - Removes duplicate exports causing "Cannot redeclare block-scoped variable" errors
  - Consolidates `any` types into proper interfaces

### Import Simplification
**Before** (confusing):
```typescript
import { authStore } from '$lib/stores/auth-store.svelte';
import { currentUser } from '$lib/stores/authStore';
import { getAuthContext } from '$lib/stores/auth';
// Which one is correct? They all exist but do different things!
```

**After** (crystal clear):
```typescript
import { auth, type User } from '$lib/stores/auth.svelte';
// Single import path, all auth functionality
```

## 🚨 Risks and Mitigation

### Risk 1: Breaking Existing Components
**Mitigation**:
- Keep old files temporarily with `.OLD` suffix
- Update imports incrementally
- Run `npm run check` after each batch

### Risk 2: XState Machine Complexity
**Mitigation**:
- `chatMachine.ts` is already well-structured
- Merge is straightforward: machine definition + Svelte wrapper
- Preserve all XState actors and actions

### Risk 3: Lost Functionality
**Mitigation**:
- Each "KEEP" file has most features from duplicates
- Document any missing features before deletion
- Create migration checklist per store

## ✅ Verification Checklist

- [ ] Run `npm run check` - should show ~700 fewer errors
- [ ] Test auth flows: login, logout, session persistence
- [ ] Test AI assistant: multi-backend switching, streaming responses
- [ ] Test chat: message sending, conversation switching, XState transitions
- [ ] Verify all 27 component imports updated
- [ ] Check no broken imports in `+page.svelte` files
- [ ] Git commit before deletion: "Pre-consolidation backup"
- [ ] Git commit after deletion: "Store consolidation complete"

## 🔄 Rollback Plan

If issues arise:
```bash
git checkout HEAD~1 -- src/lib/stores/
npm install
npm run dev
```

## 📚 Svelte 5 Store Pattern (Reference)

**Correct pattern:**
```typescript
// ✅ auth.svelte.ts
import { browser } from '$app/environment';

// Svelte 5 runes (globals, no import needed for $state)
let user = $state<User | null>(null);
let isAuthenticated = $derived(user !== null);

export const auth = {
  get user() { return user; },
  get isAuthenticated() { return isAuthenticated; },
  async login(email: string, password: string) {
    // Fetch API logic
    user = result.user;
  },
  logout() {
    user = null;
  }
};
```

**Anti-pattern (old Svelte 4):**
```typescript
// ❌ auth.ts (OLD)
import { writable } from 'svelte/store';

const user = writable<User | null>(null);

export const auth = {
  subscribe: user.subscribe,
  login: () => user.update(...)
};
```

## 🎯 Next Steps

1. **Run this plan by user for approval**
2. **Execute Phase 1-2** (renames + index.ts updates)
3. **Validate with TypeScript check**
4. **Execute Phase 3** (component import updates)
5. **Final validation + Phase 4** (safe deletion)

---

**Estimated Time**: 2-3 hours
**Complexity**: Medium (requires careful import updates)
**Reward**: ~700 fewer errors, cleaner architecture, Svelte 5 best practices
