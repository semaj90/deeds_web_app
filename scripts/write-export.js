const fs = require("fs");
const target = "c:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/routes/api/cases/[id]/export/pdf/+server.ts";
const content = fs.readFileSync("c:/Users/james/Videos/deeds-web-app/scripts/export-content.txt", "utf8");
fs.writeFileSync(target, content);
console.log("Written", content.length, "chars");
