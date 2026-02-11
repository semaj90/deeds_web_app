const fs = require("fs");
const text = fs.readFileSync("c:/Users/james/Videos/deeds-web-app/sc-out.txt", "utf8");
const lines = text.split("
");
const counts = {};
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const pathMatch = line.match(/sveltekit-frontend[\/](.+?):d+:d+/);
  if (pathMatch) {
    const nextLines = lines.slice(i, i + 3).join(" ");
    if (nextLines.includes("Error")) {
      const filePath = pathMatch[1].replace(/\/g, "/");
      counts[filePath] = (counts[filePath] || 0) + 1;
    }
  }
}
const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 30);
sorted.forEach(([file, count]) => {
  console.log(String(count).padStart(6) + " " + file);
});
console.log("
Total unique files with errors:", Object.keys(counts).length);
console.log("Total errors counted:", Object.values(counts).reduce((a, b) => a + b, 0));
