const fs=require('fs');
const path=require('path');
const file=path.resolve(process.cwd(),'sveltekit-tsc-output.txt');
if(!fs.existsSync(file)){console.error('No tsc output file found:',file);process.exit(2);}
const text=fs.readFileSync(file,'utf8');
const regex=/(^|\n)([^\n:]+\.(ts|js))(?=\(|:)/g;
const counts={};
for(const m of text.matchAll(regex)){
  const f=m[2].trim();
  counts[f]=(counts[f]||0)+1;
}
const arr=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);
if(arr.length===0){console.log('No files found in output'); process.exit(0);}
for(const [filePath,count] of arr){ console.log(String(count).padStart(5),' ',filePath); }
