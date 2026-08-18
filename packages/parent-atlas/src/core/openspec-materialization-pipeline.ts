import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { ingestOpenSpecRepository } from './openspec-repository-ingestion.js';
import { materializeOpenSpecDocument } from './canonical-evidence-materializers.js';

const revision=z.string().min(1);
export const openSpecMaterializationBatchReceiptSchema=z.object({schema:z.literal('atlas.openspec-materialization-batch-receipt.v1').default('atlas.openspec-materialization-batch-receipt.v1'),workspace_revision:revision,ingestion_checksum:z.string().regex(/^[a-f0-9]{64}$/),document_count:z.number().int().nonnegative(),materialized_count:z.number().int().nonnegative(),failed_count:z.number().int().nonnegative(),allow_partial:z.boolean(),atomic:z.boolean(),documents:z.array(z.object({source_ref:z.string().min(1),source_revision:revision,evidence_id:z.string().min(1),fact_count:z.number().int().nonnegative(),rename_count:z.number().int().nonnegative()}).strict()),failures:z.array(z.object({source_ref:z.string().min(1),error:z.string().min(1)}).strict()),output_checksum:z.string().regex(/^[a-f0-9]{64}$/),producer_revision:revision}).strict();
export type OpenSpecMaterializationBatchReceiptV1=z.infer<typeof openSpecMaterializationBatchReceiptSchema>;
function stable(value:unknown):string{if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;if(value&&typeof value==='object')return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;return JSON.stringify(value)??'null';}
function checksum(value:unknown):string{return createHash('sha256').update(stable(value),'utf8').digest('hex');}

export async function ingestAndMaterializeOpenSpecRepository(pool:Pool,input:{repo_root:string;workspace_revision:string;openspec_roots?:string[];producer_revision:string;allow_partial?:boolean}):Promise<OpenSpecMaterializationBatchReceiptV1>{
  const allowPartial=input.allow_partial??false;
  const ingestion=await ingestOpenSpecRepository({repo_root:input.repo_root,workspace_revision:input.workspace_revision,openspec_roots:input.openspec_roots,producer_revision:input.producer_revision,fail_on_document_error:!allowPartial});
  if(!allowPartial&&ingestion.receipt.failed_count>0)throw new Error(`OPENSPEC_INGESTION_PARTIAL_REJECTED:${ingestion.receipt.failed_count}`);
  const documents:Array<{source_ref:string;source_revision:string;evidence_id:string;fact_count:number;rename_count:number}>=[];
  const failures=[...ingestion.receipt.failures];

  if(!allowPartial){
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      for(const document of ingestion.documents){const result=await materializeOpenSpecDocument(pool,{document,producer_revision:input.producer_revision,db_client:client});documents.push({source_ref:document.source_ref,source_revision:document.source_revision,evidence_id:result.evidence_id,fact_count:result.fact_count,rename_count:document.receipt.rename_count});}
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }else{
    for(const document of ingestion.documents){try{const result=await materializeOpenSpecDocument(pool,{document,producer_revision:input.producer_revision});documents.push({source_ref:document.source_ref,source_revision:document.source_revision,evidence_id:result.evidence_id,fact_count:result.fact_count,rename_count:document.receipt.rename_count});}catch(error){failures.push({source_ref:document.source_ref,error:error instanceof Error?error.message:String(error)});}}
  }

  return openSpecMaterializationBatchReceiptSchema.parse({workspace_revision:input.workspace_revision,ingestion_checksum:ingestion.receipt.output_checksum,document_count:ingestion.documents.length,materialized_count:documents.length,failed_count:failures.length,allow_partial:allowPartial,atomic:!allowPartial,documents,failures,output_checksum:checksum({ingestion:ingestion.receipt.output_checksum,documents,failures,atomic:!allowPartial}),producer_revision:input.producer_revision});
}
