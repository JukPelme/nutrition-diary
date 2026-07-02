const API = '/api/v1';
let token = localStorage.getItem('token');
let refreshToken = localStorage.getItem('refresh_token');
let _refreshing = null;  // in-flight refresh promise (dedupe concurrent 401s)

async function _tryRefresh() {
    if (!refreshToken) return false;
    // Dedupe: if a refresh is already running, await the same promise
    if (_refreshing) return _refreshing;
    _refreshing = (async () => {
        try {
            const res = await fetch(API + '/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken }),
            });
            if (!res.ok) return false;
            const data = await res.json();
            if (data?.access_token) {
                setToken(data.access_token);
                if (data.refresh_token) setRefreshToken(data.refresh_token);
                return true;
            }
            return false;
        } catch (e) {
            return false;
        } finally {
            _refreshing = null;
        }
    })();
    return _refreshing;
}

async function api(path, opts = {}, _retried = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
        const res = await fetch(API + path, { ...opts, headers: { ...headers, ...opts.headers } });
        if (res.status === 401) {
            // Access token likely expired — try a silent refresh once, then replay
            if (!_retried && path !== '/auth/refresh' && await _tryRefresh()) {
                return api(path, opts, true);
            }
            logout();
            return null;
        }
        if (res.status === 204) return null;
        const data = await res.json();
        if (!res.ok) {
            console.error('API error:', path, res.status, data);
            return { _error: true, status: res.status, detail: data.detail || JSON.stringify(data) };
        }
        return data;
    } catch (e) {
        console.error('API fetch error:', path, e);
        return { _error: true, detail: e.message };
    }
}

function setToken(t) { token = t; localStorage.setItem('token', t); if (typeof persistTokenForSW === 'function') persistTokenForSW(t); }
function setRefreshToken(t) { refreshToken = t; if (t) localStorage.setItem('refresh_token', t); else localStorage.removeItem('refresh_token'); }
function logout() {
    token = null;
    refreshToken = null;
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    if (typeof persistTokenForSW === 'function') { try { persistTokenForSW(null); } catch(e){} }
    // Loop guard: if we just reloaded due to logout in the last 5s, don't reload again — just clear UI
    const last = +sessionStorage.getItem('_lastLogoutAt') || 0;
    if (Date.now() - last < 5000) { console.warn('[api] logout loop suppressed'); return; }
    sessionStorage.setItem('_lastLogoutAt', String(Date.now()));
    location.reload();
}
function isLoggedIn() { return !!token; }
