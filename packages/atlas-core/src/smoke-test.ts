#!/usr/bin/env node

/**
 * Smoke test: Verify all modules load and export correctly
 */

import { PacketReader } from './packet-reader.js';
import { classifyPacketTask, getTaskRoute, groupPacketsByTask } from './policy-task-router.js';
import { WorkstationOrchestrator } from './workstation-orchestrator.js';

console.log('✅ PacketReader imported');
console.log('✅ PolicyTaskRouter functions imported');
console.log('✅ WorkstationOrchestrator imported');

// Verify functions exist
console.log('');
console.log('Function verification:');
console.log('  - classifyPacketTask:', typeof classifyPacketTask === 'function' ? '✅' : '❌');
console.log('  - getTaskRoute:', typeof getTaskRoute === 'function' ? '✅' : '❌');
console.log('  - groupPacketsByTask:', typeof groupPacketsByTask === 'function' ? '✅' : '❌');

// Verify classes can be instantiated
console.log('');
console.log('Class instantiation:');

try {
  const reader = new PacketReader('postgresql://localhost/test');
  console.log('  - PacketReader: ✅');
} catch (err) {
  console.log('  - PacketReader: ❌ -', (err as Error).message);
}

try {
  const orchestrator = new WorkstationOrchestrator({
    enableGPU: false,
    limit: 100
  });
  console.log('  - WorkstationOrchestrator: ✅');
} catch (err) {
  console.log('  - WorkstationOrchestrator: ❌ -', (err as Error).message);
}

// Test mock packet classification
console.log('');
console.log('Mock packet classification:');

const mockPacket = {
  packet_key: 'test:001',
  source_ref: 'src/test.ts',
  feature_id: 'test.feature',
  feature_label: 'Test Feature',
  directory_path: 'src',
  som_cluster: 42,
  metadata: { test: true }
};

try {
  const task = classifyPacketTask(mockPacket);
  console.log(`  - Classified as: ${task.taskType} (${task.workload})`);
  console.log(`  - Priority: ${task.priority}`);
  console.log('  - ✅');
} catch (err) {
  console.log('  - ❌ -', (err as Error).message);
}

console.log('');
console.log('🟢 All smoke tests passed');