// Chat box + announcer controls. The chat is only there while a room is connected (online 1v1 / lobbies); Enter opens it in a match. Messages pass the word filter first.
import { S } from './gameCore.js';
import { onChat, getChat, sendChat, chatActive, chatEnabled, setChatEnabled } from './net/chat.js';
import { announcerOn, setAnnouncer } from './announcer.js';

let root, list, input, row, btnChat, btnVoice, open = false, lastCount = 0, lastShown = 0;
const esc = (t) => String(t).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
function build() {
    root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:14px;bottom:84px;z-index:61;width:min(340px,calc(100vw - 28px));font:600 13px system-ui,sans-serif;color:#e2e8f0;display:flex;flex-direction:column;gap:6px;pointer-events:none';
    root.innerHTML = `<div data-list style="display:flex;flex-direction:column;gap:3px;max-height:170px;overflow:hidden;justify-content:flex-end"></div>
      <div data-row style="display:none;pointer-events:auto"><input data-in maxlength="80" placeholder="Say something (Enter to send, Esc to close)" style="width:100%;box-sizing:border-box;background:rgba(8,12,24,.92);border:1px solid #334155;border-radius:10px;color:#fff;padding:8px 10px;font:600 13px system-ui" autocomplete="off"></div>
      <div style="display:flex;gap:6px;pointer-events:auto"><button data-chat style="background:rgba(8,12,24,.8);border:1px solid #334155;color:#e2e8f0;border-radius:999px;padding:4px 10px;cursor:pointer;font:700 12px system-ui">💬 Chat</button><button data-voice style="background:rgba(8,12,24,.8);border:1px solid #334155;color:#e2e8f0;border-radius:999px;padding:4px 10px;cursor:pointer;font:700 12px system-ui">🎙 Announcer</button></div>`;
    document.body.appendChild(root);
    list = root.querySelector('[data-list]'); row = root.querySelector('[data-row]'); input = root.querySelector('[data-in]');
    btnChat = root.querySelector('[data-chat]'); btnVoice = root.querySelector('[data-voice]');
    for (const ev of ['keydown', 'keyup', 'keypress']) input.addEventListener(ev, (e) => {
        e.stopPropagation();
        if (ev !== 'keydown') return;
        if (e.key === 'Enter') { const v = input.value.trim(); if (v) sendChat(v); input.value = ''; if (S.gameState === 'playing' || S.gameState === 'countdown') close(); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    btnChat.addEventListener('click', () => { setChatEnabled(!chatEnabled()); refresh(); });
    btnVoice.addEventListener('click', () => { setAnnouncer(!announcerOn()); refresh(); });
    onChat(() => { lastShown = performance.now(); refresh(); });
    window.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.repeat || open || !chatActive() || !chatEnabled()) return;
        if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
        if (S.gameState !== 'playing' && S.gameState !== 'countdown') return;
        if (document.querySelector('.lm-modal:not(.lm-hidden)')) return;
        e.preventDefault(); openBox();
    });
}
function openBox() { open = true; row.style.display = 'block'; window.dispatchEvent(new Event('blur')); input.focus(); refresh(); }
function close() { open = false; row.style.display = 'none'; input.blur(); refresh(); }
function refresh() {
    if (!root) return;
    const on = chatActive() && chatEnabled();
    btnChat.style.display = chatActive() ? '' : 'none'; btnChat.style.opacity = chatEnabled() ? 1 : 0.5; btnChat.textContent = chatEnabled() ? '💬 Chat' : '💬 Chat off';
    btnVoice.style.opacity = announcerOn() ? 1 : 0.5; btnVoice.textContent = announcerOn() ? '🎙 Announcer' : '🎙 Announcer off';
    const inLobby = S.gameState === 'start' || !S.match;
    const msgs = on ? getChat().slice(-7) : [];
    const html = msgs.map(m => `<div style="background:rgba(8,12,24,.72);border-radius:8px;padding:4px 8px;word-break:break-word"><b style="color:#7dd3fc">${esc(m.name)}</b> ${esc(m.text)}</div>`).join('');
    if (list.innerHTML !== html) list.innerHTML = html;
    list.style.opacity = open || inLobby || performance.now() - lastShown < 9000 ? 1 : 0.0;
    if (inLobby && on) { row.style.display = 'block'; } else if (!open) row.style.display = 'none';
    root.style.display = (S.gameState === 'start' && !chatActive()) ? 'none' : 'flex';
}
export function initChatUI() { build(); setInterval(refresh, 600); refresh(); }
