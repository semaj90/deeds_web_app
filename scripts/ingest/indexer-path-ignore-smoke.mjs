const paths = [
  'src/lib/server/indexer/thing.ts',
  '.venv/Lib/site-packages/somepkg/module.py',
  'sveltekit-frontend/.venv/Lib/site-packages/torch/__init__.py',
  'venv/lib/site-packages/otherpkg/file.py',
  'src/__pycache__/module.cpython-39.pyc',
  'src/components/Button.svelte'
];

function shouldIgnore(relPath){
  if(!relPath) return false;
  const lp = relPath.replace(/\\\\/g,'/').toLowerCase();
  return (
    lp.includes('.venv/') ||
    lp.includes('/.venv/') ||
    lp.includes('/venv/') ||
    lp.startsWith('venv/') ||
    lp.includes('site-packages/') ||
    lp.includes('__pycache__/')
  );
}

for(const p of paths){
  console.log(p, '->', shouldIgnore(p) ? 'IGNORED' : 'INDEX');
}
