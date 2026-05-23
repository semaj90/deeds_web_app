export const aiOsState = $state({
  phase: 'idle' as 'idle' | 'retrieving' | 'tooling' | 'streaming' | 'caching' | 'rendering' | 'failed',
  progress: 0,
  sourceRefs: [] as string[],
  cacheKey: '',
  lastError: ''
});
