import { z } from 'zod';

/**
 * RESIDENCY-CONTROLLER-V1
 * 
 * Implements the 3-tier memory residency controller:
 * 1. Hot Deque: active ContextManifest, recent packet refs, current adapter slot.
 *    Eviction via pop_back, promotion via push_front.
 * 2. Warm Priority Queue: graph neighbors, same SOM cell, next-hop concepts.
 *    Priority = (utility * p_reuse * recency * breadth) / reload_cost.
 * 3. Cold Registry: persistent storage (PostgreSQL, Qdrant, SeaweedFS).
 */

export const WarmQueueItemSchema = z
  .object({
    id: z.string().min(1),
    utility: z.number().min(0),
    pReuse: z.number().min(0).max(1),
    recency: z.number().min(0),
    breadth: z.number().min(0),
    reloadCost: z.number().min(0.0001),
  })
  .strict();

export type WarmQueueItem = z.infer<typeof WarmQueueItemSchema>;

export class HotDeque<T> {
  private items: T[] = [];
  private capacity: number;

  constructor(capacity = 32) {
    this.capacity = capacity;
  }

  pushFront(item: T): void {
    const idx = this.items.indexOf(item);
    if (idx !== -1) {
      this.items.splice(idx, 1);
    }
    this.items.unshift(item);
    if (this.items.length > this.capacity) {
      this.items.pop();
    }
  }

  popBack(): T | undefined {
    return this.items.pop();
  }

  getItems(): readonly T[] {
    return this.items;
  }

  size(): number {
    return this.items.length;
  }
}

export function computeWarmPriority(item: WarmQueueItem): number {
  return (item.utility * item.pReuse * item.recency * item.breadth) / item.reloadCost;
}

export class WarmPriorityQueue {
  private items: WarmQueueItem[] = [];

  enqueue(item: WarmQueueItem): void {
    WarmQueueItemSchema.parse(item);
    this.items.push(item);
    this.items.sort((a, b) => computeWarmPriority(b) - computeWarmPriority(a));
  }

  dequeue(): WarmQueueItem | undefined {
    return this.items.shift();
  }

  peek(): WarmQueueItem | undefined {
    return this.items[0];
  }

  size(): number {
    return this.items.length;
  }
}

export const AtlasResidencyDescriptorV1Schema = z
  .object({
    schema: z.literal('atlas.residency-descriptor.v1'),
    hotCapacity: z.number().int().min(1),
    warmSize: z.number().int().min(0),
    activeManifestChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
    activeAdapterSlot: z.number().int().min(0).max(255).default(0),
    canonicalAuthority: z.literal(false),
  })
  .strict();

export type AtlasResidencyDescriptorV1 = z.infer<typeof AtlasResidencyDescriptorV1Schema>;
