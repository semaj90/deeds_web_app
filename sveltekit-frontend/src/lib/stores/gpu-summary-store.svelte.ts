/**
 * GPU Summary Store - Svelte 5 Runes
 * Tracks GPU capability and utilization metrics
 */

class GpuSummaryStore {
  available = $state(false);
  backend = $state<string>('none');
  memoryUsage = $state(0);
  utilization = $state(0);

  update(data: { available?: boolean; backend?: string; memoryUsage?: number; utilization?: number }) {
    if (data.available !== undefined) this.available = data.available;
    if (data.backend !== undefined) this.backend = data.backend;
    if (data.memoryUsage !== undefined) this.memoryUsage = data.memoryUsage;
    if (data.utilization !== undefined) this.utilization = data.utilization;
  }

  reset() {
    this.available = false;
    this.backend = 'none';
    this.memoryUsage = 0;
    this.utilization = 0;
  }
}

export const gpuSummaryStore = new GpuSummaryStore();
