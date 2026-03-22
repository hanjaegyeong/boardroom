import Phaser from 'phaser';
import { TILE_SIZE, DISPLAY_TILE, TILES } from '../assets/tilePixels';
import { floorLayer, furniture } from '../map/OfficeMap';
import { MAP_WIDTH, MAP_HEIGHT } from '../map/zones';
import { AgentManager } from '../characters/AgentManager';
import { BUBBLE_OFFSET_Y, BUBBLE_FONT_SIZE, BUBBLE_FONT_FAMILY, BUBBLE_PADDING, BUBBLE_MAX_WIDTH, BUBBLE_MAX_CHARS } from '../characters/Agent';
import { CHARACTERS } from '../assets/characterPixels';

export class OfficeScene extends Phaser.Scene {
  public agentManager!: AgentManager;
  private speechBubbles: Map<string, {
    bg: Phaser.GameObjects.Graphics;
    text: Phaser.GameObjects.Text;
    timeout?: Phaser.Time.TimerEvent;
  }> = new Map();
  private costBubble: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text } | null = null;

  constructor() {
    super({ key: 'OfficeScene' });
  }

  create() {
    // Set world bounds
    this.cameras.main.setBounds(
      0, 0,
      MAP_WIDTH * DISPLAY_TILE,
      MAP_HEIGHT * DISPLAY_TILE
    );

    // Render floor layer
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tile = floorLayer[y]?.[x];
        let tileKey = 'floor';
        if (tile === 2) tileKey = 'carpet';
        else if (tile === 3) tileKey = 'wall';
        else if (tile === 0) continue;

        const img = this.add.image(
          x * DISPLAY_TILE + DISPLAY_TILE / 2,
          y * DISPLAY_TILE + DISPLAY_TILE / 2,
          tileKey
        );
        img.setScale(DISPLAY_TILE / TILE_SIZE);
        img.setDepth(0);
      }
    }

    // Render furniture
    for (const item of furniture) {
      if (this.textures.exists(item.type)) {
        const img = this.add.image(
          item.x * DISPLAY_TILE + DISPLAY_TILE / 2,
          item.y * DISPLAY_TILE + DISPLAY_TILE / 2,
          item.type
        );
        if (item.type === 'office_desk') {
          img.setScale(1);
          img.setDepth(5);
        } else if (item.type === 'office_chair') {
          // Chair ABOVE character (depth 10) so backrest wraps around them
          img.setScale(1);
          img.setDepth(12);
        } else {
          img.setScale(DISPLAY_TILE / TILE_SIZE);
          img.setDepth(5);
        }
      }
    }

    // Add room labels
    this.addRoomLabel(4, 1, 'CEO Office');
    this.addRoomLabel(10, 1, 'CDO Office');
    this.addRoomLabel(4, 7.5, 'CTO Office');
    this.addRoomLabel(10, 7.5, 'CMO Office');
    this.addRoomLabel(4, 13.5, 'CFO Office');
    this.addRoomLabel(10, 13.5, 'CSO Office');
    this.addRoomLabel(19, 1, 'Lounge');
    this.addRoomLabel(28, 19.5, 'Cost Center');

    // Create agent characters
    this.agentManager = new AgentManager(this);

    // Accountant idle typing loop - looks busy at desk
    this.time.addEvent({
      delay: 3000 + Math.random() * 4000,
      loop: true,
      callback: () => {
        const acc = this.agentManager.getAgent('accountant');
        if (acc && acc.state === 'idle') {
          acc.setTyping(true);
          this.time.delayedCall(600, () => acc.setTyping(false));
        }
      },
    });

    // Camera setup
    const gameWidth = MAP_WIDTH * DISPLAY_TILE;
    const gameHeight = MAP_HEIGHT * DISPLAY_TILE;
    this.cameras.main.centerOn(gameWidth / 2, gameHeight / 2);

    // Zoom to fit
    const scaleX = this.scale.width / gameWidth;
    const scaleY = this.scale.height / gameHeight;
    const zoom = Math.min(scaleX, scaleY) * 0.95;
    this.cameras.main.setZoom(Math.max(zoom, 0.5));

    // Ambient: subtle camera drift
    this.tweens.add({
      targets: this.cameras.main,
      scrollX: this.cameras.main.scrollX + 5,
      duration: 8000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private addRoomLabel(tileX: number, tileY: number, text: string) {
    const label = this.add.text(
      tileX * DISPLAY_TILE,
      tileY * DISPLAY_TILE,
      text,
      {
        fontSize: '11px',
        fontFamily: 'Galmuri11, monospace',
        color: '#9a8a76',
      }
    );
    label.setOrigin(0.5, 0.5);
    label.setDepth(1);
  }

  showSpeechBubble(agentId: string, text: string) {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent) return;

    // Remove existing bubble for this agent
    this.hideSpeechBubble(agentId);

    const x = agent.sprite.x;
    const y = agent.sprite.y + BUBBLE_OFFSET_Y;

    // Truncate text for bubble
    const displayText = text.length > BUBBLE_MAX_CHARS ? text.substring(0, BUBBLE_MAX_CHARS - 3) + '...' : text;

    // Create background
    const bg = this.add.graphics();
    const textObj = this.add.text(x, y, displayText, {
      fontSize: BUBBLE_FONT_SIZE,
      fontFamily: BUBBLE_FONT_FAMILY,
      color: '#333333',
      wordWrap: { width: BUBBLE_MAX_WIDTH },
      lineSpacing: 3,
    });
    textObj.setOrigin(0.5, 1);
    textObj.setDepth(25);

    // Draw bubble background
    const bounds = textObj.getBounds();
    const pad = BUBBLE_PADDING;
    bg.fillStyle(0xffffff, 0.95);
    bg.lineStyle(1, Phaser.Display.Color.HexStringToColor(
      CHARACTERS.find(c => c.id === agentId)?.color || '#ffffff'
    ).color, 0.8);
    bg.fillRoundedRect(
      bounds.x - pad,
      bounds.y - pad,
      bounds.width + pad * 2,
      bounds.height + pad * 2,
      4
    );
    bg.strokeRoundedRect(
      bounds.x - pad,
      bounds.y - pad,
      bounds.width + pad * 2,
      bounds.height + pad * 2,
      4
    );
    bg.setDepth(24);

    // Triangle pointer
    const triX = x;
    const triY = bounds.y + bounds.height + pad;
    bg.fillTriangle(
      triX - 4, triY,
      triX + 4, triY,
      triX, triY + 6
    );

    // Auto-hide after delay
    const timeout = this.time.delayedCall(4000, () => {
      this.hideSpeechBubble(agentId);
    });

    this.speechBubbles.set(agentId, { bg, text: textObj, timeout });
  }

  hideSpeechBubble(agentId: string) {
    const bubble = this.speechBubbles.get(agentId);
    if (bubble) {
      bubble.bg.destroy();
      bubble.text.destroy();
      if (bubble.timeout) bubble.timeout.destroy();
      this.speechBubbles.delete(agentId);
    }
  }

  hideAllBubbles() {
    for (const id of this.speechBubbles.keys()) {
      this.hideSpeechBubble(id);
    }
  }

  showCostBubble(inputTokens: number, outputTokens: number, totalCalls: number, costUsd: number) {
    const agent = this.agentManager.getAgent('accountant');
    if (!agent) return;

    // Remove previous cost bubble
    if (this.costBubble) {
      this.costBubble.bg.destroy();
      this.costBubble.text.destroy();
      this.costBubble = null;
    }

    const x = agent.sprite.x;
    const y = agent.sprite.y + BUBBLE_OFFSET_Y;

    const total = inputTokens + outputTokens;
    const lines = [
      `Tokens: ${total.toLocaleString()}`,
      `  in: ${inputTokens.toLocaleString()}`,
      `  out: ${outputTokens.toLocaleString()}`,
      `Calls: ${totalCalls}`,
      `Cost: $${costUsd.toFixed(3)}`,
    ].join('\n');

    const textObj = this.add.text(x, y, lines, {
      fontSize: BUBBLE_FONT_SIZE,
      fontFamily: BUBBLE_FONT_FAMILY,
      color: '#333333',
      lineSpacing: 3,
    });
    textObj.setOrigin(0.5, 1);
    textObj.setDepth(25);

    const bounds = textObj.getBounds();
    const pad = BUBBLE_PADDING;
    const bg = this.add.graphics();
    bg.fillStyle(0xfff8f0, 0.95);
    bg.lineStyle(1, 0xe05050, 0.8);
    bg.fillRoundedRect(
      bounds.x - pad, bounds.y - pad,
      bounds.width + pad * 2, bounds.height + pad * 2, 4
    );
    bg.strokeRoundedRect(
      bounds.x - pad, bounds.y - pad,
      bounds.width + pad * 2, bounds.height + pad * 2, 4
    );
    bg.setDepth(24);

    // Triangle pointer
    bg.fillTriangle(x - 4, bounds.y + bounds.height + pad, x + 4, bounds.y + bounds.height + pad, x, bounds.y + bounds.height + pad + 6);

    this.costBubble = { bg, text: textObj };
  }

  hideCostBubble() {
    if (this.costBubble) {
      this.costBubble.bg.destroy();
      this.costBubble.text.destroy();
      this.costBubble = null;
    }
  }
}
