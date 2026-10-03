export type OpenSpecExecutionState =
  | 'PROVEN'
  | 'ACTIONABLE'
  | 'WAITING_ON_DEPENDENCY'
  | 'WAITING_ON_AUTHORITY'
  | 'DEFERRED'
  | 'SUPERSEDED'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface OpenSpecBoardTaskV1 {
  id: string;
  changeId: string;
  title: string;
  state: OpenSpecExecutionState;
  blockerKey: string | null;
  topic: string;
  secondaryTopics: string[];
  priority: string | null;
  sourceReport: string;
  fileRefs: string[];
  raw: Record<string, unknown>;
}

export interface OpenSpecReportFileV1 {
  name: string;
  path: string;
  exists: boolean;
  size: number;
  mtimeMs: number;
  sha256: string | null;
}

export interface OpenSpecBoardSummaryV1 {
  total: number;
  proven: number;
  actionable: number;
  waiting: number;
  deferred: number;
  superseded: number;
  unknown: number;
  writesPerformed: boolean;
}

export interface OpenSpecTopicClusterV1 {
  id: string;
  label: string;
  count: number;
  actionable: number;
  waiting: number;
  proven: number;
  changes: string[];
  concepts: string[];
}

export interface OpenSpecBlockerGroupV1 {
  key: string;
  count: number;
  owner: string | null;
  meaning: string | null;
  releaseEvent: string | null;
  retryPolicy: string | null;
}

export interface OpenSpecBoardSnapshotV1 {
  schema: 'atlas.openspec-board.v1';
  reportDirectory: string;
  semanticChecksum: string;
  generatedAt: string;
  reports: OpenSpecReportFileV1[];
  summary: OpenSpecBoardSummaryV1;
  tasks: OpenSpecBoardTaskV1[];
  blockers: OpenSpecBlockerGroupV1[];
  freshness: {
    newestMtimeMs: number;
    newestReport: string | null;
    stale: boolean;
  };
  invariants: string[];
}
