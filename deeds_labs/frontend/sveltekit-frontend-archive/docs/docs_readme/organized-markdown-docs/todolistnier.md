# NieR SvelteKit Migration TODO

## 1. Layout (+layout.svelte)
- [x] Refactor navigation to use Svelte 5 runes and Bits UI primitives
- [x] Use UnoCSS shortcuts and nier.css for all layout and nav styling
- [x] Add skip links and ARIA for accessibility
- [x] Modularize nav, actions, and user menu
- [x] Remove legacy slot/slot syntax from layout-level UI
- [x] Use Svelte stores/context for user and settings
- [x] Add theme toggle, settings, and keyboard shortcuts

## 2. Home Page (+page.svelte)
- [x] Refactor hero, quick actions, and features to use UnoCSS shortcuts
- [x] Use Bits UI Button, Card, and Input components
- [x] Remove all legacy slot/slot syntax
- [x] Add ARIA labels and keyboard accessibility
- [x] Modularize sections (Hero, Quick Actions, Recent Cases, Features)
- [x] Use Svelte 5 runes and {@render children()} for all custom UI

## 3. Global Styles
- [x] Migrate all global CSS to nier.css and UnoCSS
- [x] Use uno-shortcuts.ts for all common patterns

## 4. State Management
- [x] Use Svelte stores for user, settings, notifications
- [x] Remove legacy state patterns

## 5. API/Data Layer
- [x] Use Drizzle ORM and pgvector for all backend data
- [x] Refactor endpoints to SvelteKit 2 conventions

## 6. Accessibility & i18n
- [x] Add ARIA, skip links, and keyboard navigation
- [ ] Add i18n support (future)

## 7. Testing & Docs
- [x] Add svelte-check, eslint, stylelint
- [x] Add migration notes to context7-docs/

---

## Next Steps
- [x] Migrate all remaining UI components to Svelte 5 runes/Bits UI
- [x] Refactor all forms to use Bits UI and uno-shortcuts
- [ ] Add more e2e and accessibility tests
- [ ] Document all new patterns in context7-docs/
- [ ] Automate backup and refactor scripts for all UI components and subfolders
- [ ] Update all imports to use unified, refactored components
- [ ] Run `npm run check` and `npm run dev` after each batch, collect errors, and iterate until all are resolved
- [ ] Use #context7, Bits UI, melt-ui, shadcn-svelte, and uno-shortcuts for all new/refactored code
- [ ] Review and optimize SSR hydration and modern web-design patterns throughout the codebase
