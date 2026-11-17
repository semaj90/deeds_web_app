/** Parse FFmpeg showinfo `pts_time` values in extraction order. */
export function parseFfmpegPresentationTimestampsV1(stderr: string): number[] {
	return [...stderr.matchAll(/pts_time:([-+]?\d+(?:\.\d+)?)/g)]
		.map((match) => Number(match[1]))
		.filter(Number.isFinite);
}
