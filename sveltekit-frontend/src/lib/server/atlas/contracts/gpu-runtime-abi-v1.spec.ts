import { describe, expect, it } from 'vitest';
import { validateGpuRuntimeAbiV1 } from './gpu-runtime-abi-v1.js';

function base() {
  return {
    schema: 'atlas.gpu-runtime-abi.v1' as const,
    laneId: 'fixture',
    platform: 'WINDOWS_NATIVE' as const,
    gpuName: 'RTX 3060 Ti',
    computeCapability: '8.6',
    driverVersion: '580.88',
    systemToolkitVersion: '13.0',
    compilerToolkitVersion: '12.8',
    framework: 'PYTORCH' as const,
    frameworkVersion: '2.8.0+cu128',
    frameworkCudaRuntimeVersion: '12.8',
    nodeApi: {
      used: false,
      napiVersion: null,
      nodeAbiStable: false,
      externalLibraryAbiStable: false,
    },
    libtorchAbi: {
      used: false,
      mode: 'NONE' as const,
      torchVersion: null,
      stableApiSubsetOnly: false,
    },
    cutile: {
      used: false,
      version: null,
      ampereTargetSupported: false,
      ctkSupportsTarget: false,
    },
    sharedMemory: {
      requestedBytes: null,
      resourceProofRequired: false,
      treatedAsAbiMechanism: false as const,
    },
    checkpointing: {
      enabled: false,
      mechanism: 'NONE' as const,
      affectsAbiClaim: false as const,
    },
    realTargetExecutionObserved: true,
    parityPassed: true,
    promotionAuthorized: false as const,
    producerRevision: 'fixture-r1',
  };
}

describe('GpuRuntimeAbiV1', () => {
  it('keeps a proven PyTorch cu128 lane independent from a CUDA 13 system toolkit', () => {
    const receipt = validateGpuRuntimeAbiV1(base());
    expect(receipt.frameworkCudaRuntimeVersion).toBe('12.8');
    expect(receipt.systemToolkitVersion).toBe('13.0');
    expect(receipt.parityPassed).toBe(true);
  });

  it('allows Node-API ABI stability without claiming transitive LibTorch ABI stability', () => {
    const receipt = validateGpuRuntimeAbiV1({
      ...base(),
      framework: 'LIBTORCH',
      frameworkVersion: '2.8.0',
      nodeApi: {
        used: true,
        napiVersion: 10,
        nodeAbiStable: true,
        externalLibraryAbiStable: false,
      },
      libtorchAbi: {
        used: true,
        mode: 'VERSION_PINNED',
        torchVersion: '2.8.0',
        stableApiSubsetOnly: false,
      },
    });
    expect(receipt.nodeApi.nodeAbiStable).toBe(true);
    expect(receipt.libtorchAbi.mode).toBe('VERSION_PINNED');
  });

  it('rejects a limited stable LibTorch ABI claim unless only the stable subset is used', () => {
    expect(() => validateGpuRuntimeAbiV1({
      ...base(),
      framework: 'LIBTORCH',
      frameworkVersion: '2.8.0',
      libtorchAbi: {
        used: true,
        mode: 'LIMITED_STABLE_ABI',
        torchVersion: '2.8.0',
        stableApiSubsetOnly: false,
      },
    })).toThrow(/LIMITED_STABLE_LIBTORCH_ABI_REQUIRES_STABLE_API_SUBSET_ONLY/);
  });

  it('rejects cuTile on sm86 until Ampere and CTK target support are recorded', () => {
    expect(() => validateGpuRuntimeAbiV1({
      ...base(),
      platform: 'WSL2_LINUX',
      framework: 'CUTILE',
      frameworkVersion: '1.2.0',
      compilerToolkitVersion: '13.1',
      frameworkCudaRuntimeVersion: '13.1',
      cutile: {
        used: true,
        version: '1.2.0',
        ampereTargetSupported: true,
        ctkSupportsTarget: false,
      },
      realTargetExecutionObserved: false,
      parityPassed: false,
    })).toThrow(/CUTILE_SM86_TARGET_SUPPORT_NOT_PROVEN/);
  });

  it('records shared memory and checkpointing without letting either change the ABI claim', () => {
    const receipt = validateGpuRuntimeAbiV1({
      ...base(),
      sharedMemory: {
        requestedBytes: 49152,
        resourceProofRequired: true,
        treatedAsAbiMechanism: false,
      },
      checkpointing: {
        enabled: true,
        mechanism: 'PYTORCH_CHECKPOINT',
        affectsAbiClaim: false,
      },
    });
    expect(receipt.sharedMemory.treatedAsAbiMechanism).toBe(false);
    expect(receipt.checkpointing.affectsAbiClaim).toBe(false);
  });
});
