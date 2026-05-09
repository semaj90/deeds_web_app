const fs = require('fs');
const filePath = 'src/mcp/trace-mcp-server.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// Replace escaped backticks and template expressions
// Note: We need to be careful not to replace valid escapes if any exist, 
// but in this context, backslash-backtick is almost certainly a mistake from my previous scripts.
content = content.split('\\`').join('`');
content = content.split('\\${').join('${');

fs.writeFileSync(filePath, content);
console.log('Fixed escaped backticks in ' + filePath);
