import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const icons = require('@iconify-json/lucide/icons.json');

// All icon names used in codebase (from grep/agent search)
const used = [
  'align-left','arrow-down-left','arrow-down-right','arrow-up-left','arrow-up-right',
  'bar-chart-2','braces','cable','check-circle','columns','construction','copy',
  'crosshair','crown','dna','eraser','file-question','file-stack','file-x','files',
  'focus','folders','git-compare-arrows','grid-3x3','history','layout-grid','list-tree',
  'magnet','mail','message','monitor','monitor-off','mouse-pointer-2','option','palette',
  'pen-tool','pin','play-circle','rotate-cw','scan-face','scroll','search-code','search-x',
  'send','server','shield-check','sliders','sliders-horizontal','split','sticky-note',
  'sun-moon','tags','timer','title','unlock','upload-cloud','user-x','volume-2','volume-x',
  'wrench','zap-off',
  // Also check names from sidebar/pages that might not be in safelist
  'fingerprint','folder','folder-open','layout-dashboard','scroll-text','library-big',
  'book-open-text','scan-search','landmark','gamepad-2','book-open','radio','library',
  'users','search','brain','terminal','map','shield','settings','network','share-2',
  'bug','bot','database','chevron-left','chevron-right',
  // Additional from full list
  'activity','alert-circle','alert-triangle','archive','arrow-left','arrow-right',
  'bar-chart','bar-chart-3','bold','bookmark','book-text','briefcase','calendar',
  'camera','check','chevron-down','chevron-up','circle-check','circle-x','clipboard-list',
  'clock','code','command','cpu','dollar-sign','download','edit','external-link',
  'eye','eye-off','file','file-check','file-code','file-image','file-json','file-plus',
  'file-spreadsheet','file-text','file-up','filter','folder-search','folder-tree',
  'gavel','git-branch','git-compare','globe','grid-2x2','hard-drive','hash',
  'heading-1','heading-2','heart','home','image','inbox','info','italic','keyboard',
  'layers','layout','lightbulb','link','link-2','list','list-ordered','loader','loader-2',
  'lock','map-pin','maximize','maximize-2','message-circle','message-square','mic',
  'mic-off','minimize','more-vertical','move','notebook-pen','paperclip','pause',
  'pause-circle','pencil','percent','phone','play','plus','quote','radar','redo','redo-2',
  'refresh-cw','replace','rotate-ccw','save','scale','scan','sparkles','square','star',
  'star-off','tag','target','thumbs-down','thumbs-up','trash-2','trending-up',
  'triangle-alert','type','undo','undo-2','upload','user','user-cog','video','wand-2',
  'wifi','wifi-off','x','x-circle','zap','zoom-in','zoom-out'
];

const safelisted = new Set([
  'activity','alert-circle','alert-triangle','archive','arrow-left','arrow-right',
  'bar-chart','bar-chart-3','bell','bold','book-open','book-open-text','book-text',
  'bookmark','bot','brain','briefcase','bug','calendar','camera','check','check-circle',
  'chevron-down','chevron-left','chevron-right','chevron-up','circle','circle-check',
  'circle-x','clipboard-check','clipboard-list','clock','code','command','copy','cpu',
  'database','dollar-sign','download','edit','external-link','eye','eye-off','file',
  'file-check','file-code','file-image','file-json','file-plus','file-spreadsheet',
  'file-text','file-up','filter','fingerprint','folder','folder-open','folder-search',
  'folder-tree','gamepad-2','gavel','git-branch','git-compare','globe','grid-2x2',
  'hard-drive','hash','heading-1','heading-2','headphones','heart','help-circle','home',
  'image','inbox','info','italic','keyboard','landmark','layers','layout',
  'layout-dashboard','library','library-big','lightbulb','link','link-2','list',
  'list-ordered','loader','loader-2','lock','mail','map','map-pin','maximize','maximize-2',
  'message-circle','message-square','mic','mic-off','minimize','moon','more-vertical',
  'move','music','network','notebook-pen','panel-left','paperclip','pause','pause-circle',
  'pencil','percent','phone','play','plus','quote','radar','radio','redo','redo-2',
  'refresh-cw','replace','rotate-ccw','save','scale','scan','scan-search','scroll-text',
  'search','send','settings','share-2','shield','shield-alert','skip-back','skip-forward',
  'sort-asc','sort-desc','sparkles','square','star','star-off','sun','tag','target',
  'terminal','thumbs-down','thumbs-up','trash-2','trending-down','trending-up',
  'triangle-alert','type','undo','undo-2','upload','upload-cloud','user','user-cog',
  'users','video','wand-2','wifi','wifi-off','x','x-circle','zap','zoom-in','zoom-out'
]);

const uniqueUsed = [...new Set(used)];
const missingValid = [];
const missingInvalid = [];

for (const name of uniqueUsed) {
  if (!safelisted.has(name)) {
    if (icons.icons[name]) {
      missingValid.push(name);
    } else {
      missingInvalid.push(name);
    }
  }
}

console.log('=== VALID LUCIDE ICONS MISSING FROM SAFELIST ===');
missingValid.sort().forEach(n => console.log(`  i-lucide-${n}`));
console.log(`Total: ${missingValid.length}`);
console.log('');
console.log('=== USED BUT NOT VALID LUCIDE ICONS (data props, not real icons) ===');
missingInvalid.sort().forEach(n => console.log(`  ${n}`));
console.log(`Total: ${missingInvalid.length}`);
console.log('');

// Also check: icons in safelist that DON'T exist in @iconify-json/lucide
const safelistArr = [...safelisted];
const phantomSafelist = safelistArr.filter(n => !icons.icons[n]);
if (phantomSafelist.length) {
  console.log('=== PHANTOM SAFELIST ENTRIES (not in @iconify-json/lucide) ===');
  phantomSafelist.sort().forEach(n => console.log(`  i-lucide-${n} (WILL NOT RENDER)`));
  console.log(`Total: ${phantomSafelist.length}`);
}
