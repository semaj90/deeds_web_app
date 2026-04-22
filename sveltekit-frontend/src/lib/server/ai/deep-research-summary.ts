import type { Interactions } from '@google/genai';

export interface DeepResearchImageOutput {
	src: string | null;
	uri: string | null;
	mimeType: string | null;
	resolution: string | null;
}

export interface DeepResearchInteractionSummary {
	provider: 'google-deep-research';
	interactionId: string;
	status: string;
	createdAt: string;
	updatedAt: string;
	durationMs: number | null;
	textOutput: string;
	thoughtSummaries: string[];
	imageCount: number;
	images: DeepResearchImageOutput[];
	error: {
		code: number | null;
		message: string;
	} | null;
}

export function summarizeDeepResearchInteraction(interaction: Interactions.Interaction): DeepResearchInteractionSummary {
	const outputs = Array.isArray(interaction.outputs) ? interaction.outputs : [];
	const interactionError = (interaction as { error?: { code?: number; message?: string } }).error ?? null;

	const textOutput = outputs
		.reduce<string[]>((texts, output) => {
			if (output.type === 'text') {
				const text = output.text?.trim();
				if (text) texts.push(text);
			}
			return texts;
		}, [])
		.join('\n\n');

	const thoughtSummaries = outputs
		.map((output) => {
			if (output.type !== 'thought' || !Array.isArray(output.summary)) return '';
			return output.summary
				.reduce<string[]>((texts, part) => {
					if (part.type === 'text') {
						const text = part.text?.trim();
						if (text) texts.push(text);
					}
					return texts;
				}, [])
				.join(' ')
				.trim();
		})
		.filter((summary): summary is string => Boolean(summary));

	const images = outputs.reduce<DeepResearchImageOutput[]>((assets, output) => {
		if (output.type !== 'image') return assets;

		const uri = output.uri?.trim() || null;
		const mimeType = output.mime_type ?? null;
		const src = output.data && mimeType
			? `data:${mimeType};base64,${output.data}`
			: uri;

		assets.push({
			src: src || null,
			uri,
			mimeType,
			resolution: output.resolution ?? null,
		});
		return assets;
	}, []);

	const createdAt = Date.parse(interaction.created);
	const updatedAt = Date.parse(interaction.updated);
	const durationMs = Number.isFinite(createdAt) && Number.isFinite(updatedAt)
		? Math.max(0, updatedAt - createdAt)
		: null;

	return {
		provider: 'google-deep-research',
		interactionId: interaction.id,
		status: interaction.status,
		createdAt: interaction.created,
		updatedAt: interaction.updated,
		durationMs,
		textOutput,
		thoughtSummaries,
		imageCount: images.length,
		images,
		error: interactionError
			? {
				code: interactionError.code ?? null,
				message: interactionError.message ?? 'Unknown Deep Research error',
			}
			: null,
	};
}