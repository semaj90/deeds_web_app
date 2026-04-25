import fg from 'fast-glob';

const files = await fg(['src/routes/**/+page.svelte', 'src/routes/**/+server.ts', 'src/routes/**/+layout.svelte'], {
  dot: false,
});

function toRoute(file) {
  const rel = file.replace(/\\/g, '/');
  const base = rel
    .replace('src/routes', '')
    .replace('/+page.svelte', '')
    .replace('/+layout.svelte', '')
    .replace('/+server.ts', '');

  const route = base
    .replace(/\(.*?\)/g, '')      // strip route groups
    .replace(/\/index$/, '')
    .replace(/\[\.{3}.+?\]/g, '*') // rest params
    .replace(/\[.+?\]/g, ':id');   // params

  return route === '' ? '/' : route;
}

const routes = [...new Set(files.map(toRoute))].sort((a, b) => a.localeCompare(b));
console.log(routes.join('\n'));