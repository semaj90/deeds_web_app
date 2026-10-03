import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * PACKET-CLASS-LUT (the "byte/nibble class table" from Addendum 9's
 * ROM-bank/cartridge framing — see openspec/changes/parent-atlas-memory-architecture-freeze/
 * proposal.md Addendum 9, and memory/reference_pokemon_rombank_lod_frame.md).
 *
 * This is a PRESENTATION/COMPRESSION layer, never identity and never the
 * ontology itself:
 * - It does NOT decide what the label set is (domain vocabulary, packet kind,
 *   cache tier, etc). That decision belongs to whichever contract already
 *   owns that vocabulary (e.g. this repo currently has THREE competing,
 *   still-undecided domain vocabularies per CLAUDE.md's Schema Tournament
 *   section — this module must never bake in one of them as "the" set).
 * - It does NOT invent a numbering scheme (no "dex 0-151" style hardcoding).
 *   Byte codes are assigned deterministically from the caller's own label
 *   set (lexicographic sort), so the same set always produces the same LUT.
 * - `canonicalAuthority` is always `false`. A `PacketClassLutV1` is a
 *   compact *view* of an already-decided label set (`sourceLabelSetChecksum`
 *   pins exactly which set), keyed by `encodingRevision` so a consumer can
 *   detect drift and refuse to decode against a stale table rather than
 *   silently mis-decoding.
 *
 * Where this is meant to be used (not wired here — this module only builds
 * and validates the LUT itself): shrinking a repeated label string down to
 * one byte inside compact packet encodings (scripts/atlas/build-compressed-
 * packets.mjs's `{s,f,t,q,k}` shape), BitFrost/centroid cache-key suffixes,
 * and ACE JSON packet fields that currently repeat a long label string per
 * candidate. Any such wiring must carry `encodingRevision` alongside the
 * byte value so a reader can verify the byte was decoded against the same
 * table that encoded it.
 */

export const PacketClassLutEntrySchema = z
  .object({
    label: z.string().min(1),
    code: z.number().int().min(0).max(255), // uint8 — one-byte class code
  })
  .strict();

export const PacketClassLutV1Schema = z
  .object({
    schema: z.literal('atlas.packet-class-lut.v1'),
    encodingRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sourceLabelSetChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    entries: z.array(PacketClassLutEntrySchema).min(1).max(256),
    canonicalAuthority: z.literal(false),
  })
  .strict();

export type PacketClassLutEntry = z.infer<typeof PacketClassLutEntrySchema>;
export type PacketClassLutV1 = z.infer<typeof PacketClassLutV1Schema>;

export class DuplicateLutLabelError extends Error {}
export class LutOverflowError extends Error {}
export class EmptyLutLabelSetError extends Error {}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/**
 * Builds a deterministic one-byte LUT from a caller-supplied, already-decided
 * label set. Input order never affects the result: labels are de-duplicated,
 * sorted, then assigned codes 0..N-1 in sorted order, so re-running this on
 * the exact same set (in any order) always yields the same
 * `encodingRevision` and the same label->code assignment.
 *
 * Throws rather than silently coercing on: an empty set, duplicate labels
 * (a caller bug, not a valid vocabulary), or a set exceeding 256 entries
 * (does not fit a one-byte code — the caller needs a wider encoding, not a
 * truncated LUT).
 */
export function buildPacketClassLutV1(labels: readonly string[]): PacketClassLutV1 {
  if (labels.length === 0) {
    throw new EmptyLutLabelSetError('PacketClassLutV1 requires at least one label');
  }
  const unique = new Set(labels);
  if (unique.size !== labels.length) {
    throw new DuplicateLutLabelError(
      `Duplicate labels in input set: ${labels.length - unique.size} duplicate(s) found among ${labels.length} entries`,
    );
  }
  if (unique.size > 256) {
    throw new LutOverflowError(`${unique.size} labels exceeds one-byte LUT capacity of 256`);
  }

  const sorted = [...unique].sort();
  const sourceLabelSetChecksum = sha256(JSON.stringify(sorted));
  const entries: PacketClassLutEntry[] = sorted.map((label, code) => ({ label, code }));
  const encodingRevision = sha256(JSON.stringify({ schema: 'atlas.packet-class-lut.v1', entries }));

  return {
    schema: 'atlas.packet-class-lut.v1',
    encodingRevision,
    sourceLabelSetChecksum,
    entries,
    canonicalAuthority: false,
  };
}

/** Returns the one-byte code for a label, or null if the label isn't in this LUT. */
export function lutEncode(lut: PacketClassLutV1, label: string): number | null {
  return lut.entries.find((entry) => entry.label === label)?.code ?? null;
}

/** Returns the label for a one-byte code, or null if the code isn't in this LUT. */
export function lutDecode(lut: PacketClassLutV1, code: number): string | null {
  return lut.entries.find((entry) => entry.code === code)?.label ?? null;
}

/**
 * True only if rebuilding the LUT from `labels` right now produces the exact
 * same `encodingRevision` already stamped on `lut`. A caller holding a
 * `code` alongside an `encodingRevision` should call this (or an equivalent
 * revision comparison) before trusting `lutDecode` — decoding a byte against
 * a LUT built from a label set that has since changed (a label added,
 * removed, or renamed) can silently return the wrong label.
 */
export function isLutRevisionCurrent(lut: PacketClassLutV1, labels: readonly string[]): boolean {
  try {
    return buildPacketClassLutV1(labels).encodingRevision === lut.encodingRevision;
  } catch {
    return false;
  }
}
