const fs = require('fs');
const b = 'c:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/components';
function fix(p, pairs) {
  let c = fs.readFileSync(p, "utf-8");
  let n = 0;
  for (const [a, b2, all] of pairs) {
    const prev = c;
    c = all ? c.replaceAll(a, b2) : c.replace(a, b2);
    if (c !== prev) n++;
  }
  fs.writeFileSync(p, c, "utf-8");
  return n;
}