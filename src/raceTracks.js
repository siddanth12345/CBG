// Race tracks: every map has its own course (small and big versions of a theme share the look, not the track).
// A track is a chain of soft platforms [gap, rise (negative = up), width] after the start island; the last one is the finish island.
const START = { x: 300, y: 3125, w: 1300 };
const CH = {
    frontier:   [[190, 0, 300], [210, -70, 260], [220, 50, 280], [190, -90, 250], [230, 0, 280], [200, -70, 260], [220, 60, 280], [200, -60, 260], [220, 0, 800]],
    big:        [[200, -80, 300], [220, -120, 260], [230, -120, 260], [220, 60, 300], [240, -100, 260], [220, -120, 240], [230, -120, 260], [220, 100, 300], [220, -60, 800]],
    horizon:    [[240, -40, 240], [260, 60, 220], [250, -60, 240], [260, 40, 220], [250, -80, 240], [260, 50, 220], [250, -50, 240], [240, 0, 800]],
    bighorizon: [[200, 60, 300], [220, 120, 260], [230, 100, 260], [230, -60, 240], [240, 120, 260], [230, 100, 280], [230, -110, 260], [240, -90, 260], [220, -60, 800]],
    lava:       [[200, 0, 200], [210, -60, 180], [220, 50, 200], [210, -70, 180], [230, 0, 200], [220, -90, 180], [220, 60, 200], [220, -70, 180], [230, 30, 200], [210, -30, 800]],
    biglava:    [[190, -100, 260], [210, -130, 220], [200, -130, 240], [210, -120, 200], [200, -130, 240], [220, -100, 200], [200, -110, 240], [210, -80, 220], [200, -60, 800]],
};
export const TRACK_NAMES = { frontier: 'Neon Sprint', big: 'Skyline Climb', horizon: 'Cloud Hop', bighorizon: 'Waterfall Descent', lava: 'Magma Dash', biglava: 'Volcano Ascent' };
export function raceTrack(map) {
    const ch = CH[map] || CH.big;
    let x = START.x + START.w, y = START.y;
    const platforms = [];
    for (const [gap, rise, w] of ch) { x += gap; y += rise; platforms.push({ x, y, w }); x += w; }
    const last = platforms[platforms.length - 1];
    const nodes = [{ l: START.x, r: START.x + START.w, y: START.y }, ...platforms.map(p => ({ l: p.x, r: p.x + p.w, y: p.y }))];
    return {
        stage: { x: START.x, y: START.y, width: START.w, height: 225 },
        platforms, nodes, finishX: last.x + last.w * 0.5, finishY: last.y,
        killY: Math.max(...nodes.map(n => n.y)) + 900, name: TRACK_NAMES[map] || 'Race',
    };
}
