// High-detail office furniture rendered via Canvas API
// Each piece is drawn at native resolution for crisp scaling

export function generateFurnitureTextures(scene: Phaser.Scene) {
  generateOfficeDesk(scene);
  generateChair(scene);
  generateCoffeeTable(scene);
}

function generateOfficeDesk(scene: Phaser.Scene) {
  // 64x48 pixel detailed desk with monitor, keyboard, mouse, coffee, papers
  const w = 64, h = 48;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // === Desk body ===
  // Shadow
  ctx.fillStyle = '#6a5030';
  ctx.fillRect(2, 20, 60, 28);

  // Desk top surface
  ctx.fillStyle = '#b8945e';
  ctx.fillRect(0, 16, 64, 4);
  // Wood grain highlight
  ctx.fillStyle = '#c8a470';
  ctx.fillRect(2, 17, 60, 2);

  // Front panel
  ctx.fillStyle = '#a07840';
  ctx.fillRect(0, 20, 64, 24);
  // Panel edge highlight
  ctx.fillStyle = '#b08850';
  ctx.fillRect(0, 20, 64, 1);
  // Drawer line
  ctx.fillStyle = '#8a6830';
  ctx.fillRect(2, 30, 26, 1);
  ctx.fillRect(36, 30, 26, 1);
  // Drawer handles
  ctx.fillStyle = '#c0a060';
  ctx.fillRect(10, 32, 8, 2);
  ctx.fillRect(46, 32, 8, 2);
  // Desk legs
  ctx.fillStyle = '#7a5a38';
  ctx.fillRect(2, 44, 4, 4);
  ctx.fillRect(58, 44, 4, 4);

  // Side panels
  ctx.fillStyle = '#8a6830';
  ctx.fillRect(0, 20, 2, 24);
  ctx.fillRect(62, 20, 2, 24);

  // === Monitor ===
  // Monitor stand base
  ctx.fillStyle = '#404050';
  ctx.fillRect(24, 14, 16, 3);
  // Monitor stand neck
  ctx.fillStyle = '#505060';
  ctx.fillRect(30, 6, 4, 10);
  // Monitor frame
  ctx.fillStyle = '#303040';
  ctx.fillRect(16, 0, 32, 15);
  // Screen bezel
  ctx.fillStyle = '#252535';
  ctx.fillRect(17, 1, 30, 13);
  // Screen
  ctx.fillStyle = '#4488cc';
  ctx.fillRect(18, 2, 28, 11);
  // Screen reflection
  ctx.fillStyle = '#5599dd';
  ctx.fillRect(18, 2, 28, 3);
  // Screen content lines (code/text)
  ctx.fillStyle = '#88ccff';
  ctx.fillRect(20, 5, 12, 1);
  ctx.fillRect(20, 7, 18, 1);
  ctx.fillRect(20, 9, 8, 1);
  ctx.fillRect(20, 11, 14, 1);
  // Power LED
  ctx.fillStyle = '#40ff80';
  ctx.fillRect(31, 13, 2, 1);

  // === Keyboard ===
  ctx.fillStyle = '#606068';
  roundRect(ctx, 6, 11, 20, 6, 1);
  ctx.fill();
  // Keys
  ctx.fillStyle = '#808088';
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      ctx.fillRect(8 + c * 2 + (c > 3 ? 1 : 0), 12 + r * 2, 1, 1);
    }
  }
  // Spacebar
  ctx.fillStyle = '#808088';
  ctx.fillRect(11, 16, 8, 1);

  // === Mouse ===
  ctx.fillStyle = '#505058';
  ctx.fillRect(50, 12, 4, 6);
  ctx.fillStyle = '#606068';
  ctx.fillRect(50, 12, 4, 3);
  // Mouse wheel
  ctx.fillStyle = '#909098';
  ctx.fillRect(51, 13, 2, 1);

  // === Coffee mug ===
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(56, 8, 5, 7);
  ctx.fillStyle = '#d8d0c0';
  ctx.fillRect(56, 8, 5, 2);
  // Handle
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(61, 10, 2, 3);
  ctx.fillRect(62, 9, 1, 5);
  // Coffee inside
  ctx.fillStyle = '#6a4020';
  ctx.fillRect(57, 9, 3, 2);

  // === Small papers/notes ===
  ctx.fillStyle = '#f0f0e0';
  ctx.fillRect(3, 8, 6, 8);
  ctx.fillStyle = '#e8e8d8';
  ctx.fillRect(3, 8, 6, 1);
  // Text lines on paper
  ctx.fillStyle = '#c0c0b0';
  ctx.fillRect(4, 10, 4, 1);
  ctx.fillRect(4, 12, 3, 1);
  ctx.fillRect(4, 14, 4, 1);

  // === Pen ===
  ctx.fillStyle = '#3050a0';
  ctx.fillRect(10, 10, 1, 6);
  ctx.fillStyle = '#c0c0b0';
  ctx.fillRect(10, 9, 1, 1);

  scene.textures.addCanvas('office_desk', canvas);
  scene.textures.get('office_desk').setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function generateChair(scene: Phaser.Scene) {
  // 32x36 detailed office swivel chair, top-down/front perspective
  const w = 32, h = 36;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // === 5-star base ===
  ctx.fillStyle = '#505058';
  // Center post
  ctx.fillRect(14, 28, 4, 4);
  // Star arms
  ctx.fillRect(6, 32, 20, 2);
  ctx.fillRect(14, 30, 4, 4);
  // Wheels (5 dots)
  ctx.fillStyle = '#404048';
  ctx.fillRect(5, 33, 3, 3);
  ctx.fillRect(24, 33, 3, 3);
  ctx.fillRect(14, 34, 4, 2);

  // === Seat cushion ===
  ctx.fillStyle = '#3a4258';
  roundRect(ctx, 4, 16, 24, 14, 4);
  ctx.fill();
  // Seat surface highlight
  ctx.fillStyle = '#4a5570';
  roundRect(ctx, 6, 17, 20, 8, 3);
  ctx.fill();
  // Seat center stitch line
  ctx.fillStyle = '#3a4258';
  ctx.fillRect(15, 18, 2, 6);

  // === Backrest ===
  ctx.fillStyle = '#2e3648';
  roundRect(ctx, 5, 2, 22, 16, 4);
  ctx.fill();
  // Back padding
  ctx.fillStyle = '#38425a';
  roundRect(ctx, 7, 4, 18, 10, 3);
  ctx.fill();
  // Lumbar support highlight
  ctx.fillStyle = '#404c65';
  roundRect(ctx, 8, 8, 16, 4, 2);
  ctx.fill();

  // === Armrests ===
  ctx.fillStyle = '#505058';
  // Left arm
  roundRect(ctx, 0, 14, 6, 10, 2);
  ctx.fill();
  // Right arm
  roundRect(ctx, 26, 14, 6, 10, 2);
  ctx.fill();
  // Arm pads
  ctx.fillStyle = '#3a4258';
  ctx.fillRect(1, 15, 4, 3);
  ctx.fillRect(27, 15, 4, 3);

  scene.textures.addCanvas('office_chair', canvas);
  scene.textures.get('office_chair').setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function generateCoffeeTable(scene: Phaser.Scene) {
  // 48x48 round coffee/meeting table
  const w = 48, h = 48;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Table shadow
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.beginPath();
  ctx.ellipse(24, 26, 22, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Table leg
  ctx.fillStyle = '#6a5a3a';
  ctx.fillRect(21, 24, 6, 20);

  // Table surface
  ctx.fillStyle = '#c8a070';
  ctx.beginPath();
  ctx.ellipse(24, 20, 22, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wood grain ring
  ctx.strokeStyle = '#b89060';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(24, 20, 16, 10, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Highlight
  ctx.fillStyle = '#d8b080';
  ctx.beginPath();
  ctx.ellipse(20, 16, 8, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();

  scene.textures.addCanvas('coffee_table', canvas);
  scene.textures.get('coffee_table').setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
