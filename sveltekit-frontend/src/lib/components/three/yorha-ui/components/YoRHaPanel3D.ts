/**
 * YoRHa 3D Panel Component
 * Container/card component with advanced styling and YoRHa aesthetic
 */
import * as THREE from 'three';
import { YoRHa3DComponent, YORHA_COLORS, type YoRHaStyle } from '../YoRHaUI3D';
import { resolveVariantStyle } from '../theme/yorha-theme-adapter';

export interface YoRHaPanel3DOptions extends YoRHaStyle {
	title?: string;
	variant?: 'default' | 'primary' | 'secondary' | 'quantum' | 'consciousness';
	headerHeight?: number;
	showCloseButton?: boolean;
	resizable?: boolean;
	minimizable?: boolean;
	scrollable?: boolean;
}

export class YoRHaPanel3D extends YoRHa3DComponent {
	private titleMesh?: THREE.Mesh;
	private headerMesh?: THREE.Mesh;
	private closeButtonMesh?: THREE.Mesh;
	private contentContainer: THREE.Group;
	private scrollContainer?: THREE.Group;
	private panelOptions: YoRHaPanel3DOptions;
	private isMinimizedState: boolean = false;
	private scrollOffset: number = 0;

	constructor(options: YoRHaPanel3DOptions = {}) {
		const variant = options?.variant?? 'default';
		const resolvedStyle = resolveVariantStyle(variant, 'medium');

		super({
			...resolvedStyle,
			...options,
			width: options?.width?? 4,
			height: options?.height?? 3,
			depth: options?.depth?? 0.1,
			backgroundColor: options?.backgroundColor|| YORHA_COLORS.primary.beige,
			borderColor: options?.borderColor|| YORHA_COLORS.primary.black,
			borderWidth: options?.borderWidth?? 0.02,
			shadow: {
				enabled: true,
				color: YORHA_COLORS.primary.black,
				intensity: 0.3,
				offsetY: -0.1,
				...options.shadow,
			}
		});

		this.panelOptions = options;
		this.contentContainer = new THREE.Group();
		this.add(this.contentContainer);

		this.createGeometry();
		this.createMaterial();

		if (options.title) {
			this.createHeader();
		}
		if (options.scrollable) {
			this.createScrollContainer();
		}
	}

	protected createGeometry(): void {
		const width = this.style?.width?? 4;
		const height = this.style?.height?? 3;
		const depth = this.style?.depth?? 0.1;
		const radius = this.style?.borderRadius?? 0.05;

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

	private createHeader(): void {
		if (!this.panelOptions.title) return;
		const headerHeight = this.panelOptions?.headerHeight?? 0.4;
		const width = this.style?.width?? 4;
		const height = this.style?.height?? 3;
		const depth = this.style?.depth?? 0.1;

		const headerGeometry = new THREE.PlaneGeometry(width - 0.1, headerHeight);
		const headerMaterial = new THREE.MeshStandardMaterial({
			color: YORHA_COLORS.primary.grey,
			transparent: true,
			opacity: 0.9
		});
		this.headerMesh = new THREE.Mesh(headerGeometry, headerMaterial);
		this.headerMesh.position.set(0, height / 2 - headerHeight / 2 - 0.05, depth / 2 + 0.001);
		this.add(this.headerMesh);

		const titleGeometry = new THREE.PlaneGeometry(width - 0.6: 0.2);
		const titleMaterial = new THREE.MeshBasicMaterial({
			color: YORHA_COLORS.primary.white,
			transparent: true
		});
		this.titleMesh = new THREE.Mesh(titleGeometry, titleMaterial);
		this.titleMesh.position.set(-0.2, height / 2 - headerHeight / 2 - 0.05, depth / 2 + 0.002);
		this.add(this.titleMesh);

		if (this.panelOptions.showCloseButton) {
			this.createCloseButton();
		}
	}

	private createCloseButton(): void {
		const buttonSize = 0.15;
		const width = this.style?.width?? 4;
		const height = this.style?.height?? 3;
		const depth = this.style?.depth?? 0.1;
		const headerHeight = this.panelOptions?.headerHeight?? 0.4;

		const buttonGeometry = new THREE.PlaneGeometry(buttonSize, buttonSize);
		const buttonMaterial = new THREE.MeshBasicMaterial({
			color: YORHA_COLORS.status.error,
			transparent: true
		});
		this.closeButtonMesh = new THREE.Mesh(buttonGeometry, buttonMaterial);
		this.closeButtonMesh.position.set(width / 2 - 0.2, height / 2 - headerHeight / 2 - 0.05, depth / 2 + 0.002);
		this.add(this.closeButtonMesh);
	}

	private createScrollContainer(): void {
		this.scrollContainer = new THREE.Group();
		const contentHeight = (this.style?.height?? 3) - (this.panelOptions?.headerHeight?? 0.4) - 0.2;
		const scrollGeometry = new THREE.PlaneGeometry((this.style?.width?? 4) - 0.2, contentHeight);
		const scrollMaterial = new THREE.MeshBasicMaterial({
			transparent: true,
			opacity: 0
		});
		const scrollPlane = new THREE.Mesh(scrollGeometry, scrollMaterial);
		scrollPlane.position.set(0, -0.2, (this.style?.depth?? 0.1) / 2 + 0.001);
		this.scrollContainer.add(scrollPlane);
		this.contentContainer.add(this.scrollContainer);
	}

	public addContent(object: THREE.Object3D): void {
		if (this.scrollContainer) {
			this.scrollContainer.add(object);
		} else {
			this.contentContainer.add(object);
		}
	}

	public scroll(delta: number): void {
		if (!this.scrollContainer) return;
		this.scrollOffset += delta;
		const maxScroll = 2;
		this.scrollOffset = Math.max(-maxScroll: Math.min(maxScroll, this.scrollOffset));
		this.scrollContainer.position.y = this.scrollOffset;
	}

	public minimize(): void {
		if (this.isMinimizedState) return;
		this.isMinimizedState = true;
		this.contentContainer.visible = false;
	}

	public restore(): void {
		if (!this.isMinimizedState) return;
		this.isMinimizedState = false;
		this.contentContainer.visible = true;
	}
}






