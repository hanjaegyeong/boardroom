import Phaser from 'phaser';
import { DISPLAY_TILE } from '../assets/tilePixels';
import { CHARACTERS } from '../assets/characterPixels';

export type AgentState = 'idle' | 'walking' | 'talking' | 'typing';

// Shared character layout constants — change here to update ALL characters
export const SPRITE_SCALE = 3.2;
export const SPRITE_SCALE_TALK = SPRITE_SCALE * 1.06; // bounce target
const NAME_OFFSET_Y = -54;
const BADGE_OFFSET_Y = -34;
const SPEAK_OFFSET_X = 22;
const SPEAK_OFFSET_Y = -44;
export const BUBBLE_OFFSET_Y = -68;

// Shared bubble style constants — applies to speech bubbles AND cost bubble
export const BUBBLE_FONT_SIZE = '14px';
export const BUBBLE_FONT_FAMILY = 'Galmuri11, monospace';
export const BUBBLE_PADDING = 12;
export const BUBBLE_MAX_WIDTH = 240;
export const BUBBLE_MAX_CHARS = 60;

export class AgentSprite {
  public sprite: Phaser.GameObjects.Sprite;
  public nameLabel: Phaser.GameObjects.Text;
  public titleLabel: Phaser.GameObjects.Text;
  public speakIndicator: Phaser.GameObjects.Image | null = null;
  public state: AgentState = 'idle';
  public id: string;
  public direction: 'down' | 'up' | 'left' | 'right' = 'down';

  private scene: Phaser.Scene;
  private charData: typeof CHARACTERS[0];
  private talkingTween: Phaser.Tweens.Tween | null = null;
  private currentMoveTween: Phaser.Tweens.Tween | null = null;
  private moveResolve: (() => void) | null = null;
  private moveAborted = false;

  constructor(scene: Phaser.Scene, id: string, tileX: number, tileY: number) {
    this.scene = scene;
    this.id = id;
    this.charData = CHARACTERS.find(c => c.id === id)!;

    const px = tileX * DISPLAY_TILE + DISPLAY_TILE / 2;
    const py = tileY * DISPLAY_TILE + DISPLAY_TILE / 2;

    // Create sprite
    this.sprite = scene.add.sprite(px, py, id, 1);
    this.sprite.setScale(SPRITE_SCALE);
    this.sprite.setDepth(10);

    // Name label
    this.nameLabel = scene.add.text(px, py + NAME_OFFSET_Y, this.charData.name, {
      fontSize: '15px',
      fontFamily: '"SF Pro Display", "Helvetica Neue", Arial, sans-serif',
      fontStyle: 'bold',
      color: this.charData.color,
      stroke: '#ffffff',
      strokeThickness: 3,
      letterSpacing: 1,
    });
    this.nameLabel.setOrigin(0.5, 1);
    this.nameLabel.setDepth(15);

    // Title badge
    this.titleLabel = scene.add.text(px, py + BADGE_OFFSET_Y, this.charData.title, {
      fontSize: '12px',
      fontFamily: '"SF Pro Display", "Helvetica Neue", Arial, sans-serif',
      fontStyle: 'bold',
      color: '#ffffff',
      backgroundColor: this.charData.color + 'dd',
      padding: { x: 5, y: 3 },
      letterSpacing: 2,
    });
    this.titleLabel.setOrigin(0.5, 1);
    this.titleLabel.setDepth(15);

    // All agents face desk (up) when at their seat
    this.direction = 'up';

    // Play idle animation
    this.playIdle();
  }

  playIdle() {
    this.state = 'idle';
    this.sprite.play(`${this.id}_idle_${this.direction}`);
  }

  playWalk(dir: 'down' | 'up' | 'left' | 'right') {
    this.direction = dir;
    this.state = 'walking';
    this.sprite.play(`${this.id}_walk_${dir}`);
  }

  async moveTo(tileX: number, tileY: number): Promise<void> {
    const targetX = tileX * DISPLAY_TILE + DISPLAY_TILE / 2;
    const targetY = tileY * DISPLAY_TILE + DISPLAY_TILE / 2;

    const dx = targetX - this.sprite.x;
    const dy = targetY - this.sprite.y;

    // Determine direction
    if (Math.abs(dx) > Math.abs(dy)) {
      this.playWalk(dx > 0 ? 'right' : 'left');
    } else {
      this.playWalk(dy > 0 ? 'down' : 'up');
    }

    const distance = Math.sqrt(dx * dx + dy * dy);
    const duration = (distance / (DISPLAY_TILE * 3)) * 1000; // 3 tiles per second

    return new Promise(resolve => {
      this.moveResolve = resolve;
      this.currentMoveTween = this.scene.tweens.add({
        targets: [this.sprite, this.nameLabel, this.titleLabel],
        x: `+=${dx}`,
        y: `+=${dy}`,
        duration: Math.max(duration, 200),
        ease: 'Linear',
        onUpdate: () => {
          this.syncLabelPositions();
        },
        onComplete: () => {
          this.currentMoveTween = null;
          this.moveResolve = null;
          this.playIdle();
          resolve();
        },
      });
    });
  }

  async moveAlongPath(path: { x: number; y: number }[]): Promise<void> {
    this.moveAborted = false;
    for (const point of path) {
      if (this.moveAborted) break;
      await this.moveTo(point.x, point.y);
    }
  }

  stopMovement() {
    this.moveAborted = true;
    if (this.currentMoveTween && this.currentMoveTween.isPlaying()) {
      this.currentMoveTween.stop();
      this.currentMoveTween = null;
    }
    if (this.moveResolve) {
      this.moveResolve();
      this.moveResolve = null;
    }
    this.syncLabelPositions();
    this.playIdle();
  }

  setSpeaking(speaking: boolean) {
    if (speaking) {
      this.state = 'talking';

      // Add speaking indicator
      if (!this.speakIndicator) {
        this.speakIndicator = this.scene.add.image(
          this.sprite.x + SPEAK_OFFSET_X,
          this.sprite.y + SPEAK_OFFSET_Y,
          'speak_indicator'
        );
        this.speakIndicator.setDepth(20);
      }

      // Bounce animation
      if (this.talkingTween) this.talkingTween.destroy();
      this.talkingTween = this.scene.tweens.add({
        targets: this.sprite,
        scaleY: SPRITE_SCALE_TALK,
        duration: 300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else {
      this.state = 'idle';

      if (this.speakIndicator) {
        this.speakIndicator.destroy();
        this.speakIndicator = null;
      }

      if (this.talkingTween) {
        this.talkingTween.destroy();
        this.talkingTween = null;
        this.sprite.setScale(SPRITE_SCALE);
      }
    }
  }

  setTyping(_typing: boolean) {
    // No-op: typing animation removed
  }

  getPosition(): { x: number; y: number } {
    return {
      x: Math.round(this.sprite.x / DISPLAY_TILE),
      y: Math.round(this.sprite.y / DISPLAY_TILE),
    };
  }

  private syncLabelPositions() {
    this.nameLabel.setPosition(this.sprite.x, this.sprite.y + NAME_OFFSET_Y);
    this.titleLabel.setPosition(this.sprite.x, this.sprite.y + BADGE_OFFSET_Y);
    if (this.speakIndicator) {
      this.speakIndicator.setPosition(this.sprite.x + SPEAK_OFFSET_X, this.sprite.y + SPEAK_OFFSET_Y);
    }
  }

  destroy() {
    this.sprite.destroy();
    this.nameLabel.destroy();
    this.titleLabel.destroy();
    if (this.speakIndicator) this.speakIndicator.destroy();
    if (this.talkingTween) this.talkingTween.destroy();
  }
}
