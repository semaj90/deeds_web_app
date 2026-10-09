#!/usr/bin/env node
/** Read-only KAG / OaK / ContextManifest proof preflight. Does NOT write data.
 * Usage: node scripts/atlas/prove-kag-oak-context-request-v1.mjs --packet-key=...
 * Fails closed until ontology storage owner and downstream joins are reconciled.
 */
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
const packetKey=process.argv.find(a=>a.startsWith('--packet-key='))?.slice('--packet-key='.length);
if (!packetKey || !/^[\w:./-]{1,256}$/.test(packetKey)) {
  console.error('USAGE: --packet-key=<revision-qualified existing packet key>');
  process.exitCode=2;
} else {
  const pool=new pg.Pool({connectionString:resolveDatabaseUrl(loadRepoEnv(process.env)),max:1});
  try {
    const client=await pool.connect();
    try {
      await client.query('BEGIN TRANSACTION READ ONLY ISOLATION LEVEL REPEATABLE READ');
      const columns=await client.query(`SELECT table_name,column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name,column_name`,
        [['atlas_ontology_tuples','atlas_ontology_linked_tuples']]);
      const byTable={};
      for(const row of columns.rows)(byTable[row.table_name]??=[]).push(row.column_name);
      const provenance=[];
      for(const table of ['atlas_ontology_tuples','atlas_ontology_linked_tuples']) {
        if(!byTable[table]?.includes('packet_key')) continue;
        const rows=await client.query(`SELECT tuple_id,packet_key FROM ${table} WHERE packet_key=$1 LIMIT 20`,[packetKey]);
        provenance.push({table,rows:rows.rows});
      }
      const report={
        schema:'atlas.kag.oak.context-proof-preflight.v1',requestPacketKey:packetKey,
        readOnly:true,transaction:'REPEATABLE READ READ ONLY',
        tables:Object.fromEntries(Object.entries(byTable).map(([table,cols])=>[table,{columns:cols}])),
        candidateTupleRows:provenance,
        status:'NOT_PROVEN',
        missing:[
          'Reconcile canonical ontology tuple write owner before selecting source table',
          'Revision-qualified grounded NLP fact and tuple join',
          'OaK resolver owner actual invocation and evidence refs',
          'Request-scoped retrieval lane and RRF candidate identity',
          'ContextManifest checksum, source spans and immutable readback'
        ]
      };
      console.log(JSON.stringify(report,null,2));
      await client.query('ROLLBACK');
    } finally {client.release();}
  } catch(e){console.error(JSON.stringify({status:'FAIL',reason:String(e)}));process.exitCode=1;}
  finally {await pool.end();}
}
