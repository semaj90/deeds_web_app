export interface HybridGPUContext {
    type: 'webgpu' | 'webgl2' | 'webgl' | 'cpu-fallback';
    device?: GPUDevice; // For WebGPU
    gl?: WebGL2RenderingContext | WebGLRenderingContext; // For WebGL
    // optional cached ANGLE_instanced_arrays extension (for WebGL1 instancing support)
    angle?: ANGLE_instanced_arrays | null;
    // Add other context-specific properties as needed
}

/**
 * Try to obtain and cache the ANGLE_instanced_arrays extension for a WebGL context.
 * Use this when using a WebGL1 context that needs instanced arrays support.
 */
export function ensureAngleExtension(ctx: HybridGPUContext): ANGLE_instanced_arrays | null {
    if (!ctx.gl) return null;

    try {
        const gl = ctx.gl as WebGLRenderingContext | WebGL2RenderingContext;
        // If already cached on ctx, return it
        if (ctx.angle) return ctx.angle;

        const ext = (gl.getExtension?.('ANGLE_instanced_arrays') ?? null) as ANGLE_instanced_arrays | null;
        ctx.angle = ext;
        return ext;
    } catch {
        return null;
    }
}

/**
 * Cross-backend helper to set vertex attribute divisor.
 * - WebGL2: uses gl.vertexAttribDivisor
 * - WebGL1 + ANGLE: uses ANGLE_instanced_arrays.vertexAttribDivisorANGLE
 * - WebGPU: no-op and gives guidance (WebGPU uses GPUVertexBufferLayout.stepMode = "instance")
 */
export function setVertexAttribDivisor(ctx: HybridGPUContext, location: number, divisor: number): void {
    if (ctx.type === 'webgl2' && ctx.gl && (ctx.gl as WebGL2RenderingContext).vertexAttribDivisor) {
        try {
            (ctx.gl as WebGL2RenderingContext).vertexAttribDivisor(location, divisor);
            return;
        } catch {
            // fall through to other attempts
        }
    }

    // Try ANGLE extension for WebGL1 contexts
    const angle = ctx.angle ?? (ctx.gl ? (ctx.gl.getExtension?.('ANGLE_instanced_arrays') as ANGLE_instanced_arrays | null) : null);

    if (angle && typeof angle.vertexAttribDivisorANGLE === 'function') {
        try {
            angle.vertexAttribDivisorANGLE(location, divisor);
            // cache it if not already cached
            ctx.angle = angle;
            return;
        } catch {
            // ignore and continue to fallback
        }
    }

    if (ctx.type === 'webgpu') {
        // WebGPU uses buffer layouts with stepMode: "vertex" | "instance" in GPUVertexBufferLayout.
        // There's no direct per-attribute divisor setter; instruct caller to set GPUVertexBufferLayout.stepMode = "instance".
        // Keep this as a no-op to avoid throwing in hybrid code paths.
        // Example guidance: gpuBufferLayout.stepMode = "instance";
        console.warn(
            'setVertexAttribDivisor: WebGPU detected — set GPUVertexBufferLayout.stepMode = "instance" on the corresponding GPUVertexBufferLayout instead of using a divisor.'
        );
        return;
    }

    // If none of the above are available, warn once.
    console.warn('setVertexAttribDivisor: no supported instancing API available on this context');
}
