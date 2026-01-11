// CommonJS wrapper for ESM MCP helpers
const path = require("path");
const { pathToFileURL } = require("url");
// Patch: Point to the correct ESM build location in ../utils/
const esmPath = path.join(__dirname, "../utils/mcp-helpers.js");
const esmUrl = pathToFileURL(esmPath).href;

module.exports = new Proxy(
  {},
  {
    get: function (_, prop) {
      return async (...args) => {
        const mod = await import(esmUrl);
        // If the export is a function, call it
        if (typeof mod[prop] === "function") {
          return mod[prop](...args);
        }
        // If the export is an object (like commonMCPQueries), return it directly
        if (typeof mod[prop] === "object" && mod[prop] !== null) {
          return mod[prop];
        }
        throw new Error(`Export ${prop} not found in mcp-helpers.js`);
      };
    },
  }
);
