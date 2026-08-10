export type DataResidency = 'COLD' | 'MMAPPED' | 'WARM' | 'PINNED' | 'GPU_RESIDENT' | 'IN_USE';
export type JobStage = 'QUEUED' | 'INGESTING' | 'ENRICHING' | 'INDEXING' | 'GPU_PROMOTING' | 'RETRIEVING' | 'ASSEMBLING' | 'READY' | 'FAILED';

export interface ResidencyEvent {
  eventId: string;
  tileKey: string;
  from: DataResidency;
  to: DataResidency;
  bytes: number;
  reason: string;
  policyRevision: string;
  atMs: number;
}

export interface JobProgressEvent {
  jobId: string;
  stage: JobStage;
  completed: number;
  total: number;
  artifactRevision?: string;
  detail?: string;
}
