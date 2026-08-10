import fs from 'node:fs';
import path from 'node:path';

export class StageProfiler {
  constructor(reportPath) { this.reportPath=reportPath; this.stages=[]; }
  start(name,inputCount=null) {
    const rec={name,startedAt:new Date().toISOString(),startedNs:process.hrtime.bigint(),inputCount};
    this.stages.push(rec); return rec;
  }
  end(rec,outputCount=null,status='ok') {
    const end=process.hrtime.bigint();
    rec.completedAt=new Date().toISOString(); rec.elapsedMs=Number(end-rec.startedNs)/1e6;
    rec.outputCount=outputCount; rec.status=status; delete rec.startedNs; return rec;
  }
  write(extra={}) {
    fs.mkdirSync(path.dirname(this.reportPath),{recursive:true});
    const payload={schema:'atlas.graph_refresh_profile.v1',generatedAt:new Date().toISOString(),stages:this.stages,...extra};
    const tmp=`${this.reportPath}.tmp-${process.pid}`;
    fs.writeFileSync(tmp,JSON.stringify(payload,null,2)); fs.renameSync(tmp,this.reportPath);
    return payload;
  }
}
