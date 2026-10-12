/**
 * SOURCE-01 read-only bridge for existing ContextManifest shadow.
 * Wire dependencies only to audited canonical owners. Does not open files itself,
 * issue SQL, fetch FastAPI, access Valkey, or authorize ontology admission.
 *
 * CandidateOrdinalMapV1 parsing and integrity verification run inside this
 * bridge; the injected snapshot loader must still obtain the real SearchRuntime
 * map and must never derive it from cache/centroid hints.
 * Reopened bytes are not source authority by themselves. verifySourceBinding
 * must call the canonical packet/source resolver for those exact decoded bytes.
 * TODO: locate revision-qualified ChunkRetrievalProfileV2 writer and the three
 * live supplement feature producers before exposing this from a production route.
 */
import { createHash } from 'node:crypto';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../atlas/features/canonical-candidate-v1.js';
import {
  assertGroundedExtractionSourceBindingReceiptV1,
  resolveGroundedExtractionSourceBindingV1,
  type GroundedExtractionSourceBindingReceiptV1,
} from '../atlas/identity/grounded-extraction-source-binding-v1.js';
import {
  ChunkRetrievalProfileV2Schema,
  verifyChunkRetrievalProfileV2Checksum,
  type ChunkRetrievalProfileV2,
} from '../atlas/retrieval/chunk-retrieval-profile-v2.js';
import type { SearchRuntimeLiveFeatureSupplementV1 } from '../atlas/retrieval/search-runtime-live-feature-join-v1.js';
import type { SearchRuntimeContextManifestShadowSourceRowsV1 } from '../atlas/retrieval/search-runtime-context-manifest-shadow-v1.js';
import { createCandidateOrdinalSourceReaderV1 } from '../atlas/workflow/admitted-ast-grep-provider-v1.js';

type Candidate = {
  candidateOrdinal: number;
  canonicalCandidateId: string;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  expectedContentSha256: string;
  startByte: number;
  endByte: number;
  expectedSpanSha256: string;
};
type Snapshot = {
  ordinalMap: CandidateOrdinalMapV1;
  candidates: readonly Candidate[];
};
export type CanonicalShadowProvidersV1 = {
  loadSnapshot: (args: {requestId: string; workspaceRevision: string}) => Promise<Snapshot | null>;
  repositoryRoot?: string;
  // Test-only override. Production uses the ordinal-map-bound confined reader below.
  readSource?: (candidate: Candidate) => Promise<Uint8Array | null>;
  verifySourceBinding?: (candidate: Candidate, sourceText: string) => Promise<GroundedExtractionSourceBindingReceiptV1>;
  loadProfile: (candidate: Candidate) => Promise<ChunkRetrievalProfileV2 | null>;
  loadSupplement: (candidate: Candidate) => Promise<unknown>;
};
export type ShadowSourcePreflightV1 =
  | {status:'UNAVAILABLE'; reason:string; rows:null; admission:'NOT_PERFORMED'}
  | {status:'SOURCE_VERIFIED_NOT_ADMITTED'; reason:null; rows:SearchRuntimeContextManifestShadowSourceRowsV1; admission:'NOT_PERFORMED'};
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const nonempty=(v:unknown):v is string=>typeof v==='string'&&v.length>0;
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/i.test(v);
const isUint8Array=(value:unknown):value is Uint8Array=>ArrayBuffer.isView(value)&&Object.prototype.toString.call(value)==='[object Uint8Array]';
const isRecord=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const isFiniteNumber=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
function isLiveFeatureSupplement(value:unknown):value is SearchRuntimeLiveFeatureSupplementV1 {
  if(!isRecord(value)||!isRecord(value.producerRevisions)||!Array.isArray(value.evidenceRefs))return false;
  const producerRevisionKeys=Object.keys(value.producerRevisions).sort();
  const requiredProducerRevisionKeys=['executionUtility','processFit','retrievalFrequency'];
  return nonempty(value.packetKey)&&isFiniteNumber(value.retrievalFrequency)&&isFiniteNumber(value.executionUtility)&&
    isFiniteNumber(value.processFit)&&nonempty(value.featureRevision)&&
    producerRevisionKeys.length===requiredProducerRevisionKeys.length&&
    producerRevisionKeys.every((key,index)=>key===requiredProducerRevisionKeys[index])&&
    Object.values(value.producerRevisions).every(nonempty)&&
    value.evidenceRefs.length>0&&value.evidenceRefs.every(nonempty);
}
const unavailable=(reason:string):ShadowSourcePreflightV1=>({status:'UNAVAILABLE',reason,rows:null,admission:'NOT_PERFORMED'});

export async function resolveRevisionQualifiedShadowSourcesV1(
  input:{requestId:string;workspaceRevision:string;packets:readonly {packet_key?:string;packetKey?:string}[]},
  owners:CanonicalShadowProvidersV1
):Promise<ShadowSourcePreflightV1> {
  if(!nonempty(input.requestId)||!nonempty(input.workspaceRevision))return unavailable('REQUEST_IDENTITY_MISSING');
  if(input.packets.length===0)return unavailable('EMPTY_RETRIEVAL');
  try {
    const snapshot=await owners.loadSnapshot({requestId:input.requestId,workspaceRevision:input.workspaceRevision});
    if(!snapshot)return unavailable('ORDINAL_MAP_NOT_INDEPENDENTLY_VERIFIED');
    const ordinalMap=candidateOrdinalMapV1Schema.parse(snapshot.ordinalMap);
    assertCandidateOrdinalMapIntegrityV1(ordinalMap);
    if(ordinalMap.workspaceRevision!==input.workspaceRevision)return unavailable('ORDINAL_MAP_NOT_INDEPENDENTLY_VERIFIED');
    const readSource = owners.readSource ?? (owners.repositoryRoot
      ? createCandidateOrdinalSourceReaderV1({ repositoryRoot: owners.repositoryRoot, ordinalMap })
      : null);
    if (!readSource) return unavailable('AUTHORIZED_SOURCE_READER_UNAVAILABLE');
    const packetKeys=input.packets.map(p=>p.packetKey??p.packet_key);
    const selected=new Set(packetKeys);
    if(selected.size!==packetKeys.length)return unavailable('DUPLICATE_PACKET_IDENTITY');
    if(selected.has(undefined))return unavailable('PACKET_IDENTITY_MISSING');
    const profiles:ChunkRetrievalProfileV2[]=[];
    const supplements:SearchRuntimeLiveFeatureSupplementV1[]=[];
    const seen=new Set<string>();
    for(const packetKey of selected){
      const ordinalMatches=ordinalMap.candidates.filter(c=>c.packetKey===packetKey);
      const matches=snapshot.candidates.filter(c=>c.packetKey===packetKey);
      if(ordinalMatches.length!==1)return unavailable('CANDIDATE_NOT_UNIQUE_IN_ORDINAL_MAP');
      if(matches.length!==1)return unavailable('CANDIDATE_NOT_UNIQUE');
      const candidate=matches[0]!;
      const canonical=ordinalMatches[0]!;
      if(candidate.candidateOrdinal!==canonical.candidateOrdinal||candidate.canonicalCandidateId!==canonical.canonicalId||
        candidate.packetKey!==canonical.packetKey||candidate.sourceRef!==canonical.sourceRef||
        candidate.sourceRevision!==canonical.sourceRevision||candidate.workspaceRevision!==canonical.workspaceRevision)
        return unavailable('SNAPSHOT_CANDIDATE_ORDINAL_MAP_MISMATCH');
      if(seen.has(candidate.canonicalCandidateId))return unavailable('DUPLICATE_CANDIDATE');
      seen.add(candidate.canonicalCandidateId);
      if(candidate.workspaceRevision!==input.workspaceRevision||!nonempty(candidate.sourceRevision)||
        !hash(candidate.expectedContentSha256)||!hash(candidate.expectedSpanSha256))return unavailable('CANDIDATE_LINEAGE_UNQUALIFIED');
      const bytes=await readSource(candidate);
      if(!isUint8Array(bytes))return unavailable('SOURCE_BYTES_UNAVAILABLE');
      if(sha(bytes)!==candidate.expectedContentSha256.toLowerCase())return unavailable('SOURCE_CONTENT_DIGEST_MISMATCH');
      if(candidate.sourceRevision.toLowerCase()!==`sha256:${sha(bytes)}`)return unavailable('SOURCE_CONTENT_REVISION_MISMATCH');
      let sourceText: string;
      try { sourceText = new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
      catch { return unavailable('SOURCE_BYTES_INVALID_UTF8'); }
      const sourceBinding = owners.verifySourceBinding
        ? await owners.verifySourceBinding(candidate, sourceText)
        : await resolveGroundedExtractionSourceBindingV1({
          packetKey: candidate.packetKey,
          sourceRef: candidate.sourceRef,
          sourceRevision: candidate.sourceRevision,
          workspaceRevision: candidate.workspaceRevision,
          submittedText: sourceText,
        });
      try {
        assertGroundedExtractionSourceBindingReceiptV1(sourceBinding, {
          packetKey: candidate.packetKey,
          sourceRef: candidate.sourceRef,
          sourceRevision: `sha256:${sha(bytes)}`,
          workspaceRevision: candidate.workspaceRevision,
          byteLength: bytes.byteLength,
        });
      } catch {
        return unavailable('SOURCE_AUTHORITY_BINDING_MISMATCH');
      }
      const {startByte,endByte}=candidate;
      if(!Number.isSafeInteger(startByte)||!Number.isSafeInteger(endByte)||startByte<0||endByte<=startByte||endByte>bytes.length)
        return unavailable('SOURCE_SPAN_BOUNDS_INVALID');
      if((bytes[startByte]!&0xc0)===0x80||(endByte<bytes.length&&(bytes[endByte]!&0xc0)===0x80))
        return unavailable('UTF8_SPAN_BOUNDARY_INVALID');
      if(sha(bytes.subarray(startByte,endByte))!==candidate.expectedSpanSha256.toLowerCase())return unavailable('SOURCE_SPAN_DIGEST_MISMATCH');
      const profile=await owners.loadProfile(candidate);
      const supplementValue=await owners.loadSupplement(candidate);
      if(!profile||!supplementValue)return unavailable('REVISION_QUALIFIED_PROFILE_OR_SUPPLEMENT_MISSING');
      if(!isLiveFeatureSupplement(supplementValue))return unavailable('SUPPLEMENT_LINEAGE_MISSING');
      const supplement=supplementValue;
      const parsed=ChunkRetrievalProfileV2Schema.safeParse(profile);
      if(!parsed.success||!verifyChunkRetrievalProfileV2Checksum(parsed.data))return unavailable('PROFILE_INVALID');
      if(parsed.data.packetKey!==candidate.packetKey||parsed.data.sourceRef!==candidate.sourceRef||
         parsed.data.sourceRevision!==candidate.sourceRevision||parsed.data.workspaceRevision!==candidate.workspaceRevision)
        return unavailable('PROFILE_LINEAGE_MISMATCH');
      const producerRevisionKeys=Object.keys(supplement.producerRevisions??{}).sort();
      const requiredProducerRevisionKeys=['executionUtility','processFit','retrievalFrequency'];
      if(supplement.packetKey!==candidate.packetKey||!nonempty(supplement.featureRevision)||
        producerRevisionKeys.length!==requiredProducerRevisionKeys.length||
        producerRevisionKeys.some((key,index)=>key!==requiredProducerRevisionKeys[index])||
        Object.values(supplement.producerRevisions).some(v=>!nonempty(v))||
        supplement.evidenceRefs.length===0||
        supplement.featureRevision!==parsed.data.revisions.featureRevision)return unavailable('SUPPLEMENT_LINEAGE_MISSING');
      profiles.push(parsed.data);supplements.push(supplement);
    }
    return {status:'SOURCE_VERIFIED_NOT_ADMITTED',reason:null,rows:{profiles,supplements},admission:'NOT_PERFORMED'};
  } catch {
    return unavailable('CANONICAL_OWNER_READ_FAILED');
  }
}
