// Data layer: SQLite via Node's built-in node:sqlite (no native modules to compile).
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const migrations = require('./schema');

// Entity registry. `links` are many-to-many id arrays carried on the entity object itself
// (e.g. npc.faction_ids) and written to their join tables inside the same transaction.
const ENT = {
  campaign: { cols: ['name', 'system', 'notes', 'party_level', 'party_size'] },
  location: { cols: ['campaign_id', 'name', 'description', 'parent_id', 'tags'], scoped: true },
  faction: { cols: ['campaign_id', 'name', 'description', 'goals', 'relationships', 'tags'], scoped: true },
  npc: {
    cols: ['campaign_id', 'name', 'description', 'personality', 'location_id', 'status', 'tags', 'ac', 'max_hp', 'init_bonus', 'monster_id'],
    scoped: true,
    links: { faction_ids: ['npc_faction', 'npc_id', 'faction_id'] },
  },
  quest: {
    cols: ['campaign_id', 'title', 'status', 'description', 'tags'], scoped: true,
    links: { npc_ids: ['quest_npc', 'quest_id', 'npc_id'], location_ids: ['quest_location', 'quest_id', 'location_id'] },
  },
  session: {
    cols: ['campaign_id', 'date', 'title', 'summary'], scoped: true,
    links: { encounter_ids: ['session_encounter', 'session_id', 'encounter_id'] },
  },
  note: {
    cols: ['session_id', 'body', 'created_at'],
    links: { npc_ids: ['note_npc', 'note_id', 'npc_id'], quest_ids: ['note_quest', 'note_id', 'quest_id'] },
  },
  encounter: {
    cols: ['campaign_id', 'name', 'notes', 'hp_mode'], scoped: true,
    links: { npc_ids: ['encounter_npc', 'encounter_id', 'npc_id'] },
  },
  monster: { cols: ['name', 'source', 'cr', 'type', 'ac', 'hp', 'init_bonus', 'data'], json: ['data'], library: true },
  spell: { cols: ['name', 'source', 'level', 'school', 'data'], json: ['data'], library: true },
  item: { cols: ['name', 'source', 'category', 'rarity', 'data'], json: ['data'], library: true },
  rule: { cols: ['name', 'source', 'category', 'section', 'body'], library: true },
  condition: { cols: ['name', 'description', 'leveled', 'sort_order'] },
  party_member: { cols: ['campaign_id', 'name', 'player', 'ac', 'max_hp', 'init_bonus'], scoped: true },
  timer: { cols: ['campaign_id', 'label', 'unit', 'duration', 'remaining', 'running', 'started_at', 'combatant_id', 'combatant_name'], scoped: true },
  sound_button: { cols: ['campaign_id', 'label', 'color', 'sort_order', 'audio', 'visual', 'visual_kind', 'volume', 'loop', 'duration', 'channel', 'fade', 'members'], json: ['members'], scoped: true },
  gen_table: { cols: ['key', 'name', 'category', 'top', 'save_as', 'builtin', 'entries'], json: ['entries'] },
};

class Store {
  constructor(file) {
    this.file = file;
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;');
    this.migrate();
  }

  migrate() {
    let v = this.db.prepare('PRAGMA user_version').get().user_version;
    for (; v < migrations.length; v++) {
      this.tx(() => {
        this.db.exec(migrations[v]);
        this.db.exec(`PRAGMA user_version = ${v + 1}`);
      });
    }
  }

  tx(fn) {
    this.db.exec('BEGIN');
    try { const r = fn(); this.db.exec('COMMIT'); return r; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  all(sql, ...p) { return this.db.prepare(sql).all(...p); }
  get(sql, ...p) { return this.db.prepare(sql).get(...p); }
  run(sql, ...p) { return this.db.prepare(sql).run(...p); }

  // ---- bundled SRD content: upsert by srd_key whenever the bundled version changes
  seed(srdPath) {
    const have = this.get("SELECT value FROM kv WHERE key = 'srd_version'");
    const srd = JSON.parse(fs.readFileSync(srdPath, 'utf8'));
    this.attribution = srd.attribution;
    if (!(have && JSON.parse(have.value) === srd.version)) this.tx(() => {
      const up = (table, cols) => this.db.prepare(
        `INSERT INTO ${table} (srd_key, source, ${cols.join(', ')}) VALUES (?, 'SRD', ${cols.map(() => '?').join(', ')})
         ON CONFLICT(srd_key) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}`);
      const m = up('monster', ['name', 'cr', 'type', 'ac', 'hp', 'init_bonus', 'data']);
      for (const x of srd.monsters) m.run(x.key, x.name, x.cr, x.type, x.ac, x.hp, x.init_bonus, JSON.stringify(x));
      const s = up('spell', ['name', 'level', 'school', 'data']);
      for (const x of srd.spells) s.run(x.key, x.name, x.level, x.school, JSON.stringify(x));
      const i = up('item', ['name', 'category', 'rarity', 'data']);
      for (const x of srd.items) i.run(x.key, x.name, x.category, x.rarity, JSON.stringify(x));
      const r = up('rule', ['name', 'category', 'section', 'body']);
      for (const x of srd.rules) r.run(x.key, x.name, x.category, x.section || '', x.body);
      // The condition list is user-editable, so it is only seeded once.
      if (!this.get("SELECT 1 AS x FROM kv WHERE key = 'conditions_seeded'")) {
        const c = this.db.prepare('INSERT INTO condition (name, description, leveled, sort_order) VALUES (?, ?, ?, ?)');
        srd.conditions.forEach((x, n) => c.run(x.name, x.description, x.leveled ? 1 : 0, n));
        this.kvSet('conditions_seeded', true);
      }
      // XP budget per character: present in SRD 5.2 (Gameplay Toolbox), shipped as editable defaults.
      if (!this.get('SELECT 1 AS x FROM difficulty_threshold LIMIT 1')) {
        const t = this.db.prepare('INSERT INTO difficulty_threshold (level, tier, xp) VALUES (?, ?, ?)');
        (srd.xp_budget || []).forEach(([low, moderate, high], n) => { t.run(n + 1, 'low', low); t.run(n + 1, 'moderate', moderate); t.run(n + 1, 'high', high); });
      }
      this.kvSet('srd_version', srd.version);
    });
    this.seedGenerators(require('node:path').join(require('node:path').dirname(srdPath), 'generators.json'));
  }

  // Built-in generator tables are original content. They are added once per key and never
  // overwritten afterwards, so the GM's edits (or deletions of entries) always stick.
  seedGenerators(file) {
    const gens = JSON.parse(fs.readFileSync(file, 'utf8'));
    const done = new Set(JSON.parse(this.get("SELECT value FROM kv WHERE key = 'gen_seeded'")?.value || '[]'));
    const fresh = gens.tables.filter((g) => !done.has(g.key));
    if (!fresh.length) return;
    this.tx(() => {
      const ins = this.db.prepare('INSERT OR IGNORE INTO gen_table (key, name, category, top, save_as, builtin, entries) VALUES (?, ?, ?, ?, ?, 1, ?)');
      for (const g of fresh) {
        ins.run(g.key, g.name, g.category, g.top ? 1 : 0, g.save_as || '', JSON.stringify(g.entries.map((e) => (typeof e === 'string' ? { text: e, weight: 1 } : { text: e[1], weight: e[0] }))));
        done.add(g.key);
      }
      this.kvSet('gen_seeded', [...done]);
    });
  }

  // ---- reads
  rowOut(type, row) {
    for (const j of ENT[type].json || []) row[j] = JSON.parse(row[j] || '{}');
    return row;
  }

  bootstrap() {
    const kv = {};
    for (const r of this.all('SELECT key, value FROM kv')) kv[r.key] = JSON.parse(r.value);
    const lib = (t) => this.all(`SELECT * FROM ${t} ORDER BY name COLLATE NOCASE`).map((r) => this.rowOut(t, r));
    return {
      campaigns: this.all('SELECT * FROM campaign ORDER BY name COLLATE NOCASE'),
      monsters: lib('monster'), spells: lib('spell'), items: lib('item'), rules: lib('rule'),
      conditions: this.all('SELECT * FROM condition ORDER BY sort_order, id'),
      thresholds: this.all('SELECT * FROM difficulty_threshold ORDER BY level'),
      genTables: this.all('SELECT * FROM gen_table ORDER BY category, name COLLATE NOCASE').map((r) => this.rowOut('gen_table', r)),
      diceLog: this.all('SELECT * FROM dice_log ORDER BY id DESC LIMIT 200'),
      kv, attribution: this.attribution, dbFile: this.file,
    };
  }

  loadCampaign(id) {
    const out = {};
    for (const type of ['location', 'faction', 'npc', 'quest', 'session', 'encounter', 'party_member', 'timer', 'sound_button']) {
      out[type] = this.all(`SELECT * FROM ${type} WHERE campaign_id = ? ORDER BY id`, id).map((r) => this.rowOut(type, r));
      this.attachLinks(type, out[type], `SELECT id FROM ${type} WHERE campaign_id = ${Number(id)}`);
    }
    const noteScope = `SELECT n.id FROM note n JOIN session s ON s.id = n.session_id WHERE s.campaign_id = ${Number(id)}`;
    out.note = this.all(`SELECT n.* FROM note n JOIN session s ON s.id = n.session_id WHERE s.campaign_id = ? ORDER BY n.id`, id);
    this.attachLinks('note', out.note, noteScope);
    const em = this.all(`SELECT * FROM encounter_monster WHERE encounter_id IN (SELECT id FROM encounter WHERE campaign_id = ?) ORDER BY id`, id);
    for (const e of out.encounter) e.monsters = em.filter((x) => x.encounter_id === e.id).map((x) => ({ monster_id: x.monster_id, quantity: x.quantity, custom_name: x.custom_name, hp_override: x.hp_override }));
    return out;
  }

  attachLinks(type, rows, scopeSql) {
    const links = ENT[type].links || {};
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const [field, [table, own, other]] of Object.entries(links)) {
      for (const r of rows) r[field] = [];
      for (const l of this.all(`SELECT ${own} AS o, ${other} AS x FROM ${table} WHERE ${own} IN (${scopeSql})`)) {
        byId.get(l.o)?.[field].push(l.x);
      }
    }
  }

  // ---- writes
  save(type, obj) {
    const def = ENT[type];
    if (!def) throw new Error('Unknown entity type: ' + type);
    return this.tx(() => {
      if (def.library) {
        if (obj.id && this.get(`SELECT source FROM ${type} WHERE id = ?`, obj.id)?.source === 'SRD') {
          throw new Error('SRD entries are read-only. Duplicate it to make your own version.');
        }
        obj.source = 'Homebrew';
      }
      // Only columns present on the object are written, so inserts pick up schema defaults
      // and updates can be partial.
      const present = def.cols.filter((c) => obj[c] !== undefined);
      const vals = present.map((c) => {
        let v = obj[c];
        if ((def.json || []).includes(c)) return JSON.stringify(v ?? {});
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (v === null || v === '') return this.emptyFor(type, c);
        return v;
      });
      let id = obj.id;
      if (id) {
        if (present.length) this.run(`UPDATE ${type} SET ${present.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...vals, id);
      } else {
        const r = present.length
          ? this.run(`INSERT INTO ${type} (${present.join(', ')}) VALUES (${present.map(() => '?').join(', ')})`, ...vals)
          : this.run(`INSERT INTO ${type} DEFAULT VALUES`);
        id = Number(r.lastInsertRowid);
      }
      for (const [field, [table, own, other]] of Object.entries(def.links || {})) {
        if (!Array.isArray(obj[field])) continue;
        this.run(`DELETE FROM ${table} WHERE ${own} = ?`, id);
        const ins = this.db.prepare(`INSERT OR IGNORE INTO ${table} (${own}, ${other}) VALUES (?, ?)`);
        for (const x of new Set(obj[field])) ins.run(id, x);
      }
      if (type === 'encounter' && Array.isArray(obj.monsters)) {
        this.run('DELETE FROM encounter_monster WHERE encounter_id = ?', id);
        const ins = this.db.prepare('INSERT INTO encounter_monster (encounter_id, monster_id, quantity, custom_name, hp_override) VALUES (?, ?, ?, ?, ?)');
        for (const m of obj.monsters) ins.run(id, m.monster_id, Math.max(1, m.quantity | 0), m.custom_name || '', m.hp_override || null);
      }
      const row = this.rowOut(type, this.get(`SELECT * FROM ${type} WHERE id = ?`, id));
      for (const field of Object.keys(def.links || {})) row[field] = Array.isArray(obj[field]) ? [...new Set(obj[field])] : [];
      if (type === 'encounter') row.monsters = obj.monsters || [];
      return row;
    });
  }

  // What an empty form field becomes: NULL for optional numbers/links, 0 or '' for NOT NULL columns.
  emptyFor(type, col) {
    if (/^(location_id|parent_id|monster_id|ac|hp|max_hp|combatant_id)$/.test(col)) return null;
    if (/^(party_level|party_size|duration|remaining|running|started_at|top|builtin|volume|loop|fade)$/.test(col)) return 0;
    if (col === 'init_bonus') return type === 'npc' ? null : 0;
    if (/^(level|leveled|sort_order)$/.test(col)) return 0;
    return '';
  }

  remove(type, id) {
    if (!ENT[type]) throw new Error('Unknown entity type: ' + type);
    if (ENT[type].library && this.get(`SELECT source FROM ${type} WHERE id = ?`, id)?.source === 'SRD') {
      throw new Error('SRD entries are read-only.');
    }
    this.run(`DELETE FROM ${type} WHERE id = ?`, id);
    return true;
  }

  kvGet(key) { const r = this.get('SELECT value FROM kv WHERE key = ?', key); return r ? JSON.parse(r.value) : undefined; }

  kvSet(key, value) {
    this.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
    return true;
  }

  setThreshold(level, tier, xp) {
    this.run('INSERT INTO difficulty_threshold (level, tier, xp) VALUES (?, ?, ?) ON CONFLICT(level, tier) DO UPDATE SET xp = excluded.xp', level, tier, Math.max(0, xp | 0));
    return true;
  }

  diceAdd(entry) {
    const r = this.run('INSERT INTO dice_log (created_at, expression, detail, total, session_id, combatant) VALUES (?, ?, ?, ?, ?, ?)',
      entry.created_at, entry.expression, entry.detail, entry.total, entry.session_id || null, entry.combatant || '');
    return { ...entry, id: Number(r.lastInsertRowid) };
  }

  // Every media file some soundboard button still uses (for sweeping orphans at startup).
  // That is soundboard files plus pictures attached to NPCs, locations and monsters (kv keys "img:<type>:<id>").
  mediaInUse() {
    const pics = this.all("SELECT value FROM kv WHERE key LIKE 'img:%'").map((r) => JSON.parse(r.value));
    return new Set([...this.all('SELECT audio, visual FROM sound_button').flatMap((r) => [r.audio, r.visual]), ...pics].filter(Boolean));
  }

  // A consistent single-file copy of the database, for backups.
  snapshot(dest) { fs.rmSync(dest, { force: true }); this.db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`); }
  close() { this.db.close(); }

  diceClear() { this.run('DELETE FROM dice_log'); return true; }
}

module.exports = { Store, ENT };
