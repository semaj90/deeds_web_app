/**
 * Synthetic evidence-like frame + matching depth map (bright = near) as blob URLs, for demos and tests that
 * must work with no depth service running. Both images are drawn from the same shape list, so they are the
 * same frame by construction. Browser only (canvas); caller revokes via `revoke()`.
 */
export interface ReliefSamplePair {
	imageUrl: string;
	depthUrl: string;
	revoke: () => void;
}

export async function makeSampleReliefPair(): Promise<ReliefSamplePair> {
	const W = 640, H = 400;
	const mk = () => {
		const c = document.createElement('canvas');
		c.width = W;
		c.height = H;
		return [c, c.getContext('2d')!] as const;
	};
	const [ic, ix] = mk();
	const [dc, dx] = mk();

	const sky = ix.createLinearGradient(0, 0, 0, H);
	sky.addColorStop(0, '#5a7aa6');
	sky.addColorStop(1, '#c9b79a');
	ix.fillStyle = sky;
	ix.fillRect(0, 0, W, H);
	const far = dx.createLinearGradient(0, 0, 0, H);
	far.addColorStop(0, '#202020');
	far.addColorStop(1, '#707070');
	dx.fillStyle = far;
	dx.fillRect(0, 0, W, H);

	const shapes = [
		{ x: 90, y: 170, w: 150, h: 190, color: '#8a2f2f', depth: 235 },
		{ x: 300, y: 120, w: 130, h: 240, color: '#2f6a8a', depth: 170 },
		{ x: 470, y: 210, w: 130, h: 150, color: '#7a8a2f', depth: 205 }
	];
	for (const s of shapes) {
		ix.fillStyle = s.color;
		ix.fillRect(s.x, s.y, s.w, s.h);
		ix.strokeStyle = 'rgba(255,255,255,.35)';
		ix.strokeRect(s.x + 6, s.y + 6, s.w - 12, s.h - 12);
		const g = dx.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, 5, s.x + s.w / 2, s.y + s.h / 2, s.w);
		g.addColorStop(0, `rgb(${s.depth},${s.depth},${s.depth})`);
		g.addColorStop(1, `rgb(${s.depth - 50},${s.depth - 50},${s.depth - 50})`);
		dx.fillStyle = g;
		dx.fillRect(s.x, s.y, s.w, s.h);
	}

	const toUrl = (c: HTMLCanvasElement) =>
		new Promise<string>((res, rej) =>
			c.toBlob((b) => (b ? res(URL.createObjectURL(b)) : rej(new Error('toBlob failed'))), 'image/png')
		);
	const [imageUrl, depthUrl] = await Promise.all([toUrl(ic), toUrl(dc)]);
	return { imageUrl, depthUrl, revoke: () => { URL.revokeObjectURL(imageUrl); URL.revokeObjectURL(depthUrl); } };
}
