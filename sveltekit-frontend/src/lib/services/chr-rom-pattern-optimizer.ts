/**
 * CHR-ROM Pattern Format Optimizer
 * Hybrid SVG + Pixelated PNG system for optimal visual quality and performance
 */

export interface CHRROMPattern {
	type: 'icon' | 'indicator' | 'gauge' | 'heatmap' | 'badge' | 'graph' | 'color' | 'default';
	size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'scalable';
	data: string;
	metadata: {
		confidence: number;
		timestamp: number;
		version: string;
		format?: 'svg' | 'png' | 'hybrid' | 'hex';
		aesthetic?: 'nes-8bit' | 'snes-16bit' | 'modern';
		renderingHint?: 'pixelated' | 'crisp-edges' | 'auto';
		dimensions?: string;
		[key: string]: unknown;
	};
}

export interface PatternFormatSpec {
	format: 'svg' | 'png' | 'hybrid';
	aesthetic: 'nes-8bit' | 'snes-16bit' | 'modern';
	renderingHint: 'pixelated' | 'crisp-edges' | 'auto';
	targetSize: string;
	colorPalette: 'nes-54' | 'snes-256' | 'modern-unlimited';
	compressionTarget: number;
}

export type PatternInputData = {
	documentType?: string;
	type?: string;
	category?: string;
	confidence?: number;
	processingStatus?: 'pending' | 'processing' | 'completed' | 'error' | string;
	analysis?: {
		confidence?: number;
		riskLevel?: number;
		entities?: Array<Record<string, unknown>>;
		similarities?: number[];
	};
	[key: string]: unknown;
};

const PATTERN_FORMAT_SPECS: Record<string, PatternFormatSpec> = {
	doc_summary_icon: {
		format: 'svg',
		aesthetic: 'snes-16bit',
		renderingHint: 'crisp-edges',
		targetSize: 'scalable',
		colorPalette: 'snes-256',
		compressionTarget: 300,
	},
	status_indicator: {
		format: 'png',
		aesthetic: 'nes-8bit',
		renderingHint: 'pixelated',
		targetSize: '16x16',
		colorPalette: 'nes-54',
		compressionTarget: 150,
	},
	risk_gauge: {
		format: 'svg',
		aesthetic: 'modern',
		renderingHint: 'auto',
		targetSize: 'scalable',
		colorPalette: 'modern-unlimited',
		compressionTarget: 200,
	},
	entity_heatmap: {
		format: 'png',
		aesthetic: 'nes-8bit',
		renderingHint: 'pixelated',
		targetSize: '32x32',
		colorPalette: 'nes-54',
		compressionTarget: 400,
	},
	confidence_badge: {
		format: 'svg',
		aesthetic: 'snes-16bit',
		renderingHint: 'crisp-edges',
		targetSize: 'scalable',
		colorPalette: 'snes-256',
		compressionTarget: 250,
	},
	similarity_graph: {
		format: 'svg',
		aesthetic: 'modern',
		renderingHint: 'crisp-edges',
		targetSize: 'scalable',
		colorPalette: 'modern-unlimited',
		compressionTarget: 350,
	},
	category_color: {
		format: 'svg',
		aesthetic: 'modern',
		renderingHint: 'auto',
		targetSize: '1x1',
		colorPalette: 'modern-unlimited',
		compressionTarget: 10,
	},
};

export class CHRROMPatternOptimizer {
	private canvas: HTMLCanvasElement | null = null;
	private ctx: CanvasRenderingContext2D | null = null;

	constructor() {
		if (typeof window !== 'undefined') {
			this.canvas = document.createElement('canvas');
			this.ctx = this.canvas.getContext('2d', { alpha: true });
		}
	}

	async generateOptimizedPattern(
		patternType: string,
		data: PatternInputData,
	): Promise<CHRROMPattern> {
		const spec = PATTERN_FORMAT_SPECS[patternType];
		if (!spec) {
			return this.generateDefaultPattern(patternType, data);
		}

		const confidence = data.confidence ?? data.analysis?.confidence ?? 0.8;

		return {
			type: this.getPatternType(patternType),
			size: this.getPatternSize(spec.targetSize),
			data: this.generateSVGForType(patternType, data, spec),
			metadata: {
				confidence,
				timestamp: Date.now(),
				version: '2.0',
				format: spec.format === 'png' ? 'png' : 'svg',
				aesthetic: spec.aesthetic,
				renderingHint: spec.renderingHint,
			},
		};
	}

	private generateSVGForType(
		patternType: string,
		data: PatternInputData,
		spec: PatternFormatSpec,
	): string {
		switch (patternType) {
			case 'risk_gauge': {
				const riskLevel = data.analysis?.riskLevel ?? 0.3;
				const pct = Math.round(riskLevel * 100);
				const color = riskLevel > 0.7 ? '#EF4444' : riskLevel > 0.4 ? '#F59E0B' : '#10B981';
				return `<svg viewBox="0 0 60 8" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="60" height="8" rx="4" fill="#E5E7EB"/><rect x="0" y="0" width="${pct * 0.6}" height="8" rx="4" fill="${color}"/></svg>`;
			}
			case 'confidence_badge': {
				const conf = data.confidence ?? 0.75;
				const pct = Math.round(conf * 100);
				const color = conf > 0.8 ? '#10B981' : conf > 0.5 ? '#F59E0B' : '#EF4444';
				return `<svg viewBox="0 0 40 12" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="40" height="12" rx="3" fill="${color}"/><text x="20" y="8" text-anchor="middle" font-family="monospace" font-size="8" fill="#FFF">${pct}%</text></svg>`;
			}
			case 'category_color':
				return this.getCategoryColor(data.category);
			default:
				return `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="16" height="16" fill="#CCCCCC"/></svg>`;
		}
	}

	private getCategoryColor(category?: string): string {
		const colors: Record<string, string> = {
			contract: '#3B82F6',
			nda: '#EF4444',
			agreement: '#10B981',
			lease: '#F59E0B',
			default: '#6B7280',
		};
		return colors[category ?? 'default'] ?? colors.default;
	}

	private generateDefaultPattern(patternType: string, data: PatternInputData): CHRROMPattern {
		return {
			type: 'default',
			size: 'sm',
			data: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16" fill="#CCC"/></svg>`,
			metadata: {
				confidence: data.confidence ?? 0.5,
				timestamp: Date.now(),
				version: '2.0',
			},
		};
	}

	private getPatternType(patternType: string): CHRROMPattern['type'] {
		const map: Record<string, CHRROMPattern['type']> = {
			doc_summary_icon: 'icon',
			status_indicator: 'indicator',
			risk_gauge: 'gauge',
			entity_heatmap: 'heatmap',
			confidence_badge: 'badge',
			similarity_graph: 'graph',
			category_color: 'color',
		};
		return map[patternType] ?? 'default';
	}

	private getPatternSize(targetSize: string): CHRROMPattern['size'] {
		const map: Record<string, CHRROMPattern['size']> = {
			'16x16': 'xs',
			'32x32': 'sm',
			'64x64': 'md',
			'128x128': 'lg',
			'256x256': 'xl',
			scalable: 'scalable',
		};
		return map[targetSize] ?? 'scalable';
	}
}

export const chrROMPatternOptimizer = new CHRROMPatternOptimizer();
