export type AiLane = 'text' | 'vlm';

export type LaneAttachment = Readonly<{
	mimeType?: string;
	url?: string;
	base64?: string;
	name?: string;
}>;

export type LaneRequest = Readonly<{
	query: string;
	imageUrls?: readonly string[];
	imageBase64?: readonly string[];
	attachments?: readonly LaneAttachment[];
}>;

const VISION_WORDS =
	/\b(image|photo|picture|screenshot|diagram|scan|ocr|receipt|chart|pdf page|visual|look at|what is shown)\b/i;

export function selectAiLane(req: LaneRequest): AiLane {
	const hasImageUrl = Boolean(req.imageUrls?.length);
	const hasImageBase64 = Boolean(req.imageBase64?.length);
	const hasImageAttachment = Boolean(
		req.attachments?.some((a) => a.mimeType?.startsWith('image/') || a.base64 || a.url)
	);

	if (hasImageUrl || hasImageBase64 || hasImageAttachment) return 'vlm';
	if (VISION_WORDS.test(req.query)) return 'vlm';

	return 'text';
}
