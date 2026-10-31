export interface MetadataSnapshotPage<TPoint> {
  points: TPoint[];
  nextOffset?: string | number | null;
}

export interface MetadataSnapshotOptions<TPoint, TItem> {
  maxPoints: number;
  maxBytes: number;
  maxPages: number;
  deadlineMs: number;
  now: () => number;
  mapPoint: (point: TPoint) => TItem;
}

export type MetadataSnapshotResult<TItem> =
  | { ok: true; items: TItem[]; pointCount: number; estimatedBytes: number; pages: number }
  | { ok: false; reason: string; pointCount: number; estimatedBytes: number };

export function collectBoundedMetadataSnapshot<TPoint, TItem>(
  readPage: (offset: string | number | null) => Promise<MetadataSnapshotPage<TPoint>>,
  options: MetadataSnapshotOptions<TPoint, TItem>
): Promise<MetadataSnapshotResult<TItem>>;
