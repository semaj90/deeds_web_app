const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const base = 'c:/Users/james/Videos/deeds-web-app/sveltekit-frontend';

// Find all svelte files with broken transition directives (excluding _archive and routes_parked)
const files = execSync(
  `grep -rln "transitionfade\|transitionslide\|transitionfly\|transitionscale" --include="*.svelte" "${base}/src/"`,
  { encoding: 'utf8' }
).trim().split('\n').filter(f => !f.includes('_archive') && !f.includes('routes_parked'));

let totalFixed = 0;

for (const fullPath of files) {
  try {
    let content = fs.readFileSync(fullPath, 'utf8');
    const original = content;

    // Fix: transitionfade -> transition:fade (with optional params)
    content = content.replace(/transitionfade(\s*=\s*\{\{)/g, 'transition:fade$1');
    content = content.replace(/transitionfade(?=[>\s])/g, 'transition:fade');
    
    // Fix: transitionslide -> transition:slide (with optional params)
    content = content.replace(/transitionslide(\s*=\s*\{\{)/g, 'transition:slide$1');
    content = content.replace(/transitionslide(?=[>\s])/g, 'transition:slide');
    
    // Fix: transitionfly -> transition:fly (with optional params)
    content = content.replace(/transitionfly(\s*=\s*\{\{)/g, 'transition:fly$1');
    content = content.replace(/transitionfly(?=[>\s])/g, 'transition:fly');
    
    // Fix: transitionscale -> transition:scale (with optional params)
    content = content.replace(/transitionscale(\s*=\s*\{\{)/g, 'transition:scale$1');
    content = content.replace(/transitionscale(?=[>\s])/g, 'transition:scale');

    if (content !== original) {
      fs.writeFileSync(fullPath, content, 'utf8');
      totalFixed++;
      const relPath = fullPath.replace(base + '/', '').replace(base + '\', '');
      console.log('Fixed: ' + relPath);
    }
  } catch (err) {
    console.log('ERROR: ' + fullPath + ' - ' + err.message);
  }
}

console.log('\nTotal files fixed: ' + totalFixed);
