export const DOMAIN_PATH_LABELING_V1 = Object.freeze({
  provenance: 'PATH_HEURISTIC_SYNTHETIC',
  evaluationMeaning: 'PATH_LABEL_PREDICTABILITY_ONLY',
  groundTruth: false,
  promotionEligible: false,
});

export function deriveSyntheticPathDomainV1(sourceRef) {
  const norm = String(sourceRef ?? '').toLowerCase().replace(/\\/g, '/');
  if (norm.includes('retrieval') || norm.includes('qdrant') || norm.includes('search') || norm.includes('vector')) return 'retrieval';
  if (norm.includes('svelte') || norm.includes('components') || norm.includes('routes') || norm.includes('ui')) return 'frontend';
  if (norm.includes('onnx') || norm.includes('model') || norm.includes('embedding') || norm.includes('torch') || norm.includes('kmeans')) return 'machine-learning';
  if (norm.includes('graph') || norm.includes('cst') || norm.includes('tree-sitter') || norm.includes('topology')) return 'graph';
  if (norm.includes('cache') || norm.includes('valkey') || norm.includes('redis')) return 'cache';
  if (norm.includes('auth') || norm.includes('login') || norm.includes('permission')) return 'auth';
  if (norm.includes('docker') || norm.includes('deploy') || norm.includes('script') || norm.includes('infra')) return 'devops';
  if (norm.includes('error') || norm.includes('diagnos') || norm.includes('repair') || norm.includes('warning')) return 'error-handling';
  if (norm.includes('docs') || norm.includes('readme') || norm.includes('.md') || norm.includes('okf')) return 'documentation';
  return 'agent';
}
