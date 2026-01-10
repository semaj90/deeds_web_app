```javascript
class MemoryPalaceEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private settings: PalaceSettings;
  private rooms: Map<string, MemoryRoom>;
  private textureCache: Map<string, WebGLTexture>;
  private currentMemoryUsage: number;
  private TEXTURE_CACHE_SIZE: number;

  constructor(canvas: HTMLCanvasElement, settings?: Partial<PalaceSettings>) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
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
    // Load textures, shaders, etc.
  }

  async loadRooms(roomData: { [roomId: string]: MemoryRoom }): Promise<void> {
    this.rooms = new Map(Object.entries(roomData));
  }

  async loadTextures(textureData: { [textureName: string]: string }): Promise<void> {
    // Load textures from URLs or data
    for (const [name, url] of Object.entries(textureData)) {
      const img = new Image();
      img.onload = () => {
        const texture = this.createTexture(img);
        this.textureCache.set(name, texture);
        this.currentMemoryUsage += img.width * img.height * 4; // Assuming 4 bytes per pixel
        if (this.currentMemoryUsage > this.TEXTURE_CACHE_SIZE) {
          console.warn("Texture cache is full. Consider increasing textureCacheSize.");
        }
      };
      img.src = url;
    }
  }

  private createTexture(image