const API = '/api/v1';
let token = localStorage.getItem('token');

async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API + path, { ...opts, headers: { ...headers, ...opts.headers } });
    if (res.status === 401) { logout(); return null; }
    if (res.status === 204) return null;
    return res.json();
}

function setToken(t) { token = t; localStorage.setItem('token', t); }
function logout() { token = null; localStorage.removeItem('token'); location.reload(); }
function isLoggedIn() { return !!token; }
