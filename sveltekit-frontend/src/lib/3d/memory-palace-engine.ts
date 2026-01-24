/**
 * Memory Palace Engine
 * 3D Visualization of Legal Knowledge
 */

interface PalaceSettings {
    renderDistance: number;
    textureCacheSize: number;
  }

  export interface MemoryRoom {
    id: string;
    name: string;
    theme?: 'evidence' | 'contracts' | 'cases' | 'research';
    documents?: LegalDocument[];
    position?: [number, number, number];
    size?: [number, number, number];
    color?: string;
    texture?: string;
  }

  export interface LegalDocument {
    id: string;
    title: string;
    type: 'evidence' | 'contract' | 'brief' | 'citation' | 'research';
    content?: string;
    confidence: number;
    priority: number;
    position: [number, number, number];
    embedding?: Float32Array;
  }

  export class MemoryPalaceEngine {
    private canvas: HTMLCanvasElement;
    private gl: WebGLRenderingContext | null; // Allow null if context fails, though we throw
    private settings: PalaceSettings;
    private rooms: Map<string, MemoryRoom>;
    private textureCache: Map<string, WebGLTexture>;
    private currentMemoryUsage: number;
    private TEXTURE_CACHE_SIZE: number;

    constructor(canvas: HTMLCanvasElement, settings?: Partial<PalaceSettings>) {
      this.canvas = canvas;
      this.gl = canvas.getContext('webgl') || (canvas.getContext('experimental-webgl') as WebGLRenderingContext);
      this.settings = {
        renderDistance: 100,
        textureCacheSize: 1024 * 1024, // 1MB
        ...settings,
      };
      this.rooms = new Map();
      this.textureCache = new Map();
      this.currentMemoryUsage = 0;
      this.TEXTURE_CACHE_SIZE = this.settings.textureCacheSize;

      if (!this.gl) {
        throw new Error('WebGL not supported');
      }
    }

    async initialize(): Promise<void> {
      // Initialize WebGL context and resources
      if (!this.gl) return;
      this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
      this.gl.enable(this.gl.DEPTH_TEST);
    }

    async loadRooms(roomData: { [roomId: string]: MemoryRoom }): Promise<void> {
      this.rooms = new Map(Object.entries(roomData));
    }

    async loadTextures(textureData: { [textureName: string]: string }): Promise<void> {
      // Load textures from URLs or data
      for (const [name, url] of Object.entries(textureData)) {
        try {
          const img = await this.loadImage(url);
          if (this.gl) {
              const texture = this.createTexture(img);
              if (texture) {
                  this.textureCache.set(name, texture);
                  this.currentMemoryUsage += img.width * img.height * 4; // Assuming 4 bytes per pixel
                  if (this.currentMemoryUsage > this.TEXTURE_CACHE_SIZE) {
                    console.warn("Texture cache is full. Consider increasing textureCacheSize.");
                  }
              }
          }
        } catch (e) {
            console.error(`Failed to load texture ${name}:`, e);
        }
      }
    }

    private loadImage(url: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }

    private createTexture(image: HTMLImageElement): WebGLTexture | null {
      if (!this.gl) return null;
      const texture = this.gl.createTexture();
      if (!texture) throw new Error('Failed to create texture');

      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);

      // WebGL1 requires non-power-of-two textures to have CLAMP_TO_EDGE and no mipmap
      if (this.isPowerOfTwo(image.width) && this.isPowerOfTwo(image.height)) {
         this.gl.generateMipmap(this.gl.TEXTURE_2D);
         this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);
      } else {
         this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
         this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
         this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
      }
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

      return texture;
    }

    private isPowerOfTwo(x: number) {
        return (x & (x - 1)) === 0;
    }
  }
