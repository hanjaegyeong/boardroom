import Phaser from 'phaser';
import { TILES, TILE_SIZE } from '../assets/tilePixels';
import { generateCharacterTextures, CHARACTERS } from '../assets/characterPixels';
import { generateFurnitureTextures } from '../assets/furnitureRenderer';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  async create() {
    // Wait for pixel fonts to load before rendering any text
    try {
      await document.fonts.load('bold 12px "SF Pro Display"');
      await document.fonts.load('11px Galmuri11');
    } catch {
      // Fallback: wait a bit for fonts
      await new Promise(r => setTimeout(r, 500));
    }

    // Generate tile textures
    for (const tile of TILES) {
      this.generateTileTexture(tile.key, tile.pixels, tile.palette);
    }

    // Generate character textures
    generateCharacterTextures(this);

    // Generate high-detail furniture
    generateFurnitureTextures(this);

    // Generate a simple shadow/highlight texture
    this.generateSpeechBubbleTexture();

    // Set NEAREST filter on all pixel art textures (keeps them crisp without pixelArt:true)
    const pixelKeys = [...TILES.map(t => t.key), 'bubble_dot', 'speak_indicator', 'label_bg'];
    for (const key of pixelKeys) {
      const tex = this.textures.get(key);
      if (tex) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    // Character sprite textures
    const charIds = CHARACTERS.map(c => c.id);
    for (const id of charIds) {
      const tex = this.textures.get(id);
      if (tex) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    // Start the main scene
    this.scene.start('OfficeScene');
  }

  private generateTileTexture(
    key: string,
    pixels: string[],
    palette: Record<string, string>
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext('2d')!;

    for (let y = 0; y < pixels.length && y < TILE_SIZE; y++) {
      for (let x = 0; x < pixels[y].length && x < TILE_SIZE; x++) {
        const char = pixels[y][x];
        const color = palette[char];
        if (color && color !== 'transparent') {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }

    this.textures.addCanvas(key, canvas);
  }

  private generateSpeechBubbleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4, 4, 4, 0, Math.PI * 2);
    ctx.fill();
    this.textures.addCanvas('bubble_dot', canvas);

    // Speaking indicator
    const indCanvas = document.createElement('canvas');
    indCanvas.width = 6;
    indCanvas.height = 6;
    const indCtx = indCanvas.getContext('2d')!;
    indCtx.fillStyle = '#4ade80';
    indCtx.beginPath();
    indCtx.arc(3, 3, 3, 0, Math.PI * 2);
    indCtx.fill();
    this.textures.addCanvas('speak_indicator', indCanvas);

    // Name label background
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 4;
    labelCanvas.height = 4;
    const labelCtx = labelCanvas.getContext('2d')!;
    labelCtx.fillStyle = '#000000';
    labelCtx.globalAlpha = 0.7;
    labelCtx.fillRect(0, 0, 4, 4);
    this.textures.addCanvas('label_bg', labelCanvas);
  }
}
