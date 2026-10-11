/** FEATURE-LINEAGE-WIRE-01b: read-only binding evidence adapter.
 * This is NOT a SourceVersionReceipt, approval resolver or materializer admission.
 */
import { resolveAdmittedSourceRevisionV1 } from './admitted-source-revision-resolver-v1.js';
import type { AdmittedSourceRevisionV1 } from './admitted-source-revision-resolver-v1.js';

const REV = /^sha256:[a-f0-9]{64}$/;
export interface OrfSourceBindingRequestV1 {
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
}
export type OrfSourceBindingResultV1 = {
  schema: 'atlas.orf-source-binding-readback.v1';
  status: 'SOURCE_BINDING_MATCH_READ_ONLY';
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  repositoryId: string;
  bindingChecksum: string;
  sourceVersionReceiptVerified: false;
  registryApprovalVerified: false;
  canonicalAuthority: false;
  admissionAuthorized: false;
  writesPerformed: false;
};
export class OrfSourceBindingErrorV1 extends Error {
  constructor(readonly code: string) { super(code); this.name = 'OrfSourceBindingErrorV1'; }
}
/** Dependency-injected core to test missing, stale, ambiguous and mismatched owners.
 * Packet identity must be checked separately against the packet identity resolver;
 * the workspace binding table does not bind packet_key.
 */
export async function inspectOrfSourceBindingV1(
  request: OrfSourceBindingRequestV1,
  resolve: (input: {sourceRef: string; workspaceRevision: string}) => Promise<AdmittedSourceRevisionV1>,
): Promise<OrfSourceBindingResultV1> {
  if (!request.packetKey?.trim() || !request.sourceRef?.trim() ||
      !REV.test(request.sourceRevision) || !REV.test(request.workspaceRevision)) {
    throw new OrfSourceBindingErrorV1('ORF_SOURCE_BINDING_REQUEST_INVALID');
  }
  let binding: AdmittedSourceRevisionV1;
  try {
    binding = await resolve({sourceRef: request.sourceRef, workspaceRevision: request.workspaceRevision});
  } catch {
    throw new OrfSourceBindingErrorV1('ORF_SOURCE_BINDING_UNRESOLVED');
  }
  if (binding.sourceRef !== request.sourceRef ||
      binding.sourceRevision !== request.sourceRevision ||
      binding.workspaceRevision !== request.workspaceRevision ||
      binding.contentDigest !== request.sourceRevision.slice(7) ||
      !binding.repoId?.trim() || !/^(?:sha256:)?[a-f0-9]{64}$/.test(binding.bindingChecksum)) {
    throw new OrfSourceBindingErrorV1('ORF_SOURCE_BINDING_MISMATCH');
  }
  return {
    schema: 'atlas.orf-source-binding-readback.v1',
    status: 'SOURCE_BINDING_MATCH_READ_ONLY',
    packetKey: request.packetKey,
    sourceRef: request.sourceRef,
    sourceRevision: request.sourceRevision,
    workspaceRevision: request.workspaceRevision,
    repositoryId: binding.repoId,
    bindingChecksum: binding.bindingChecksum,
    sourceVersionReceiptVerified: false,
    registryApprovalVerified: false,
    canonicalAuthority: false,
    admissionAuthorized: false,
    writesPerformed: false,
  };
}
export function resolveOrfSourceBindingReadOnlyV1(input: OrfSourceBindingRequestV1) {
  return inspectOrfSourceBindingV1(input, resolveAdmittedSourceRevisionV1);
}
