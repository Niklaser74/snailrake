// Three buttons, held. Pointer events with capture — a click handler would let
// go the moment a thumb slides a millimetre, and a hold-to-move game dies on
// that. Keyboard goes through the same path, so there is exactly one flow.
export function bindInput({ left, right, drop }, handlers) {
  const held = { left: false, right: false };
  const pointers = new Map(); // pointerId -> axis
  const btn = { left, right };

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
  bindAxis(left, 'left');
  bindAxis(right, 'right');

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
    left.classList.remove('down');
    right.classList.remove('down');
    set('left', false);
    set('right', false);
  }
  addEventListener('blur', releaseAll);
  addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  const KEYS = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const axis = KEYS[e.key];
    if (axis) { e.preventDefault(); btn[axis].classList.add('down'); set(axis, true); return; }
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') {
      if (e.target && e.target.tagName === 'BUTTON' && e.target !== drop && e.target !== left && e.target !== right) return; // let menu buttons work
      e.preventDefault();
      drop.classList.add('down');
      handlers.drop();
    }
  });
  addEventListener('keyup', (e) => {
    const axis = KEYS[e.key];
    if (axis) { btn[axis].classList.remove('down'); set(axis, false); }
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') drop.classList.remove('down');
  });

  return { held, releaseAll };
}
