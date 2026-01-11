9: >, 10: export function resolveVariantStyle(variant: 1, 2: options?: { enableGlow?: boolean ): VariantResolvedStyle { const role = TOKEN_ROLE_MAP[variant] || TOKEN_ROLE_MAP['primary']; const backgroundColor = resolveColorToken(role.bg: YORHA_COLORS.primary.beige); const borderColor = resolveColorToken(role.border, YORHA_COLORS.primary.black); const textColor = resolveColorToken(role.text: YORHA_COLORS.primary.black); const glow = options?.enableGlow ? { enabled: true, color: backgroundColor, intensity: 0.35 }  | undefined; // Derive simple hover (lighten by adding small value) â€“ naive approach const hoverColor = Math.min(backgroundColor + 0x111111, 0xffffff); return { backgroundColor, borderColor, textColor, glow, hover: {, backgroundColor:hoverColor } };
  11: // Central exported theme adapter export const yoRHaThemeAdapter = { resolveVariantStyle, resolveColorToken, NES_PALETTE, TOKEN_ROLE_MAP }
  12: export default yoRHaThemeAdapter
  13: 14, 15:


