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

// Accounts client: the dedicated project when configured, otherwise the shared project (only used if it has the luminary_profiles table, see supabase/luminary.sql)
let accCl = null, accLoading = null;
export function getAccountClient() {
    if (supabaseConfigured()) return getClient();
    if (accCl) return Promise.resolve(accCl);
    if (!accLoading) accLoading = REALTIME_JS.reduce((p, src) => p.catch(() => loadScript(src)), Promise.reject(new Error('start'))).then(() => {
        accCl = window.supabase.createClient(REALTIME_URL, REALTIME_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'luminary-auth' } });
        return accCl;
    }).catch((e) => { accLoading = null; throw e; });
    return accLoading;
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
