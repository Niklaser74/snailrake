// Three buttons, held. Pointer events with capture — a click handler would let
// go the moment a thumb slides a millimetre, and a hold-to-move game dies on
// that. Keyboard goes through the same path, so there is exactly one flow.
export function bindInput({ x, y, drop }, handlers) {
  const held = { x: false, y: false };
  const pointers = new Map(); // pointerId -> axis

  function set(axis, on) {
    if (held[axis] === on) return;
    held[axis] = on;
    handlers.axis(axis, on);
  }
  function bindAxis(el, axis) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
      pointers.set(e.pointerId, axis);
      el.classList.add('down');
      set(axis, true);
    });
    const up = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      el.classList.remove('down');
      set(axis, false);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  bindAxis(x, 'x');
  bindAxis(y, 'y');

  drop.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    drop.classList.add('down');
    handlers.drop();
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) drop.addEventListener(ev, () => drop.classList.remove('down'));
  drop.addEventListener('contextmenu', (e) => e.preventDefault());

  // anything that steals focus lets go of everything, or the rake runs off on its own
  function releaseAll() {
    pointers.clear();
    x.classList.remove('down');
    y.classList.remove('down');
    set('x', false);
    set('y', false);
  }
  addEventListener('blur', releaseAll);
  addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  const KEYS = { ArrowRight: 'x', d: 'x', D: 'x', ArrowDown: 'y', s: 'y', S: 'y' };
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const axis = KEYS[e.key];
    if (axis) { e.preventDefault(); (axis === 'x' ? x : y).classList.add('down'); set(axis, true); return; }
    if (e.key === ' ' || e.key === 'Enter') {
      if (e.target && e.target.tagName === 'BUTTON' && e.target !== drop && e.target !== x && e.target !== y) return; // let menu buttons work
      e.preventDefault();
      drop.classList.add('down');
      handlers.drop();
    }
  });
  addEventListener('keyup', (e) => {
    const axis = KEYS[e.key];
    if (axis) { (axis === 'x' ? x : y).classList.remove('down'); set(axis, false); }
    if (e.key === ' ' || e.key === 'Enter') drop.classList.remove('down');
  });

  return { held, releaseAll };
}
