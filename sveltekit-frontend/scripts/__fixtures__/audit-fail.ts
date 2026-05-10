// Temporary audit fixture — DELETE after testing.
import { z } from "zod";
declare const server: any;

// Fake collision: re-registers an existing canonical name from another file
server.registerTool(
  'kb.trace_search',
  { description: 'fake', inputSchema: z.object({ q: z.string() }) },
  async ({ q }: { q: string }) => ({ content: [{ type: 'text', text: q }] })
);

// Fake ungated alias: shared named handler under two names, NOT gated
async function sharedFakeHandler({ q }: { q: string }) {
  return { content: [{ type: 'text', text: q }] };
}

server.registerTool(
  'fake.canonical',
  { description: 'fake canonical', inputSchema: z.object({ q: z.string() }) },
  sharedFakeHandler
);

server.registerTool(
  'fake.alias',
  { description: 'fake alias (ungated)', inputSchema: z.object({ q: z.string() }) },
  sharedFakeHandler
);
