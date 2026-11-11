// Bot-vs-bot balance report: node tools/balance.js [baseUrl] [chars,comma] [matchesPerChar] [tier] [out.json]
//   every listed character (played by a bot of the given tier, default hard) fights the other characters in 1-stock matches; prints its win rate.
//   needs the dev server (python3 -m http.server 8123) and playwright. A match that is still going after 7000 steps is decided by damage.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const ALL = ['luminent', 'bulwark', 'zephyr', 'ember', 'tide', 'volt', 'umbra', 'terra'];
const chars = (process.argv[3] || ALL.join(',')).split(','), N = +(process.argv[4] || 16), tier = process.argv[5] || 'hard', out = process.argv[6];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 400, height: 240 } })).newPage();
  await pg.goto(URL); await pg.waitForFunction(() => window.__luminary, null, { timeout: 60000 });
  await pg.evaluate(async () => { const m = await import('./src/account.js'); m.playAsGuest(); document.querySelectorAll('.lm-modal').forEach(x => x.classList.add('lm-hidden')); });
  const res = {};
  for (const ch of chars) {
    const r = await pg.evaluate(async ({ ch, ALL, N, tier }) => {
      const c = await import('./src/gameCore.js'); const L = window.__luminary; let w = 0, n = 0;
      for (let k = 0; k < N; k++) {
        const oc = ALL.filter(x => x !== ch)[k % 7];
        L.startMatchSequence('lobby', { players: [{ slot: 2, name: 'o', team: 'red', char: oc, bot: tier }, { slot: 3, name: 'x', team: 'blue', char: ch, bot: tier }], teams: false, startDamage: 0, stocks: 1, map: ['frontier', 'big', 'horizon', 'bighorizon'][k % 4] });
        await new Promise(r => { const t = setInterval(() => { if (L.S.gameState === 'playing') { clearInterval(t); r(); } }, 20); });
        window.__luminaryPaused = true;
        for (let i = 0; i < 7000 && L.S.gameState === 'playing'; i++) L.step();
        const A = c.fighters[2], B = c.fighters[3]; n++;
        if (B.stocks > A.stocks) w++; else if (B.stocks === A.stocks && B.damage < A.damage) w += 0.5;
        window.__luminaryPaused = false;
      }
      return { w, n };
    }, { ch, ALL, N, tier });
    res[ch] = +(r.w / r.n).toFixed(2); console.log(ch, res[ch], `(${r.n} matches)`);
  }
  if (out) require('fs').writeFileSync(out, JSON.stringify(res));
  await b.close();
})();
