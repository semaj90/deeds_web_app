// IndexedDB cache for tensor storage in browser
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface TensorDB extends DBSchema {
    tensors: {
        key: string;
        value: {
            tensorId: string;
            data: ArrayBuffer;
            shape: number[];
            dtype: string;
            parentIds: string[];
            timestamp: number;
            metadata: Record<string, any>;
        };
        indexes: {
            'by-parent': string[];
            'by-timestamp': number;
        };
    };
    assets: {
        key: string;
        value: {
            assetId: string;
            type: 'image' | 'text' | 'document';
            source: string;
            tensorIds: string[];
            created: number;
        };
    };
}

export class TensorCache {
    private db: IDBPDatabase<TensorDB> | null = null;
    private memCache = new Map<string, ArrayBuffer>();
    private maxMemSize = 50 * 1024 * 1024; // 50MB in-memory cache
    private currentMemSize = 0;

    async init() {
        this.db = await openDB<TensorDB>('tensor-cache', 1, {
            upgrade(db) {
                // Tensors store
                const tensorStore = db.createObjectStore('tensors', {
                    keyPath: 'tensorId',
                });
                tensorStore.createIndex('by-parent', 'parentIds', { multiEntry: true });
                tensorStore.createIndex('by-timestamp', 'timestamp');

                // Assets store (one-to-many relationship)
                db.createObjectStore('assets', {
                    keyPath: 'assetId',
                });
            },
        });
    }

    // Bit-packing utilities
    packFloat16(arr: Float32Array): ArrayBuffer {
        const float16 = new Uint16Array(arr.length);
        for (let i = 0; i < arr.length; i++) {
            float16[i] = this.float32ToFloat16(arr[i]);
        }
        return float16.buffer;
    }

    unpackFloat16(buffer: ArrayBuffer, length: number): Float32Array {
        const float16 = new Uint16Array(buffer);
        const float32 = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            float32[i] = this.float16ToFloat32(float16[i]);
        }
        return float32;
    }

    private float32ToFloat16(val: number): number {
        const floatView = new Float32Array(1);
        const int32View = new Int32Array(floatView.buffer);
        floatView[0] = val;
        const x = int32View[0];

        const sign = (x >> 31) & 0x0001;
        const exp = (x >> 23) & 0x00ff;
        let frac = x & 0x007fffff;

        if (exp === 0) return sign << 15;
        if (exp === 0xff) return (sign << 15) | 0x7c00 | (frac ? 1 : 0);

        const newExp = exp - 127 + 15;
        if (newExp >= 31) return (sign << 15) | 0x7c00;
        if (newExp <= 0) return sign << 15;

        return (sign << 15) | (newExp << 10) | (frac >> 13);
    }

    private float16ToFloat32(val: number): number {
        const sign = (val >> 15) & 0x0001;
        const exp = (val >> 10) & 0x001f;
        const frac = val & 0x03ff;

        if (exp === 0) {
            return sign ? -0 : 0;
        }
        if (exp === 31) {
            return frac ? NaN : (sign ? -Infinity : Infinity);
        }

        const floatExp = exp - 15 + 127;
        const floatFrac = frac << 13;

        const bits = (sign << 31) | (floatExp << 23) | floatFrac;
        const floatView = new Float32Array(1);
        const int32View = new Int32Array(floatView.buffer);
        int32View[0] = bits;

        return floatView[0];
    }

    // Store tensor with multiple compression levels (LoD)
    async storeTensorSlices(
        assetId: string,
        data: Float32Array,
        shape: number[]
    ): Promise<string[]> {
        if (!this.db) await this.init();

        const sliceIds: string[] = [];
        const timestamp = Date.now();

        // Create 3 LoD slices
        for (let lod = 0; lod < 3; lod++) {
            const tensorId = `${assetId}_lod${lod}_${timestamp}`;
            let sliceData: ArrayBuffer;
            let dtype: string;

            if (lod === 0) {
                // Full precision
                sliceData = data.buffer.slice(0);
                dtype = 'float32';
            } else if (lod === 1) {
                // Float16
                sliceData = this.packFloat16(data);
                dtype = 'float16';
            } else {
                // Int8 quantized
                sliceData = this.quantizeToInt8(data);
                dtype = 'int8';
            }

            // Store in IndexedDB
            await this.db!.put('tensors', {
                tensorId,
                data: sliceData,
                shape,
                dtype,
                parentIds: [assetId],
                timestamp,
                metadata: { lod },
            });

            sliceIds.push(tensorId);

            // Add to memory cache if space available
            if (this.currentMemSize + sliceData.byteLength < this.maxMemSize) {
                this.memCache.set(tensorId, sliceData);
                this.currentMemSize += sliceData.byteLength;
            }
        }

        // Update asset record
        await this.db!.put('assets', {
            assetId,
            type: 'text',
            source: assetId,
            tensorIds: sliceIds,
            created: timestamp,
        });

        return sliceIds;
    }

    private quantizeToInt8(data: Float32Array): ArrayBuffer {
        const scale = Math.max(...data.map(Math.abs)) || 1;
        const int8 = new Int8Array(data.length + 4);

        // Store scale in first 4 bytes
        new Float32Array(int8.buffer, 0, 1)[0] = scale;

        // Quantize data
        for (let i = 0; i < data.length; i++) {
            int8[i + 4] = Math.round((data[i] / scale) * 127);
        }

        return int8.buffer;
    }

    async getTensor(tensorId: string): Promise<{
        data: ArrayBuffer;
        shape: number[];
        dtype: string;
    } | null> {
        // Check memory cache first
        if (this.memCache.has(tensorId)) {
            const cached = await this.db!.get('tensors', tensorId);
            if (cached) {
                return {
                    data: this.memCache.get(tensorId)!,
                    shape: cached.shape,
                    dtype: cached.dtype,
                };
            }
        }

        // Load from IndexedDB
        if (!this.db) await this.init();
        const tensor = await this.db!.get('tensors', tensorId);

        if (tensor) {
            // Add to memory cache if space
            if (this.currentMemSize + tensor.data.byteLength < this.maxMemSize) {
                this.memCache.set(tensorId, tensor.data);
                this.currentMemSize += tensor.data.byteLength;
            }

            return {
                data: tensor.data,
                shape: tensor.shape,
                dtype: tensor.dtype,
            };
        }

        return null;
    }

    async getAssetTensors(assetId: string): Promise<string[]> {
        if (!this.db) await this.init();
        const asset = await this.db!.get('assets', assetId);
        return asset?.tensorIds || [];
    }

    async evictOldTensors(maxAge: number = 3600000) {
        if (!this.db) await this.init();

        const cutoff = Date.now() - maxAge;
        const tx = this.db!.transaction('tensors', 'readwrite');
        const index = tx.store.index('by-timestamp');

        for await (const cursor of index.iterate()) {
            if (cursor.value.timestamp < cutoff) {
                await cursor.delete();
                this.memCache.delete(cursor.value.tensorId);
            } else {
                break; // Index is sorted, so we can stop
            }
        }
    }

    getMemoryUsage(): { used: number; cached: number } {
        return {
            used: this.currentMemSize,
            cached: this.memCache.size,
        };
    }

    async clear() {
        if (!this.db) await this.init();
        await this.db!.clear('tensors');
        await this.db!.clear('assets');
        this.memCache.clear();
        this.currentMemSize = 0;
    }
}