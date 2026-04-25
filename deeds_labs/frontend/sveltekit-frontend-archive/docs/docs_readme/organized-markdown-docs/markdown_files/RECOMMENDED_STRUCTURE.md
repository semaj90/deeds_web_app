# Recommended Monorepo Structure

## Current Issues
- Complex nested structure makes Playwright testing difficult
- Mixed concerns between web and desktop apps
- $lib aliases cause test runner issues

## Recommended Structure

```
warden-net/
├── apps/
│   ├── web/                    # SvelteKit web app
│   │   ├── src/
│   │   │   ├── lib/           # Web-specific components
│   │   │   ├── routes/        # SvelteKit routes
│   │   │   └── app.html
│   │   ├── tests/             # Playwright tests
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── desktop/               # Tauri desktop app
│       ├── src/
│       ├── src-tauri/         # Rust backend
│       ├── package.json
│       └── vite.config.ts
│
├── packages/
│   ├── shared/                # Shared components & utilities
│   │   ├── components/        # UI components (Button, Modal, etc.)
│   │   ├── stores/           # Svelte stores
│   │   ├── utils/            # Helper functions
│   │   └── types/            # TypeScript types
│   │
│   ├── database/             # Database schema & migrations
│   │   ├── schema/           # Drizzle schema
│   │   ├── migrations/       # SQL migrations
│   │   └── seed.ts          # Test data
│   │
│   └── ai/                   # AI/ML utilities
│       ├── classification/
│       ├── embeddings/
│       └── nlp/
│
├── docker-compose.yml         # Dev services (Postgres, Redis, Qdrant)
├── package.json              # Root package.json
└── README.md

```

## Benefits of This Structure

### Testing Benefits
- **Isolated Playwright tests**: `apps/web/tests/` contains only web E2E tests
- **Clean imports**: No complex $lib resolution in tests
- **Faster CI**: Can test web and desktop separately
- **Better mocking**: Easier to mock shared packages

### Development Benefits
- **Clear separation**: Web vs desktop concerns are isolated
- **Shared code**: Common UI/logic in `packages/shared`
- **Independent builds**: Each app can have different build configs
- **Team scalability**: Different teams can own different apps

### Import Patterns
```typescript
// In apps/web/src/routes/+page.svelte
import Button from '../../lib/components/Button.svelte';
import { userStore } from '@warden-net/shared/stores';
import { type Case } from '@warden-net/database/schema';

// In packages/shared/components/Modal.svelte
import Button from './Button.svelte';
import { createEventDispatcher } from 'svelte';
```

## Migration Strategy

1. **Phase 1**: Create new structure, move web app
2. **Phase 2**: Move shared components to packages/
3. **Phase 3**: Set up desktop app
4. **Phase 4**: Configure workspaces and build pipeline
5. **Phase 5**: Add comprehensive tests

## Playwright Configuration

With this structure, Playwright config becomes much simpler:

```typescript
// apps/web/playwright.config.ts
export default defineConfig({
  testDir: './tests',
  webServer: {
    command: 'npm run dev',
    port: 5173
  },
  use: {
    baseURL: 'http://localhost:5173'
  }
});
```

No need for complex alias resolution or monorepo-specific configurations.
