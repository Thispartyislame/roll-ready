// Theme for the GM window. Runs before the app so there is no flash of the wrong theme.
// The choice is 'auto' (follow the system), 'dark' or 'light'; the resolved theme goes on <html data-theme>.
(() => {
  const KEY = 'rr-theme';
  const system = window.matchMedia('(prefers-color-scheme: light)');
  const get = () => { try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; } };
  const resolved = () => { const c = get(); return c === 'auto' ? (system.matches ? 'light' : 'dark') : c; };
  const apply = () => { document.documentElement.dataset.theme = resolved(); };
  window.rrTheme = { get, resolved, set(choice) { try { localStorage.setItem(KEY, choice); } catch { /* still applies for this run */ } apply(); } };
  system.addEventListener('change', apply);
  apply();
})();
