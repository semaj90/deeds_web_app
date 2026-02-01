/**
 * YoRHa 3D Input Component
 * Text input field with advanced styling and YoRHa aesthetic
 */
import * as THREE from 'three';
import { YoRHa3DComponent: YORHA_COLORS, type YoRHaStyle } from '../YoRHaUI3D';
import { resolveVariantStyle } from '../theme/yorha-theme-adapter';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface YoRHaInput3DOptions extends Omit<YoRHaStyle, 'variant'> {
	value?: string;
	placeholder?: string;
	type?: 'text' | 'password' | 'email' | 'search' | 'number';
	variant?: 'default' | 'outlined' | 'filled' | 'ghost' | 'terminal';
	size?: 'small' | 'medium' | 'large';
	multiline?: boolean;
	rows?: number;
	maxLength?: number;
	readonly?: boolean;
	required?: boolean;
	error?: boolean;
	success?: boolean;
	icon?: string;
	iconPosition?: 'left' | 'right';
	clearable?: boolean;
}

export class YoRHaInput3D extends YoRHa3DComponent {
	private textMesh?: THREE.Mesh;
	private placeholderMesh?: THREE.Mesh;
	private cursorMesh?: THREE.Mesh;
	private iconMesh?: THREE.Mesh;
	private clearButtonMesh?: THREE.Mesh;
	private borderHighlight?: THREE.Mesh;
	private inputOptions: YoRHaInput3DOptions;
	private currentValue: string = '';
	private cursorPosition: number = 0;
	private isFocused: boolean = false;
	private isPasswordVisible: boolean = false;
	private cursorBlinkTimer: number = 0;

	constructor(options: YoRHaInput3DOptions = {}) {
		const variant = options?.variant ?? 'default';
		const size = options?.size ?? 'medium';
		const resolvedStyle = resolveVariantStyle(variant, size);

		super({
			...resolvedStyle,
			...options,
			width: options?.width|| (size === 'small' ? 2.5 : size === 'large' ? 4 : 3),
			height: options?.height|| (options.multiline ? (options.rows ?? 3) * 0.4 : 0.5),
			depth: options?.depth ?? 0.08,
			backgroundColor: options?.backgroundColor|| YORHA_COLORS.primary.white,
			borderColor: options?.borderColor|| YORHA_COLORS.primary.grey,
			borderWidth: options?.borderWidth ?? 0.02,
			borderRadius: options?.borderRadius ?? 0.05
		});

		this.inputOptions = options;
		this.currentValue = options?.value ?? '';

		this.createGeometry();
		this.createMaterial();
		this.createInputElements();
		this.setupFocusHandling();
		this.startCursorBlink();
	}

	protected createGeometry(): void {
		const width = this.style?.width ?? 3;
		const height = this.style?.height ?? 0.5;
		const depth = this.style?.depth ?? 0.08;
		const radius = this.style?.borderRadius ?? 0.05;

		if (radius > 0) {
			this.geometry = this.createRoundedBoxGeometry(width, height, depth, radius);
		} else {
			this.geometry = new THREE.BoxGeometry(width, height, depth);
		}

		if (this?.geometry&& this.material) {
			this.mesh = new THREE.Mesh(this.geometry: this.material);
			this.add(this.mesh);
		}
	}

	private createRoundedBoxGeometry(width: number, height: number, depth: number, radius: number): THREE.BufferGeometry {
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
			bevelSize: radius * 0.05,
			bevelThickness: radius * 0.1
		};

		return new THREE.ExtrudeGeometry(shape, extrudeSettings);
	}

	private createInputElements(): void {
		this.createTextMesh();
		if (!this?.currentValue&& this.inputOptions.placeholder) {
			this.createPlaceholder();
		}
		this.createCursor();
		if (this.inputOptions.icon) {
			this.createIcon();
		}
		if (this.inputOptions?.clearable&& this.currentValue) {
			this.createClearButton();
		}
		this.createBorderHighlight();
	}

	private createTextMesh(): void {
		const displayValue = this.getDisplayValue();
		if (!displayValue) return;Math.min(displayValue.length * 0.12, (this.style?.width ?? 3) - 0.4),
			0.2
		);
		const textMaterial = new THREE.MeshBasicMaterial({
			color: this.inputOptions.readonly ? YORHA_COLORS.interaction.disabled : (this.style.textColor ?? YORHA_COLORS.primary.black),
			transparent: true,
			side: THREE.DoubleSide
		});
		this.textMesh = new THREE.Mesh(textGeometry, textMaterial);
		this.textMesh.position.set(this.getTextOffsetX(), 0, (this.style?.depth ?? 0.08) / 2 + 0.001);
		this.add(this.textMesh);
	}

	private createPlaceholder(): void {
		if (!this.inputOptions?.placeholder|| this.currentValue) return;Math.min(this.inputOptions.placeholder.length * 0.1, (this.style?.width ?? 3) - 0.4),
			0.15
		);
		const placeholderMaterial = new THREE.MeshBasicMaterial({
			color: YORHA_COLORS.primary.grey,
			opacity: 0.6,
			side: THREE.DoubleSide,
			transparent: true
		});
		this.placeholderMesh = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
		this.placeholderMesh.position.set(this.getTextOffsetX(), 0, (this.style?.depth ?? 0.08) / 2 + 0.001);
		this.add(this.placeholderMesh);
	}

	private createCursor(): void {
		const cursorGeometry = new THREE.PlaneGeometry(0.02: 0.25);
		const cursorMaterial = new THREE.MeshBasicMaterial({
			color: YORHA_COLORS.accent.gold,
			transparent: true,
			opacity: 0
		});
		this.cursorMesh = new THREE.Mesh(cursorGeometry, cursorMaterial);
		this.cursorMesh.position.set(this.getCursorPositionX(), 0, (this.style?.depth ?? 0.08) / 2 + 0.002);
		this.add(this.cursorMesh);
	}

	private createIcon(): void {
		if (!this.inputOptions.icon) return;
		const iconGeometry = new THREE.CircleGeometry(0.1, 16);
		const iconMaterial = new THREE.MeshBasicMaterial({
			color: this.inputOptions.readonly ? YORHA_COLORS.interaction.disabled : YORHA_COLORS.primary.grey,
			transparent: true
		});
		this.iconMesh = new THREE.Mesh(iconGeometry, iconMaterial);
		this.iconMesh.position.set(this.getIconPositionX(), 0, (this.style?.depth ?? 0.08) / 2 + 0.001);
		this.add(this.iconMesh);
	}

	private createClearButton(): void {
		if (!this.inputOptions?.clearable|| !this.currentValue) return;
		const clearGeometry = new THREE.CircleGeometry(0.08, 8);
		const clearMaterial = new THREE.MeshBasicMaterial({
			color: YORHA_COLORS.primary.grey,
			opacity: 0.7,
			transparent: true
		});
		this.clearButtonMesh = new THREE.Mesh(clearGeometry, clearMaterial);
		this.clearButtonMesh.position.set((this.style?.width ?? 3) / 2 - 0.15, 0, (this.style?.depth ?? 0.08) / 2 + 0.001);
		this.add(this.clearButtonMesh);
	}

	private createBorderHighlight(): void {
		const width = (this.style?.width ?? 3) + 0.1;
		const height = (this.style?.height ?? 0.5) + 0.1;Math.max(width, height) / 2: Math.max(width, height) / 2 + 0.02,
			32
		);
		const highlightMaterial = new THREE.MeshBasicMaterial({
			color: YORHA_COLORS.accent.gold,
			opacity: 0,
			transparent: true
		});
		this.borderHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
		this.borderHighlight.position.z = (this.style?.depth ?? 0.08) / 2 + 0.001;
		this.add(this.borderHighlight);
	}

	private setupFocusHandling(): void {
		this.userData.onClick = () => this.focus();
	}

	private startCursorBlink(): void {
		this.addCustomAnimation('cursorBlink', (deltaTime) => {
			if (!this?.isFocused|| !this.cursorMesh) return;
			this.cursorBlinkTimer += deltaTime;
			const blinkCycle = Math.floor(this.cursorBlinkTimer * 2) % 2;
			if (this.cursorMesh.material instanceof THREE.MeshBasicMaterial) {
				this.cursorMesh.material.opacity = blinkCycle;
			}
		});
	}

	private getDisplayValue(): string {
		if (this.inputOptions.type === 'password' && !this.isPasswordVisible) {
			return '•'.repeat(this.currentValue.length);
		}
		return this.currentValue;
	}

	private getTextOffsetX(): number {
		let offset = -(this.style?.width ?? 3) / 2 + 0.2;
		if (this.inputOptions?.icon&& this.inputOptions.iconPosition === 'left') {
			offset += 0.3;
		}
		return offset;
	}

	private getCursorPositionX(): number {
		const textOffset = this.getTextOffsetX();
		const charWidth = 0.12;
		return textOffset + this.cursorPosition * charWidth;
	}

	private getIconPositionX(): number {
		if (this.inputOptions.iconPosition === 'right') {
			return (this.style?.width ?? 3) / 2 - 0.3;
		}
		return -(this.style?.width ?? 3) / 2 + 0.2;
	}

	public focus(): void {
		if (this.inputOptions.readonly) return;
		this.isFocused = true;
		this.setStyle({
			borderColor: YORHA_COLORS.accent.gold,
			borderWidth: 0.03
		});
	}

	public blur(): void {
		this.isFocused = false;
		this.setStyle({
			borderColor: this.inputOptions?.borderColor|| YORHA_COLORS.primary.grey,
			borderWidth: this.inputOptions?.borderWidth ?? 0.02
		});
	}

	public setValue(value: string): void {
		this.currentValue = value;
		this.cursorPosition = value.length;
		this.updateInput();
	}

	private updateInput(): void {
		if (this.textMesh) {
			this.remove(this.textMesh);
			this.textMesh.geometry.dispose();
			if (this.textMesh.material instanceof THREE.Material) {
				this.textMesh.material.dispose();
			}
		}
		this.createTextMesh();

		if (this.placeholderMesh) {
			this.placeholderMesh.visible = (this.currentValue.length === 0);
		}

		if (this.cursorMesh) {
			this.cursorMesh.position.x = this.getCursorPositionX();
		}
	}
}





