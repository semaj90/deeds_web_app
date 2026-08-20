import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);

export const assertionKindSchema = z.enum(['expect', 'assert', 'custom_assertion']);
export const staticAssertionObservationSchema = z.object({
  schema: z.literal('atlas.static-assertion-observation.v1').default('atlas.static-assertion-observation.v1'),
  stable_test_id: id, source_ref: z.string().min(1), source_revision: revision,
  assertion_kind: assertionKindSchema, expression_text: z.string().min(1),
  byte_start: z.number().int().nonnegative(), byte_end: z.number().int().positive(),
  line: z.number().int().positive(), column: z.number().int().positive(),
  extractor_revision: revision, canonical_authority: z.literal(false).default(false),
}).strict().superRefine((v,ctx) => { if (v.byte_end <= v.byte_start) ctx.addIssue({ code:z.ZodIssueCode.custom,path:['byte_end'],message:'byte_end must be greater than byte_start' }); });
export const assertionNominationSchema = z.object({
  schema:z.literal('atlas.assertion-nomination.v1').default('atlas.assertion-nomination.v1'), nomination_id:id, assertion_key:id,
  identity_status:z.literal('nominated').default('nominated'), stable_test_id:id, source_ref:z.string().min(1), source_revision:revision,
  assertion_kind:assertionKindSchema, expression_fingerprint:z.string().regex(/^[a-f0-9]{64}$/), duplicate_ordinal:z.number().int().nonnegative(),
  duplicate_count:z.number().int().positive(), requires_review:z.boolean(), byte_start:z.number().int().nonnegative(), byte_end:z.number().int().positive(),
  line:z.number().int().positive(), column:z.number().int().positive(), definition_hash:z.string().regex(/^[a-f0-9]{64}$/), extractor_revision:revision,
  canonical_authority:z.literal(false).default(false),
}).strict();
export const assertionResolutionSchema = z.object({
  schema:z.literal('atlas.assertion-resolution.v1').default('atlas.assertion-resolution.v1'), nomination_id:id, assertion_key:id,
  status:z.enum(['canonical','ambiguous','unresolved']), stable_assertion_id:id.nullable().optional(), registry_revision:revision,
  resolution_basis:z.enum(['exact_assertion_key','existing_alias','human_review','unresolved']), candidate_ids:z.array(id).default([]), evidence_refs:z.array(id).default([]),
}).strict().superRefine((v,ctx)=>{ if(v.status==='canonical'&&!v.stable_assertion_id)ctx.addIssue({code:z.ZodIssueCode.custom,path:['stable_assertion_id'],message:'canonical assertion resolution requires stable_assertion_id'}); });
export const assertionVersionSchema = z.object({
  schema:z.literal('atlas.assertion-version.v1').default('atlas.assertion-version.v1'), assertion_version_id:id, stable_assertion_id:id, stable_test_id:id,
  assertion_key:id, source_ref:z.string().min(1), source_revision:revision, assertion_kind:assertionKindSchema,
  expression_fingerprint:z.string().regex(/^[a-f0-9]{64}$/), duplicate_ordinal:z.number().int().nonnegative(), byte_start:z.number().int().nonnegative(),
  byte_end:z.number().int().positive(), line:z.number().int().positive(), column:z.number().int().positive(), definition_hash:z.string().regex(/^[a-f0-9]{64}$/), producer_revision:revision,
}).strict();

export type StaticAssertionObservationV1=z.infer<typeof staticAssertionObservationSchema>;
export type AssertionNominationV1=z.infer<typeof assertionNominationSchema>;
export type AssertionResolutionV1=z.infer<typeof assertionResolutionSchema>;
export type AssertionVersionV1=z.infer<typeof assertionVersionSchema>;

function stable(value:unknown):string{if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;if(value&&typeof value==='object')return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;return JSON.stringify(value)??'null';}
function hash(value:unknown):string{return createHash('sha256').update(stable(value),'utf8').digest('hex');}

/** Conservative textual canonicalizer used after AST has isolated one assertion call. */
export function normalizeAssertionExpression(value:string):string{
  return value.normalize('NFC')
    .replace(/\/\*[\s\S]*?\*\//g,' ')
    .replace(/\/\/[^\n]*/g,' ')
    .replace(/\s+/g,' ')
    .replace(/\s*([().,\[\]{}])\s*/g,'$1')
    .trim();
}

export function compileAssertionNominations(observationsInput:StaticAssertionObservationV1[]):AssertionNominationV1[]{
  const observations=observationsInput.map((i)=>staticAssertionObservationSchema.parse(i)).sort((a,b)=>a.byte_start-b.byte_start||a.byte_end-b.byte_end);
  const groups=new Map<string,StaticAssertionObservationV1[]>();
  for(const o of observations){const fp=hash(normalizeAssertionExpression(o.expression_text));const key=`${o.stable_test_id}\0${o.assertion_kind}\0${fp}`;const g=groups.get(key)??[];g.push(o);groups.set(key,g);}
  const out:AssertionNominationV1[]=[];
  for(const group of groups.values())for(let index=0;index<group.length;index+=1){const o=group[index]!;const fp=hash(normalizeAssertionExpression(o.expression_text));const key=`assertion-key:${hash([o.stable_test_id,o.assertion_kind,fp,index]).slice(0,40)}`;const def=hash({assertion_kind:o.assertion_kind,expressionFingerprint:fp,duplicate_ordinal:index});out.push(assertionNominationSchema.parse({nomination_id:`assertion-nomination:${hash([key,o.source_revision,def]).slice(0,40)}`,assertion_key:key,stable_test_id:o.stable_test_id,source_ref:o.source_ref,source_revision:o.source_revision,assertion_kind:o.assertion_kind,expression_fingerprint:fp,duplicate_ordinal:index,duplicate_count:group.length,requires_review:group.length>1,byte_start:o.byte_start,byte_end:o.byte_end,line:o.line,column:o.column,definition_hash:def,extractor_revision:o.extractor_revision,canonical_authority:false}));}
  return out.sort((a,b)=>a.byte_start-b.byte_start);
}
function stableAssertionId(n:AssertionNominationV1):string{return`assertion:${hash([n.stable_test_id,n.assertion_key]).slice(0,40)}`;}
function versionId(stableId:string,n:AssertionNominationV1):string{return`assertion-version:${hash([stableId,n.source_revision,n.definition_hash]).slice(0,40)}`;}
async function withClient<T>(pool:Pool,fn:(client:PoolClient)=>Promise<T>):Promise<T>{const client=await pool.connect();try{return await fn(client);}finally{client.release();}}

export function createAssertionRegistryRepository(pool:Pool){
  const resolveNomination=async(input:{nomination:AssertionNominationV1;registry_revision:string}):Promise<AssertionResolutionV1>=>withClient(pool,async(client)=>{const rows=await client.query<{stable_assertion_id:string;basis:string}>(`SELECT stable_assertion_id,basis FROM (SELECT stable_assertion_id,'exact_assertion_key'::text basis,1 priority FROM atlas_assertion_registry WHERE canonical_key=$1 AND status='active' UNION ALL SELECT a.stable_assertion_id,'existing_alias'::text basis,2 priority FROM atlas_assertion_aliases a JOIN atlas_assertion_registry r USING(stable_assertion_id) WHERE a.alias_key=$1 AND r.status='active')q ORDER BY priority,stable_assertion_id`,[input.nomination.assertion_key]);const ids=[...new Set(rows.rows.map(r=>r.stable_assertion_id))];if(ids.length===1)return assertionResolutionSchema.parse({nomination_id:input.nomination.nomination_id,assertion_key:input.nomination.assertion_key,status:'canonical',stable_assertion_id:ids[0],registry_revision:input.registry_revision,resolution_basis:rows.rows[0]?.basis==='exact_assertion_key'?'exact_assertion_key':'existing_alias',candidate_ids:ids});return assertionResolutionSchema.parse({nomination_id:input.nomination.nomination_id,assertion_key:input.nomination.assertion_key,status:ids.length>1?'ambiguous':'unresolved',registry_revision:input.registry_revision,resolution_basis:'unresolved',candidate_ids:ids});});
  return{resolveNomination,async promoteNomination(input:{nomination:AssertionNominationV1;registry_revision:string;producer_revision:string;allow_create:boolean;allow_duplicate_review?:boolean;evidence_refs?:string[]}):Promise<{resolution:AssertionResolutionV1;version:AssertionVersionV1}>{const n=assertionNominationSchema.parse(input.nomination);if(!input.allow_create)throw new Error('ASSERTION_PROMOTION_REQUIRES_EXPLICIT_ALLOW_CREATE');if(n.requires_review&&!input.allow_duplicate_review)throw new Error('ASSERTION_DUPLICATE_FINGERPRINT_REQUIRES_REVIEW');const existing=await resolveNomination({nomination:n,registry_revision:input.registry_revision});const sid=existing.status==='canonical'&&existing.stable_assertion_id?existing.stable_assertion_id:stableAssertionId(n);const vid=versionId(sid,n);await withClient(pool,async(client)=>{await client.query('BEGIN');try{await client.query(`INSERT INTO atlas_assertion_registry(stable_assertion_id,stable_test_id,canonical_key,assertion_kind,expression_fingerprint,created_from_nomination_id,created_from_source_revision,registry_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(stable_assertion_id) DO UPDATE SET updated_at=now(),registry_revision=EXCLUDED.registry_revision`,[sid,n.stable_test_id,n.assertion_key,n.assertion_kind,n.expression_fingerprint,n.nomination_id,n.source_revision,input.registry_revision]);await client.query(`INSERT INTO atlas_assertion_aliases(alias_key,stable_assertion_id,alias_kind,source_ref,source_revision,evidence_refs,registry_revision) VALUES($1,$2,'assertion_key',$3,$4,$5::jsonb,$6) ON CONFLICT(alias_key,stable_assertion_id) DO NOTHING`,[n.assertion_key,sid,n.source_ref,n.source_revision,JSON.stringify(input.evidence_refs??[]),input.registry_revision]);await client.query(`INSERT INTO atlas_assertion_versions(assertion_version_id,stable_assertion_id,stable_test_id,assertion_key,source_ref,source_revision,assertion_kind,expression_fingerprint,duplicate_ordinal,byte_start,byte_end,line,column_no,definition_hash,producer_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(assertion_version_id) DO NOTHING`,[vid,sid,n.stable_test_id,n.assertion_key,n.source_ref,n.source_revision,n.assertion_kind,n.expression_fingerprint,n.duplicate_ordinal,n.byte_start,n.byte_end,n.line,n.column,n.definition_hash,input.producer_revision]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}});return{resolution:assertionResolutionSchema.parse({nomination_id:n.nomination_id,assertion_key:n.assertion_key,status:'canonical',stable_assertion_id:sid,registry_revision:input.registry_revision,resolution_basis:existing.status==='canonical'?existing.resolution_basis:'human_review',candidate_ids:[sid],evidence_refs:input.evidence_refs??[]}),version:assertionVersionSchema.parse({assertion_version_id:vid,stable_assertion_id:sid,stable_test_id:n.stable_test_id,assertion_key:n.assertion_key,source_ref:n.source_ref,source_revision:n.source_revision,assertion_kind:n.assertion_kind,expression_fingerprint:n.expression_fingerprint,duplicate_ordinal:n.duplicate_ordinal,byte_start:n.byte_start,byte_end:n.byte_end,line:n.line,column:n.column,definition_hash:n.definition_hash,producer_revision:input.producer_revision})};}};
}
