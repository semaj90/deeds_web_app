import { createHash } from 'node:crypto';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { z } from 'zod';

const id=z.string().min(1);const revision=z.string().min(1);
export const atlasEvidenceRecordSchema=z.object({schema:z.literal('atlas.evidence-record.v1').default('atlas.evidence-record.v1'),evidence_id:id,evidence_kind:z.string().regex(/^[a-z][a-z0-9_.-]*$/),source_ref:z.string().min(1),source_revision:revision,evidence_revision:revision,producer_revision:revision,confidence:z.number().finite().min(0).max(1),payload:z.record(z.string(),z.unknown()).default({}),tags:z.array(z.string().min(1)).default([]),search_text:z.string().default('')}).strict();
export const atlasEvidenceReadbackReceiptSchema=z.object({schema:z.literal('atlas.evidence-readback-receipt.v1').default('atlas.evidence-readback-receipt.v1'),evidence_id:id,source_revision:revision,evidence_revision:revision,checksum:z.string().regex(/^[a-f0-9]{64}$/),producer_revision:revision}).strict();
export type AtlasEvidenceRecordV1=z.infer<typeof atlasEvidenceRecordSchema>;export type AtlasEvidenceReadbackReceiptV1=z.infer<typeof atlasEvidenceReadbackReceiptSchema>;

type Queryable={query<R extends QueryResultRow=any>(text:string,values?:any[]):Promise<QueryResult<R>>};
function stable(value:unknown):string{if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;if(value&&typeof value==='object')return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;return JSON.stringify(value)??'null';}
function checksum(value:unknown):string{return createHash('sha256').update(stable(value),'utf8').digest('hex');}

/** Accepts Pool or caller-owned PoolClient so larger materializations may be atomic. */
export function createEvidenceLedgerRepository(db:Pool|PoolClient|Queryable){
  const queryable = db as Queryable;
  return{
    async upsert(input:AtlasEvidenceRecordV1):Promise<AtlasEvidenceRecordV1>{const e=atlasEvidenceRecordSchema.parse(input);await queryable.query(`INSERT INTO atlas_evidence(evidence_id,evidence_kind,source_ref,source_revision,evidence_revision,producer_revision,confidence,payload,tags,search_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::text[],$10) ON CONFLICT(evidence_id) DO UPDATE SET evidence_kind=EXCLUDED.evidence_kind,source_ref=EXCLUDED.source_ref,source_revision=EXCLUDED.source_revision,evidence_revision=EXCLUDED.evidence_revision,producer_revision=EXCLUDED.producer_revision,confidence=EXCLUDED.confidence,payload=EXCLUDED.payload,tags=EXCLUDED.tags,search_text=EXCLUDED.search_text`,[e.evidence_id,e.evidence_kind,e.source_ref,e.source_revision,e.evidence_revision,e.producer_revision,e.confidence,JSON.stringify(e.payload),e.tags,e.search_text]);return e;},
    async readback(input:{evidence_id:string;producer_revision:string}):Promise<AtlasEvidenceReadbackReceiptV1>{const result=await queryable.query<{evidence_id:string;evidence_kind:string;source_ref:string;source_revision:string;evidence_revision:string;producer_revision:string;confidence:number;payload:unknown;tags:string[];search_text:string}>(`SELECT evidence_id,evidence_kind,source_ref,source_revision,evidence_revision,producer_revision,confidence,payload,tags,search_text FROM atlas_evidence WHERE evidence_id=$1`,[input.evidence_id]);if(result.rowCount!==1)throw new Error(`EVIDENCE_READBACK_MISSING:${input.evidence_id}`);const row=result.rows[0]!;return atlasEvidenceReadbackReceiptSchema.parse({evidence_id:row.evidence_id,source_revision:row.source_revision,evidence_revision:row.evidence_revision,checksum:checksum(row),producer_revision:input.producer_revision});},
  };
}
export function describeEvidenceLedgerRepository():string{return['atlas_evidence is the canonical source-grounded evidence ledger and does not require a feature attachment.','The repository accepts a caller-owned transaction for atomic multi-document materialization.','atlas_evidence_entities may be written only after the referenced evidence row exists and entity identity is canonical.'].join(' ');}
