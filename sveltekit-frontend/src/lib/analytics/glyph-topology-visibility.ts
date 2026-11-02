export function hasGlyphTopology(totalGlyphs: unknown): boolean {
	return typeof totalGlyphs === 'number' && Number.isFinite(totalGlyphs) && totalGlyphs > 0;
}
