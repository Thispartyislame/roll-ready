// Schema migrations. Each entry runs once, in order; PRAGMA user_version tracks progress.
// To change the schema later, append a new entry — never edit an old one.
module.exports = [
  // ---- v1: Phase 1 data model
  `
  CREATE TABLE campaign (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    system TEXT NOT NULL DEFAULT 'D&D 2024 (5.5e)',   -- free text on purpose: 2014 campaigns can live side by side
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE location (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    parent_id INTEGER REFERENCES location(id) ON DELETE SET NULL,
    tags TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE faction (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    goals TEXT NOT NULL DEFAULT '',
    relationships TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE npc (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    personality TEXT NOT NULL DEFAULT '',
    location_id INTEGER REFERENCES location(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'alive',
    tags TEXT NOT NULL DEFAULT '',
    -- optional combat numbers so a prepped NPC can be dropped straight into initiative
    ac INTEGER, max_hp INTEGER, init_bonus INTEGER,
    monster_id INTEGER REFERENCES monster(id) ON DELETE SET NULL   -- "uses this stat block"
  );
  CREATE TABLE npc_faction (
    npc_id INTEGER NOT NULL REFERENCES npc(id) ON DELETE CASCADE,
    faction_id INTEGER NOT NULL REFERENCES faction(id) ON DELETE CASCADE,
    PRIMARY KEY (npc_id, faction_id)
  );

  CREATE TABLE quest (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    description TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE quest_npc (
    quest_id INTEGER NOT NULL REFERENCES quest(id) ON DELETE CASCADE,
    npc_id INTEGER NOT NULL REFERENCES npc(id) ON DELETE CASCADE,
    PRIMARY KEY (quest_id, npc_id)
  );
  CREATE TABLE quest_location (
    quest_id INTEGER NOT NULL REFERENCES quest(id) ON DELETE CASCADE,
    location_id INTEGER NOT NULL REFERENCES location(id) ON DELETE CASCADE,
    PRIMARY KEY (quest_id, location_id)
  );

  CREATE TABLE session (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
    date TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE note (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    body TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE note_npc (
    note_id INTEGER NOT NULL REFERENCES note(id) ON DELETE CASCADE,
    npc_id INTEGER NOT NULL REFERENCES npc(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, npc_id)
  );
  CREATE TABLE note_quest (
    note_id INTEGER NOT NULL REFERENCES note(id) ON DELETE CASCADE,
    quest_id INTEGER NOT NULL REFERENCES quest(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, quest_id)
  );

  -- Shared library (not campaign-scoped). srd_key is set for bundled SRD rows so they can be
  -- refreshed in place on app updates without breaking encounter links.
  CREATE TABLE monster (
    id INTEGER PRIMARY KEY,
    srd_key TEXT UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'Homebrew',
    cr TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '',
    ac INTEGER, hp INTEGER, init_bonus INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL DEFAULT '{}'            -- full 2024-format stat block as JSON
  );

  CREATE TABLE encounter (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE encounter_monster (
    encounter_id INTEGER NOT NULL REFERENCES encounter(id) ON DELETE CASCADE,
    monster_id INTEGER NOT NULL REFERENCES monster(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (encounter_id, monster_id)
  );
  CREATE TABLE encounter_npc (
    encounter_id INTEGER NOT NULL REFERENCES encounter(id) ON DELETE CASCADE,
    npc_id INTEGER NOT NULL REFERENCES npc(id) ON DELETE CASCADE,
    PRIMARY KEY (encounter_id, npc_id)
  );
  CREATE TABLE session_encounter (
    session_id INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    encounter_id INTEGER NOT NULL REFERENCES encounter(id) ON DELETE CASCADE,
    PRIMARY KEY (session_id, encounter_id)
  );

  -- Rules reference (shared). source = 'SRD' (bundled, read-only) or 'Homebrew' (user's own).
  CREATE TABLE spell (
    id INTEGER PRIMARY KEY, srd_key TEXT UNIQUE,
    name TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'Homebrew',
    level INTEGER NOT NULL DEFAULT 0, school TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE item (
    id INTEGER PRIMARY KEY, srd_key TEXT UNIQUE,
    name TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'Homebrew',
    category TEXT NOT NULL DEFAULT '', rarity TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE rule (
    id INTEGER PRIMARY KEY, srd_key TEXT UNIQUE,
    name TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'Homebrew',
    category TEXT NOT NULL DEFAULT '', section TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT ''
  );

  -- Editable condition list for the initiative tracker (not every table runs 2024 rules).
  CREATE TABLE condition (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    leveled INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE dice_log (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    expression TEXT NOT NULL,
    detail TEXT NOT NULL,
    total INTEGER NOT NULL
  );

  -- Small app state: live initiative tracker per campaign, active session, window prefs.
  CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE INDEX idx_npc_campaign ON npc(campaign_id);
  CREATE INDEX idx_location_campaign ON location(campaign_id);
  CREATE INDEX idx_faction_campaign ON faction(campaign_id);
  CREATE INDEX idx_quest_campaign ON quest(campaign_id);
  CREATE INDEX idx_session_campaign ON session(campaign_id);
  CREATE INDEX idx_encounter_campaign ON encounter(campaign_id);
  CREATE INDEX idx_note_session ON note(session_id);
  `,

  // ---- v2: Phase 2 — encounter builder, party, countdown timers, roll log links, generator tables
  `
  ALTER TABLE campaign ADD COLUMN party_level INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE campaign ADD COLUMN party_size INTEGER NOT NULL DEFAULT 4;
  UPDATE campaign SET system = '5E (2024 rules)' WHERE system = 'D&D 2024 (5.5e)';
  UPDATE campaign SET system = '5E (2014 rules)' WHERE system = 'D&D 2014 (5e)';

  -- Encounter lines get their own id so the same monster can appear twice with different names/HP.
  ALTER TABLE encounter ADD COLUMN hp_mode TEXT NOT NULL DEFAULT 'average';   -- 'average' | 'rolled'
  CREATE TABLE encounter_monster_v2 (
    id INTEGER PRIMARY KEY,
    encounter_id INTEGER NOT NULL REFERENCES encounter(id) ON DELETE CASCADE,
    monster_id INTEGER NOT NULL REFERENCES monster(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    custom_name TEXT NOT NULL DEFAULT '',
    hp_override INTEGER
  );
  INSERT INTO encounter_monster_v2 (encounter_id, monster_id, quantity)
    SELECT encounter_id, monster_id, quantity FROM encounter_monster;
  DROP TABLE encounter_monster;
  ALTER TABLE encounter_monster_v2 RENAME TO encounter_monster;
  CREATE INDEX idx_encounter_monster ON encounter_monster(encounter_id);

  -- Reusable party list, one per campaign. Deliberately tiny: this is not a character sheet.
  CREATE TABLE party_member (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    player TEXT NOT NULL DEFAULT '',
    ac INTEGER, max_hp INTEGER, init_bonus INTEGER
  );

  -- Editable XP budget per character, by party level and difficulty tier.
  CREATE TABLE difficulty_threshold (
    level INTEGER NOT NULL,
    tier TEXT NOT NULL,              -- 'low' | 'moderate' | 'high'
    xp INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (level, tier)
  );

  -- Named countdown timers. unit = 'seconds' (real time) or 'rounds' (ticks with the tracker).
  CREATE TABLE timer (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT 'seconds',
    duration INTEGER NOT NULL DEFAULT 0,
    remaining INTEGER NOT NULL DEFAULT 0,      -- seconds or rounds left as of started_at
    running INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL DEFAULT 0,     -- epoch ms when last started (seconds timers)
    combatant_id INTEGER,                      -- tracker combatant this effect is attached to
    combatant_name TEXT NOT NULL DEFAULT ''
  );

  -- Roll history: optional links to the session and combatant a roll was made for.
  ALTER TABLE dice_log ADD COLUMN session_id INTEGER REFERENCES session(id) ON DELETE SET NULL;
  ALTER TABLE dice_log ADD COLUMN combatant TEXT NOT NULL DEFAULT '';

  -- Roll tables for the generators. Entries are JSON: [{ "text": "...", "weight": 1 }].
  -- Text may reference other tables as {key} and dice as {2d6}.
  CREATE TABLE gen_table (
    id INTEGER PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    top INTEGER NOT NULL DEFAULT 1,            -- 1 = shown as a generator, 0 = a parts table used by others
    save_as TEXT NOT NULL DEFAULT '',          -- '', 'npc', 'location', 'quest' or 'note'
    builtin INTEGER NOT NULL DEFAULT 0,
    entries TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX idx_party_campaign ON party_member(campaign_id);
  CREATE INDEX idx_timer_campaign ON timer(campaign_id);
  `,

  // ---- v3: soundboard buttons. Media files are copied into the "roll-ready-media" folder beside the database.
  `
  CREATE TABLE sound_button (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',            -- '', 'blue', 'violet', 'good', 'orange' or 'bad'
    sort_order INTEGER NOT NULL DEFAULT 0,
    audio TEXT NOT NULL DEFAULT '',            -- file name in the media folder
    visual TEXT NOT NULL DEFAULT '',           -- picture or video shown on the player view
    visual_kind TEXT NOT NULL DEFAULT '',      -- 'image' | 'video'
    volume INTEGER NOT NULL DEFAULT 100,       -- 0-100
    loop INTEGER NOT NULL DEFAULT 0,
    duration INTEGER NOT NULL DEFAULT 0        -- seconds until it stops and disappears; 0 = no limit
  );
  CREATE INDEX idx_sound_campaign ON sound_button(campaign_id);
  `,

  // ---- v4: soundboard channels (music / effect / scene), fades, and scenes that start several buttons at once
  `
  ALTER TABLE sound_button ADD COLUMN channel TEXT NOT NULL DEFAULT 'effect';   -- 'effect' | 'music' | 'scene'
  ALTER TABLE sound_button ADD COLUMN fade INTEGER NOT NULL DEFAULT 0;           -- seconds to fade in and out
  ALTER TABLE sound_button ADD COLUMN members TEXT NOT NULL DEFAULT '[]';        -- for a scene: JSON array of button ids
  `,
];
