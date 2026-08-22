/**
 * Parent Atlas OpenCode plugin entrypoint.
 *
 * The package primarily ships skills and commands, but TypeScript expects a
 * buildable module entry so the package can be compiled in isolation.
 */

export const parentAtlasOpenCodePlugin = {
  name: '@deeds/parent-atlas-opencode',
  skillsDir: './skills',
  commandsDir: './commands',
} as const;

export default parentAtlasOpenCodePlugin;
