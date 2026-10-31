// One shared Supabase client (loaded from a CDN) for accounts and realtime.
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_JS, REALTIME_URL, REALTIME_KEY, REALTIME_JS } from './config.js';

export const supabaseConfigured = () => !!(SUPABASE_URL && SUPABASE_KEY);
let client = null, loading = null;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (window.supabase) return resolve();
        const s = document.createElement('script');
        s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error('could not load the Supabase library'));
        document.head.appendChild(s);
    });
}
export async function getClient() {
    if (!supabaseConfigured()) return null;
    if (client) return client;
    if (!loading) loading = loadScript(SUPABASE_JS).then(() => {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { params: { eventsPerSecond: 60 } } });
        return client;
    });
    return loading;
}

// Realtime-only client (the relay shared with Table Wars). Never used for accounts.
let rtClient = null, rtLoading = null;
export const realtimeConfigured = () => !!(REALTIME_URL && REALTIME_KEY);
export function getRealtimeClient() {
    if (rtClient) return Promise.resolve(rtClient);
    if (!rtLoading) rtLoading = REALTIME_JS.reduce((p, src) => p.catch(() => loadScript(src)), Promise.reject(new Error('start'))).then(() => {
        rtClient = window.supabase.createClient(REALTIME_URL, REALTIME_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 100 } } });
        return rtClient;
    }).catch((e) => { rtLoading = null; throw e; });
    return rtLoading;
}
