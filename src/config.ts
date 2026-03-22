import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { OfficeScene } from './game/scenes/OfficeScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  pixelArt: false,
  roundPixels: true,
  backgroundColor: '#e8e0d8',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, OfficeScene],
};
