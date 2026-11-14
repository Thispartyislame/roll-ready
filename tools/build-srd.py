#!/usr/bin/env python3
"""Builds data/srd.json from two CC-BY-4.0 sources of the SRD 5.2:

  1. open5e-api  (github.com/open5e/open5e-api)   data/v2/wizards-of-the-coast/srd-2024
     -> spells, creatures, equipment, magic items, conditions, core rules sections
  2. dndsrd5.2_markdown (github.com/springbov/dndsrd5.2_markdown)  src/
     -> rules glossary, gameplay toolbox

Usage: build-srd.py <open5e srd-2024 dir> <markdown src dir> <out.json>
Only needed if you want to regenerate the bundled data; the app ships with the output.
"""
import json, re, sys, os

O5, MD, OUT = sys.argv[1], sys.argv[2], sys.argv[3]


def L(name):
    with open(os.path.join(O5, name + ".json"), encoding="utf-8") as f:
        return json.load(f)


def title(s):
    return " ".join(w.capitalize() for w in str(s).replace("-", " ").split())


def sign(n):
    return ("+" if n >= 0 else "") + str(n)


# ---------------------------------------------------------------- spells
CAST = {"action": "Action", "bonus-action": "Bonus Action", "reaction": "Reaction",
        "1minute": "1 minute", "10minutes": "10 minutes", "1hour": "1 hour"}
spells = []
for s in L("Spell"):
    f = s["fields"]
    comps = [c for c, k in (("V", "verbal"), ("S", "somatic"), ("M", "material")) if f[k]]
    comp = ", ".join(comps)
    if f["material"] and f["material_specified"]:
        comp += " (" + f["material_specified"] + ")"
    cast = CAST.get(f["casting_time"], f["casting_time"])
    if f["reaction_condition"]:
        cast += ", " + f["reaction_condition"]
    dur = (f["duration"] or "")
    dur = dur[:1].upper() + dur[1:]
    if f["concentration"] and "oncentration" not in dur:
        dur = "Concentration, " + dur
    spells.append({
        "key": s["pk"], "name": f["name"], "level": f["level"], "school": title(f["school"]),
        "classes": ", ".join(sorted(title(c.split("_")[1]) for c in f["classes"])),
        "casting_time": cast, "range": (f["range_text"] or "")[:1].upper() + (f["range_text"] or "")[1:], "components": comp,
        "duration": dur, "concentration": bool(f["concentration"]), "ritual": bool(f["ritual"]),
        "description": f["desc"], "higher_level": f["higher_level"] or "",
    })

# ---------------------------------------------------------------- monsters
def cr_str(v):
    x = float(v)
    return {0.125: "1/8", 0.25: "1/4", 0.5: "1/2"}.get(x, str(int(x)))


traits, actions = {}, {}
for t in L("CreatureTrait"):
    f = t["fields"]
    traits.setdefault(f["parent"], []).append({"name": f["name"], "desc": f["desc"]})
for a in sorted(L("CreatureAction"), key=lambda a: a["fields"]["order_in_statblock"] or 0):
    f = a["fields"]
    name = f["name"]
    ut, up = f["uses_type"], f["uses_param"]
    if "(" not in name:
        if ut == "RECHARGE_ON_ROLL":
            name += " (Recharge %s)" % ("6" if up == 6 else "%d–6" % up)
        elif ut == "PER_DAY":
            name += " (%d/Day)" % up
        elif ut == "RECHARGE":
            name += " (Recharge after a Short or Long Rest)"
        if f["limited_to_form"]:
            name += " (%s)" % f["limited_to_form"]
    actions.setdefault(f["parent"], {}).setdefault(f["action_type"], []).append({"name": name, "desc": f["desc"]})

AB = [("str", "strength"), ("dex", "dexterity"), ("con", "constitution"),
      ("int", "intelligence"), ("wis", "wisdom"), ("cha", "charisma")]
monsters = []
for c in L("Creature"):
    f = c["fields"]
    speed = ["%s ft." % f["walk"]] if f["walk"] is not None else []
    for k in ("burrow", "climb", "fly", "swim"):
        if f[k]:
            speed.append("%s %s ft.%s" % (k.capitalize(), f[k], " (hover)" if k == "fly" and f["hover"] else ""))
    senses = []
    for k in ("blindsight", "darkvision", "tremorsense", "truesight"):
        if f[k + "_range"]:
            senses.append("%s %s ft." % (k.capitalize(), f[k + "_range"]))
    sense_s = ", ".join(senses)
    if f["passive_perception"] is not None:
        sense_s += ("; " if sense_s else "") + "Passive Perception %s" % f["passive_perception"]
    skills = ", ".join("%s %s" % (title(k[len("skill_bonus_"):].replace("_", " ")), sign(v))
                       for k, v in sorted(f.items()) if k.startswith("skill_bonus_") and v is not None)
    imm = "; ".join(x for x in (title(f["damage_immunities_display"]), title(f["condition_immunities_display"])) if x)
    lang = f["languages_desc"] or ""
    if f["telepathy_range"] and "telepathy" not in lang.lower():
        lang += ("; " if lang else "") + "telepathy %s ft." % f["telepathy_range"]
    acts = actions.get(c["pk"], {})
    monsters.append({
        "key": c["pk"], "name": f["name"], "size": title(f["size"]), "type": title(f["type"]),
        "alignment": title(f["alignment"] or ""), "ac": f["armor_class"], "hp": f["hit_points"],
        "hit_dice": f["hit_dice"] or "", "speed": ", ".join(speed), "init_bonus": f["initiative_bonus"] or 0,
        "abilities": {a: f["ability_score_" + n] for a, n in AB},
        "saves": {a: f["saving_throw_" + n] for a, n in AB},
        "skills": skills, "vulnerabilities": title(f["damage_vulnerabilities_display"]),
        "resistances": title(f["damage_resistances_display"]), "immunities": imm,
        "senses": sense_s, "languages": lang or "None", "cr": cr_str(f["challenge_rating"]),
        "traits": traits.get(c["pk"], []), "actions": acts.get("ACTION", []),
        "bonus_actions": acts.get("BONUS_ACTION", []), "reactions": acts.get("REACTION", []),
        "legendary_actions": acts.get("LEGENDARY_ACTION", []),
    })

# ---------------------------------------------------------------- items
weapons = {w["pk"]: w["fields"] for w in L("Weapon")}
armors = {a["pk"]: a["fields"] for a in L("Armor")}
wprops = {p["pk"]: p["fields"] for p in L("WeaponProperty")}
wassign = {}
for a in L("WeaponPropertyAssignment"):
    f = a["fields"]
    p = wprops[f["property"]]
    label = p["name"] + (" (%s)" % f["detail"] if f["detail"] else "")
    wassign.setdefault(f["weapon"], {"props": [], "mastery": []})["mastery" if p["type"] == "Mastery" else "props"].append(label)


def cost_str(c):
    v = float(c or 0)
    if v <= 0:
        return ""
    if v >= 1:
        return ("%g GP" % v)
    if v >= 0.1:
        return "%g SP" % (v * 10)
    return "%g CP" % (v * 100)


def weapon_line(pk):
    w = weapons.get(pk)
    if not w:
        return ""
    bits = ["**%s %s weapon.**" % ("Simple" if w["is_simple"] else "Martial", "ranged" if w["range"] and not any(
        "Thrown" in p for p in wassign.get(pk, {}).get("props", [])) else "melee"),
            "Damage %s %s." % (w["damage_dice"], w["damage_type"])]
    if w["range"]:
        bits.append("Range %s/%s ft." % (int(w["range"]), int(w["long_range"] or 0)))
    a = wassign.get(pk, {})
    if a.get("props"):
        bits.append("Properties: %s." % ", ".join(a["props"]))
    if a.get("mastery"):
        bits.append("Mastery: %s." % ", ".join(a["mastery"]))
    return " ".join(bits)


def armor_line(pk):
    a = armors.get(pk)
    if not a:
        return ""
    ac = "AC %s" % a["ac_base"]
    if a["ac_add_dexmod"]:
        ac += " + Dex modifier" + (" (max %s)" % a["ac_cap_dexmod"] if a["ac_cap_dexmod"] else "")
    bits = ["**Armor.** %s." % ac]
    if a["strength_score_required"]:
        bits.append("Requires Strength %s." % a["strength_score_required"])
    if a["grants_stealth_disadvantage"]:
        bits.append("Disadvantage on Stealth checks.")
    return " ".join(bits)


items = []
for src, magic in ((L("Item"), False), (L("MagicItem"), True)):
    for it in src:
        f = it["fields"]
        name = re.sub(r"\s*\([\d.,]+ [GSC]P\)$", "", f["name"])
        extra = "\n\n".join(x for x in (weapon_line(f["weapon"]), armor_line(f["armor"])) if x)
        desc = f["desc"] or ""
        if extra:
            desc = extra + ("\n\n" + desc if desc and not re.match(r"^An? [\w ,'-]+\.$", desc) else "")
        w = float(f["weight"] or 0)
        items.append({
            "key": it["pk"], "name": name,
            "category": ("Magic " if magic else "") + title(f["category"]),
            "rarity": title(f.get("rarity") or ""), "attunement": bool(f.get("requires_attunement")),
            "cost": cost_str(f["cost"]), "weight": ("%g lb." % w) if w else "", "description": desc,
        })

# ---------------------------------------------------------------- rules
rules = []
rulesets = {r["pk"]: r["fields"]["name"] for r in L("RuleSet")}
for r in L("RuleSet"):
    f = r["fields"]
    if f["desc"] and f["name"] != "Trinkets":
        rules.append({"key": r["pk"], "name": f["name"], "category": "Playing the Game", "body": f["desc"]})
for r in L("Rule"):
    f = r["fields"]
    rs = rulesets.get(f["ruleset"], "")
    if rs in ("Create Your Character", "Multiclassing"):
        cat = "Character Creation"
    else:
        cat = "Playing the Game"
    rules.append({"key": r["pk"], "name": f["name"], "category": cat, "section": rs, "body": f["desc"]})
for p in L("WeaponProperty"):
    f = p["fields"]
    rules.append({"key": p["pk"], "name": f["name"],
                  "category": "Weapon Mastery" if f["type"] == "Mastery" else "Weapon Property", "body": f["desc"]})


def read(name):
    with open(os.path.join(MD, name), encoding="utf-8") as fh:
        return fh.read()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# Glossary: every "#### Term [Tag]" under "## Rules Definitions"
gl = read("08_RulesGlossary.md").split("## Rules Definitions", 1)[1]
for chunk in re.split(r"^#### ", gl, flags=re.M)[1:]:
    head, _, body = chunk.partition("\n")
    m = re.match(r"^(.*?)\s*\[(.+?)\]\s*$", head.strip())
    name, tag = (m.group(1), m.group(2)) if m else (head.strip(), "")
    name = name.replace("*", "").strip()
    rules.append({"key": "gloss_" + slug(head), "name": name, "category": "Glossary", "section": tag,
                  "body": body.strip()})

# Gameplay toolbox: split on ## and ### headings
tb = read("09_GameplayToolbox.md")
parent = ""
for chunk in re.split(r"^(?=#{2,3} )", tb, flags=re.M)[1:]:
    head, _, body = chunk.partition("\n")
    level = len(head) - len(head.lstrip("#"))
    name = head.lstrip("# ").strip()
    body = re.sub(r"^#### ", "### ", body.strip(), flags=re.M)
    if level == 2:
        parent = name
    if not body:
        continue
    rules.append({"key": "tool_" + slug((parent + "-" if level == 3 else "") + name), "name": name,
                  "category": "Gameplay Toolbox", "section": parent if level == 3 else "", "body": body})

# XP Budget per Character (Gameplay Toolbox > Combat Encounters): [low, moderate, high] for levels 1-20
xp_budget = []
for row in re.findall(r"^\|\s*(\d+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)\s*\|", tb.split("XP Budget per Character", 2)[2], flags=re.M)[:20]:
    xp_budget.append([int(x.replace(",", "")) for x in row[1:]])
assert len(xp_budget) == 20, xp_budget

conditions = [{"name": title(c["fields"]["describes"]), "description": c["fields"]["desc"].strip(),
               "leveled": c["fields"]["describes"] == "exhaustion"} for c in L("ConditionDescription")]

out = {
    "version": "srd-5.2-build-2",
    "attribution": "This work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards "
                   "of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the "
                   "Creative Commons Attribution 4.0 International License, available at "
                   "https://creativecommons.org/licenses/by/4.0/legalcode.",
    "spells": spells, "monsters": monsters, "items": items, "rules": rules, "conditions": conditions, "xp_budget": xp_budget,
}
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
print({k: len(v) for k, v in out.items() if isinstance(v, list)}, os.path.getsize(OUT))
