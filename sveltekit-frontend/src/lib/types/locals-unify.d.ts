// Thin types that reference the canonical App.Locals from src/app.d.ts export type AppLocals = App.Locals; // Utility
runtime function signature; implementation lives in locals-unify.ts export function getTypedLocals(locals): AppLocals

