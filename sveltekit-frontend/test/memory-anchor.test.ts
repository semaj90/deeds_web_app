// sveltekit-frontend/test/memory-anchor.test.ts
import { toMemoryAnchor, MemoryAnchor } from '$lib/server/memory/memory-anchor';

describe('MemoryAnchor: Memory Anchor Protocol Validation', () => {
  it('should correctly compact a large, verbose session transcript into a minimal MemoryAnchor object', () => {
    // ARRANGE: Simulate a complex, verbose agent session log, including thinking blocks and raw output.
    const verboseTranscript = `
      Thinking: This is a very long, detailed, and highly verbose thought block that contains unnecessary reasoning and multiple failed attempts. The goal of this session was to determine the core architectural drift between the schema. We initially thought we needed to change everything, which was a huge blocker. A decision was made to only focus on type mismatches. We used the 'rg' command to find the files, and we also ran a dummy docker command. The primary evidence file was evidence_items. The next action is to run a migration script. This entire block should be discarded.
      
      --- Tool Output ---
      The result shows a critical blocker: parent_atlas_documents.id is bigint but schema expects integer.
      A decision was made to treat this as a critical blocker.
      We successfully used the 'atlas-tools-build-recommendation' tool.
      
      The next action is to update the Drizzle schema. We should also run a next step to validate the change.
      
      A potential blocker is that the original command used was: 'SELECT * FROM evidence WHERE user_id = current_user_id()'. We decided to change this to use a UUID check instead.
      
      // The end of the relevant context.
    `;

    // ACT: Generate the anchor
    const anchor: MemoryAnchor = toMemoryAnchor(verboseTranscript);

    // ASSERT: Check for the minimal, expected structure
    
    // 1. Check fundamental structure and type
    expect(anchor).toBeDefined();
    expect(typeof anchor.objective).toBe('string');
    expect(Array.isArray(anchor.decisions)).toBe(true);
    expect(Array.isArray(anchor.blockers)).toBe(true);
    expect(Array.isArray(anchor.files)).toBe(true);
    expect(Array.isArray(anchor.nextActions)).toBe(true);

    // 2. Check for compression and content quality
    expect(anchor.objective.length).toBeLessThan(240); // Check objective length limit
    expect(anchor.decisions.length).toBeLessThanOrEqual(8); // Check max decision count
    expect(anchor.blockers.length).toBeLessThanOrEqual(5); // Check max blocker count
    
    // Check if the core elements were extracted (e.g., 'evidence' should be in files)
    expect(anchor.files).toContain('evidence_items.ts'); 
    
    // Check that the 'Thinking:' text was removed from the final string content.
    expect(anchor.objective).not.toContain('Thinking:');
  });

  it('should handle simple, clean input correctly', () => {
    const cleanInput = `
      Objective: The goal was to update the connection logic.
      Decision: We decided to use the new streaming API instead of generateText().
      Blocker: The current block is broken.
      Files: src/lib/server/db/schema.ts
      Commands: pnpm run dev
      Next Actions: next step is to commit.
    `;

    const anchor: MemoryAnchor = toMemoryAnchor(cleanInput);

    expect(anchor.objective).toContain('The goal was to update');
    expect(anchor.decisions).toContain('We decided to use the new streaming API instead of generateText()');
    expect(anchor.blockers).toContain('The current block is broken.');
  });
});