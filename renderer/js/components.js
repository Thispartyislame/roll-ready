import { html, useState, useRef, useEffect, S, edit, label, byId, open, nameScore, listOf, tagsOf } from './lib.js';

// Text input / textarea bound to a field of a stored entity; saves itself as you type.
export function Bound({ type, obj, k, area, numeric, placeholder, cls = '', rows = 3, ...rest }) {
  const onInput = (e) => edit(type, obj, { [k]: numeric ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value });
  const value = obj[k] ?? '';
  return area
    ? html`<textarea class=${cls} rows=${rows} placeholder=${placeholder} value=${value} onInput=${onInput} ...${rest}></textarea>`
    : html`<input class=${cls} type=${numeric ? 'number' : 'text'} placeholder=${placeholder} value=${value} onInput=${onInput} ...${rest} />`;
}

export const Field = ({ label: l, children, wide, hint }) => html`
  <label class="field ${wide ? 'wide' : ''}"><span class="flabel">${l}${hint ? html`<em>${hint}</em>` : ''}</span>${children}</label>`;

export function Select({ value, options, onChange, empty }) {
  return html`<select value=${value ?? ''} onChange=${(e) => onChange(e.target.value)}>
    ${empty != null ? html`<option value="">${empty}</option>` : ''}
    ${options.map((o) => (typeof o === 'string' ? html`<option value=${o}>${o}</option>` : html`<option value=${o.id}>${o.label}</option>`))}
  </select>`;
}

// A clickable reference to another entity.
export const Ref = ({ type, id, onRemove }) => {
  const e = byId(type, id);
  return html`<span class="chip ref ${type}" title="Open ${label(e)}">
    <a onClick=${(ev) => { ev.stopPropagation(); open(type, id); }}>${label(e)}</a>
    ${onRemove ? html`<button class="x" title="Unlink" onClick=${onRemove}>×</button>` : ''}
  </span>`;
};

// Type-to-search dropdown. `options` = [{id, label, sub, type}]; Enter picks the top hit.
// If nothing matches and onCreate is given, Enter creates a new entry from the typed text.
export function Picker({ options, onPick, onCreate, placeholder, autoFocus, keepOpen, cls = '' }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [focus, setFocus] = useState(false);
  const ref = useRef();
  const ql = q.trim().toLowerCase();
  const hits = !focus ? [] : options
    .map((o) => ({ o, s: nameScore(o.label.toLowerCase(), ql) }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.o.label.localeCompare(b.o.label)).slice(0, 12).map((x) => x.o);
  const canCreate = onCreate && ql && !options.some((o) => o.label.toLowerCase() === ql);
  const total = hits.length + (canCreate ? 1 : 0);
  const pick = (n) => {
    if (n < hits.length) onPick(hits[n]); else if (canCreate) onCreate(q.trim()); else return;
    setQ(''); setHi(0);
    if (!keepOpen) ref.current?.blur();
  };
  const key = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(total - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter' && total) { e.preventDefault(); pick(Math.min(hi, total - 1)); }
    else if (e.key === 'Escape') { setQ(''); ref.current?.blur(); }
  };
  return html`<span class="picker ${cls}">
    <input ref=${ref} value=${q} placeholder=${placeholder} autoFocus=${autoFocus}
      onInput=${(e) => { setQ(e.target.value); setHi(0); }} onKeyDown=${key}
      onFocus=${() => setFocus(true)} onBlur=${() => setTimeout(() => setFocus(false), 120)} />
    ${focus && total > 0 ? html`<div class="menu">
      ${hits.map((o, n) => html`<div class="mi ${n === hi ? 'hi' : ''}" onMouseDown=${(e) => { e.preventDefault(); pick(n); }}>
        <span>${o.label}</span>${o.sub ? html`<small>${o.sub}</small>` : ''}</div>`)}
      ${canCreate ? html`<div class="mi create ${hi >= hits.length ? 'hi' : ''}" onMouseDown=${(e) => { e.preventDefault(); pick(hits.length); }}>+ Create “${q.trim()}”</div>` : ''}
    </div>` : ''}
  </span>`;
}

// Edit a many-to-many link: chips for what's linked, a picker to add more.
export function Links({ type, ids, onChange, onCreate, placeholder }) {
  const opts = listOf(type).filter((e) => !ids.includes(e.id)).map((e) => ({ id: e.id, label: label(e) }));
  return html`<div class="links">
    ${ids.map((id) => html`<${Ref} key=${id} type=${type} id=${id} onRemove=${() => onChange(ids.filter((x) => x !== id))} />`)}
    <${Picker} options=${opts} placeholder=${placeholder || 'Add…'} keepOpen
      onPick=${(o) => onChange([...ids, o.id])}
      onCreate=${onCreate ? async (name) => { const e = await onCreate(name); onChange([...ids, e.id]); } : null} />
  </div>`;
}

export const Tags = ({ e }) => tagsOf(e).map((t) => html`<span class="tag">${t}</span>`);

// Two-pane screen: searchable list on the left, detail on the right.
export function TwoPane({ list, detail, wideList }) {
  return html`<div class="two ${wideList ? 'widelist' : ''}"><div class="listpane">${list}</div><div class="detail">${detail}</div></div>`;
}

export function useHotkey(test, fn) {
  useEffect(() => {
    const h = (e) => { if (test(e)) { e.preventDefault(); fn(e); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
}

export const Empty = ({ children }) => html`<div class="empty">${children}</div>`;
