const pkg = require('./package.json');
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
console.log('Checking for invalid version strings...');
let hasInvalid = false;
for (const [name, version] of Object.entries(deps)) {
  if (!version || typeof version !== 'string' || version.trim() === '') {
    console.log('INVALID:', name, '=', version);
    hasInvalid = true;
  }
}
if (!hasInvalid) console.log('All version strings appear valid');
console.log('Total deps:', Object.keys(deps).length);
