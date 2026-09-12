// The five snail sizes. Colour is size: the player reads the lawn by hue alone,
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

// r is collision truth, scale is only drawing (scale 1 ≈ 48 px wide snail),
// thick is how tall the snail is when something rests on top of it.
// speed is the crawl towards a match, px/s — snail pace on purpose: the lawn
// has to fill faster than it tidies itself, or there is nothing to do.
// The ladder ends on red on purpose: the level about to pop should pull the eye.
export const LEVELS = [
  { id: 1, color: hex.yellow, r: 12, thick: 9, scale: 0.45, speed: 4, score: 5 },
  { id: 2, color: hex.green, r: 16, thick: 12, scale: 0.6, speed: 3.5, score: 15 },
  { id: 3, color: hex.blue, r: 21, thick: 15, scale: 0.8, speed: 3, score: 40 },
  { id: 4, color: PURPLE, r: 27, thick: 19, scale: 1.05, speed: 2.5, score: 100 },
  { id: 5, color: hex.red, r: 34, thick: 24, scale: 1.35, speed: 2, score: 300 },
];

export const TOP_LEVEL = LEVELS.length - 1;
export const SNAIL_STYLE = 'cartoon'; // the same snail as the hub cards and the chess board
