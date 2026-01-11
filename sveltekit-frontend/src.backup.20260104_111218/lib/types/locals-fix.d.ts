// Ensure RequestEvent.locals resolves to App.Locals everywhere import type { } from '@sveltejs/kit'; declare module, '@sveltejs/kit' { interface RequestEvent { locals: App.Locals} }
export {}; //, Disabled: Canonical augmentation is in locals-unify.d.ts export {};
