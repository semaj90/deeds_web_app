# Desktop Migration & Autonomous Research Architecture

To achieve true "Claude Code"-style autonomy where our Assistant can spin up hidden `tmux` sessions, traverse your local file system, and run background LLM-compilation tasks overnight (like Karpathy's `autoresearch`), we must break out of the browser sandbox.

Here are the three architectural paths to transition the `sveltekit-frontend` into a Desktop Application capable of autonomous deep research:

## Path A: The Electrobun Migration (Cutting Edge, High Effort)
[Electrobun](https://github.com/blackboard-sh/electrobun) uses the ultra-fast `bun` runtime in the background and the native OS Webview in the foreground, dropping the massive Chromium bloat of standard Electron.
* **The Catch:** SvelteKit must be stripped of its server-side `+server.ts` routes. We would have to use `@sveltejs/adapter-static` and rewrite all of our `/api/` routes (for the Database, Local Context, and Streaming) into Electrobun `RPC` calls.
* **The Benefit:** Incredible speed, native local memory, and 100% unrestricted access to your terminal and `tmux` bindings through Bun's powerful OS modules.

## Path B: The Tauri + Rust Proxy (Industry Standard, Medium Effort)
Tauri provides the same lightweight Webview architecture but uses Rust as the backend. 
* **The Catch:** You need to bridge Node.js to Rust if you want to keep your existing backend architecture.
* **The Benefit:** It is robust, battle-tested, and currently far more stable for integrating with complex SvelteKit SSR apps than the early stages of Electrobun.

## Path C: The "Headless Desktop" Approach (Low Effort, Immediate)
Keep SvelteKit exactly as it is running in your browser, but we write a new `/api/system/tmux` server endpoint. Use SvelteKit's existing Node server to natively spawn `child_process.exec('tmux new-session -d -s autonomous_agent')`. 
* **The Catch:** You are still handcuffed to opening localhost in the browser. 
* **The Benefit:** We can build the 31 tools and background research methodology *today* without refactoring the entire UI storage layer we just built. Node natively proxies the agent's OS-level commands perfectly.

---

## Deep Research Methodology (Next Steps)
Regardless of the path chosen, the goal is to emulate the 31 background tools by mapping specific host OS commands directly to the Contextual Agent:
1. `tmux_create_session(id)`
2. `ast_analyze_repo(path)`
3. `lint_file(path)`
4. `wiki_writeback(results)`
