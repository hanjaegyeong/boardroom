// Character sprite definitions for programmatic generation
// Each character is 16x16 pixels at base, displayed at 2x scale

export interface CharacterSpriteData {
  id: string;
  name: string;
  title: string;
  color: string;       // Primary color hex
  skinColor: string;
  hairColor: string;
  suitColor: string;
}

export const CHARACTERS: CharacterSpriteData[] = [
  {
    id: 'ceo',
    name: 'Alexandra',
    title: 'CEO',
    color: '#c27a1a',
    skinColor: '#f0c090',
    hairColor: '#2a1a0a',
    suitColor: '#3a3548',
  },
  {
    id: 'cto',
    name: 'Marcus',
    title: 'CTO',
    color: '#2563a8',
    skinColor: '#d4a574',
    hairColor: '#1a1a2a',
    suitColor: '#2a3858',
  },
  {
    id: 'cmo',
    name: 'Sofia',
    title: 'CMO',
    color: '#b84080',
    skinColor: '#f0c8a8',
    hairColor: '#5a2a1a',
    suitColor: '#4a2838',
  },
  {
    id: 'cfo',
    name: 'James',
    title: 'CFO',
    color: '#1a8a5a',
    skinColor: '#c8956c',
    hairColor: '#0a0a1a',
    suitColor: '#2a3830',
  },
  {
    id: 'cso',
    name: 'Elena',
    title: 'CSO',
    color: '#6d4ab5',
    skinColor: '#f0d0b0',
    hairColor: '#3a2a1a',
    suitColor: '#382848',
  },
  {
    id: 'cdo',
    name: 'David',
    title: 'CDO',
    color: '#0e7fa0',
    skinColor: '#e0b090',
    hairColor: '#1a1a1a',
    suitColor: '#283848',
  },
  {
    id: 'accountant',
    name: 'Penny',
    title: 'COST',
    color: '#e05050',
    skinColor: '#f0d0b0',
    hairColor: '#4a3020',
    suitColor: '#484040',
  },
];

// Generate sprite frames at runtime using canvas
export function generateCharacterTextures(scene: Phaser.Scene) {
  for (const char of CHARACTERS) {
    const directions = ['down', 'left', 'right', 'up'] as const;
    const frames: { key: string; frame: number }[] = [];

    // Create a canvas with 4 columns (directions) x 3 rows (animation frames)
    const frameW = 16;
    const frameH = 20;
    const cols = 3; // 3 animation frames per direction
    const rows = 4; // 4 directions
    const canvas = document.createElement('canvas');
    canvas.width = frameW * cols;
    canvas.height = frameH * rows;
    const ctx = canvas.getContext('2d')!;

    directions.forEach((dir, row) => {
      for (let animFrame = 0; animFrame < 3; animFrame++) {
        const ox = animFrame * frameW;
        const oy = row * frameH;
        drawCharacter(ctx, ox, oy, char, dir, animFrame);
      }
    });

    // Add to Phaser
    scene.textures.addCanvas(char.id, canvas);

    // Add animation frames
    const textureFrames: Phaser.Types.Animations.AnimationFrame[] = [];
    directions.forEach((dir, row) => {
      // Create frames for this direction
      for (let animFrame = 0; animFrame < 3; animFrame++) {
        scene.textures.get(char.id).add(
          row * 3 + animFrame,
          0,
          animFrame * frameW,
          row * frameH,
          frameW,
          frameH
        );
      }

      // Create walk animation
      scene.anims.create({
        key: `${char.id}_walk_${dir}`,
        frames: [
          { key: char.id, frame: row * 3 + 0 },
          { key: char.id, frame: row * 3 + 1 },
          { key: char.id, frame: row * 3 + 2 },
          { key: char.id, frame: row * 3 + 1 },
        ],
        frameRate: 6,
        repeat: -1,
      });

      // Create idle animation (just the middle frame)
      scene.anims.create({
        key: `${char.id}_idle_${dir}`,
        frames: [{ key: char.id, frame: row * 3 + 1 }],
        frameRate: 1,
        repeat: 0,
      });
    });
  }
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  char: CharacterSpriteData,
  dir: 'down' | 'left' | 'right' | 'up',
  animFrame: number
) {
  // Clear area
  ctx.clearRect(ox, oy, 16, 20);

  const isWalking = animFrame !== 1;
  const legOffset = animFrame === 0 ? -1 : animFrame === 2 ? 1 : 0;

  // Hair/Head
  ctx.fillStyle = char.hairColor;
  if (dir === 'up') {
    // Back of head - more hair visible
    ctx.fillRect(ox + 4, oy + 0, 8, 3);
    ctx.fillRect(ox + 3, oy + 1, 10, 4);
  } else {
    ctx.fillRect(ox + 4, oy + 0, 8, 2);
    ctx.fillRect(ox + 3, oy + 1, 10, 2);
  }

  // Face
  ctx.fillStyle = char.skinColor;
  if (dir === 'up') {
    ctx.fillRect(ox + 4, oy + 3, 8, 5);
  } else {
    ctx.fillRect(ox + 4, oy + 3, 8, 5);
    // Eyes
    if (dir === 'down') {
      ctx.fillStyle = '#222';
      ctx.fillRect(ox + 5, oy + 4, 2, 2);
      ctx.fillRect(ox + 9, oy + 4, 2, 2);
    } else if (dir === 'left') {
      ctx.fillStyle = '#222';
      ctx.fillRect(ox + 4, oy + 4, 2, 2);
    } else if (dir === 'right') {
      ctx.fillStyle = '#222';
      ctx.fillRect(ox + 10, oy + 4, 2, 2);
    }
  }

  // Body (suit)
  ctx.fillStyle = char.suitColor;
  ctx.fillRect(ox + 3, oy + 8, 10, 6);

  // Color accent (tie/lapel)
  ctx.fillStyle = char.color;
  if (dir !== 'up') {
    ctx.fillRect(ox + 7, oy + 8, 2, 5);
  }

  // Arms
  ctx.fillStyle = char.suitColor;
  if (dir === 'left') {
    ctx.fillRect(ox + 2, oy + 9, 2, 4);
  } else if (dir === 'right') {
    ctx.fillRect(ox + 12, oy + 9, 2, 4);
  } else {
    ctx.fillRect(ox + 1, oy + 9, 2, 4);
    ctx.fillRect(ox + 13, oy + 9, 2, 4);
  }

  // Legs
  ctx.fillStyle = '#1a1a2a';
  const leftLegX = ox + 4 + (isWalking ? legOffset : 0);
  const rightLegX = ox + 9 + (isWalking ? -legOffset : 0);
  ctx.fillRect(leftLegX, oy + 14, 3, 4);
  ctx.fillRect(rightLegX, oy + 14, 3, 4);

  // Shoes
  ctx.fillStyle = '#111';
  ctx.fillRect(leftLegX, oy + 17, 3, 2);
  ctx.fillRect(rightLegX, oy + 17, 3, 2);

  // Name tag indicator (small colored dot)
  ctx.fillStyle = char.color;
  ctx.fillRect(ox + 7, oy + 19, 2, 1);
}
