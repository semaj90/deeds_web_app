import fs from 'fs';

// 1. mbvh4-webgpu-engine.ts
const mbvhPath = 'sveltekit-frontend/src/lib/webgpu/mbvh4-webgpu-engine.ts';
let mbvh = fs.readFileSync(mbvhPath, 'utf8');
mbvh = mbvh.replace(
  'device.queue.writeBuffer(nodesGpuBuffer, 0, packedNodes);',
  'device.queue.writeBuffer(nodesGpuBuffer, 0, packedNodes.buffer as ArrayBuffer);'
);
mbvh = mbvh.replace(
  'device.queue.writeBuffer(raysGpuBuffer, 0, packedRays);',
  'device.queue.writeBuffer(raysGpuBuffer, 0, packedRays.buffer as ArrayBuffer);'
);
fs.writeFileSync(mbvhPath, mbvh, 'utf8');
console.log('Fixed mbvh4-webgpu-engine.ts');

// 2. admin/ai-dashboard/+page.svelte
const pagePath = 'sveltekit-frontend/src/routes/(app)/admin/ai-dashboard/+page.svelte';
let page = fs.readFileSync(pagePath, 'utf8');
page = page.replace(
  "{#if task.blockedBy.length}<p>Blocked by: {task.blockedBy.join(', '</p>{/if}",
  "{#if task.blockedBy.length}<p>Blocked by: {task.blockedBy.join(', ')}</p>{/if}"
);
fs.writeFileSync(pagePath, page, 'utf8');
console.log('Fixed admin/ai-dashboard/+page.svelte line 374 syntax');
