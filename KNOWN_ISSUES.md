# Known issues

## toggleAuthMode breaks when UI is not Russian
`app/static/js/app-01-core.js` — `toggleAuthMode()` decides direction with
`if (btn.textContent === 'Войти')`. When the interface language is EN or JA
(auto-detected from `navigator.language`), the submit button reads "Log in" /
"ログイン", the check fails, and clicking the "register" link silently keeps the
form in login mode — registration becomes unreachable for non-RU browsers.

Found via E2E (register flow) which had to force `localStorage.lang='ru'` to
pass. Fix: key the toggle on an explicit mode flag / data-attribute instead of
the localized button text. Low effort, isolated to one function.
