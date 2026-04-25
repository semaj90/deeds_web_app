import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit({
      inspector: false, // Disable inspector to avoid module resolution issues
    }),
  ],

  // Fabric.js optimization
  optimizeDeps: {
    include: ["fabric"],
  },

  // Canvas and file handling
  define: {
    global: "globalThis",
  },

  server: {
    fs: {
      allow: [".."],
    },
  },

  // Build optimization
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("fabric")) {
            return "fabric";
          }
        },
      },
    },
  },
});
