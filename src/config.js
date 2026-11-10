// Physics is 2D: x right, y down, ground at y = G. Scene height = G - physics y.
export const G = 600;
export const STEP_MS = 1000 / 60;
export const STEP = STEP_MS / 1000;
export const GRAV = 0.001 * STEP_MS * STEP_MS;
export const AIR = 0.004;

export const RS = 1.15;
export const CS = 1.25;
export const CAN_X = 165;
export const RAC_X = 305;
export const ZONE = { x0: 830, x1: 1212, top: 150 };
export const DUMP_X = 1060;
export const DUMP_TOP = G - 160;
export const DOOR_X = 1385, DOCK_Y = 50, DOCK_Z = -205, STAND_X = 1312;

export const MAX_PULL = 95, MIN_PULL = 16, POWER = 0.25;

export const SPEC = {
  box:   { w: 60, h: 60, d: 56, hp: 40,  density: 0.001,  color: 0xd49d5e, hurt: 0xa87947 },
  small: { w: 46, h: 46, d: 44, hp: 28,  density: 0.001,  color: 0xe2b273, hurt: 0xb3874f },
  crate: { w: 60, h: 60, d: 56, hp: 130, density: 0.0018, color: 0xa86f3a, hurt: 0x7f5229 },
};

export const AMMO = {
  can:  { name: 'Tin can',    r: 15, density: 0.005, hint: 'A solid all-rounder.' },
  bag:  { name: 'Trash bag',  r: 24, density: 0.006, hint: 'Heavy. Smashes wooden crates.' },
  fish: { name: 'Fish bones', r: 12, density: 0.005, hint: 'Tap while it flies to split it in three.' },
};

export const LEVELS = [
  { name: 'Night Shift', par: 11, first: 8, interval: 13, speed: 170, spot: 0.9, flight: 0.85, linger: 0.3, crates: 0,
    ammo: ['can', 'can', 'bag'],
    cols: [[880, 'box', 'box'], [950, 'box', 'small'], [1016, 'box', 'box', 'small'], [1082, 'box', 'box'], [1148, 'box']] },
  { name: 'Restock Rush', par: 15, first: 7, interval: 10, speed: 200, spot: 0.75, flight: 0.75, linger: 0.6, crates: 0.15,
    ammo: ['can', 'fish', 'can', 'bag'],
    cols: [[880, 'crate', 'box', 'small'], [950, 'box', 'box'], [1016, 'crate', 'box', 'small'], [1082, 'box', 'box', 'box'], [1148, 'box', 'small']] },
  { name: 'Inventory Day', par: 20, first: 6, interval: 7.5, speed: 230, spot: 0.6, flight: 0.65, linger: 1.0, crates: 0.3,
    ammo: ['can', 'bag', 'fish', 'can'],
    cols: [[880, 'crate', 'box', 'box'], [950, 'box', 'crate', 'small'], [1016, 'box', 'box', 'box', 'small'], [1082, 'crate', 'box', 'box'], [1148, 'box', 'box', 'small']] },
];
