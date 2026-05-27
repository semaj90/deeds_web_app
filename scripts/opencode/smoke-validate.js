const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const checks = [];

function mustExist(rel){
  const p = path.join(ROOT, rel);
  checks.push(() => {
    if(!fs.existsSync(p)) throw new Error(`${rel} not found`);
    return JSON.parse(fs.readFileSync(p,'utf8'));
  });
}

mustExist('.opencode/ace-context.json');
mustExist('.opencode/ace-patch-card.json');
mustExist('.opencode/feature-map/ace-context.json');
mustExist('.opencode/feature-map/ace-context-patch-card.json');

(async()=>{
  try{
    const [aceCtx, acePatch, featMap, featPatch] = checks.map(fn=>fn());

    // Basic structural checks
    if(typeof aceCtx !== 'object') throw new Error('ace-context.json invalid');
    if(typeof acePatch !== 'object') throw new Error('ace-patch-card.json invalid');
    if(featMap.feature !== 'ace-context') {
      // tolerate capitalization
      if(String(featMap.feature).toLowerCase() !== 'ace-context') throw new Error('feature-map feature mismatch');
    }
    // featPatch should have patchCard or patchCard.type
    const fp = featPatch.patchCard || featPatch;
    if(!fp.type && !(fp.patchCard && fp.patchCard.type)) throw new Error('feature patch-card missing type');

    // ace-patch-card should include id or content_hash
    if(!acePatch.id && !acePatch.content_hash && !(acePatch.patchCard && (acePatch.patchCard.id || acePatch.patchCard.content_hash))){
      throw new Error('ace-patch-card.json missing id/content_hash');
    }

    console.log('SMOKE OK: all opencode JSON exist and basic keys present');
    process.exit(0);
  }catch(err){
    console.error('SMOKE FAIL:', err.message);
    process.exit(2);
  }
})();
