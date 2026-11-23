// In-room chat (online 1v1 and custom matches). Messages are max 80 characters; the word filter (profanity.js) stars out
// anything nasty (checked again on receive, in case a modified client skipped it);
// five mild insults in a row get the same treatment. Same idea as Table Wars' chat.
import { displayName } from '../account.js';
import { maskBad, hasMild } from './profanity.js';

const MAX = 30;
let messages = [];
const subs = new Set();
let mildStrikes = 0;
export const onChat = (f) => { subs.add(f); return () => subs.delete(f); };
export const getChat = () => messages;
const bump = () => subs.forEach(f => f());
export function clearChat() { messages = []; mildStrikes = 0; bump(); }
export function pushChat(m) { if (messages.some(x => x.id === m.id)) return; messages = [...messages, m].slice(-MAX); bump(); }

export const chatEnabled = () => { try { return localStorage.getItem('luminary.chat') !== 'off'; } catch (e) { return true; } };
export const setChatEnabled = (on) => { try { localStorage.setItem('luminary.chat', on ? 'on' : 'off'); } catch (e) { /* ignore */ } bump(); };

/** swear words (many languages, with the usual bypasses) become asterisks; five mild insults in a row get masked too */
export function filterChat(raw) {
    const text = String(raw).slice(0, 80);
    const hard = maskBad(text);
    const mildHit = hasMild(hard.text);
    if (mildHit) { if (++mildStrikes >= 5) return maskBad(hard.text, true).text; } else if (!hard.hit) mildStrikes = 0;
    return hard.text;
}

let transport = null;
/** online.js hands us the room's transport so chat shares its connection */
export function bindChat(sendFn) { transport = sendFn; }
export function sendChat(raw) {
    const t = (raw || '').trim();
    if (!t || !transport) return;
    const m = { id: Math.random().toString(36).slice(2, 10), name: displayName(), text: filterChat(t), t: Date.now() };
    pushChat(m);
    transport({ t: 'chat', id: m.id, name: m.name, text: m.text });
}
export function onRemoteChat(p) {
    if (!p || typeof p !== 'object') return;
    const text = maskBad(String(p.text || '').slice(0, 80)).text;
    pushChat({ id: String(p.id || Math.random().toString(36).slice(2, 10)), name: maskBad(String(p.name || 'player').slice(0, 20)).text, text, t: Date.now() });
}

export const chatActive = () => !!transport;
