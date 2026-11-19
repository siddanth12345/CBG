// Graphics quality setting (Auto | Low | Medium | High), remembered on this device.
const KEY = 'cbg.gfx';
export const getGfx = () => { try { const v = localStorage.getItem(KEY); return ['auto', 'low', 'medium', 'high'].includes(v) ? v : 'auto'; } catch (e) { return 'auto'; } };
export function setGfx(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* blocked */ } window.dispatchEvent(new CustomEvent('cbg-gfx')); }

/** Low quality setting only (not Auto, even when Auto drops resolution). */
export const lowGfx = () => getGfx() === 'low';

/** Decorative particle density. Low uses structural cuts + ~0; Medium 26%; High 50%; Auto leaves null so view.js ladder decides. */
export const particleScale = () => {
    const g = getGfx();
    if (g === 'low') return 0.08;
    if (g === 'medium') return 0.18;
    if (g === 'high') return 0.35;
    return null;
};

// Show the red attack hitboxes (off by default), remembered on this device.
const HKEY = 'cbg.hitboxes';
export const getHitboxes = () => { try { return localStorage.getItem(HKEY) === '1'; } catch (e) { return false; } };
export function setHitboxes(on) { try { localStorage.setItem(HKEY, on ? '1' : '0'); } catch (e) { /* blocked */ } window.dispatchEvent(new CustomEvent('cbg-hb')); }

// Reduce flashing lights: no full-screen flashes or flicker, dimmer lights and glow, and a smoother final-blow transition. Remembered on this device.
const RKEY = 'cbg.reduceFlash';
let rfOn = false; try { rfOn = localStorage.getItem(RKEY) === '1'; } catch (e) { /* blocked */ }
export const getReduceFlash = () => rfOn;
export function setReduceFlash(on) { rfOn = !!on; try { localStorage.setItem(RKEY, on ? '1' : '0'); } catch (e) { /* blocked */ } window.dispatchEvent(new CustomEvent('cbg-rf')); }

// Camera zoom (this player's own view only; it is never shared with other players):
//   all    = frame every fighter (the default)      stage  = lock on the stage (zooms out to include you if you leave it)
//   player = frame you and the nearest fighter      full   = always the whole map (not recommended)
const ZKEY = 'cbg.zoom';
export const ZOOM_MODES = ['all', 'stage', 'player', 'full'];
export const getZoom = () => { try { const v = localStorage.getItem(ZKEY); return ZOOM_MODES.includes(v) ? v : 'all'; } catch (e) { return 'all'; } };
export function setZoom(v) { try { localStorage.setItem(ZKEY, v); } catch (e) { /* blocked */ } window.dispatchEvent(new CustomEvent('cbg-zoom')); }
