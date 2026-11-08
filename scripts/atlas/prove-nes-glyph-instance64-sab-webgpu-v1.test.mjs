import test from 'node:test';
import assert from 'node:assert/strict';
import { runNesGlyphInstance64SabWebGpuProof } from './prove-nes-glyph-instance64-sab-webgpu-v1.mjs';

test('NES GlyphInstance64 separate wire schema, SharedArrayBuffer worker protocol, and WebGPU 256B row-pitch / CPU fallback parity pass with 5 adversarial probes', async () => {
  const report = await runNesGlyphInstance64SabWebGpuProof();

  assert.equal(report.status, 'PASS');
  assert.equal(report.canonicalAuthority, false);
  assert.equal(report.writesPerformed, false);
  assert.equal(report.nesLutCrossLayerParity.domainCount, 10);
  assert.equal(report.nesLutCrossLayerParity.allDomainBytesIndependentFromPaletteHex, true);
  assert.equal(report.nesLutCrossLayerParity.uiDomainExample.lutByte, 2);
  assert.equal(report.nesLutCrossLayerParity.uiDomainExample.nesHex, '0x2A');

  assert.equal(report.sharedArrayBufferWorkerExecution.cohortTasksEncoded, 6527);
  assert.equal(report.sharedArrayBufferWorkerExecution.totalSharedBytes, 64 + 6527 * 64);
  assert.equal(report.sharedArrayBufferWorkerExecution.atomicGenerationCounter, 2);

  assert.equal(report.webgpuRowPitchAndDeviceLossFallback.alignedBytesPerRow, 1280);
  assert.equal(
    report.webgpuRowPitchAndDeviceLossFallback.webgpuRender.pixelSha256,
    report.webgpuRowPitchAndDeviceLossFallback.cpuFallbackRender.pixelSha256
  );

  assert.equal(report.adversarialProbes.adv_01_task_rpc_magic_rejected_by_glyph_decoder.passed, true);
  assert.equal(report.adversarialProbes.adv_02_torn_write_generation_mismatch_rejected.passed, true);
  assert.equal(report.adversarialProbes.adv_03_unaligned_webgpu_row_pitch_rejected.passed, true);
  assert.equal(
    report.adversarialProbes.adv_04_device_loss_triggers_cpu_rgba_fallback_parity.passed,
    true
  );
  assert.equal(
    report.adversarialProbes.adv_05_non_isolated_context_uses_transferable_fallback.passed,
    true
  );
});
