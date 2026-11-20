// Race tracks: every map has its own course (small and big versions of a theme share the look, not the track).
// A track is a chain of soft platforms [gap, rise (negative = up), width] after the start island; the last one is the finish island.
const START = { x: 300, y: 3125, w: 1300 };
const CH = {
    // Neon Sprint: a rhythm of short hops, then a long thin bridge between two pillars, a dive, and a final staircase
    frontier:   [[170, 0, 240], [190, -60, 200], [190, 60, 200], [210, -110, 160], [180, 0, 520], [200, 90, 140], [210, 0, 140], [230, -40, 140], [200, 110, 360], [190, -70, 220], [200, -80, 220], [200, -80, 220], [210, 60, 700]],
    // Skyline Climb: a tower of ledges zig-zagging upward, then a long glide down the other side
    big:        [[190, -90, 260], [210, -120, 200], [190, 0, 160], [210, -120, 200], [180, -110, 260], [230, -60, 140], [210, 100, 200], [200, 120, 200], [200, 100, 460], [220, 40, 160], [210, -30, 160], [230, 0, 160], [220, -80, 700]],
    // Cloud Hop: lots of little clouds, every jump a commitment (needs the double jump), with a wide cloud to catch your breath
    horizon:    [[210, -30, 150], [240, 50, 130], [250, -70, 150], [250, 20, 130], [240, -90, 150], [220, 0, 520], [250, 60, 130], [260, -40, 120], [250, 70, 130], [250, -80, 120], [240, 30, 130], [230, -50, 130], [230, 0, 700]],
    // Waterfall Descent: big drops down a cascade of ledges, a rushing flat in the middle, then back up the far wall
    bighorizon: [[170, 90, 260], [200, 130, 200], [190, 120, 200], [200, 110, 340], [200, -20, 440], [210, 120, 160], [200, 100, 200], [210, -90, 200], [200, -120, 180], [210, -120, 180], [200, -110, 200], [200, -60, 700]],
    // Magma Dash: tiny stepping stones over the lava, one long cooled bridge, a final leap
    lava:       [[180, 0, 140], [200, -40, 120], [210, 40, 120], [200, -60, 120], [210, 30, 120], [200, 0, 560], [220, -70, 120], [230, 80, 110], [230, -60, 110], [230, 50, 110], [230, -90, 120], [240, -20, 140], [250, 0, 700]],
    // Volcano Ascent: a steep zig-zag climb around the crater, with a few wide ledges to rest on, and a summit
    biglava:    [[170, -100, 220], [190, -120, 160], [180, 70, 160], [200, -130, 160], [190, -120, 240], [190, 60, 140], [210, -120, 140], [190, -120, 180], [190, -110, 360], [210, 70, 140], [220, -110, 140], [200, -110, 160], [190, -90, 700]],
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
