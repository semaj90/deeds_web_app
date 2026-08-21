import { pathToFileURL } from 'node:url';

const originalPg = 'C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/node_modules/pg/lib/index.js';

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'pg') {
    return { url: pathToFileURL(originalPg).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
