// Bulwark's great-sword keyframes (shared by the renderer and the game logic, so the hitbox rides the blade tip exactly as drawn).
// columns: lSx,lSz,lE, blade angle (0 up, 90 forward, 180 down, 270 back), lean,torsoY,twist,dy,fwd,lHx,rHx,lK,rK,headX
const clamp01 = (v) => Math.max(0, Math.min(1, v)), smooth = (t) => t * t * (3 - 2 * t);
export const BW_KEYS = {
    UP: [[0, [125, 18, 95, 293, 0, 0, 0, 0, 0, 0, 0, 8, 8, 0]],
         [38, [-28, 14, 24, 205, 16, 22, 8, -5, 0, 20, -18, 44, 20, 8], 'slow'],                // sinks, blade low behind him ... very slowly
         [48, [165, 20, 8, 18, -14, -24, -10, 8, 4, -8, 12, 6, 32, -16], 'fast'],               // ... then the full upward slash from the low far side to overhead
         [60, [125, 18, 95, -67, 0, 0, 0, 0, 0, 0, 0, 8, 8, 0], 'smooth']],
    SIDE: [[0, [125, 18, 95, 293, 0, 0, 0, 0, 0, 0, 0, 8, 8, 0]],
         [14, [-26, 24, 22, 236, 8, 34, 16, -2, 0, 12, -12, 34, 16, 4], 'smooth'],             // blade low behind him, point on the floor
         [38, [-12, 30, 22, 198, 12, 40, 20, -3, 0, 16, -14, 40, 18, 6], 'slow'],               // dragged forward along the floor, slowly, throwing sparks
         [48, [95, 40, 8, 66, -20, -36, -22, 3, 10, -10, 18, 8, 30, 8], 'fast'],               // then up and across in one sweep
         [60, [125, 18, 95, -67, 0, 0, 0, 0, 0, 0, 0, 8, 8, 0], 'smooth']],
    DOWN: [[0, [125, 18, 95, -67, 0, 0, 0, 0, 0, 0, 0, 8, 8, 0]],
         [26, [168, 8, 16, -12, -10, 10, 0, 3, 0, -8, 8, 14, 14, -12], 'slow'],                // lifted above the head, slowly
         [38, [152, 10, 30, 176, -4, 8, 0, 2, 0, -6, 6, 18, 18, -6], 'smooth'],                // turned point-down, held high in both hands
         [48, [55, 10, 8, 178, 28, -14, -8, -8, 8, 20, -14, 50, 30, 18], 'fast'],              // driven straight down into the floor in front of him
         [60, [125, 18, 95, 293, 0, 0, 0, 0, 0, 0, 0, 8, 8, 0], 'smooth']],
};
BW_KEYS.BACK = [[0, [125, 18, 95, 293, 0, 0, 0, 0, 0, 0, 0, 8, 8, 0]],
         [8, [60, 10, 40, 100, -3, -4, -14, -1, 1, 10, -10, 22, 10, -3], 'smooth'],             // the great-sword is drawn in close, point forward, body coiled
         [12, [-70, 8, 4, 268, 2, 4, 16, -2, -2, -14, 16, 30, 12, 4], 'fast'],               // then driven straight out behind him
         [18, [-74, 8, 4, 266, 2, 4, 18, -2, -2, -14, 16, 30, 12, 4], 'smooth'],
         [26, [125, 18, 95, 293, 0, 0, 0, 0, 0, 0, 0, 8, 8, 0], 'smooth']];
export function bwEval(T, fr) {
    let i = 0;
    while (i < T.length - 2 && fr > T[i + 1][0]) i++;
    const A = T[i], B = T[i + 1], span = B[0] - A[0];
    let q = clamp01((fr - A[0]) / span);
    const e = B[2];
    q = e === 'slow' ? q * q * q : e === 'fast' ? 1 - (1 - q) * (1 - q) : smooth(q);
    return A[1].map((v, j) => v + (B[1][j] - v) * q);
}


