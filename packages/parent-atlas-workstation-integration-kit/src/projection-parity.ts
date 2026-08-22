export type StoreProjection = {
  store: 'postgres' | 'qdrant' | 'neo4j' | 'valkey' | 'ace';
  packetId: string;
  packetKey: string | null;
  workspaceRevision: string | null;
  contentHash: string | null;
  projectionRevision: string | null;
  representationId: string | null;
};

export type ParityIssue = {
  field: keyof Omit<StoreProjection, 'store'>;
  authoritative: unknown;
  observed: unknown;
  store: StoreProjection['store'];
};

export type ParityResult = {
  packetId: string;
  pass: boolean;
  checkedStores: StoreProjection['store'][];
  issues: ParityIssue[];
};

export function compareProjectionParity(authority: StoreProjection, projections: readonly StoreProjection[]): ParityResult {
  if (authority.store !== 'postgres') {
    throw new Error('Postgres projection must be supplied as authority');
  }

  const fields: Array<keyof Omit<StoreProjection, 'store'>> = [
    'packetId',
    'packetKey',
    'workspaceRevision',
    'contentHash',
    'projectionRevision',
    'representationId',
  ];

  const issues: ParityIssue[] = [];
  for (const projection of projections) {
    for (const field of fields) {
      if (authority[field] !== projection[field]) {
        issues.push({ field, authoritative: authority[field], observed: projection[field], store: projection.store });
      }
    }
  }

  return {
    packetId: authority.packetId,
    pass: issues.length === 0,
    checkedStores: projections.map((projection) => projection.store),
    issues,
  };
}
