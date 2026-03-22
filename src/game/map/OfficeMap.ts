import { MAP_WIDTH, MAP_HEIGHT } from './zones';

// Map layers
// 0 = empty, 1 = floor, 2 = carpet, 3 = wall
// Furniture layer: 0=empty, D=desk, C=computer, T=conference table, P=plant, W=whiteboard

// Create the floor layer (30x24 grid)
function createFloorLayer(): number[][] {
  const map: number[][] = [];

  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: number[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      // Walls on edges
      if (y === 0 || y === MAP_HEIGHT - 1 || x === 0 || x === MAP_WIDTH - 1) {
        row.push(3); // wall
        continue;
      }

      // Internal walls
      // Horizontal dividers
      if (y === 7 && (x < 6 || (x > 7 && x < 12))) {
        row.push(3);
        continue;
      }
      if (y === 13 && (x < 6 || (x > 7 && x < 12))) {
        row.push(3);
        continue;
      }

      // Lounge area - carpet (open space, no wall)
      if (x >= 15 && x <= 24 && y >= 1 && y <= 9) {
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

// Furniture placement data
export interface FurnitureItem {
  x: number;
  y: number;
  type: string; // tile key
}

function createFurniture(): FurnitureItem[] {
  const items: FurnitureItem[] = [];

  // CEO office (top-left)
  items.push({ x: 3, y: 2, type: 'office_desk' });
  items.push({ x: 3, y: 4, type: 'office_chair' });
  items.push({ x: 1, y: 1, type: 'plant' });

  // CDO office (top-middle)
  items.push({ x: 9, y: 2, type: 'office_desk' });
  items.push({ x: 9, y: 4, type: 'office_chair' });

  // CTO office (middle-left)
  items.push({ x: 3, y: 8, type: 'office_desk' });
  items.push({ x: 3, y: 10, type: 'office_chair' });

  // CMO office (middle-middle)
  items.push({ x: 9, y: 8, type: 'office_desk' });
  items.push({ x: 9, y: 10, type: 'office_chair' });
  items.push({ x: 12, y: 8, type: 'plant' });

  // CFO office (bottom-left)
  items.push({ x: 3, y: 14, type: 'office_desk' });
  items.push({ x: 3, y: 16, type: 'office_chair' });

  // CSO office (bottom-middle)
  items.push({ x: 9, y: 14, type: 'office_desk' });
  items.push({ x: 9, y: 16, type: 'office_chair' });
  items.push({ x: 12, y: 14, type: 'plant' });

  // Lounge area
  items.push({ x: 22, y: 1, type: 'whiteboard' });
  items.push({ x: 15, y: 1, type: 'plant' });
  items.push({ x: 24, y: 1, type: 'plant' });
  items.push({ x: 15, y: 9, type: 'plant' });
  items.push({ x: 24, y: 9, type: 'plant' });

  // Accountant corner (bottom-right)
  items.push({ x: 28, y: 20, type: 'office_desk' });
  items.push({ x: 28, y: 22, type: 'office_chair' });

  // Hallway plants
  items.push({ x: 7, y: 1, type: 'plant' });
  items.push({ x: 7, y: 19, type: 'plant' });

  return items;
}

// Collision map: true = blocked
function createCollisionMap(floor: number[][], furniture: FurnitureItem[]): boolean[][] {
  const map: boolean[][] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      row.push(floor[y]?.[x] === 3); // walls are blocked
    }
    map.push(row);
  }

  // Block furniture positions
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
