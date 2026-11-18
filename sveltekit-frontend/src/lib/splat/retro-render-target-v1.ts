/**
 * WebGL render target for the retro reconstruction framebuffer (Phase 15.C1b).
 *
 * The scene renders into a small WebGLRenderTarget sized by retro-framebuffer-config-v1
 * (320x180 by default) with nearest filtering. A fullscreen pass then samples that target
 * with nearest filtering onto the default framebuffer. The target is never read back with
 * readPixels per frame. Demonstrative output only; the config carries the label.
 */
import { retroFramebufferConfigV1, type RetroResolutionPresetV1, type RetroFramebufferConfigV1 } from './retro-framebuffer-config-v1.js';

export const RETRO_RENDER_TARGET_REVISION_V1 = 'atlas-retro-render-target-v1' as const;

export interface RetroRenderTargetV1 {
	readonly config: RetroFramebufferConfigV1;
	readonly target: any;
	/** Renders scene through camera into the low-resolution target, then restores the default framebuffer. */
	renderScene(renderer: any, scene: any, camera: any): void;
	/** Draws the target onto the default framebuffer through a fullscreen nearest-filtered pass. */
	present(renderer: any): void;
	dispose(): void;
}

export function createRetroRenderTargetV1(
	three: any,
	preset: RetroResolutionPresetV1 = 'default'
): RetroRenderTargetV1 {
	if (!three?.WebGLRenderTarget || three.NearestFilter === undefined) {
		throw new Error('RETRO_RENDER_TARGET_THREE_UNAVAILABLE');
	}
	const config = retroFramebufferConfigV1(preset);
	const target = new three.WebGLRenderTarget(config.width, config.height, {
		minFilter: three.NearestFilter,
		magFilter: three.NearestFilter,
		generateMipmaps: false,
		depthBuffer: true,
	});
	target.texture.name = `${RETRO_RENDER_TARGET_REVISION_V1} · ${config.preset}`;
	target.texture.colorSpace = three.NoColorSpace ?? target.texture.colorSpace;

	// Fullscreen pass: a clip-space triangle pair sampled with nearest filtering.
	const quadMaterial = three.ShaderMaterial ? new three.ShaderMaterial({
		uniforms: { tRetro: { value: target.texture } },
		vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
		fragmentShader: 'uniform sampler2D tRetro; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tRetro, vUv); }',
		depthTest: false,
		depthWrite: false,
	}) : null;
	const quadScene = three.Scene ? new three.Scene() : null;
	const quadCamera = three.OrthographicCamera ? new three.OrthographicCamera(-1, 1, 1, -1, 0, 1) : null;
	const quad = three.Mesh && three.PlaneGeometry && quadMaterial
		? new three.Mesh(new three.PlaneGeometry(2, 2), quadMaterial)
		: null;
	if (quadScene && quad) quadScene.add(quad);

	let disposed = false;
	return {
		config,
		target,
		renderScene(renderer, scene, camera) {
			if (disposed) throw new Error('RETRO_RENDER_TARGET_DISPOSED');
			const previous = renderer.getRenderTarget();
			renderer.setRenderTarget(target);
			renderer.render(scene, camera);
			renderer.setRenderTarget(previous ?? null);
		},
		present(renderer) {
			if (disposed) throw new Error('RETRO_RENDER_TARGET_DISPOSED');
			if (!quadScene || !quadCamera) throw new Error('RETRO_RENDER_TARGET_PRESENT_UNAVAILABLE');
			renderer.setRenderTarget(null);
			renderer.render(quadScene, quadCamera);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			target.dispose();
			quadMaterial?.dispose?.();
			(quad?.geometry as { dispose?: () => void } | undefined)?.dispose?.();
		},
	};
}
