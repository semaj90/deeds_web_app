const path = require('node:path');

const binding = require(path.join(
  __dirname,
  'atlas-packet-parser.win32-x64-msvc.node',
));

module.exports = binding;
