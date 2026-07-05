// Frontend load smoke test — no browser needed (jsdom).
//
// Guards the manual app.js -> app-NN-*.js split (and any future script
// reordering): loads the REAL index.html body plus every /static/js file in
// the exact order index.html declares, then asserts that
//   1. every script parses & runs with zero load-time errors,
//   2. the DOMContentLoaded handler runs clean,
//   3. every onclick="fn(...)" handler in the HTML is a defined global,
//   4. the core cross-file globals are reachable across script boundaries.
//
// Script order and the onclick list are parsed FROM index.html so this test
// never goes stale when files are added/renamed. Run: node smoke.mjs
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..", "..", "app");
const INDEX = join(APP, "templates", "index.html");
const rawHtml = readFileSync(INDEX, "utf8");

// --- Parse local script load order from index.html (skip external CDNs) ---
const order = [...rawHtml.matchAll(/<script\s+src="\/static\/js\/([^"]+)"><\/script>/g)]
  .map((m) => m[1]);
if (order.length === 0) {
  console.error("FAIL: no /static/js scripts found in index.html");
  process.exit(1);
}

// --- Parse onclick handler function names (bare `name(` calls only) ---
const STOP = new Set(["this", "event", "window", "document", "return", "if", "for", "function"]);
const onclicks = [...new Set(
  [...rawHtml.matchAll(/onclick="([a-zA-Z_]\w*)\(/g)].map((m) => m[1])
)].filter((n) => !STOP.has(n));

// Globals declared with top-level `let` in app-01-core (shared across files).
const globals = ["currentDate", "meals", "entries", "userGoals", "waterGoal"];

// --- Build a DOM from real index.html, minus external <script src> tags ---
const html = rawHtml.split("\n").filter((l) => !/<script\s+src=/.test(l)).join("\n");
const errors = [];
const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
window.onerror = (m) => errors.push("onerror: " + m);
window.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve("") });
window.Html5Qrcode = function () {};
window.Html5QrcodeScanner = function () {};
if (!window.navigator.serviceWorker) {
  window.navigator.serviceWorker = { register: () => Promise.resolve({ then: () => ({ catch: () => {} }) }), ready: Promise.resolve({}), controller: null, addEventListener() {} };
}

// --- Inject every local script in declared order (classic global scope) ---
let loaded = 0;
for (const f of order) {
  const s = window.document.createElement("script");
  s.textContent = readFileSync(join(APP, "static", "js", f), "utf8");
  try { window.document.body.appendChild(s); loaded++; }
  catch (e) { errors.push(`LOAD ${f}: ${e.message}`); }
}

// --- Fire the app init handler ---
try {
  const ev = window.document.createEvent("Event");
  ev.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(ev);
} catch (e) { errors.push("DOMContentLoaded threw: " + e.message); }

// --- Assertions ---
const missing = onclicks.filter((fn) => typeof window[fn] !== "function");
const missingG = globals.filter((g) => {
  try { return window.eval("typeof " + g) === "undefined"; } catch { return true; }
});

console.log(`scripts loaded:         ${loaded}/${order.length}`);
console.log(`load/runtime errors:    ${errors.length}`);
errors.forEach((e) => console.log("  ! " + e));
console.log(`onclick handlers ok:    ${onclicks.length - missing.length}/${onclicks.length}`);
if (missing.length) console.log("  MISSING: " + missing.join(", "));
console.log(`core globals reachable: ${globals.length - missingG.length}/${globals.length}`);
if (missingG.length) console.log("  MISSING globals: " + missingG.join(", "));

const pass = errors.length === 0 && missing.length === 0 && missingG.length === 0 && loaded === order.length;
console.log("\n" + (pass ? "SMOKE PASS" : "SMOKE FAIL"));
process.exit(pass ? 0 : 1);
