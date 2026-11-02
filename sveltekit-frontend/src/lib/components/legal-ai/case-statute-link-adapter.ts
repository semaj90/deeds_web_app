export interface CaseStatuteLink {
	id: string;
	case_id: string;
	statute_code: string;
	link_type: string;
	notes?: string;
	created_at: string;
	updated_at: string;
}

export function normalizeCaseStatuteLinks(value: unknown, caseId: string): CaseStatuteLink[] {
	const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	const rows = Array.isArray(payload.links)
		? payload.links
		: Array.isArray(payload.data)
			? payload.data
			: [];

	return rows.flatMap((row) => {
		if (!row || typeof row !== 'object') return [];
		const item = row as Record<string, unknown>;
		const createdAt = String(item.created_at ?? item.createdAt ?? '');
		return [{
			id: String(item.id ?? ''),
			case_id: String(item.case_id ?? item.caseId ?? caseId),
			statute_code: String(
				item.statute_code ?? item.statuteCode ?? item.statuteSection ?? item.statuteTitle ?? item.statuteId ?? '',
			),
			link_type: String(item.link_type ?? item.linkType ?? 'CITED_IN'),
			notes: typeof item.notes === 'string' ? item.notes : undefined,
			created_at: createdAt,
			updated_at: String(item.updated_at ?? item.updatedAt ?? createdAt),
		}];
	});
}

export function countCaseStatuteLinksByType(links: CaseStatuteLink[]): Record<string, number> {
	return links.reduce<Record<string, number>>((counts, link) => {
		counts[link.link_type] = (counts[link.link_type] ?? 0) + 1;
		return counts;
	}, {});
}
