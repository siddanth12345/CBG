// Chat word filter. Bad words are replaced with asterisks of the same length (f*** style, but all stars), in many languages, and the usual bypasses are undone first:
// leet speak (f4ck, sh1t, @ss), look-alike letters from other alphabets (Cyrillic / Greek), accents, fullwidth letters, zero-width characters, separators
// (f.u.c.k, f u c k, f-u-c-k), stretched letters (fuuuuck) and words glued together (youfuckingidiot).
// STRONG words are matched anywhere inside the squashed message; SHORT words (which sit inside harmless words: ass in "class", cum in "document") only as whole words.

const STRONG = `fuck fuk fvck fucc fukk phuck phuk motherfuck mofo shit shyt shiit shite bullshit horseshit dipshit bitch biatch bytch beatch cunt kunt cuunt nigger nigga nigguh nigr faggot faget fagot faggit fagg whore slut skank bastard basterd asshole arsehole dickhead dickhed dickface cocksucker cocksuck blowjob handjob rimjob jizz cumshot cumslut dildo pussy wanker twat tosser bollock bugger retard spastic mongoloid tranny shemale wetback beaner raghead towelhead sandnigger porchmonkey jigaboo
pedophile paedophile paedo molest childporn nazi heilhitler hitler kkk whitepower killyourself killurself gokillyourself hopeyoudie dieinafire
mierda pendejo pendeja cabron cabrona chingar chingada chinga verga culero joder hijodeputa hijueputa malparido gonorrea maricon conchetumare culiao ctm
merde putain connard connasse salope salaud encule batard branleur petasse
scheisse scheiss arschloch wichser wichsen fotze hurensohn schlampe ficken ficker verpiss missgeburt
porra caralho fodase buceta viado vadia merda filhodaputa cuzao arrombado babaca
cazzo stronzo stronza vaffanculo puttana minchia coglione cogliona fanculo
blyat blyad pizda pizdec huyne ebany eblan gandon mudak mudila zalupa pidor pidoras pidar yobany
madarchod behenchod bhenchod bhosdike bhosdi chutiya chutiye gandu gaandu haramkhor lavde bhosda
sharmouta sharmoota ibnelkalb kusomak ayrfik
orospu siktir sikerim yarrak pezevenk
kurwa jebac pierdol pierdolic chuj skurwysyn
klootzak kanker kankerlijer
caonima caonimabi tamade wocao jibai ssibal sibal gaesaekki byungshin kuso chikusho kisama`.split(/\s+/).filter(w => w.length >= 3);

// native-script words (matched in the text with spaces and punctuation removed)
const NATIVE = `сука суки сучка блядь блять бляд пизда пизде пизду пиздец хуй хуя хуе хуев нахуй похуй ебать ебал ебан ебло ёбан мудак мудила гондон пидор пидарас пидр залупа шлюха долбоеб долбоёб уебок уебан
كس كسمك كسامك شرموطة شرموط منيوك منيك عرص قحبة قحبه ابن الكلب ابن الشرموطة ينعل
मादरचोद बहनचोद भोसड़ी भोसड़ीके चूतिया चुतिया गांडू गण्डू रंडी हरामी हरामखोर लौड़ा
操你妈 操你媽 草泥马 傻逼 傻屄 他妈的 他媽的 妈的 媽的 你妈 你媽 去死 狗娘养 王八蛋 婊子 肏
씨발 시발 씨바 개새끼 병신 좆 지랄 애미 느금마 꺼져
くそ クソ ちくしょう 畜生 死ね しね きさま 貴様 ばか野郎 馬鹿野郎
σκατά μαλάκα πούτσα γαμώ
siktir orospu`.split(/\s+/).filter(Boolean);

// whole-word only (short or ambiguous: they sit inside harmless words such as class / document / unique)
const SHORT_BAD = new Set(`kys kms sht btch fck fuc fuq ntm ctm fdp amk ebat pinche ass arse fag fags dick cock tit tits cum anal anus dyke cuck thot dumbass jackass fatass pute puta puto cono nier niger2 pu zob nik hui fut hoer lul kut eikel prick spic kike paki chink gook coon rapist raping pedo fick negr nigra nique suka figa cipa lauda tering coglione culo cul`.split(' ').filter(w => w !== 'niger2' && w !== 'pu' && w !== 'nik' && w !== 'fut' && w !== 'cul' && w !== 'culo' && w !== 'lauda' && w !== 'tering' && w !== 'figa' && w !== 'cipa' && w !== 'coglione'));
const MILD = new Set('stupid idiot dumb moron loser trash noob ugly suck sucks scum garbage useless pathetic'.split(' '));
const ENDINGS = /^(s|es|er|ers|ed|ing|in|y|ie|ies|head|heads|hole|holes|face|wipe|lick|licker|hat|ish)?$/;
// real words that contain a strong word once the separators are squashed
const SAFE_SET = new Set(['scunthorpe', 'shiitake', 'shitake', 'niggardly', 'retardant', 'retardants', 'therapist', 'therapists', 'assist', 'assistant', 'assassin', 'classic', 'cocktail', 'peacock', 'hancock', 'hitchcock', 'cockatoo', 'dumbbell', 'dumbbells', 'sibalnumber', 'passion', 'ficken']);
const SAFE_ONLY = ['scunthorpe', 'shiitake', 'shitake', 'niggardly', 'retardant', 'retardants', 'therapist', 'therapists'];

const LOOK = {
    '@': 'a', '4': 'a', '^': 'a', 'а': 'a', 'α': 'a', 'ä': 'a', 'á': 'a', 'à': 'a', 'â': 'a', 'å': 'a', 'ɑ': 'a',
    '8': 'b', 'в': 'b', 'ь': 'b', 'β': 'b', 'ß': 'ss',
    '(': 'c', '<': 'c', '¢': 'c', '©': 'c', 'с': 'c', 'ϲ': 'c', 'ç': 'c', 'κ': 'k', 'к': 'k',
    'ð': 'd', 'ԁ': 'd',
    '3': 'e', '€': 'e', 'е': 'e', 'ё': 'e', 'ε': 'e', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'ƒ': 'f', 'ф': 'f',
    '6': 'g', '9': 'g', 'ɡ': 'g',
    'н': 'h', 'η': 'n', '#': 'h',
    '1': 'i', '!': 'i', '|': 'i', 'і': 'i', 'ї': 'i', 'ι': 'i', 'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i', '¡': 'i',
    'ј': 'j', 'м': 'm', 'ν': 'v', 'п': 'n', 'ñ': 'n',
    '0': 'o', 'о': 'o', 'ο': 'o', 'ö': 'o', 'ó': 'o', 'ò': 'o', 'ô': 'o', 'ø': 'o', '°': 'o',
    'р': 'p', 'ρ': 'p', 'ԛ': 'q', 'г': 'r', 'я': 'r',
    '5': 's', '$': 's', 'ѕ': 's', 'ś': 's', 'š': 's',
    '7': 't', '+': 't', 'т': 't', 'τ': 't',
    'ü': 'u', 'ú': 'u', 'ù': 'u', 'û': 'u', 'υ': 'u', 'μ': 'u',
    'ѵ': 'v', 'ω': 'w', 'х': 'x', 'χ': 'x', 'ү': 'y', 'у': 'y', 'γ': 'y', 'ý': 'y', 'ÿ': 'y', '2': 'z', 'ž': 'z',
};
const ZW = /[​-‏‪-‮⁠-⁯﻿­͏]/;
const collapse = (s) => s.replace(/(.)\1+/g, '$1');
const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const clean = (w) => collapse(strip(w.toLowerCase()).replace(/[^a-z]/g, ''));
const strongRe = (w) => new RegExp([...w.matchAll(/(.)\1*/g)].map(m => m[0][0] + '{' + m[0].length + ',}').join(''), 'g');
const STRONG_RE = [...new Set(STRONG.map(w => strip(w.toLowerCase()).replace(/[^a-z]/g, '')))].filter(w => w.length >= 3).map(strongRe);
const NATIVE_C = NATIVE.map(w => w.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')).filter(w => w.length >= 2);
const wordRe = (w) => { const runs = w.match(/(.)\1*/g); return new RegExp('^' + runs.map(r => r[0] + '{' + r.length + ',}').join('') + '$'); };       // ass -> a+ s{2,}: stretched is fine, "as" is not
const SHORT_RE = [...SHORT_BAD].map(w => [w, wordRe(w)]);

/** the letter stream of a text: [raw letters, their positions, their word numbers] (leet undone, separators skipped) */
function stream(src) {
    const L = [], I = [], W = []; let w = 0;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i].toLowerCase();
        if (ZW.test(ch)) continue;
        if (/\s/.test(ch)) { w++; continue; }
        let m = LOOK[ch] !== undefined ? LOOK[ch] : /[a-z]/.test(ch) ? ch : (strip(ch).match(/^[a-z]$/) ? strip(ch) : '');
        for (const c of m) { L.push(c); I.push(i); W.push(w); }
    }
    return { L, I, W };
}

/** mask every bad word with asterisks (same length). `mild` = also mask the mild insults. Returns { text, hit } */
export function maskBad(raw, mild) {
    const text = String(raw), src = [...text.normalize('NFKC')];
    const { L, I, W } = stream(src);
    const hide = new Array(src.length).fill(false); let hit = false;
    const mark = (a, b) => { hit = true; for (let i = a; i <= b; i++) hide[i] = true; };
    // 1. strong words anywhere in the squashed Latin stream. A letter may be stretched (fuuuck) but a real double stays a double (nigger != Niger)
    const rs = L.join('');
    const safe = new Array(rs.length).fill(false);
    for (const sw of SAFE_ONLY) { let p = -1; while ((p = rs.indexOf(sw, p + 1)) >= 0) for (let k = 0; k < sw.length; k++) safe[p + k] = true; }
    for (const re of STRONG_RE) {
        re.lastIndex = 0; let m;
        while ((m = re.exec(rs))) {
            const p = m.index, e = p + m[0].length - 1;
            let ok = true; for (let k = p; k <= e; k++) if (safe[k]) { ok = false; break; }
            if (ok) mark(I[p], I[e]);
            if (m[0].length === 0) re.lastIndex++;
        }
    }
    // 2. short / ambiguous words: whole words only (with common endings), also letters spaced apart ("a s s")
    const groups = new Map(); L.forEach((c, k) => { if (!groups.has(W[k])) groups.set(W[k], []); groups.get(W[k]).push(k); });
    const bad = (tok) => { for (const [w, re] of SHORT_RE) { if (re.test(tok)) return true; if (tok.startsWith(w) && tok.length > w.length) { const rest = tok.slice(w.length); if (ENDINGS.test(rest) && collapse(tok.slice(0, w.length)) === collapse(w)) return true; } } return false; };
    const order = [...groups].sort((x, y) => x[0] - y[0]);
    for (const [, ks] of order) {
        const tok = ks.map(k => L[k]).join('');
        if (SAFE_SET.has(tok)) continue;
        if (bad(tok) || (mild && MILD.has(collapse(tok)))) mark(I[ks[0]], I[ks[ks.length - 1]]);
    }
    { let run = []; const flush = () => { if (run.length >= 3) { const t = run.map(k => L[k]).join(''); if (bad(t)) mark(I[run[0]], I[run[run.length - 1]]); } run = []; };
      let prevW = -2; for (const [g, ks] of order) { if (ks.length === 1 && (run.length === 0 || g === prevW + 1 || true)) run.push(ks[0]); else flush(); prevW = g; } flush(); }
    // 3. words in other scripts (Cyrillic, Arabic, Devanagari, Chinese, Korean, Japanese, Greek)
    { const nat = [], ni = []; src.forEach((ch, i) => { const c = ch.toLowerCase(); if (/[\p{L}\p{N}]/u.test(c) && !/[a-z0-9]/.test(c)) { nat.push(c); ni.push(i); } });
      const ns = nat.join('');
      for (const w of NATIVE_C) { let p = -1; while ((p = ns.indexOf(w, p + 1)) >= 0) mark(ni[p], ni[p + w.length - 1]); } }
    if (!hit) return { text, hit: false };
    const chars = [...text.normalize('NFKC')];
    return { text: chars.map((c, i) => hide[i] && !/\s/.test(c) ? '*' : c).join(''), hit: true };
}
export const hasBad = (raw) => maskBad(raw).hit;
export const hasMild = (raw) => { const a = maskBad(raw, true); return a.hit && !maskBad(raw).hit; };
