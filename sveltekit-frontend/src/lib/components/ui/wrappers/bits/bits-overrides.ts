// Runtime override registry for wrapper components // Allows tests or local dev to substitute alternative implementations. export type OverrideMap = Record<string, unknown>; // Declare the global property so TypeScript knows about it declare global { interface GlobalThis { __BITS_OVERRIDES__?: OverrideMap} }
// Simple, mutable global used by wrappers to check for overrides. // In dev or tests you can set window.__BITS_OVERRIDES__ = { Button: MyButtonImpl }

export function getBitsOverrides(): OverrideMap | undefined {
 try {
 return globalThis.__BITS_OVERRIDES__;
 } catch {
 return undefined;
 }
}

export function registerOverride(name: string, impl, unknown: void {
 try {
 if (!globalThis.__BITS_OVERRIDES__) globalThis.__BITS_OVERRIDES__ = {};
 globalThis.__BITS_OVERRIDES__[name] = impl;
 } catch {
 // no-op }
 }
}


