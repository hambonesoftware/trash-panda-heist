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

// Trash the raccoon digs out of cans. `pierce` keeps most of a shot's speed after it breaks a box.
export const AMMO = {
  can:    { name: 'Tin can',      r: 15, density: 0.005,  hint: 'A solid all-rounder.' },
  bag:    { name: 'Trash bag',    r: 24, density: 0.006,  hint: 'Heavy. Smashes wooden crates.' },
  fish:   { name: 'Fish bones',   r: 12, density: 0.005,  hint: 'Tap while it flies to split it in three.' },
  bottle: { name: 'Glass bottle', r: 11, density: 0.012,  hint: 'Punches straight through a box.', pierce: 0.92 },
  melon:  { name: 'Melon rind',   r: 27, density: 0.0075, hint: 'Very heavy. Topples a whole stack.' },
  banana: { name: 'Banana peel',  r: 13, density: 0.003,  hint: 'Weak on boxes. Land it on the dock and the stocker slips.' },
};

// ---------- the alley maze (Lode Runner half) ----------
// Heights are feet-level above the ground. Ropes are listed by the feet level of the floors they join;
// the line itself hangs ROPE_UP above that.
export const PERCH_X = 282;      // walk right past this to take the slingshot position
export const ROPE_UP = 150;
export const ROAM = {
  run: 300, climb: 215, rope: 185, grav: 2300, xMin: -1560,
  rummage: 0.75,   // seconds per piece of trash
  refill: 26,      // seconds until an emptied can has trash again
  trapLife: 9, trapCool: 2.2, stun: 3.6, noise: 380,
  guardMaxX: 70,   // guards never come up to the perch
  safeX: 135,      // and cannot see the raccoon this close to it
  giveUp: 1.4, blind: 3,   // a guard who cannot reach him gives up, then looks around for a while
};
export const MAZE = {
  floors: [
    { id: 'g', h: 0,   x0: -1600, x1: 340 },
    { id: 'A', h: 260, x0: -1500, x1: -1020 },
    { id: 'B', h: 260, x0: -760,  x1: -300 },
    { id: 'C', h: 520, x0: -1320, x1: -860 },
    { id: 'D', h: 520, x0: -560,  x1: -180 },
  ],
  ladders: [
    { x: -1440, h0: 0,   h1: 260 },
    { x: -1080, h0: 260, h1: 520 },
    { x: -700,  h0: 0,   h1: 260 },
    { x: -360,  h0: 260, h1: 520 },
  ],
  ropes: [
    { h: 260, x0: -1020, x1: -760 },
    { h: 520, x0: -860,  x1: -560 },
  ],
  // The harder a can is to reach, the better its trash.
  cans: [
    { x: -250,  floor: 'g', loot: ['can', 'can'] },
    { x: -900,  floor: 'g', loot: ['bag', 'can'] },
    { x: -1300, floor: 'g', loot: ['can', 'banana'] },
    { x: -1250, floor: 'A', loot: ['fish', 'bag'] },
    { x: -520,  floor: 'B', loot: ['bag', 'bottle'] },
    { x: -1200, floor: 'C', loot: ['melon', 'bottle'] },
    { x: -260,  floor: 'D', loot: ['melon', 'fish'] },
  ],
  guards: [
    { floor: 'g', x: -820,  x0: -1480, x1: -120 },
    { floor: 'B', x: -480,  x0: -740,  x1: -320 },
    { floor: 'C', x: -1100, x0: -1300, x1: -880 },
  ],
};

// One meal every six hours. After dinner a new day starts with a faster crew.
export const MEALS = ['Midnight Snack', 'Breakfast', 'Lunch', 'Dinner'];
export const LEVELS = [
  { name: 'Midnight Snack', hour: 0, par: 11, first: 14, interval: 24, speed: 170, spot: 0.9, flight: 0.85, linger: 0.3, crates: 0,
    stash: ['can', 'can', 'bag'], guards: 1, guardSpeed: 1,
    cols: [[880, 'box', 'box'], [950, 'box', 'small'], [1016, 'box', 'box', 'small'], [1082, 'box', 'box'], [1148, 'box']] },
  { name: 'Breakfast', hour: 6, par: 15, first: 12, interval: 20, speed: 200, spot: 0.75, flight: 0.75, linger: 0.6, crates: 0.15,
    stash: ['can', 'fish'], guards: 2, guardSpeed: 1.06,
    cols: [[880, 'crate', 'box', 'small'], [950, 'box', 'box'], [1016, 'crate', 'box', 'small'], [1082, 'box', 'box', 'box'], [1148, 'box', 'small']] },
  { name: 'Lunch', hour: 12, par: 19, first: 11, interval: 17, speed: 215, spot: 0.68, flight: 0.7, linger: 0.8, crates: 0.22,
    stash: ['can', 'bag'], guards: 2, guardSpeed: 1.12,
    cols: [[880, 'crate', 'box', 'box'], [950, 'box', 'crate', 'small'], [1016, 'box', 'box', 'small'], [1082, 'crate', 'box', 'box'], [1148, 'box', 'small']] },
  { name: 'Dinner', hour: 18, par: 22, first: 10, interval: 15, speed: 230, spot: 0.6, flight: 0.65, linger: 1.0, crates: 0.3,
    stash: ['can', 'can'], guards: 3, guardSpeed: 1.18,
    cols: [[880, 'crate', 'box', 'box'], [950, 'box', 'crate', 'small'], [1016, 'box', 'box', 'box', 'small'], [1082, 'crate', 'box', 'box'], [1148, 'box', 'box', 'small']] },
];
