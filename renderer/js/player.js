// Player-facing view. This window can only read the sanitized public state (see preload-player.js):
// names, initiative, whose turn it is, the round, public conditions and a coarse health word.
(() => {
  const list = document.getElementById('list');
  const round = document.getElementById('round');
  const themeBtn = document.getElementById('theme');
  const system = window.matchMedia('(prefers-color-scheme: light)');
  let theme = 'dark'; let choice = 'auto'; let last = null;
  let lastActive = null;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  function draw(state) {
    // 'auto' (nobody has chosen yet) follows the system setting.
    choice = state.theme;
    theme = ['light', 'dark'].includes(choice) ? choice : (system.matches ? 'light' : 'dark');
    document.documentElement.dataset.theme = theme;
    themeBtn.textContent = theme === 'light' ? '☾ Dark' : '☀ Light';
    const all = state.combatants || [];
    list.textContent = '';
    if (!all.length) {
      round.textContent = '';
      const w = el('div', 'waiting'); w.append(el('div', 'wtitle', 'Roll Ready'), el('div', 'wsub', 'Waiting for initiative…'));
      list.append(w); lastActive = null;
      return;
    }
    round.textContent = 'Round ' + state.round;
    document.documentElement.style.setProperty('--n', String(Math.max(4, all.length)));
    let activeRow = null;
    for (const c of all) {
      const row = el('div', 'row' + (c.active ? ' active' : '') + (c.down ? ' down' : '') + (c.pc ? ' pc' : ''));
      row.append(el('div', 'init', c.init == null ? '–' : String(c.init)));
      const who = el('div', 'who');
      who.append(el('div', 'name', c.name));
      if (c.conditions && c.conditions.length) { const cs = el('div', 'conds'); for (const k of c.conditions) cs.append(el('span', 'cond', k)); who.append(cs); }
      row.append(who);
      if (c.health) row.append(el('div', 'health ' + c.health.toLowerCase().replace(/\s+/g, '-'), c.health));
      if (c.active) activeRow = row;
      list.append(row);
    }
    const key = activeRow ? activeRow.querySelector('.name').textContent + '|' + state.round : null;
    if (activeRow && key !== lastActive) { activeRow.classList.add('justnow'); activeRow.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' }); }
    lastActive = key;
  }

  const redraw = (state) => { last = state; draw(state); };
  window.table.get().then(redraw);
  window.table.onState(redraw);
  system.addEventListener('change', () => { if (last) draw(last); });
  themeBtn.addEventListener('click', () => window.table.setTheme(theme === 'light' ? 'dark' : 'light'));
  document.getElementById('full').addEventListener('click', () => window.table.toggleFullscreen());

  // Controls and the cursor fade away when the mouse is still, so a shared screen stays clean.
  let idle;
  const wake = () => { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('idle'), 2500); };
  for (const ev of ['mousemove', 'mousedown', 'keydown']) window.addEventListener(ev, wake);
  wake();
})();
