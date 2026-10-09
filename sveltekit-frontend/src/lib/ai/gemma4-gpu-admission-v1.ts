/** Offline-only admission policy. Adapter limits do NOT report free VRAM.
 * This is a pure preflight: it never requests a device, loads a model or fetches assets.
 * A separate audited operator/receipt-backed grant is required before runtime enablement.
 */
export type E2BGpuAdmissionInputV1 = {
  browser: boolean;
  webgpu: boolean;
  adapterPresent: boolean;
  maxBufferSize?: number;
  maxStorageBufferBindingSize?: number;
  operatorFreeMemoryMB?: number | null;
  requiredMemoryMB: number;
  independentlyVerifiedMemoryReceipt?: boolean;
  offlineAssetManifestVerified?: boolean;
  userApprovedLoad?: boolean;
};
export type E2BGpuAdmissionResultV1 = {
  eligible: boolean;
  reason: 'SSR' | 'NO_WEBGPU' | 'NO_ADAPTER' | 'INVALID_BUDGET' |
    'GPU_MEMORY_UNVERIFIED' | 'GPU_MEMORY_INSUFFICIENT' |
    'ASSETS_UNVERIFIED' | 'USER_APPROVAL_REQUIRED' | 'PREFLIGHT_READY';
  availableMemoryMB: number | null;
};
export function inspectE2BGpuAdmissionV1(input: E2BGpuAdmissionInputV1): E2BGpuAdmissionResultV1 {
  const reject = (reason: E2BGpuAdmissionResultV1['reason']): E2BGpuAdmissionResultV1 =>
    ({ eligible: false, reason, availableMemoryMB: null });
  if (!input.browser) return reject('SSR');
  if (!input.webgpu) return reject('NO_WEBGPU');
  if (!input.adapterPresent) return reject('NO_ADAPTER');
  if (!Number.isFinite(input.requiredMemoryMB) || input.requiredMemoryMB <= 0) return reject('INVALID_BUDGET');
  // maxBufferSize/maxStorageBufferBindingSize intentionally never influence admission.
  if (!input.independentlyVerifiedMemoryReceipt ||
      !Number.isFinite(input.operatorFreeMemoryMB) || (input.operatorFreeMemoryMB ?? -1) < 0)
    return reject('GPU_MEMORY_UNVERIFIED');
  const availableMemoryMB = input.operatorFreeMemoryMB!;
  if (availableMemoryMB < input.requiredMemoryMB)
    return { eligible:false, reason:'GPU_MEMORY_INSUFFICIENT', availableMemoryMB };
  if (!input.offlineAssetManifestVerified)
    return { eligible:false, reason:'ASSETS_UNVERIFIED', availableMemoryMB };
  if (!input.userApprovedLoad)
    return { eligible:false, reason:'USER_APPROVAL_REQUIRED', availableMemoryMB };
  return { eligible:true, reason:'PREFLIGHT_READY', availableMemoryMB };
}
