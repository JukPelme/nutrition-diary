const API = '/api/v1';
let token = localStorage.getItem('token');

async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
        const res = await fetch(API + path, { ...opts, headers: { ...headers, ...opts.headers } });
        if (res.status === 401) { logout(); return null; }
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
function logout() { token = null; localStorage.removeItem('token'); if (typeof persistTokenForSW === 'function') persistTokenForSW(null); location.reload(); }
function isLoggedIn() { return !!token; }
