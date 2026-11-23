import { describe, expect, it } from 'vitest';
import { createRetroRenderTargetV1 } from './retro-render-target-v1.js';

class FakeWebGLRenderTarget {
	disposed = false;
	texture: { name: string; colorSpace: unknown } = { name: '', colorSpace: null };
	constructor(readonly width: number, readonly height: number, readonly options: Record<string, unknown>) {}
	dispose() { this.disposed = true; }
}
class FakeShaderMaterial { disposed = false; constructor(readonly opts: unknown) {} dispose() { this.disposed = true; } }
class FakeScene { children: unknown[] = []; add(c: unknown) { this.children.push(c); } }
class FakeMesh { constructor(readonly geometry: any, readonly material: any) {} }
class FakePlaneGeometry { disposed = false; constructor(readonly w: number, readonly h: number) {} dispose() { this.disposed = true; } }
class FakeOrthographicCamera { constructor(...args: number[]) { void args; } }

const three = {
	WebGLRenderTarget: FakeWebGLRenderTarget,
	ShaderMaterial: FakeShaderMaterial,
	Scene: FakeScene,
	Mesh: FakeMesh,
	PlaneGeometry: FakePlaneGeometry,
	OrthographicCamera: FakeOrthographicCamera,
	NearestFilter: 1,
	NoColorSpace: 'none',
};

function fakeRenderer() {
	const calls: string[] = [];
	let current: unknown = null;
	return {
		calls,
		getRenderTarget: () => current,
		setRenderTarget(t: unknown) { current = t; calls.push(t === null ? 'target:default' : `target:${(t as FakeWebGLRenderTarget).width}x${(t as FakeWebGLRenderTarget).height}`); },
		render(scene: unknown) { calls.push(`render:${(scene as FakeScene).children.length > 0 ? 'quad' : 'scene'}`); },
		readPixels() { calls.push('readPixels'); },
	};
}

describe('retro render target v1', () => {
	it('creates a 320x180 target with nearest filters and no mipmaps', () => {
		const rt = createRetroRenderTargetV1(three);
		const t = rt.target as FakeWebGLRenderTarget;
		expect([t.width, t.height]).toEqual([320, 180]);
		expect(t.options).toMatchObject({ minFilter: 1, magFilter: 1, generateMipmaps: false });
		expect(rt.config.readbackPerFrame).toBe(false);
	});

	it('renders the scene into the target and restores the default framebuffer', () => {
		const rt = createRetroRenderTargetV1(three);
		const r = fakeRenderer();
		rt.renderScene(r, new FakeScene(), {});
		expect(r.calls).toEqual(['target:320x180', 'render:scene', 'target:default']);
	});

	it('presents the target through a fullscreen pass on the default framebuffer', () => {
		const rt = createRetroRenderTargetV1(three);
		const r = fakeRenderer();
		rt.present(r);
		expect(r.calls).toEqual(['target:default', 'render:quad']);
	});

	it('never reads pixels back during a frame', () => {
		const rt = createRetroRenderTargetV1(three);
		const r = fakeRenderer();
		rt.renderScene(r, new FakeScene(), {});
		rt.present(r);
		expect(r.calls).not.toContain('readPixels');
	});

	it('honours the low and high presets', () => {
		expect((createRetroRenderTargetV1(three, 'low').target as FakeWebGLRenderTarget).width).toBe(160);
		expect((createRetroRenderTargetV1(three, 'high').target as FakeWebGLRenderTarget).height).toBe(360);
	});

	it('disposes its resources once and rejects use afterwards', () => {
		const rt = createRetroRenderTargetV1(three);
		const t = rt.target as FakeWebGLRenderTarget;
		rt.dispose();
		rt.dispose();
		expect(t.disposed).toBe(true);
		expect(() => rt.renderScene(fakeRenderer(), new FakeScene(), {})).toThrow('RETRO_RENDER_TARGET_DISPOSED');
	});

	it('fails closed when WebGLRenderTarget is unavailable', () => {
		expect(() => createRetroRenderTargetV1({})).toThrow('RETRO_RENDER_TARGET_THREE_UNAVAILABLE');
	});
});
