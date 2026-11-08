// Self-play training for the bots: node tools/trainAI.js  (needs the dev server on :8123 and playwright)
// Episodes per character: easy 5, medium 25, hard 120. Writes src/aiPrior.js.
const { chromium } = require('playwright'); const fs = require('fs');
const EP = { easy: 5, medium: 25, hard: +(process.env.HARD || 120) };
if (process.env.ONLY) { EP.only = process.env.ONLY.split(','); EP.levels = ['hard']; }   // ONLY=ember,umbra: extra practice for those characters (hard bots), merged into the existing priors
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const pg = await (await b.newContext({ viewport: { width: 700, height: 400 } })).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://127.0.0.1:8123/index.html'); await pg.waitForFunction(() => window.__luminary, null, { timeout: 60000 });
  const out = await pg.evaluate(async (EP) => {
    const m = await import('./src/account.js'); m.playAsGuest(); document.querySelectorAll('.lm-modal').forEach(x => x.classList.add('lm-hidden'));
    const c = await import('./src/gameCore.js'); const L = window.__luminary;
    const ids = (EP.only || ['bulwark','zephyr','ember','tide','volt','umbra','terra']);
    const others = ['luminent','bulwark','zephyr','ember','tide','volt','umbra','terra'];
    for (const lv of ['easy','medium','hard']) for (const k in c.aiStats[lv]) delete c.aiStats[lv][k];
    window.__luminaryPaused = true;
    L.startMatchSequence('lobby', { players: [{ slot: 2, name: 'a', team: 'red', char: 'ember', bot: 'hard' }, { slot: 3, name: 'b', team: 'blue', char: 'tide', bot: 'hard' }], teams: false, startDamage: 0, stocks: 99, mySlot: 2 });
    await new Promise(r => { const t = setInterval(() => { if (L.S.gameState === 'playing') { clearInterval(t); r(); } }, 20); });
    window.__luminaryPaused = true;
    const A = c.fighters[2], B = c.fighters[3];
    for (const lv of (EP.levels || ['easy','medium','hard'])) for (const id of ids) for (let e = 0; e < EP[lv]; e++) {
      c.setArenaByMap(['frontier','big','horizon','bighorizon'][(e + ids.indexOf(id)) % 4]);   // small and big arenas (platforms) alike
      { const S_ = c.STAGE; A.startX = S_.x + S_.width * 0.4; B.startX = S_.x + S_.width * 0.6; A.startY = B.startY = S_.y - 120; }
      A.char = id; B.char = others[(e + ids.indexOf(id)) % others.length]; A.diff = B.diff = lv;
      A.stocks = B.stocks = 99; A.out = B.out = false; A.reset(true); B.reset(true); A.damage = B.damage = 0;
      if (lv === 'easy') { B.x = A.x + 260; B.y = A.y; }   // easy bots barely walk, so start them close
      for (let i = 0; i < 2400; i++) { L.step(); for (const f of [A, B]) { if (f.damage > 140) f.damage = 40; if (f.out) { f.out = false; f.stocks = 99; f.reset(true); } } }
    }
    return JSON.parse(JSON.stringify(c.aiStats));
  }, EP);
  if (process.env.ONLY) { const cur = fs.readFileSync('src/aiPrior.js', 'utf8'); const prior = JSON.parse(cur.match(/AI_PRIOR = (\{.*\});/s)[1]); for (const k in out.hard) if (EP.only.includes(k.split(':')[0])) { const o = prior.hard[k] || { use: 0, hit: 0 }; prior.hard[k] = { use: o.use + out.hard[k].use, hit: o.hit + out.hard[k].hit }; } fs.writeFileSync(process.env.OUT || 'src/aiPrior.js', cur.slice(0, cur.indexOf('export const AI_PRIOR')) + 'export const AI_PRIOR = ' + JSON.stringify(prior) + ';\n'); console.log('merged', EP.only.join(',')); await b.close(); return; }
  fs.writeFileSync(process.env.OUT || 'src/aiPrior.js', '// Pre-trained special-move success rates per difficulty (self-play, tools/trainAI.js: easy 5, medium 25, hard 120 rounds per character).\nexport const AI_PRIOR = ' + JSON.stringify(out) + ';\n');
  console.log(JSON.stringify(out).slice(0, 1500)); console.log('errors', errs.slice(0, 5));
  await b.close();
})();
