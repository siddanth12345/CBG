// Chat: a see-through chat panel, a chat bar that opens with "/" (or Enter) on a keyboard, and a 💬 icon next to the Menu button (phones too) with a red badge counting
// the messages that came in while the chat was closed. Every message passes the word filter (own and received). Also holds the announcer toggle.
import { S } from './gameCore.js';
import { onChat, getChat, sendChat, chatActive, chatEnabled, setChatEnabled } from './net/chat.js';
import { announcerOn, setAnnouncer } from './announcer.js';

let root, list, input, row, btnVoice, btnIcon, badge, btnOff, open = false, unread = 0, seen = new Set(), lastShown = 0;
const esc = (t) => String(t).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const inMatch = () => S.gameState === 'playing' || S.gameState === 'countdown';
function build() {
    root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:14px;bottom:84px;z-index:61;width:min(340px,calc(100vw - 28px));font:600 13px system-ui,sans-serif;color:#e2e8f0;display:flex;flex-direction:column;gap:6px;pointer-events:none';
    root.innerHTML = `<div data-list style="display:flex;flex-direction:column;gap:3px;max-height:170px;overflow:hidden;justify-content:flex-end"></div>
      <div data-row style="display:none;pointer-events:auto"><input data-in maxlength="80" placeholder="Type a message (Enter sends, Esc closes)" style="width:100%;box-sizing:border-box;background:rgba(8,12,24,.45);backdrop-filter:blur(3px);border:1px solid rgba(148,163,184,.45);border-radius:10px;padding:9px 11px;color:#fff;font:600 16px system-ui,sans-serif;outline:none"></div>
      <div style="display:flex;gap:6px;pointer-events:auto"><button data-off style="background:rgba(8,12,24,.5);border:1px solid rgba(148,163,184,.4);color:#e2e8f0;border-radius:999px;padding:4px 10px;cursor:pointer;font:700 12px system-ui">Chat on</button><button data-voice style="background:rgba(8,12,24,.5);border:1px solid rgba(148,163,184,.4);color:#e2e8f0;border-radius:999px;padding:4px 10px;cursor:pointer;font:700 12px system-ui">🎙 Announcer</button></div>`;
    document.body.appendChild(root);
    list = root.querySelector('[data-list]'); row = root.querySelector('[data-row]'); input = root.querySelector('[data-in]');
    btnOff = root.querySelector('[data-off]'); btnVoice = root.querySelector('[data-voice]');
    // the icon next to the Menu button
    btnIcon = document.createElement('button');
    btnIcon.setAttribute('aria-label', 'Chat');
    btnIcon.style.cssText = 'position:fixed;left:150px;bottom:24px;z-index:62;width:48px;height:48px;border-radius:16px;background:rgba(15,23,42,.72);border:1px solid rgba(34,211,238,.4);color:#22d3ee;font-size:22px;cursor:pointer;display:none;align-items:center;justify-content:center;touch-action:manipulation';
    btnIcon.innerHTML = '💬<span data-badge style="position:absolute;top:-7px;right:-7px;min-width:22px;height:22px;box-sizing:border-box;padding:0 5px;border-radius:999px;background:#ef4444;color:#fff;font:800 14px/22px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px rgba(8,12,24,.9);display:none"></span>';
    badge = btnIcon.querySelector('[data-badge]');
    document.body.appendChild(btnIcon);
    btnIcon.addEventListener('click', (e) => { e.stopPropagation(); if (open) close(); else openBox(); });
    btnIcon.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    for (const ev of ['keydown', 'keyup', 'keypress']) input.addEventListener(ev, (e) => {
        e.stopPropagation();
        if (ev !== 'keydown') return;
        if (e.key === 'Enter') { const v = input.value.trim(); if (v) sendChat(v); input.value = ''; if (inMatch()) close(); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    btnOff.addEventListener('click', () => { setChatEnabled(!chatEnabled()); refresh(); });
    btnVoice.addEventListener('click', () => { setAnnouncer(!announcerOn()); refresh(); });
    onChat(() => {
        let n = 0; for (const m of getChat()) if (!seen.has(m.id)) { seen.add(m.id); if (!m.mine) n++; }
        if (!open && chatEnabled() && S.match) unread += n;
        lastShown = performance.now(); refresh();
    });
    window.addEventListener('keydown', (e) => {
        if ((e.key !== 'Enter' && e.key !== '/') || e.repeat || open || !chatActive() || !chatEnabled()) return;
        if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
        if (!inMatch() || document.querySelector('.lm-modal:not(.lm-hidden)')) return;
        e.preventDefault(); openBox();
    });
}
function openBox() { if (!chatActive() || !chatEnabled()) return; open = true; unread = 0; row.style.display = 'block'; window.dispatchEvent(new Event('blur')); input.focus(); refresh(); }
function close() { open = false; row.style.display = 'none'; input.blur(); refresh(); }
function refresh() {
    if (!root) return;
    const active = chatActive(), on = active && chatEnabled(), inLobby = S.gameState === 'start' || !S.match;
    btnOff.style.display = active ? '' : 'none'; btnOff.style.opacity = chatEnabled() ? 1 : 0.55; btnOff.textContent = chatEnabled() ? 'Chat on' : 'Chat off';
    btnVoice.style.opacity = announcerOn() ? 1 : 0.5; btnVoice.textContent = announcerOn() ? '🎙 Announcer' : '🎙 Announcer off';
    const msgs = on ? getChat().slice(-7) : [];
    const html = msgs.map(m => `<div style="background:rgba(8,12,24,.4);backdrop-filter:blur(2px);border-radius:8px;padding:4px 8px;word-break:break-word;text-shadow:0 1px 2px #000"><b style="color:#7dd3fc">${esc(m.name)}</b> ${esc(m.text)}</div>`).join('');
    if (list.innerHTML !== html) list.innerHTML = html;
    list.style.opacity = open || inLobby || performance.now() - lastShown < 9000 ? 1 : 0;
    if (inLobby && on) row.style.display = 'block'; else if (!open) row.style.display = 'none';
    root.style.display = (S.gameState === 'start' && !active) ? 'none' : 'flex';
    // the icon: shown in a match whenever a room is connected; the badge counts what arrived while the chat was closed
    btnIcon.style.display = active && S.match && !S.demo && S.gameState !== 'start' ? 'flex' : 'none';
    btnIcon.style.opacity = chatEnabled() ? 1 : 0.5;
    badge.style.display = unread > 0 && !open ? 'block' : 'none'; badge.textContent = unread > 99 ? '99+' : String(unread);
}
export function initChatUI() { build(); setInterval(refresh, 600); refresh(); }
