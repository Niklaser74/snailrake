// The five snail sizes. Colour is size: the player reads the pile by hue alone,
// so the five must stay far apart.
//
// TEAM_COLORS only has four. The fifth is the rake's own and is defined HERE,
// never in js/game/snails.js — that file is a copy and `npm run sync:game`
// overwrites it.
import { TEAM_COLORS } from './game/snails.js';

const hex = Object.fromEntries(TEAM_COLORS.map((c) => [c.id, c.hex]));

// Purple: the only saturated hue left that survives a green lawn. Orange muddies
// into yellow, teal into blue, pink vanishes into the garden theme's flowers.
export const PURPLE = '#a855f7';

// r is collision truth (the circle the physics sees); scale is only drawing,
// chosen so the drawn snail is about as wide as the circle (scale 1 ≈ 48 px).
// speed is the crawl towards a match, px/s — snail pace on purpose: the pile
// has to grow faster than it tidies itself, or there is nothing to do.
// The ladder ends on red on purpose: the level about to pop should pull the eye.
//
// (LEVELS is a plain array so balancing scripts can tweak r in place.)
// Sizes are big on purpose: with five levels a red is only sixteen yellows, so
// the pops drain the pile fast. A board about 2.5 reds wide is what makes a
// sloppy player lose in ~4 minutes (measured 2026-09-13, docs-vault).
export const LEVELS = [
  { id: 1, color: hex.yellow, r: 22, scale: 0.92, speed: 4, score: 5 },
  { id: 2, color: hex.green, r: 30, scale: 1.25, speed: 3.5, score: 15 },
  { id: 3, color: hex.blue, r: 41, scale: 1.71, speed: 3, score: 40 },
  { id: 4, color: PURPLE, r: 52, scale: 2.17, speed: 2.5, score: 100 },
  { id: 5, color: hex.red, r: 67, scale: 2.8, speed: 2, score: 300 },
];

export const TOP_LEVEL = LEVELS.length - 1;
export const SNAIL_STYLE = 'cartoon'; // the same snail as the hub cards and the chess board
