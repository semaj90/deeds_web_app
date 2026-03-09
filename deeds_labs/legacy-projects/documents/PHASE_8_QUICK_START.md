# 🚀 Phase 8 Quick Start: Begin Store Consolidation

## Current Status
- **101 store files** exist (fragmented)
- **Phase 7 tests:** Ready/completed ✅
- **Ready to consolidate:** YES ✅

---

## Three Paths

### 🏃 QUICK START (Begin Immediately)
**Time: 10 minutes to start**

1. Create unified store directory:
```bash
mkdir -p sveltekit-frontend/src/lib/stores/unified
```

2. Create index barrel exports:
```bash
touch sveltekit-frontend/src/lib/stores/unified/index.ts
```

3. Start with simplest store (UserStore):
```bash
touch sveltekit-frontend/src/lib/stores/unified/user-store.ts
```

4. Review template in `PHASE_8_STORE_CONSOLIDATION_STRATEGY.md`

### 📊 ANALYTICAL APPROACH (Plan First)
**Time: 1 hour planning**

1. Read full strategy document
2. Map all 101 → 10 consolidation points
3. Identify component dependencies
4. Create detailed migration checklist
5. Begin implementation with checklist

### 🎯 HYBRID (Recommended)
**Time: 20 minutes setup + incremental**

1. Review quick consolidation summary (this file)
2. Create unified stores directory
3. Implement UserStore (1/10 - easiest)
4. Test UserStore in 2-3 components
5. Document pattern
6. Roll out to other stores

---

## 📊 Codebase Context (Oct 16, 2025)

### Total Codebase Size
```
Total workspace files:     242,883 🔴
  - SvelteKit src/:        4,890
  - Route files:           1,482 (in 1,211+ directories)
  - Store files:           173 (101 fragmented + 72 supporting)
  - API endpoint files:    1,157 (762+ endpoints!)
  - Components:            ~800
  - Libraries:             ~300

Status:  🔴 CRITICAL FRAGMENTATION
Problem: Stores, APIs, and routes spread across hundreds of files
Solution: Phase 8 (Stores) → Phase 9 (APIs) → Phase 10 (Routes)
```

### All-Routes Status
```
✅ /all-routes endpoint EXISTS
   - Location: /routes/all-routes/
   - Shows ~20 hardcoded routes
   - Service health checks working
   - Can be enhanced to auto-discover all 1,211 routes
   - See: CODEBASE_SIZE_ANALYSIS.md for details
```

---

## What to Consolidate (Priority Order)

### **EASIEST (Start Here)**
```
1. UserStore ← consolidate: auth.ts, auth.svelte.ts, user-profile
   Complexity: LOW | Uses: ~40 components | Time: 30 min
```

### **MEDIUM**
```
2. NotificationStore ← consolidate: alerts.ts, notifications
   Complexity: LOW | Uses: ~15 components | Time: 15 min

3. CitationStore ← consolidate: citations.ts, legal-citations
   Complexity: MEDIUM | Uses: ~20 components | Time: 45 min
```

### **HARDER**
```
4. CaseStore ← consolidate: cases.ts, case-filters
   Complexity: MEDIUM | Uses: ~30 components | Time: 1 hr

5. EvidenceStore ← consolidate: evidence.ts, upload, analysis
   Complexity: HIGH | Uses: ~40 components | Time: 1.5 hrs
```

### **MOST COMPLEX**
```
6-10. ReportStore, POIStore, SearchStore, CanvasStore, AIAssistantStore
   Complexity: MEDIUM-HIGH | Time: 3-4 hrs total
```

---

## Quickest Path (UserStore First)

### Step 1: Create File (5 min)
```bash
# Create the unified user store
cat > sveltekit-frontend/src/lib/stores/unified/user-store.ts << 'EOF'
import { writable } from 'svelte/store';
import type { User, SessionUser } from '$lib/data/types';

interface UserStoreState {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionToken: string | null;
  error: string | null;
}

const initialState: UserStoreState = {
  currentUser: null,
  isAuthenticated: false,
  isLoading: true,
  sessionToken: null,
  error: null
};

function createUserStore() {
  const { subscribe, set, update } = writable<UserStoreState>(initialState);

  return {
    subscribe,

    // Auth methods
    async login(email: string, password: string) {
      update(s => ({ ...s, isLoading: true, error: null }));
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok) {
          update(s => ({
            ...s,
            currentUser: data.user,
            sessionToken: data.token,
            isAuthenticated: true
          }));
        } else {
          update(s => ({ ...s, error: data.error }));
        }
      } catch (e) {
        update(s => ({ ...s, error: String(e) }));
      } finally {
        update(s => ({ ...s, isLoading: false }));
      }
    },

    async logout() {
      await fetch('/api/auth/logout', { method: 'POST' });
      set(initialState);
    },

    async updateProfile(updates: Partial<User>) {
      try {
        const res = await fetch('/api/user/profile', {
          method: 'PUT',
          body: JSON.stringify(updates)
        });
        if (res.ok) {
          const updated = await res.json();
          update(s => ({ ...s, currentUser: updated }));
        }
      } catch (e) {
        console.error(e);
      }
    },

    // Getters
    getUser() {
      let current: User | null = null;
      subscribe(s => { current = s.currentUser; })();
      return current;
    }
  };
}

export const userStore = createUserStore();
EOF
```

### Step 2: Create Index Export (2 min)
```bash
cat >> sveltekit-frontend/src/lib/stores/unified/index.ts << 'EOF'
export { userStore } from './user-store';
// Add other stores as you create them
EOF
```

### Step 3: Update One Component (5 min)
Change this:
```typescript
// OLD
import { user } from '$lib/stores/auth';
import { profile } from '$lib/stores/user-profile';
```

To this:
```typescript
// NEW
import { userStore } from '$lib/stores/unified';

$userStore.currentUser
$userStore.isAuthenticated
```

### Step 4: Verify (3 min)
```bash
npm run check
```

---

## Consolidation Checklist

### Create Each Store
- [ ] UserStore (auth, profile)
- [ ] NotificationStore (alerts, toasts)
- [ ] CitationStore (citations, legal refs)
- [ ] CaseStore (cases, filters)
- [ ] EvidenceStore (evidence, upload, analysis)
- [ ] ReportStore (reports, builder)
- [ ] POIStore (persons of interest, network)
- [ ] SearchStore (unified search)
- [ ] CanvasStore (evidence mapping)
- [ ] AIAssistantStore (chat, recommendations)

### Update Components
- [ ] Update imports in 101 components
- [ ] Verify store method calls
- [ ] Test component rendering
- [ ] Run `npm run check` (0 errors)

### Cleanup
- [ ] Archive old store files
- [ ] Delete fragmented stores
- [ ] Update documentation
- [ ] Create store usage guide

---

## Command Summary

```bash
# Create directory
mkdir -p sveltekit-frontend/src/lib/stores/unified

# Check TypeScript
npm run check

# Build if needed
npm run build

# Start dev server
npm run dev

# Run tests (if available)
npm run test
```

---

## Tips for Success

✅ **Do:**
- Start with simplest stores (UserStore, NotificationStore)
- Implement one store completely before moving to next
- Test each store with 2-3 components
- Keep old stores until new ones verified
- Use TypeScript for type safety

❌ **Don't:**
- Consolidate all at once (too risky)
- Delete old stores until replaced
- Skip testing each store
- Forget about performance (profile after)
- Make breaking API changes without migration

---

## Rollback Plan

If consolidation breaks things:
```bash
# Revert to last git commit
git checkout HEAD -- sveltekit-frontend/src/lib/stores/

# Or restore from backup
cp -r .backups/stores-backup/* sveltekit-frontend/src/lib/stores/
```

---

## Success Metrics

✅ Phase 8 Complete when:
- [ ] 10 unified stores created
- [ ] 101 components updated to use new stores
- [ ] `npm run check` shows 0 errors
- [ ] All store methods working
- [ ] No data loss
- [ ] Performance maintained or improved
- [ ] Old fragmented stores deleted

---

## Ready?

**Choose your path:**

1. **Just start** → Run commands above, begin with UserStore
2. **Plan first** → Read `PHASE_8_STORE_CONSOLIDATION_STRATEGY.md` completely
3. **Ask questions** → Review before starting

---

**Next: Create `src/lib/stores/unified/` and begin with UserStore** 🚀
