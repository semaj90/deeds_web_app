const fs=require("fs");
const path=require("path");
const B="c:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/components";
function fix(r,reps){const fp=path.join(B,r);let c=fs.readFileSync(fp,"utf8");const o=c;for(const[f,t]of reps){if(!c.includes(f)){console.log("WARN not found: "+f.slice(0,50));continue;}c=c.replace(f,t);}if(c!==o){fs.writeFileSync(fp,c);console.log("FIXED: "+r);}else{console.log("SKIP: "+r);}}
