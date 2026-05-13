const { existsSync } = require('fs');
const { join } = require('path');

let nativeBinding = null;
const path = join(__dirname, 'hmm-repair.win32-x64-msvc.node');

if (existsSync(path)) {
  nativeBinding = require(path);
} else {
  throw new Error(`Native binding not found at ${path}`);
}

module.exports = nativeBinding;
