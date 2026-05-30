#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

const argv = process.argv.slice(2)
const opts = { file: null, out: null, apply: false }
for (let i=0;i<argv.length;i++){
  const a=argv[i]
  if(a==='--file'&&argv[i+1]){opts.file=argv[++i];continue}
  if(a==='--out'&&argv[i+1]){opts.out=argv[++i];continue}
  if(a==='--apply') { opts.apply = true; continue }
}

if(!opts.file) {
  console.error('Usage: ndjson-to-csv.mjs --file <path.ndjson> [--out out.csv] [--apply]')
  process.exit(1)
}

if(!fs.existsSync(opts.file)) { console.error('File not found:', opts.file); process.exit(2) }

const lines = fs.readFileSync(opts.file,'utf8').split(/\r?\n/).filter(Boolean)
console.log('Lines:', lines.length)
if (!opts.apply) {
  console.log('[DRY RUN] showing inferred headers and first 3 rows')
}

function inferHeaders(sampleObjs){
  const keys = new Set()
  for(const o of sampleObjs){ Object.keys(o).forEach(k=>keys.add(k)) }
  return Array.from(keys)
}

const sample = lines.slice(0,20).map(l=>{ try{return JSON.parse(l)}catch(e){return {raw:l}} })
const headers = inferHeaders(sample)
console.log('Headers (sample):', headers)

if(!opts.out) opts.out = opts.file.replace(/\.ndjson$/, '.csv')

if(!opts.apply) {
  const rows = lines.slice(0,3).map(l=>{ try{return JSON.parse(l)}catch(e){return {raw:l}} })
  console.log('Sample rows:', rows)
  console.log('Would write to', opts.out)
  process.exit(0)
}

const outStream = fs.createWriteStream(opts.out, { encoding: 'utf8' })
outStream.write(headers.join(',') + '\n')
for(const line of lines){
  try{
    const obj = JSON.parse(line)
    const row = headers.map(h => {
      const v = obj[h]
      if (v === undefined || v === null) return ''
      if (typeof v === 'object') return '"' + JSON.stringify(v).replace(/"/g,'""') + '"'
      return String(v).replace(/"/g,'""')
    }).join(',')
    outStream.write(row + '\n')
  }catch(e){ /* skip */ }
}
outStream.end()
console.log('Wrote CSV to', opts.out)
