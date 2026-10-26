const path = require('node:path');
const addon = require(path.resolve(__dirname, '../build/atlas_native_core.node'));
console.log('EXPORTS:', Object.keys(addon).sort());
console.log('LOD assembler type:', typeof addon.assembleLodTextureBlockV1);
