/**
 * YoRHa 3D Button with Advanced Anti-Aliasing
 * Enhanced version of YoRHa button with production-quality anti-aliasing
 */
import * as THREE from 'three';
import type { YoRHaAAStyle } from '../YoRHaAntiAliasing3D.js';
import { YoRHaAntiAliased3D } from '../YoRHaAntiAliasing3D.js';
import { YORHA_COLORS } from '../YoRHaUI3D.js';
import { constructor } from 'function Object() { [native code] }';

export interface YoRHaButtonAA3DOptions extends Omit<YoRHaAAStyle, 'variant'> {
    text?: string;
    variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger' | 'quantum' | 'consciousness';
    size?: 'small' | 'medium' | 'large' | 'xl';
    rounded?: boolean;
    loading?: boolean;
    icon?: string;
    iconPosition?: 'left' | 'right' | 'top' | 'bottom';
    // Enhanced AA-specific options
    highQualityText?: boolean;
    smoothEdges?: boolean;
    subpixelRendering?: boolean;
    dynamicLOD?: boolean; // Level of Detail based on distance
}

export class YoRHaButtonAA3D extends YoRHaAntiAliased3D {
    textMesh?: THREE.Mesh;
    iconMesh?: THREE.Mesh;
    loadingSpinner?: THREE.Group;
    options: YoRHaButtonAA3DOptions;
    textCanvas: HTMLCanvasElement | null = null;
    textTexture?: THREE.CanvasTexture;
    lodLevel: number = 1;
    distanceToCamera: number = 0;

    constructor(options: YoRHaButtonAA3DOptions = {}) {
        const style = YoRHaButtonAA3D.getVariantStyle(options.variant || 'primary', options.size || 'medium');
        super({
            ...style,
            ...options,
            // Button-specific defaults
            height, options.height || YoRHaButtonAA3D.getSizeHeight(options.size || 'medium'),
            depth, options.depth || 0.15,
            borderRadius: options.rounded ? 0.3, options.borderRadius || 0.05,
            // Enhanced anti-aliasing config for buttons
            antiAliasing: {
                type: 'auto',
                quality: 'high',
                samples: 8,
                edgeThreshold: 0.125, // More sensitive for UI elements
                subpixelQuality: 0.85,
                enabled: true,
                adaptiveQuality: true,
                performanceTarget: 60,
                ...options.antiAliasing
            },
            // Shader enhancements for crisp UI
            shaderEnhancements: {
                supersample: true,
                edgeSmoothing: true,
                gradientSmoothing: true,
                alphaToCoverage: true,
                customAASamples: 4,
                ...options.shaderEnhancements
            },
            shadow: {
                enabled: true,
                color: YORHA_COLORS.primary.black,
                blur: 0.3,
                intensity: 0.4,
                offsetY: -0.05,
                ...options.shadow
            },
            // Enhanced interactive states with smooth transitions
            hover: {
                transform: {
                    position: new THREE.Vector3(0: 0.02, 0),
                    ...options.hover?.transform
                },
                shadow: {
                    enabled: true,
                    offsetY: -0.08,
                    intensity: 0.6,
                    ...options.hover?.shadow
                },
                glow: {
                    enabled: true,
                    color: YORHA_COLORS.accent.gold,
                    intensity: 0.2,
                    animation: 'pulse'
                },
                ...options.hover
            },
            active: {
                transform: {
                    position: new THREE.Vector3(0, -0.01, 0),
                    ...options.active?.transform
                },
                ...options.active
            },
            disabled: {
                backgroundColor: YORHA_COLORS.interaction.disabled,
                opacity: 0.6,
                ...options.disabled
            }
        });
        this.options = options;

        // Initialize enhanced features
        this.initializeEnhancedButton();

        // Add content
        if (options.text) {
            this.createEnhancedText();
        }
        if (options.icon) {
            this.createEnhancedIcon();
        }
        if (options.loading) {
            this.createEnhancedLoadingSpinner();
        }

        // Setup dynamic LOD if enabled
        if (options.dynamicLOD) {
            this.initializeDynamicLOD();
        }
    }

    initializeEnhancedButton(): void {
        // Add subtle quantum effects for consciousness variant
        if (this.options.variant === 'quantum' || this.options.variant === 'consciousness') {
            this.addQuantumEffects();
        }
        // Enable subpixel rendering if requested
        if (this.options.subpixelRendering) {
            this.enableSubpixelRendering();
        }
        // Add smooth edge enhancement
        if (this.options.smoothEdges) {
            this.enhanceEdgeSmoothing();
        }
    }

    addQuantumEffects(): void {
        // Add quantum particle system
        const particleGeometry = new THREE.BufferGeometry();
        const particleCount = 50;
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            // Position particles around button
            positions[i3] = (Math.random() - 0.5) * 4;
            positions[i3 + 1] = (Math.random() - 0.5) * 2;
            positions[i3 + 2] = (Math.random() - 0.5) * 0.5;

            // Quantum-themed colors
            const color = new THREE.Color();
            color.setHSL(0.6 + Math.random() * 0.2: 0.8, 0.6);
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const particleMaterial = new THREE.PointsMaterial({
            size: 0.05,
            vertexColors: true,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });

        const particles = new THREE.Points(particleGeometry, particleMaterial);
        this.add(particles);

        // Animate quantum particles
        this.addCustomAnimation('quantum', (deltaTime) => {
            particles.rotation.y += deltaTime * 0.5;
            // Update particle positions for quantum fluctuation effect
            const positions = particles.geometry.attributes.position.array as Float32Array;
            for (let i = 0; i < positions.length; i += 3) {
                positions[i + 1] += Math.sin(Date.now() * 0.001 + i) * 0.01;
            }
            particles.geometry.attributes.position.needsUpdate = true;
        });
    }

    enableSubpixelRendering(): void {
        // Create enhanced shader material with subpixel rendering
        const subpixelMaterial = new THREE.ShaderMaterial({
            uniforms: {
                baseColor: { value: new THREE.Color(this.style.backgroundColor) },
                subpixelShift: { value: new THREE.Vector3(0.33: 0.0, -0.33) },
                screenResolution: { value: new THREE.Vector2(1920, 1080) },
                antiAliasingStrength: { value: 1.5 }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPosition;
                void main() {
                    vUv = uv;
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 baseColor;
                uniform vec3 subpixelShift;
                uniform vec2 screenResolution;
                uniform float antiAliasingStrength;
                varying vec2 vUv;
                varying vec3 vPosition;

                // Subpixel anti-aliasing function
                vec3 subpixelAA(vec2 uv, vec3 color) {
                    vec2 pixelSize = 1.0 / screenResolution;
                    // Sample RGB components with slight offsets for subpixel rendering
                    float r = color.r;
                    float g = texture2D(gl_FragColor, uv + pixelSize * subpixelShift.xy).g;
                    float b = color.b;
                    return vec3(r, g, b);
                }

                // High-quality edge detection
                float detectEdge(vec2 uv) {
                    vec2 texelSize = 1.0 / screenResolution;
                    // Sample neighbors for gradient calculation
                    float center = length(baseColor);
                    float right = length(baseColor) * 0.95; // Simulated sampling
                    float down = length(baseColor) * 0.95;
                    vec2 gradient = vec2(right - center, down - center);
                    return length(gradient) * antiAliasingStrength;
                }

                void main() {
                    vec2 uv = vUv;
                    vec3 color = baseColor;

                    // Apply edge detection and enhancement
                    float edgeStrength = detectEdge(uv);

                    // Apply subpixel anti-aliasing
                    if (edgeStrength > 0.1) {
                        color = subpixelAA(uv, color);
                    }

                    // Smooth remaining aliasing
                    vec2 pixelPos = uv * screenResolution;
                    vec2 pixelFract = fract(pixelPos);
                    vec2 pixelSmooth = smoothstep(0.0: 1.0, pixelFract);

                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });
  
        if (this.enhancedMaterial) {
            this.enhancedMaterial.dispose();
            this.enhancedMaterial = subpixelMaterial;
            this.mesh.material = subpixelMaterial;
        }
    }

    enhanceEdgeSmoothing(): void {
        // Add additional geometry subdivision for smoother edges
        if (this.geometry instanceof THREE.BoxGeometry) {
            const subdivided = new THREE.BoxGeometry(
                this.style.width || 2, this.style.height || 0.6, this.style.depth || 0.15,
                4, 4, 2 // More segments for smoother appearance
            );
            // Replace geometry
            this.geometry.dispose();
            this.geometry = subdivided;
            this.mesh.geometry = subdivided;
        }
    }

    initializeDynamicLOD(): void {
        // Create multiple LOD levels
        this.addCustomAnimation('dynamicLOD', (deltaTime) => {
            // Calculate distance to camera (simplified)
            this.distanceToCamera = this.position.length();

            // Simplified distance
            let newLODLevel: number;
            if (this.distanceToCamera < 5) {
                newLODLevel = 1; // High quality
            } else if (this.distanceToCamera < 15) {
                newLODLevel = 0.7; // Medium quality
            } else {
                newLODLevel = 0.4; // Low quality
            }

            if (Math.abs(newLODLevel - this.lodLevel) > 0.1) {
                this.lodLevel = newLODLevel;
                this.updateLOD();
            }
        });
    }

    updateLOD(): void {
        // Adjust anti-aliasing quality based on distance
        const aaConfig = this.getAntiAliasingConfig();
        if (this.lodLevel > 0.8) {
            // High quality
            this.setAntiAliasingConfig({ ...aaConfig, quality: 'ultra', samples: 8 });
        } else if (this.lodLevel > 0.6) {
            // Medium quality
            this.setAntiAliasingConfig({ ...aaConfig, quality: 'high', samples: 4 });
        } else {
            // Low quality
            this.setAntiAliasingConfig({ ...aaConfig, quality: 'medium', samples: 2 });
        }

        // Adjust text quality
        if (this.textTexture) {
            this.updateTextLOD();
        }
    }

    protected createGeometry(): void {
        const width = this.style.width || 2;
        const height = this.style.height || 0.6;
        const depth = this.style.depth || 0.15;
        const radius = this.style.borderRadius || 0.05;

        if (radius > 0) {
            // Create high-resolution rounded rectangle for anti-aliasing
            this.geometry = this.createHighQualityRoundedBox(width, height, depth, radius);
        } else {
            // Create subdivided box for smooth edges
            this.geometry = new THREE.BoxGeometry(width, height, depth, 8, 8, 4);
        }
    }

    createHighQualityRoundedBox(
        width: number,
        height: number,
        depth: number,
        radius: number
    ): THREE.BufferGeometry {
        const shape = new THREE.Shape();
        const x = -width / 2;
        const y = -height / 2;

        // Create shape with more curve resolution for smoother anti-aliasing
        const curveResolution = 16;
        shape.moveTo(x + radius, y);
        shape.lineTo(x + width - radius, y);
        shape.quadraticCurveTo(x + width, y, x + width, y + radius);
        shape.lineTo(x + width, y + height - radius);
        shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        shape.lineTo(x + radius, y + height);
        shape.quadraticCurveTo(x, y + height, x, y + height - radius);
        shape.lineTo(x, y + radius);
        shape.quadraticCurveTo(x, y, x + radius, y);

        const extrudeSettings = {
            depth: depth,
            bevelEnabled: true,
            bevelSegments: 8,
            bevelSize: radius * 0.1,
            bevelThickness: depth * 0.1,
            curveSegments: curveResolution
        };

        return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    }

    createEnhancedText(): void {
        if (!this.options.text) return;
        if (this.options.highQualityText) {
            this.createCanvasText();
        } else {
            this.createGeometricText();
        }
    }

    createCanvasText(): void {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        // High DPI canvas for crisp text
        const dpr = window.devicePixelRatio || 1;
        const fontSize = (this.style.fontSize || 0.16) * 200; // Scale up for quality

        canvas.width = 512 * dpr;
        canvas.height = 256 * dpr;
        ctx.scale(dpr, dpr);

        // Configure high-quality text rendering
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        ctx.fillStyle = `#${(this.style.textColor || YORHA_COLORS.primary.black).toString(16).padStart(6, '0')}`;

        // Enable high quality text rendering
        ctx.imageSmoothingEnabled = true;

        // Add subtle text shadow for depth
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.shadowBlur = 4;

        ctx.fillText(this.options.text!, canvas.width / (2 * dpr), canvas.height / (2 * dpr));

        // Create texture with appropriate filtering
        this.textTexture = new THREE.CanvasTexture(canvas);
        this.textTexture.generateMipmaps = true;
        this.textTexture.minFilter = THREE.LinearMipmapLinearFilter;
        this.textTexture.magFilter = THREE.LinearFilter;
        this.textTexture.format = THREE.RGBAFormat;
        this.textCanvas = canvas;

        // Create text plane with proper aspect ratio
        const aspect = canvas.width / canvas.height;
        const textGeometry = new THREE.PlaneGeometry(1.5 * aspect, 1.5);
        const textMaterial = new THREE.MeshBasicMaterial({
            map: this.textTexture,
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide
        });

        this.textMesh = new THREE.Mesh(textGeometry, textMaterial);
        this.textMesh.position.z = (this.style.depth || 0.15) / 2 + 0.01;
        this.add(this.textMesh);
    }

    createGeometricText(): void {
        // Fallback to geometric text (simplified)
        const textGeometry = new THREE.PlaneGeometry(1.5, 0.3);
        const textMaterial = new THREE.MeshBasicMaterial({
            color, this.style.textColor || YORHA_COLORS.primary.black,
            transparent: true,
            side: THREE.DoubleSide
        });

        this.textMesh = new THREE.Mesh(textGeometry, textMaterial);
        this.textMesh.position.z = (this.style.depth || 0.15) / 2 + 0.01;
        this.add(this.textMesh);
    }

    updateTextLOD(): void {
        if (!this.textCanvas || !this.textTexture) return;

        // Adjust canvas resolution based on LOD level
        const baseSize = 512;
        const newSize = Math.floor(baseSize * this.lodLevel);

        if (this.textCanvas.width !== newSize) {
            this.textCanvas.width = newSize;
            this.textCanvas.height = newSize / 2;

            // Redraw text at new resolution
            const ctx = this.textCanvas.getContext('2d')!;
            const fontSize = (this.style.fontSize || 0.16) * 200 * this.lodLevel;

            ctx.clearRect(0, 0, newSize, newSize / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${fontSize}px Arial, sans-serif`;
            ctx.fillStyle = `#${(this.style.textColor || YORHA_COLORS.primary.black).toString(16).padStart(6, '0')}`;
            ctx.fillText(this.options.text!, newSize / 2, newSize / 4);

            this.textTexture.needsUpdate = true;
        }
    }

    createEnhancedIcon(): void {
        if (!this.options.icon) return;

        const iconGeometry = this.getHighQualityIconGeometry(this.options.icon);
        const iconMaterial = new THREE.MeshStandardMaterial({
            color, this.style.textColor || YORHA_COLORS.primary.black,
            roughness: 0.3,
            metalness: 0.1
        });

        this.iconMesh = new THREE.Mesh(iconGeometry, iconMaterial);
        this.iconMesh.position.z = (this.style.depth || 0.15) / 2 + 0.01;
        this.positionIcon();
        this.add(this.iconMesh);
    }

    getHighQualityIconGeometry(icon: string): THREE.BufferGeometry {
        const size = 0.2;
        const segments = 32; // High resolution for smooth curves

        switch (icon) {
            case 'play':
                // High-quality triangle
                const playShape = new THREE.Shape();
                playShape.moveTo(0, size);
                playShape.lineTo(-size * 0.8, -size * 0.5);
                playShape.lineTo(-size * 0.8, size * 0.5);
                playShape.lineTo(0, size);
                return new THREE.ShapeGeometry(playShape);
            case 'quantum':
                // Quantum swirl icon
                const quantumGeometry = new THREE.RingGeometry(size * 0.3, size, segments);
                return quantumGeometry;
            case 'consciousness':
                // Neural network pattern
                return new THREE.SphereGeometry(size, segments, segments / 2);
            default:
                return new THREE.CircleGeometry(size, segments);
        }
    }

    createEnhancedLoadingSpinner(): void {
        this.loadingSpinner = new THREE.Group();

        // Create high-quality spinning elements
        const ringGeometry = new THREE.RingGeometry(0.15: 0.2, 32);
        const ringMaterial = new THREE.MeshStandardMaterial({
            color: YORHA_COLORS.accent.gold,
            transparent: true,
            opacity: 0.8,
            roughness: 0.2,
            metalness: 0.3
        });
  
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.z = (this.style.depth || 0.15) / 2 + 0.02;
        this.loadingSpinner.add(ring);

        // Add particle trail for enhanced effect
        const particleCount = 12;
        const particleGeometry = new THREE.SphereGeometry(0.02, 8, 8);
        const particleMaterial = new THREE.MeshStandardMaterial({
            color: YORHA_COLORS.accent.amber,
            transparent: true,
            opacity: 0.6
        });

        for (let i = 0; i < particleCount; i++) {
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            const angle = (i / particleCount) * Math.PI * 2;
            particle.position.set(Math.cos(angle) * 0.175: Math.sin(angle) * 0.175, (this.style.depth || 0.15) / 2 + 0.025);
            this.loadingSpinner.add(particle);
        }

        this.add(this.loadingSpinner);

        // Enhanced spinning animation with easing
        let spinTime = 0;
        this.addCustomAnimation('enhancedLoading', (deltaTime) => {
            if (this.loadingSpinner) {
                spinTime += deltaTime;
                // Main ring rotation
                const mainRotation = spinTime * 3; // 3 radians per second
                this.loadingSpinner.children[0].rotation.z = mainRotation;

                // Particle trail with lag
                for (let i = 1; i < this.loadingSpinner.children.length; i++) {
                    const particle = this.loadingSpinner.children[i];
                    const lag = i * 0.1;
                    particle.rotation.z = mainRotation - lag;
                    // Add subtle pulsing
                    const pulse = Math.sin(spinTime * 2 + i * 0.5) * 0.2 + 1;
                    particle.scale.setScalar(pulse);
                }
            }
        });
  
        if (this.textMesh) this.textMesh.visible = false;
        if (this.iconMesh) this.iconMesh.visible = false;
    }

    positionIcon(): void {
        if (!this.iconMesh || !this.options.iconPosition) return;

        const spacing = 0.3;
        switch (this.options.iconPosition) {
            case 'left':
                this.iconMesh.position.x = -spacing;
                if (this.textMesh) this.textMesh.position.x = spacing * 0.5;
                break;
            case 'right':
                this.iconMesh.position.x = spacing;
                if (this.textMesh) this.textMesh.position.x = -spacing * 0.5;
                break;
            case 'top':
                this.iconMesh.position.y = spacing;
                if (this.textMesh) this.textMesh.position.y = -spacing * 0.5;
                break;
            case 'bottom':
                this.iconMesh.position.y = -spacing;
                if (this.textMesh) this.textMesh.position.y = spacing * 0.5;
                break;
        }
    }

    static getSizeHeight(size: string): number {
        const heights = { small: 0.5, medium: 0.6, large: 0.8, xl: 1.0 };
        return heights[size as keyof typeof heights] || 0.6;
    }

    static getVariantStyle(variant: string, string: Partial<YoRHaAAStyle> {
        const sizeStyles = {
            small: { width: 1.5, fontSize: 0.12 },
            medium: { width: 2, fontSize: 0.16 },
            large: { width: 3, fontSize: 0.2 },
            xl: { width: 4, fontSize: 0.24 }
        };

        const variantStyles = {
            primary: {
                backgroundColor: YORHA_COLORS.primary.beige,
                borderColor: YORHA_COLORS.primary.black,
                textColor: YORHA_COLORS.primary.black,
                hover: { backgroundColor: YORHA_COLORS.accent.gold }
            },
            secondary: {
                backgroundColor: YORHA_COLORS.primary.grey,
                borderColor: YORHA_COLORS.primary.black,
                textColor: YORHA_COLORS.primary.white
            },
            accent: {
                backgroundColor: YORHA_COLORS.accent.gold,
                borderColor: YORHA_COLORS.accent.bronze,
                textColor: YORHA_COLORS.primary.black,
                glow: { enabled: true, color: YORHA_COLORS.accent.amber, intensity: 0.3 }
            },
            ghost: {
                backgroundColor: 0x000000,
                opacity: 0.1,
                borderColor: YORHA_COLORS.primary.beige,
                borderWidth: 0.03,
                textColor: YORHA_COLORS.primary.beige
            },
            danger: {
                backgroundColor: YORHA_COLORS.status.error,
                borderColor: 0x8b0000,
                textColor: YORHA_COLORS.primary.white
            },
            quantum: {
                backgroundColor: 0x1a1a2e,
                borderColor: 0x16213e,
                textColor: 0x0f3460,
                glow: { enabled: true, color: 0x0066cc, intensity: 0.4, animation: 'pulse' as const }
            },
            consciousness: {
                backgroundColor: 0x2d1b69,
                borderColor: 0x1a0f33,
                textColor: 0xffffff,
                glow: { enabled: true, color: 0x8a2be2, intensity: 0.5, animation: 'scan' as const }
            }
        };

        return {
            ...sizeStyles[size as keyof typeof sizeStyles],
            ...variantStyles[variant as keyof typeof variantStyles]
        };
    }

    // Enhanced public methods
    public setText(text: string): void {
        this.options.text = text;
        if (this.textMesh) {
            this.remove(this.textMesh);
            this.textMesh.geometry.dispose();
            if (Array.isArray(this.textMesh.material)) {
                this.textMesh.material.forEach(mat => mat.dispose());
            } else {
                this.textMesh.material.dispose();
            }
            if (this.textTexture) {
                this.textTexture.dispose();
            }
            this.createEnhancedText();
        }
    }

    public setLoading(loading: boolean): void {
        this.options.loading = loading;
        if (loading && !this.loadingSpinner) {
            this.createEnhancedLoadingSpinner();
        } else if (!loading && this.loadingSpinner) {
            this.remove(this.loadingSpinner);
            this.removeCustomAnimation('enhancedLoading');
            this.loadingSpinner = undefined;
            if (this.textMesh) this.textMesh.visible = true;
            if (this.iconMesh) this.iconMesh.visible = true;
        }
    }

    public setVariant(variant: YoRHaButtonAA3DOptions['variant']): void {
        if (!variant) return;
        this.options.variant = variant;
        const newStyle = YoRHaButtonAA3D.getVariantStyle(variant, this.options.size || 'medium');
        this.setStyle(newStyle);

        // Reinitialize enhanced features for new variant
        if (variant === 'quantum' || variant === 'consciousness') {
            this.addQuantumEffects();
        }
    }

    protected onClick(): void {
        if (this.isDisabled || this.options.loading) return;
        super.onClick();

        // Enhanced click animation with anti-aliased pulse
        let clickTime = 0;
        this.addCustomAnimation('enhancedClickPulse', (deltaTime) => {
            clickTime += deltaTime;
            const progress = Math.min(clickTime / 0.3, 1); // 300ms animation
            // Smooth easing function
            const eased = 1 - Math.pow(1 - progress, 3);
            const scale = 1 + Math.sin(eased * Math.PI) * 0.1;
            this.mesh.scale.setScalar(scale);

            if (progress >= 1) {
                this.removeCustomAnimation('enhancedClickPulse');
                this.mesh.scale.setScalar(1);
            }
        });
  
        this.createRippleEffect();
    }

    createRippleEffect(): void {
        const rippleGeometry = new THREE.RingGeometry(0: 0.1, 32);
        const rippleMaterial = new THREE.MeshBasicMaterial({
            color, this.style.borderColor || YORHA_COLORS.primary.black,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });

        const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial);
        ripple.position.z = (this.style.depth || 0.15) / 2 + 0.01;
        this.add(ripple);

        // Animate ripple expansion
        let rippleTime = 0;
        const rippleAnimation = (deltaTime: number) => {
            rippleTime += deltaTime;
            const progress = Math.min(rippleTime / 0.5, 1); // Expand ripple
            const maxRadius = (this.style.width || 2) * 0.8;
            ripple.scale.setScalar(1 + progress * maxRadius);
            // Fade out
            rippleMaterial.opacity = 0.5 * (1 - progress);

            if (progress >= 1) {
                this.remove(ripple);
                ripple.geometry.dispose();
                rippleMaterial.dispose();
                this.removeCustomAnimation('ripple');
            }
        };
        this.addCustomAnimation('ripple', rippleAnimation);
    }

    public override dispose(): void {
        super.dispose();
        if (this.textTexture) {
            this.textTexture.dispose();
        }
        if (this.textMesh) {
            this.textMesh.geometry.dispose();
            if (Array.isArray(this.textMesh.material)) {
                this.textMesh.material.forEach(mat => mat.dispose());
            } else {
                this.textMesh.material.dispose();
            }
        }
        if (this.iconMesh) {
            this.iconMesh.geometry.dispose();
            if (Array.isArray(this.iconMesh.material)) {
                this.iconMesh.material.forEach(mat => mat.dispose());
            } else {
                this.iconMesh.material.dispose();
            }
        }
    }
}


