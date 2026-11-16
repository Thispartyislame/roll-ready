// Soundboard pop-out: a remote control for the GM window. It shows the buttons it is sent and reports
// presses; the GM window does the playing. See preload-board.js for everything this window can do.
(() => {
  const KEYS = '1234567890';
  const grid = document.getElementById('grid');
  const stopBtn = document.getElementById('stop');
  let state = { buttons: [], playing: [] };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  function draw(next) {
    state = next || state;
    document.documentElement.dataset.theme = state.theme === 'light' ? 'light' : 'dark';
    stopBtn.disabled = !state.playing.length;
    grid.textContent = '';
    if (!state.buttons.length) { grid.append(el('div', 'empty', 'No buttons yet. Press Edit to add some in the main window.')); return; }
    state.buttons.forEach((b, n) => {
      const on = state.playing.includes(b.id);
      const btn = el('button', `sbbtn ${b.color || ''} ${on ? 'playing' : ''} ${!b.audio && !b.visual && !b.scene ? 'blank' : ''}`);
      btn.title = on ? 'Playing — press to stop' : 'Press to play';
      const top = el('span', 'sbkey');
      if (n < 10) top.append(el('kbd', '', KEYS[n]));
      top.append(el('i', '', b.scene ? `▦ scene · ${b.scene}` : [b.audio ? (b.music ? '♫' : '🔊') : '', b.visual === 'image' ? '🖼' : b.visual === 'video' ? '🎬' : ''].join(' ').trim()));
      if (b.duration) top.append(el('small', '', b.duration + 's'));
      btn.append(top, el('span', 'sblabel', b.label || 'New button'), el('span', 'sbstate', on ? '■ Playing' : ''));
      btn.addEventListener('click', () => window.deck.fire(b.id));
      grid.append(btn);
    });
  }
  window.deck.get().then(draw);
  window.deck.onState(draw);
  stopBtn.addEventListener('click', () => window.deck.stopAll());
  document.getElementById('edit').addEventListener('click', () => window.deck.edit());
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') window.deck.stopAll();
    else if (KEYS.includes(e.key) && state.buttons[KEYS.indexOf(e.key)]) window.deck.fire(state.buttons[KEYS.indexOf(e.key)].id);
  });
})();
