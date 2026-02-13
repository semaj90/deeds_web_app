// Fuse.js import wrapper with fallback

let Fuse: unknown;

try {
	Fuse = require('fuse.js');
} catch {
	// Fallback implementation for basic search
	Fuse = class FuseFallback {
		private items: unknown[];
		private options: Record<string, unknown>;

		constructor(items: unknown[], options: Record<string, unknown> = {}) {
			this.items = items;
			this.options = options;
		}

		search(query: string) {
			const keys = (this.options?.keys as string[]) || [];
			const threshold = (this.options?.threshold as number) ?? 0.3;

			return this.items
				.map((item, index) => {
					let score = 1;
					for (const key of keys) {
						const value = this.getNestedValue(item, key);
						if (typeof value === 'string' && value.toLowerCase().includes(query.toLowerCase())) {
							score = 0.1;
							break;
						}
					}
					return { item, refIndex: index, score };
				})
				.filter((result) => result.score <= threshold)
				.sort((a, b) => a.score - b.score);
		}

		private getNestedValue(obj: unknown, path: string): unknown {
			return path.split('.').reduce((current: unknown, key: string) => {
				return current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined;
			}, obj);
		}
	};
}

export default Fuse;
