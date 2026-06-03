export type CodebaseAnnBackend = 'qdrant' | 'cuvs' | 'turbovec';

export function getCodebaseAnnBackend(): CodebaseAnnBackend {
  const raw = (process.env.CODEBASE_ANN_BACKEND ?? 'qdrant').toLowerCase();
  if (raw === 'turbovec') return 'turbovec';
  return raw === 'cuvs' ? 'cuvs' : 'qdrant';
}
