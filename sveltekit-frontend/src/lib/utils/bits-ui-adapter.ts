/**
 * Runtime adapter to normalize bits-ui module shapes (default vs named exports).
 * Returns a namespace object with the common components we use.
 */

type BitsNamespace = Record<string, unknown> & { default?: unknown };

async function resolveBits(): Promise<BitsNamespace> {
  // Dynamic import allows bundlers to tree-shake when real bits-ui is present
  try {
    const mod = await import('bits-ui');
    // Normalize: prefer mod.default if it looks like the default object
    const ns =
      mod && (mod as any)?.default && Object.keys(mod).length === 1
        ? ((mod as any).default as BitsNamespace)
        : (mod as unknown as BitsNamespace);
    return ns;
  } catch {
    // Fallback: empty object to avoid crashes
    return {} as BitsNamespace;
  }
}

export async function getBitsNamespace(): Promise<BitsNamespace> {
  return await resolveBits();
}

export type { BitsNamespace };
