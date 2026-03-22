import { MAP_WIDTH, MAP_HEIGHT } from './zones';

// Map layers
// 0 = empty, 1 = floor, 2 = carpet, 3 = wall

export interface FurnitureItem {
  x: number;
  y: number;
  type: string;
}

function createFloorLayer(): number[][] {
  const map: number[][] = [];

  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: number[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      // Walls on edges
      if (y === 0 || y === MAP_HEIGHT - 1 || x === 0 || x === MAP_WIDTH - 1) {
        row.push(3);
        continue;
      }

      // Horizontal divider between departments (y=12), with gap for doorway at x=7-8
      if (y === 12 && x < 14 && !(x >= 6 && x <= 8)) {
        row.push(3);
        continue;
      }

      // Vertical divider between departments and lounge (x=14), with gap at y=11-13
      if (x === 14 && !(y >= 10 && y <= 14)) {
        row.push(3);
        continue;
      }

      // Marketing department carpet area (top-left desks area)
      if (x >= 1 && x <= 13 && y >= 1 && y <= 5) {
        row.push(2);
        continue;
      }

      // Development department carpet area (bottom-left desks area)
      if (x >= 1 && x <= 13 && y >= 14 && y <= 18) {
        row.push(2);
        continue;
      }

      // Lounge/meeting area carpet (right side center)
      if (x >= 15 && x <= 28 && y >= 8 && y <= 16) {
        row.push(2);
        continue;
      }

      // Regular floor
      row.push(1);
    }
    row.length = MAP_WIDTH;
    map.push(row);
  }
  return map;
}

function createFurniture(): FurnitureItem[] {
  const items: FurnitureItem[] = [];

  // === Marketing Department (top-left) ===
  // Lead desk
  items.push({ x: 3, y: 2, type: 'office_desk' });
  items.push({ x: 3, y: 4, type: 'office_chair' });
  // Content strategist desk
  items.push({ x: 7, y: 2, type: 'office_desk' });
  items.push({ x: 7, y: 4, type: 'office_chair' });
  // Growth hacker desk
  items.push({ x: 11, y: 2, type: 'office_desk' });
  items.push({ x: 11, y: 4, type: 'office_chair' });
  // Decorations
  items.push({ x: 1, y: 1, type: 'plant' });
  items.push({ x: 13, y: 1, type: 'plant' });

  // === Development Department (bottom-left) ===
  // Lead desk
  items.push({ x: 3, y: 14, type: 'office_desk' });
  items.push({ x: 3, y: 16, type: 'office_chair' });
  // Fullstack dev desk
  items.push({ x: 7, y: 14, type: 'office_desk' });
  items.push({ x: 7, y: 16, type: 'office_chair' });
  // AI dev desk
  items.push({ x: 11, y: 14, type: 'office_desk' });
  items.push({ x: 11, y: 16, type: 'office_chair' });
  // Decorations
  items.push({ x: 1, y: 22, type: 'plant' });
  items.push({ x: 13, y: 22, type: 'plant' });

  // === Shared Meeting/Lounge Area (right side) ===
  items.push({ x: 22, y: 8, type: 'whiteboard' });
  items.push({ x: 15, y: 8, type: 'plant' });
  items.push({ x: 28, y: 8, type: 'plant' });
  items.push({ x: 15, y: 16, type: 'plant' });
  items.push({ x: 28, y: 16, type: 'plant' });

  // === Accountant corner (bottom-right) ===
  items.push({ x: 28, y: 20, type: 'office_desk' });
  items.push({ x: 28, y: 22, type: 'office_chair' });

  return items;
}

function createCollisionMap(floor: number[][], furniture: FurnitureItem[]): boolean[][] {
  const map: boolean[][] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      row.push(floor[y]?.[x] === 3);
    }
    map.push(row);
  }

  for (const item of furniture) {
    if (item.type === 'office_desk' || item.type === 'desk' || item.type === 'table_conf' || item.type === 'plant') {
      if (map[item.y]) {
        map[item.y][item.x] = true;
      }
    }
  }

  return map;
}

export const floorLayer = createFloorLayer();
export const furniture = createFurniture();
export const collisionMap = createCollisionMap(floorLayer, furniture);
