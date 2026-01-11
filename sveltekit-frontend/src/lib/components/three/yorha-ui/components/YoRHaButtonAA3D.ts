/**
 * YoRHa 3D Button with Advanced Anti-Aliasing
 * Enhanced version of YoRHa button with production-quality anti-aliasing
 */
import * as THREE from 'three';
import type { YoRHaAAStyle } from '../YoRHaAntiAliasing3D.js';
import { YoRHaAntiAliased3D } from '../YoRHaAntiAliasing3D.js';
import { YORHA_COLORS } from '../YoRHaUI3D.js';

export interface YoRHaButtonAA3DOptions extends Omit<YoRHaAAStyle, 'variant'> {
    text?: string;
    variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger' | 'quantum' | 'consciousness';
    size?: 'small' | 'medium' | 'large' | 'xl';
    rounded?: boolean;
    loading?: boolean;
    icon?: string;
    iconPosition?: 'left' | 'right' | 'top' | 'bottom';
    highQualityText?: boolean;
    smoothEdges?: boolean;
    subpixelRendering?: boolean;
    dynamicLOD?: boolean;
    height?: number;
    depth?: number;
    borderRadius?: number;
    shaderEnhancements?: Record<string, any>;
}

export class YoRHaButtonAA3D extends YoRHaAntiAliased3D {
    public textMesh?: THREE.Mesh;
    public iconMesh?: THREE.Mesh;
    public loadingSpinner?: THREE.Group;
    public options: YoRHaButtonAA3DOptions;
    public textCanvas: HTMLCanvasElement | null = null;
    public textTexture?: THREE.CanvasTexture;
    public lodLevel: number = 1;
    public distanceToCamera: number = 0;

    constructor(options: YoRHaButtonAA3DOptions = {}) {
        const variantStyle = YoRHaButtonAA3D.getVariantStyle(options.variant || 'primary', options.size || 'medium');

        super({
            ...variantStyle,
            ...options
        });

        this.options = {
            variant: 'primary',
            size: 'medium',
            ...options
        };

        this.initializeUI();
    }

    private initializeUI(): void {
        this.createGeometry();
        this.createMaterial();

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.add(this.mesh);

        if (this.options.text) {
            this.createEnhancedText();
        }
        if (this.options.icon) {
            this.createEnhancedIcon();
        }
        if (this.options.loading) {
            this.createEnhancedLoadingSpinner();
        }
    }

    protected createGeometry(): void {
        const width = this.style.width || 2;
        const height = this.style.height || 0.6;
        const depth = this.style.depth || 0.15;
        const radius = this.style.borderRadius || 0.05;

        const shape = new THREE.Shape();
        const x = -width / 2;
        const y = -height / 2;

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
            bevelSegments: 2,
            bevelSize: radius * 0.2,
            bevelThickness: radius * 0.2
        };

        this.geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    }

    private createEnhancedText(): void {
        if (!this.options.text) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.width = 512;
        canvas.height = 128;

        ctx.fillStyle = 'white';
        ctx.font = 'bold 64px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.options.text, 256, 64);

        this.textTexture = new THREE.CanvasTexture(canvas);
        const textGeo = new THREE.PlaneGeometry(this.style.width! * 0.8, this.style.height! * 0.6);
        const textMat = new THREE.MeshBasicMaterial({
            map: this.textTexture,
            transparent: true,
            color: this.style.textColor || 0x000000
        });

        this.textMesh = new THREE.Mesh(textGeo, textMat);
        this.textMesh.position.z = (this.style.depth || 0.15) / 2 + 0.01;
        this.add(this.textMesh);
    }

    private createEnhancedIcon(): void {
        // Simple icon placeholder
        const iconGeo = new THREE.BoxGeometry(0.2, 0.2, 0.01);
        const iconMat = new THREE.MeshBasicMaterial({ color: this.style.textColor || 0x000000 });
        this.iconMesh = new THREE.Mesh(iconGeo, iconMat);
        this.iconMesh.position.z = (this.style.depth || 0.15) / 2 + 0.01;
        this.add(this.iconMesh);
    }

    private createEnhancedLoadingSpinner(): void {
        const spinnerGeo = new THREE.RingGeometry(0.1, 0.15, 16);
        const spinnerMat = new THREE.MeshBasicMaterial({ color: YORHA_COLORS.accent.gold, side: THREE.DoubleSide });
        this.loadingSpinner = new THREE.Group();
        const mesh = new THREE.Mesh(spinnerGeo, spinnerMat);
        this.loadingSpinner.add(mesh);
        this.loadingSpinner.position.z = (this.style.depth || 0.15) / 2 + 0.02;
        this.add(this.loadingSpinner);

        this.addCustomAnimation('spinner', (dt) => {
            if (this.loadingSpinner) this.loadingSpinner.rotation.z += dt * 5;
        });
    }

    static getVariantStyle(variant: string, size: string): Partial<YoRHaAAStyle> {
        const sizeStyles: Record<string, any> = {
            small: { width: 1.5, height: 0.5, fontSize: 0.12 },
            medium: { width: 2.0, height: 0.6, fontSize: 0.16 },
            large: { width: 3.0, height: 0.8, fontSize: 0.2 },
            xl: { width: 4.0, height: 1.0, fontSize: 0.24 }
        };

        const variantStyles: Record<string, any> = {
            primary: { backgroundColor: YORHA_COLORS.primary.beige, textColor: YORHA_COLORS.primary.black, borderColor: YORHA_COLORS.primary.black },
            secondary: { backgroundColor: YORHA_COLORS.primary.grey, textColor: YORHA_COLORS.primary.white, borderColor: YORHA_COLORS.primary.black },
            accent: { backgroundColor: YORHA_COLORS.accent.gold, textColor: YORHA_COLORS.primary.black, borderColor: YORHA_COLORS.accent.bronze },
            danger: { backgroundColor: YORHA_COLORS.status.error, textColor: YORHA_COLORS.primary.white, borderColor: 0x8b0000 }
        };

        return {
            ...sizeStyles[size] || sizeStyles.medium,
            ...variantStyles[variant] || variantStyles.primary
        };
    }

    public override dispose(): void {
        super.dispose();
        if (this.textTexture) this.textTexture.dispose();
        if (this.textMesh) {
            this.textMesh.geometry.dispose();
            (this.textMesh.material as THREE.Material).dispose();
        }
        if (this.iconMesh) {
            this.iconMesh.geometry.dispose();
            (this.iconMesh.material as THREE.Material).dispose();
        }
    }
}




