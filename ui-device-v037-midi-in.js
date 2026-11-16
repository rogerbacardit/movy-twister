import * as os from "os";
import * as std from "std";
import { Black, DarkGrey, White, BrightRed, NeonGreen,
         MovePads, MoveKnob1, MidiNoteOn, MidiNoteOff,
         MoveKnob1Touch, MoveKnob8Touch,
         MoveShift, MoveBack, MoveMainButton, MoveMainKnob,
         MoveLeft, MoveRight, MoveUp, MoveDown
} from "/data/UserData/schwung/shared/constants.mjs";
import { setLED, setButtonLED, decodeDelta }
    from "/data/UserData/schwung/shared/input_filter.mjs";

// src/keyboard/drum-grid.ts
function drumCols(cfg) {
  return !cfg.rawMidi && cfg.padCount > 16 ? 8 : 4;
}
function drumPadOfPhys(physPad, padMin, cfg) {
  let pad;
  if (cfg.rawMidi) {
    pad = physPad - cfg.padNoteStart + 1;
  } else {
    const idx2 = physPad - padMin;
    const col = idx2 % 8;
    if (col >= drumCols(cfg)) return -1;
    pad = Math.floor(col / 4) * 16 + Math.floor(idx2 / 8) * 4 + col % 4 + 1;
  }
  return pad >= 1 && pad <= cfg.padCount ? pad : -1;
}
function drumNoteOfPad(pad, cfg) {
  const declared = cfg.padNotes;
  if (declared && pad >= 1 && pad <= declared.length) {
    const n = declared[pad - 1];
    if (Number.isFinite(n)) return n;
  }
  return cfg.padNoteStart + pad - 1;
}
function drumPadOfNote(note, cfg) {
  for (let pad = 1; pad <= cfg.padCount; pad++) {
    if (drumNoteOfPad(pad, cfg) === note) return pad;
  }
  return -1;
}
function drumNoteOfPhys(physPad, padMin, cfg) {
  const pad = drumPadOfPhys(physPad, padMin, cfg);
  return pad < 0 ? -1 : drumNoteOfPad(pad, cfg);
}
function physPadOfDrumPad(pad, padMin, cfg) {
  if (cfg.rawMidi) return drumNoteOfPad(pad, cfg);
  const i = pad - 1;
  return padMin + Math.floor(i % 16 / 4) * 8 + Math.floor(i / 16) * 4 + i % 4;
}
function drumShiftSelect(shiftHeld, cfg) {
  return shiftHeld && cfg !== null;
}

// src/model/drum-declared.ts
var reader = null;
function setSurfaceReader(fn) {
  reader = fn;
}
function readSurface(hierarchy) {
  if (!reader || !hierarchy) return null;
  try {
    return reader(hierarchy);
  } catch (_e) {
    return null;
  }
}
function effectiveDrumConfig(declared, config) {
  if (config) return config;
  if (!declared || declared.layout !== "drums" || !declared.voices.length) return null;
  const padNotes = declared.voices.map((v) => v.note);
  return {
    padCount: padNotes.length,
    /* Kept meaningful for the rawMidi path and for anything still reading
     * it, but NOT what pad notes are derived from — see padNotes. */
    padNoteStart: padNotes[0],
    rawMidi: false,
    padNotes,
    /* The module names the param holding its focused voice. */
    ...declared.focusParam ? { currentPadParam: declared.focusParam } : {},
    /* WHAT to write into it, which the two sources spell differently.
     *
     * A hand-written `currentPadParam` (a config's) is the template
     * shape's instance number, so movy writes the pad number. A declared
     * `focus_param` is the SIBLING shape, and its value is a LEVEL NAME —
     * "snare", never "2". movy wrote the pad number into both, so every
     * declared rack was told to focus a voice called "1", which is not a
     * level and which the module can only ignore. Carried per pad because
     * the levels are the module's own names in its own order. */
    ...declared.focusParam ? { padFocusValues: declared.voices.map((v) => v.level) } : {}
  };
}
function padVoices(cfg, voices) {
  const out2 = [];
  for (let pad = 1; pad <= cfg.padCount; pad++) {
    const note = drumNoteOfPad(pad, cfg);
    out2.push(voices.find((v) => v.note === note) ?? null);
  }
  return out2;
}

// src/renderer/schwung-lib.ts
import * as pc from "/data/UserData/schwung/shared/param_pages/page_controller.mjs";
import * as pi from "/data/UserData/schwung/shared/param_pages/page_input.mjs";
import * as rpm from "/data/UserData/schwung/shared/param_pages/render_page_movy.mjs";
import * as el from "/data/UserData/schwung/shared/param_pages/enum_list.mjs";
import * as wr from "/data/UserData/schwung/shared/param_pages/widget_registry.mjs";
import * as vo from "/data/UserData/schwung/shared/param_pages/voices.mjs";
import * as ck from "/data/UserData/schwung/shared/param_pages/child_key.mjs";
import * as pm from "/data/UserData/schwung/shared/param_pages/param_meta.mjs";
import * as pp from "/data/UserData/schwung/shared/param_pages/page_plan.mjs";
import * as anm from "/data/UserData/schwung/shared/param_pages/anim_state.mjs";
import "/data/UserData/schwung/shared/param_pages/wav_io_qjs.mjs";
import * as wp from "/data/UserData/schwung/shared/param_pages/wav_peaks.mjs";
import * as vz from "/data/UserData/schwung/shared/param_pages/viz.mjs";
import * as lk from "/data/UserData/schwung/shared/param_pages/list_knob.mjs";
import * as fc from "/data/UserData/schwung/shared/param_pages/frame_ctx.mjs";
import * as rp from "/data/UserData/schwung/shared/param_pages/render_page.mjs";
import * as lfo from "/data/UserData/schwung/shared/param_pages/lfo_page.mjs";
import * as lvm from "/data/UserData/schwung/shared/lane_voice_map.mjs";
var lib = {
  createController: pc.createController,
  LAYOUT_MOVY: pc.LAYOUT_MOVY,
  applyInput: pi.applyInput,
  renderPageMovy: rpm.renderPageMovy,
  BAND_H: rpm.BAND_H,
  normalizedOf: rpm.normalizedOf,
  drawFooter: rpm.drawFooter,
  isTurnable: pm.isTurnable,
  KIND_ENUM: pm.KIND_ENUM,
  PAGE_KNOBS: pp.PAGE_KNOBS,
  PAGE_PRESET: pp.PAGE_PRESET,
  PAGE_ITEMS: pp.PAGE_ITEMS,
  PAGE_MENU: pp.PAGE_MENU,
  drawEnumList: el.drawEnumList,
  registerWidget: wr.registerWidget,
  clearWidgets: wr.clearWidgets,
  isWidgetAvailable: wr.isWidgetAvailable,
  padLayoutOf: vo.padLayoutOf,
  focusParamOf: vo.focusParamOf,
  voicesOf: vo.voicesOf,
  voiceIndexFromNote: vo.voiceIndexFromNote,
  focusPressParamOf: vo.focusPressParamOf,
  childPressParam: ck.childPressParam,
  activity: anm.activity,
  buttonPhase: rpm.buttonPhase,
  resolveChildKey: ck.resolveChildKey,
  childIndexToWire: ck.childIndexToWire,
  childCount: ck.childCount,
  childIndexFromWire: ck.childIndexFromWire,
  childIndexParam: ck.childIndexParam,
  VIZ_SAMPLE: vz.VIZ_SAMPLE,
  wavPeaksTick: wp.wavPeaksTick,
  wavPeaksDone: wp.wavPeaksDone,
  wavPeaks: wp.wavPeaks,
  listKnobInit: lk.listKnobInit,
  listKnobStep: lk.listKnobStep,
  DETENTS_PER_ENTRY: lk.DETENTS_PER_ENTRY,
  SETTLE_TICKS: pc.SETTLE_TICKS,
  frameCtx: fc.frameCtx,
  enumIndexOf: pm.enumIndexOf,
  fitHeadTail: rp.fitHeadTail
};
function schwungLib() {
  return lib;
}
var lfoPage = {
  lfoParams: lfo.lfoParams,
  lfoLevels: lfo.lfoLevels,
  lfoTargetOptions: lfo.lfoTargetOptions,
  lfoTargetIndex: lfo.lfoTargetIndex
};
function schwungLfoPage() {
  return lfoPage;
}
function schwungLaneVoiceMap() {
  return lvm.laneVoiceMap;
}

// src/renderer/schwung-voices.ts
var EMPTY = { layout: null, voices: [], focusParam: null, pressParam: null };
function pressParamOf(lib3, hierarchy) {
  if (typeof lib3.childPressParam === "function") {
    const levels2 = hierarchy && hierarchy.levels || {};
    for (const name of Object.keys(levels2)) {
      const k = lib3.childPressParam(levels2[name]);
      if (k) return k;
    }
  }
  if (typeof lib3.focusPressParamOf === "function") {
    return lib3.focusPressParamOf(hierarchy) ?? null;
  }
  return null;
}
var asRack = /* @__PURE__ */ new WeakMap();
function declaredRack(hierarchy) {
  if (!hierarchy || typeof hierarchy !== "object" || !hierarchy.levels) return hierarchy;
  const hit = asRack.get(hierarchy);
  if (hit) return hit;
  let out2 = hierarchy;
  try {
    out2 = inferRack(schwungLib(), hierarchy);
  } catch (_e) {
  }
  asRack.set(hierarchy, out2);
  return out2;
}
function inferRack(lib3, h) {
  if (lib3.padLayoutOf(h) === "chromatic" || (lib3.voicesOf(h) || []).length) return h;
  const noted = (lvl) => Array.isArray(lvl.child_notes) || Number.isFinite(lvl.child_note_base);
  const withNotes = (only) => {
    const levels2 = {};
    for (const name of Object.keys(h.levels)) {
      const lvl = h.levels[name];
      const take = lvl && lib3.childIndexParam(lvl) && lib3.childCount(lvl) > 0 && !noted(lvl) && (only === null || only === name);
      levels2[name] = take ? { ...lvl, child_note_base: 36 } : lvl;
    }
    return { ...h, pad_layout: "drums", levels: levels2 };
  };
  const first = (lib3.voicesOf(withNotes(null)) || [])[0];
  if (!first) return h;
  return withNotes(first.level);
}
function rackVoiceMap(hierarchy) {
  return hierarchy ? schwungLaneVoiceMap()(declaredRack(hierarchy)) || "" : "";
}
function onePerNote(voices) {
  const seen = /* @__PURE__ */ new Set();
  const out2 = [];
  for (const v of voices) {
    if (seen.has(v.note)) continue;
    seen.add(v.note);
    out2.push(v.index === out2.length ? v : { ...v, index: out2.length });
  }
  return out2;
}
function surfaceOf(hierarchy) {
  if (!hierarchy) return EMPTY;
  try {
    const lib3 = schwungLib();
    hierarchy = declaredRack(hierarchy);
    return {
      layout: lib3.padLayoutOf(hierarchy) ?? null,
      voices: onePerNote(lib3.voicesOf(hierarchy) || []),
      focusParam: lib3.focusParamOf(hierarchy) ?? null,
      pressParam: pressParamOf(lib3, hierarchy)
    };
  } catch (_e) {
    return EMPTY;
  }
}
function padForNote(s, note) {
  if (!s.voices.length) return null;
  const i = schwungLib().voiceIndexFromNote(s.voices, note);
  return typeof i === "number" ? i : null;
}

// src/model/child-keys.ts
var resolve = null;
var count = null;
function setChildKeyResolver(r, c) {
  resolve = r;
  count = c;
}
function childLevelsOf(levels2) {
  if (!count || !levels2) return [];
  const out2 = [];
  for (const lvl of Object.values(levels2)) {
    try {
      if (count(lvl) > 0) out2.push(lvl);
    } catch (_e) {
    }
  }
  return out2;
}
function keysOfLevel(lvl) {
  const out2 = [];
  const take = (e) => {
    const k = typeof e === "string" ? e : e && !e.level ? e.key : null;
    if (typeof k === "string" && k) out2.push(k);
  };
  for (const e of lvl.knobs || []) take(e);
  for (const e of lvl.params || []) take(e);
  return out2;
}
function childTemplateOf(levels2, key) {
  if (!resolve || !count) return null;
  for (const lvl of levels2) {
    const n = count(lvl);
    for (const t of keysOfLevel(lvl)) {
      for (let i = 0; i < n; i++) {
        const c = resolve(lvl, i, t);
        if (c === key && c !== t) return t;
      }
    }
  }
  return null;
}
function declaredKeysOf(chainParams, levels2) {
  const out2 = new Set(chainParams);
  for (const lvl of Object.values(levels2 ?? {})) {
    if (lvl && typeof lvl === "object") for (const k of keysOfLevel(lvl)) out2.add(k);
  }
  return out2;
}

// src/model/voice-keys.ts
var reader2 = null;
function setVoiceMapReader(fn) {
  reader2 = fn;
}
function voiceKeysOf(hierarchy, voices) {
  if (!reader2 || !hierarchy || !voices.length) return [];
  let wire = "";
  try {
    wire = reader2(hierarchy) || "";
  } catch (_e) {
    return [];
  }
  if (!wire) return [];
  const byNote = /* @__PURE__ */ new Map();
  for (const part of wire.split(";")) {
    const c = part.indexOf(":");
    if (c > 0) byNote.set(Number(part.slice(0, c)), part.slice(c + 1).split(","));
  }
  return voices.map((v) => byNote.get(v.note) ?? []);
}

// src/track/bulk.ts
function byteLen(s) {
  if (typeof TextEncoder === "function") return new TextEncoder().encode(s).length;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 128) n += 1;
    else if (c < 2048) n += 2;
    else if (c >= 55296 && c <= 56319) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}
function encodeBulk(items) {
  let out2 = items.length + "\n";
  for (const it of items) out2 += byteLen(it) + "\n" + it;
  return out2;
}
function parseCount(s) {
  if (s.length === 0 || !/^[0-9]+$/.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}
function decodeBulk(payload) {
  if (payload === null) return null;
  let i = payload.indexOf("\n");
  if (i < 0) return null;
  const count2 = parseCount(payload.slice(0, i));
  if (count2 === null) return null;
  i++;
  const out2 = [];
  for (let n = 0; n < count2; n++) {
    const nl = payload.indexOf("\n", i);
    if (nl < 0) return null;
    const len = parseCount(payload.slice(i, nl));
    if (len === null) return null;
    i = nl + 1;
    const end = Math.min(i + len, payload.length);
    out2.push(payload.slice(i, end));
    i = end;
  }
  return out2;
}

// src/platform/standalone.ts
var BULK_MARKER = "overtake_dsp:";
var standalonePlatform = {
  readFile: (p) => host_read_file(p),
  writeFile: (p, c) => host_write_file(p, c),
  fileExists: (p) => host_file_exists(p),
  ensureDir: (p) => host_ensure_dir(p),
  removeDir: (p) => host_remove_dir(p),
  engineGet: (k) => host_module_get_param(k) ?? null,
  engineSet: (k, v) => host_module_set_param(k, v) !== false,
  engineGetBulk: (payload) => shadow_get_params(0, BULK_MARKER, payload) ?? null,
  engineSetBulk: (payload) => shadow_set_params(0, BULK_MARKER, payload) !== false,
  engineSnapshotSeq: () => movy_engine_snapshot_seq(),
  engineSnapshot: () => movy_engine_snapshot() ?? null,
  engineSubmitted: () => movy_engine_submitted(),
  surfaceSend: (data) => {
    move_midi_internal_send(data);
  },
  externalSend: (data) => {
    move_midi_external_send(data);
  },
  loadUiModule: (p) => shadow_load_ui_module(p),
  exit: () => {
    host_exit_module();
  },
  powerOff: () => {
    host_power_off();
  },
  ipcCalls: [
    ["host_module_get_param", "mget", 0],
    ["host_module_set_param", "mset", 0],
    /* A copy, not a round trip, but still a host call per tick: counted so
     * the probe shows what replaced the `status` poll (WP10). */
    ["movy_engine_snapshot", "snap", -1],
    /* One round trip for many keys, which is why a page refresh uses it —
     * and why leaving it out would hide the call that replaced eight. */
    ["shadow_get_params", "bget", 1],
    ["shadow_set_params", "bset", 1]
  ]
};

// src/platform/index.ts
var platform = standalonePlatform;

// src/host/param.ts
var sets = 0;
var gets = 0;
var getNulls = 0;
var bulkFallbacks = 0;
function paramGet(key) {
  const v = platform.engineGet(key);
  gets++;
  if (v === null) getNulls++;
  return v;
}
function paramSet(key, value2) {
  sets++;
  return platform.engineSet(key, value2);
}
function paramGetMany(keys) {
  if (keys.length === 0) return [];
  const raw2 = platform.engineGetBulk(encodeBulk(keys));
  const items = decodeBulk(raw2);
  if (!items || items.length !== keys.length) {
    bulkFallbacks++;
    return keys.map(paramGet);
  }
  return items.map((v) => v === "" ? null : v);
}
function paramSetMany(pairs) {
  if (pairs.length === 0) return true;
  const flat = [];
  for (const [k, v] of pairs) {
    flat.push(k);
    flat.push(v);
  }
  sets += pairs.length;
  return platform.engineSetBulk(encodeBulk(flat));
}

// src/log.ts
function mlog(msg) {
  console.log("[movy] " + msg);
}

// src/seq/constants.ts
var STEP_NOTE_BASE = 16;
var NUM_STEP_BUTTONS = 16;
var MAX_STEPS = 256;
var AUTO_LANES = 32;
var PAD_MIN = 68;
var PAD_MAX = 99;
var CC_NOTE_SESSION = 50;
var CC_PLAY = 85;
var CC_REC = 86;
var CC_TRACK_END = 43;
var CC_MUTE = 88;
var STEP_SETS = 0;
var STEP_FLAGS = 1;
var STEP_CLIP_PARAMS = 2;
var STEP_METRO = 5;
var STEP_FULL_VEL = 9;
var STEP_CPU = 11;
var STEP_DOUBLE_LOOP = 14;
var STEP_QUANTIZE = 15;
var MAIN_PAGE_STEPS = { 4: 0, 6: 0, 8: 0 };
var ENGINE_VERSION = "0.103.0";
var CHAIN_MODULE_DIR = "/data/UserData/schwung/modules/chain";
var MOVY_MODULE_DIR = "/data/UserData/schwung/modules/tools/movy";

// src/test/probe.ts
var lastVm = null;
var renderSeq = 0;
var tickSeq = 0;
function noteRender(vm2) {
  lastVm = vm2;
  renderSeq++;
}
var deps = null;
function setProbeDeps(d) {
  deps = d;
}
function runVerb(verb, arg) {
  if (!deps) return { error: "probe deps not installed" };
  switch (verb) {
    case "widgets": {
      const a = arg && typeof arg === "object" ? arg : {};
      const kind = String(a.kind || "");
      if (a.clear) deps.widgetClear();
      return { kind, available: deps.widgetAvailable(kind) };
    }
    default:
      return { error: "unknown verb: " + verb };
  }
}
function answer(requestJson) {
  let req;
  try {
    req = JSON.parse(requestJson);
  } catch (e) {
    return JSON.stringify({ error: "bad request json: " + String(e) });
  }
  const tag = (o) => JSON.stringify(req.id === void 0 ? o : { id: req.id, ...o });
  if (req.verb) return tag(runVerb(req.verb, req.arg));
  switch (req.key) {
    case "tick":
      return tag({
        tickSeq,
        renderSeq,
        ready: deps ? deps.ready() : false
      });
    case "page": {
      const vm2 = lastVm;
      if (!vm2) return tag({ error: "no render yet" });
      const body = deps?.paramBody ? deps.paramBody() : null;
      return tag({
        /* The drawn page's position; 0 of 0 while a page is loading. */
        pageIndex: body?.schwung?.pageIndex ?? 0,
        pageCount: body?.schwung?.pageCount ?? 0,
        held: !!vm2.automationHeld,
        module: vm2.moduleName,
        /* Read live rather than from the VM: the VM is the last page
         * movy RENDERED, and a screen with no page behind it — the file
         * browser — leaves that stale by design. This is the one field
         * here that answers about the screen instead of about the page
         * on it. */
        view: deps ? deps.view() : "unknown",
        ...body ?? {},
        cells: body?.cells ?? new Array(8).fill(null)
      });
    }
    case "leave": {
      if (!deps) return tag({ error: "probe deps not installed" });
      return tag(deps.leaveModal());
    }
    case "browse": {
      if (!deps || !deps.browse) return tag({ error: "probe deps not installed" });
      return tag({ browse: deps.browse() });
    }
    case "sets": {
      if (!deps || !deps.sets) return tag({ error: "probe deps not installed" });
      return tag({ view: deps.view(), ...deps.sets() });
    }
    case "auto": {
      if (!deps) return tag({ error: "probe deps not installed" });
      const track = deps.activeTrack();
      return tag({ track, lanes: deps.lanesForTrack(track) });
    }
    default:
      return tag({ error: "unknown key: " + String(req.key) });
  }
}

// src/seq/probe-bridge.ts
var answeredGen = -1;
var seenGen = -1;
function noteProbeGen(gen) {
  seenGen = gen;
}
function probeBridgeTick(get, set) {
  if (seenGen <= 0 || seenGen === answeredGen) return;
  let rsp;
  try {
    rsp = answer(get("probereq") ?? "");
  } catch (e) {
    rsp = JSON.stringify({ error: "probe threw: " + String(e) });
  }
  set("probersp", rsp);
  answeredGen = seenGen;
}

// src/seq/set-source.ts
var LEGACY_SETS_DIR = "/data/UserData/schwung/modules/tools/movy/sets";
var LIBRARY_ROOT = "/data/UserData/UserLibrary/Movy";
var LIBRARY_SETS_DIR = LIBRARY_ROOT + "/Sets";
var wanted = "";
function setsDir() {
  return LIBRARY_SETS_DIR;
}
function wantedSet() {
  return wanted;
}
function wantSet(id2) {
  wanted = id2;
}

// src/seq/set-context.ts
var MOVE_SETS_DIR = "/data/UserData/UserLibrary/Sets";
function ensureDir(uuid) {
  platform.ensureDir(setsDir() + "/" + (uuid || "_default"));
}
function uuidToChainsPath(uuid) {
  return setsDir() + "/" + (uuid || "_default") + "/chains.json";
}
function uuidToUiStatePath(uuid) {
  return setsDir() + "/" + (uuid || "_default") + "/ui-state.json";
}

// src/seq/persist-store.ts
function readFile(path) {
  return platform.readFile(path);
}
function safeWrite(path, content) {
  if (!platform.writeFile(path, content)) return false;
  return readFile(path) === content;
}
function readChainsFile(uuid) {
  return readFile(uuidToChainsPath(uuid));
}
function readUiBlob(uuid) {
  return readFile(uuidToUiStatePath(uuid));
}
function writeUiBlob(uuid, content) {
  ensureDir(uuid);
  return safeWrite(uuidToUiStatePath(uuid), content);
}

// src/seq/prefs.ts
var PREFS_PATH = "/data/UserData/schwung/modules/tools/movy/prefs.json";
var FACTORY_DEFAULT_QUANT = 0;
var clampPct = (v) => typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : FACTORY_DEFAULT_QUANT;
function readPrefs() {
  const raw2 = platform.readFile(PREFS_PATH);
  if (!raw2) return {};
  try {
    const obj = JSON.parse(raw2);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}
function writePrefs(patch) {
  const prefs = readPrefs();
  patch(prefs);
  safeWrite(PREFS_PATH, JSON.stringify(prefs));
}
function readPrefDefaultQuant() {
  return clampPct(readPrefs().defaultQuant);
}
function writePrefDefaultQuant(pct) {
  writePrefs((p) => {
    p.defaultQuant = clampPct(pct);
  });
}
function readPrefFullVelocity() {
  return readPrefs().fullVelocity === true;
}
function writePrefFullVelocity(on) {
  writePrefs((p) => {
    p.fullVelocity = on;
  });
}
var FACTORY_MASTER_VOLUME = 0.2512;
function readPrefMasterVolume() {
  const v = readPrefs().masterVolume;
  return typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(1, v)) : FACTORY_MASTER_VOLUME;
}
function writePrefMasterVolume(amp2) {
  writePrefs((p) => {
    p.masterVolume = Math.max(0, Math.min(1, amp2));
  });
}
var CLICK_DB_MAX = 11;
var clampClickDb = (v) => typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(CLICK_DB_MAX, Math.round(v))) : 0;
function readPrefClickDb() {
  return clampClickDb(readPrefs().clickDb);
}
function writePrefClickDb(db2) {
  writePrefs((p) => {
    p.clickDb = clampClickDb(db2);
  });
}
function readPrefModuleBlacklist() {
  const raw2 = readPrefs().moduleBlacklist;
  if (!Array.isArray(raw2)) return [];
  const out2 = [];
  for (const v of raw2) {
    if (typeof v === "string" && v !== "" && v.indexOf(",") < 0) out2.push(v);
  }
  return out2;
}
var MAX_FILE_DIRS = 64;
function readPrefFileDir(key) {
  const dirs = readPrefs().fileDirs;
  if (!dirs || typeof dirs !== "object") return null;
  const v = dirs[key];
  return typeof v === "string" && v !== "" ? v : null;
}
function writePrefFileDir(key, dir) {
  writePrefs((p) => {
    const src = p.fileDirs && typeof p.fileDirs === "object" ? p.fileDirs : {};
    const dirs = {};
    for (const k in src) {
      if (k !== key && typeof src[k] === "string") dirs[k] = src[k];
    }
    dirs[key] = dir;
    const keys = Object.keys(dirs);
    for (let i = 0; i < keys.length - MAX_FILE_DIRS; i++) delete dirs[keys[i]];
    p.fileDirs = dirs;
  });
}

// src/model/constants.ts
var MODULE_LOAD_TICKS = 344;
var META_RETRY_LIMIT = 8;
var NAME_POLL_TICKS = MODULE_LOAD_TICKS;
var HIERARCHY_RETRY_TICKS = 12;
var HIERARCHY_RETRY_LIMIT = 60;
var HOLD_MS = 1e3;
var KNOBS_PER_PAGE = 8;
var ARC_DELTA_SCALE = 0.5;
var MIN_STEP_RANGE_FRAC = 0.01;
var CONTINUOUS_TICK_FRAC = MIN_STEP_RANGE_FRAC * ARC_DELTA_SCALE;

// src/mixer/db-ladder.ts
var VOL_MIN = 0;
var VOL_MAX = 4;
var DB_MIN = -48;
var DB_STEP = 1;
var DB_MAX = 20 * Math.log10(VOL_MAX);
var VOL_TOP_DB = DB_MAX;
var VOL_STEPS = Math.ceil((DB_MAX - DB_MIN) / DB_STEP) + 1;
function idxToAmp(i) {
  if (i <= 0) return VOL_MIN;
  const db2 = DB_MIN + (Math.min(i, VOL_STEPS) - 1) * DB_STEP;
  return Math.min(VOL_MAX, Math.pow(10, db2 / 20));
}
function ampToIdx(a) {
  if (a <= VOL_MIN) return 0;
  const db2 = 20 * Math.log10(a);
  if (db2 <= DB_MIN) return 1;
  return Math.min(VOL_STEPS, Math.round((db2 - DB_MIN) / DB_STEP) + 1);
}
function dbFrac(amp2, topDb) {
  if (amp2 <= 0) return 0;
  const db2 = 20 * Math.log10(amp2);
  return Math.min(1, Math.max(0, (db2 - DB_MIN) / (topDb - DB_MIN)));
}
var SEND_TOP_DB = 0;
function fracToAmp(frac, topDb) {
  if (frac <= 0) return 0;
  const db2 = DB_MIN + Math.min(1, frac) * (topDb - DB_MIN);
  return Math.min(VOL_MAX, Math.pow(10, db2 / 20));
}
var volumeFrac = (amp2) => dbFrac(amp2, DB_MAX);
var volumeFracOfDb = (db2) => Math.min(1, Math.max(0, (db2 - DB_MIN) / (DB_MAX - DB_MIN)));
var UNITY_FRAC = volumeFrac(1);
function idxToFrac(i) {
  return volumeFrac(idxToAmp(i));
}

// src/mixer/master-volume.ts
var TOP = ampToIdx(1);
var UNITY_DB = 0;
var idx = -1;
var touched = false;
var unsaved = false;
function current() {
  if (idx < 0) idx = Math.min(TOP, ampToIdx(readPrefMasterVolume()));
  return idx;
}
var amp = () => idxToAmp(current());
function pushMasterVolume(set) {
  set("mfx:vol", amp().toFixed(4));
}
function masterVolumeKnob(d2) {
  const delta = d2 >= 1 && d2 <= 63 ? d2 : d2 >= 65 ? d2 - 128 : 0;
  if (delta === 0) return false;
  idx = Math.min(TOP, Math.max(0, current() + delta));
  paramSet("mfx:vol", amp().toFixed(4));
  unsaved = true;
  mlog("mastervol d=" + delta + " v=" + amp().toFixed(4));
  return true;
}
function masterVolumeTouch(on) {
  touched = on;
  if (!on && unsaved) {
    writePrefMasterVolume(amp());
    unsaved = false;
  }
}
function masterVolumeOverlay() {
  if (!touched) return null;
  return { title: "MASTER VOLUME", value: amp(), frac: dbFrac(amp(), UNITY_DB), unityFrac: 1 };
}
function resetMasterVolume() {
  idx = -1;
  touched = false;
  unsaved = false;
}

// src/seq/click-volume.ts
var db = -1;
function clickVolumeDb() {
  if (db < 0) db = readPrefClickDb();
  return db;
}
function pushClickVolume(set) {
  set("clickdb", String(clickVolumeDb()));
}
function clickVolumeTurn(delta) {
  const next = Math.max(0, Math.min(CLICK_DB_MAX, clickVolumeDb() + delta));
  if (next === clickVolumeDb()) return false;
  db = next;
  writePrefClickDb(next);
  paramSet("clickdb", String(next));
  paramSet("clickaud", "1");
  return true;
}
function clickVolumeLabel() {
  return (clickVolumeDb() === 0 ? "" : "+") + clickVolumeDb() + " dB";
}

// src/track/ref.ts
var MOVY_CHAINS = 16;
var TRACK_COUNT = 16;
var GROUP_SIZE = 4;
function trackRef(index) {
  return { index };
}
function trackGroup(index) {
  return Math.floor(index / GROUP_SIZE);
}
function chainInstance(index) {
  return index;
}

// src/app/state.ts
var VIEW_KEYS = 0;
var VIEW_SESSION = 5;
var VIEW_KNOBS = 1;
var VIEW_BROWSE = 2;
var VIEW_CHAIN = 3;
var VIEW_FILE_BROWSE = 4;
var VIEW_MAIN_PARAMS = 6;
var VIEW_CLIP_PARAMS = 7;
var VIEW_FLAGS = 8;
var VIEW_CPU = 9;
var VIEW_VERSIONS = 10;
var VIEW_SETS = 11;
var VIEW_MIXER = 12;
var VIEW_NAMES = {
  [VIEW_KEYS]: "keys",
  [VIEW_KNOBS]: "knobs",
  [VIEW_BROWSE]: "browse",
  [VIEW_CHAIN]: "chain",
  [VIEW_FILE_BROWSE]: "file-browse",
  [VIEW_SESSION]: "session",
  [VIEW_MAIN_PARAMS]: "main-params",
  [VIEW_CLIP_PARAMS]: "clip-params",
  [VIEW_FLAGS]: "flags",
  [VIEW_CPU]: "cpu",
  [VIEW_VERSIONS]: "versions",
  [VIEW_SETS]: "sets",
  [VIEW_MIXER]: "mixer"
};
function viewName(view) {
  return VIEW_NAMES[view] ?? "unknown";
}
var appState = {
  /* The track the UI is editing. A TrackRef, not a slot number: a host track's
   * index happens to equal its schwung slot, and every place that assumed the
   * two were the same thing is what the port abstraction had to unpick. */
  activeTrack: trackRef(0),
  /* Which quartet the four track buttons and the session clip grid address.
   * Always the group containing activeTrack — track/focus.ts moves both. */
  focusGroup: 0,
  currentView: VIEW_CHAIN,
  shiftHeld: false,
  /* Mute held, beside Shift because it is the same kind of state and for the
   * same reason: a held button that changes what the pads MEAN. `track/pad-route`
   * reads it — the engine answers live pads on the audio thread and cannot see a
   * button, so the map has to carry the fact or a gesture press sounds. */
  muteHeld: false,
  dirty: true,
  initLedIndex: 0,
  initLedsDone: false,
  /* Sized in init() from TRACK_COUNT; these defaults only cover the boot
   * frame before init runs. */
  trackChainIndex: new Array(TRACK_COUNT).fill(1),
  trackView: new Array(TRACK_COUNT).fill(VIEW_CHAIN),
  trackModels: [],
  masterFxModels: [],
  masterChainIndex: 0,
  /* In the master FX chain (Session mode), true once the user has drilled from
   * the slot grid into the focused slot's module detail (knob) page. There is
   * no master VIEW_KNOBS: rendering keys off sessionMode, so this flag — not
   * currentView — distinguishes the master grid from the master detail page. */
  masterDetail: false,
  browseOrigin: VIEW_CHAIN,
  fileBrowserState: null,
  drumActive: false
};
function trackIsDrum(slot) {
  return (appState.trackModels[slot]?.[1]?.getDrumConfig()?.padCount ?? 0) > 0;
}

// src/seq/state.ts
function emptySession() {
  return Array.from(
    { length: TRACK_COUNT },
    () => ({ exist: 0, playing: -1, queued: -1, selected: 0 })
  );
}
function defaults() {
  return {
    engineOk: false,
    playing: false,
    engineTick: 0,
    bpmX100: 12e3,
    extSync: false,
    swingPct: 50,
    activeNotes: new Uint8Array(TRACK_COUNT * 128),
    reportedTrack: 0,
    curStep: 0,
    lenSteps: 0,
    loopStart: 0,
    clipScaleIdx: 4,
    // SCALE_DEFAULT_IDX (1X)
    clipTranspose: 0,
    clipQuant: 0,
    defaultQuant: 0,
    occ: new Uint8Array(32),
    loopMode: false,
    noteHash: "",
    trackSelectHold: false,
    recording: false,
    countingIn: false,
    capPending: 0,
    capGen: -1,
    metro: false,
    dirty: false,
    chainPending: 0,
    setBad: "",
    cpuCost: "",
    mixMeter: "",
    cpuWall: "",
    cpuMask: "",
    cpuSend: "",
    cpuMaster: "",
    lastPitch: new Array(TRACK_COUNT).fill(60),
    lastVel: new Array(TRACK_COUNT).fill(100),
    barOffset: 0,
    watchLane: -1,
    fullVelocity: false,
    posTick: 0,
    holdStep: -1,
    holdLen: 0,
    holdNotes: [],
    holdVel: 0,
    holdGate: 0,
    holdGateMixed: false,
    holdProb: 100,
    holdCondA: 1,
    holdCondB: 1,
    holdInvert: false,
    holdMaxGate: 0,
    muted: new Array(TRACK_COUNT).fill(false),
    /* A fresh Set per reset, so `resetSeqState` cannot hand two mirrors the
     * same one. */
    padMuteTrack: -1,
    padMutes: /* @__PURE__ */ new Set(),
    padSolo: -1,
    sessionMode: false,
    session: emptySession(),
    songScenes: [],
    songPos: 0,
    autoAssigned: 0,
    autoActive: 0,
    heldLocks: /* @__PURE__ */ new Map(),
    stepAutoMode: false
  };
}
function muteFromStr(s) {
  for (let t = 0; t < TRACK_COUNT; t++) seqState.muted[t] = s[t] === "1";
}
function padMutesFromStr(s) {
  const [solo2, notes2] = s.split(":");
  const n = Number(solo2);
  seqState.padSolo = Number.isInteger(n) && n >= 0 && n <= 127 ? n : -1;
  seqState.padMutes.clear();
  if (notes2) for (const p of notes2.split(".")) {
    const v = Number(p);
    if (Number.isInteger(v) && v >= 0 && v <= 127) seqState.padMutes.add(v);
  }
  seqState.padMuteTrack = seqState.reportedTrack;
}
function sessionFromStr(s) {
  const groups = s.split(",");
  for (let t = 0; t < TRACK_COUNT; t++) {
    const g = (groups[t] ?? "").split(".");
    const slot = (v) => v === "-" || v === void 0 ? -1 : Number(v);
    seqState.session[t] = {
      exist: parseInt(g[0] ?? "0", 16) || 0,
      playing: slot(g[1]),
      queued: slot(g[2]),
      selected: g[3] === void 0 ? 0 : Number(g[3]) || 0
    };
  }
}
function songFromStr(s) {
  if (!s || s === "-") {
    seqState.songScenes = [];
    seqState.songPos = 0;
    return;
  }
  const colon = s.indexOf(":");
  seqState.songPos = Number(s.slice(0, colon)) || 0;
  seqState.songScenes = s.slice(colon + 1).split(",").map(Number).filter((n) => n >= 0 && n < 8);
}
function clipBars() {
  return Math.max(1, Math.ceil(seqState.lenSteps / 16));
}
function loopBarCount() {
  return loopEndBar() - loopStartBar() + 1;
}
function minBarOffset() {
  if (seqState.lenSteps === 0) return 0;
  return loopStartBar();
}
function maxBarOffset() {
  if (seqState.lenSteps === 0) return 0;
  return Math.min(loopEndBar() + 1, 15);
}
var lastLoopStart = -1;
var lastLenSteps = -1;
function adoptLoopWindow() {
  if (seqState.loopStart === lastLoopStart && seqState.lenSteps === lastLenSteps) return;
  lastLoopStart = seqState.loopStart;
  lastLenSteps = seqState.lenSteps;
  if (seqState.lenSteps === 0) return;
  seqState.barOffset = Math.max(minBarOffset(), Math.min(seqState.barOffset, maxBarOffset()));
}
function requestLoopWindowAdopt() {
  lastLoopStart = -1;
  lastLenSteps = -1;
}
function stepInLoop(step) {
  return step >= seqState.loopStart && step < seqState.loopStart + seqState.lenSteps;
}
function loopStartBar() {
  return Math.floor(seqState.loopStart / 16);
}
function loopEndBar() {
  return Math.floor((seqState.loopStart + Math.max(16, seqState.lenSteps) - 1) / 16);
}
var seqState = defaults();
function setFullVelocity(on) {
  seqState.fullVelocity = on;
  writePrefFullVelocity(on);
}
function loadFullVelocityPref() {
  seqState.fullVelocity = readPrefFullVelocity();
}
function occHasStep(step) {
  if (step < 0 || step > 255) return false;
  return (seqState.occ[step >> 3] & 128 >> (step & 7)) !== 0;
}
function occToggleStep(step) {
  if (step < 0 || step > 255) return;
  seqState.occ[step >> 3] ^= 128 >> (step & 7);
}
function occFromHex(hex) {
  for (let i = 0; i < 32; i++) {
    seqState.occ[i] = i * 2 + 2 <= hex.length ? parseInt(hex.slice(i * 2, i * 2 + 2), 16) || 0 : 0;
  }
}
function activeFromStr(s) {
  seqState.activeNotes.fill(0);
  const tracks = s.split(",");
  for (let t = 0; t < TRACK_COUNT; t++) {
    const g = tracks[t];
    if (!g) continue;
    for (const ps of g.split(".")) {
      const p = Number(ps);
      if (p >= 0 && p < 128) seqState.activeNotes[t * 128 + p] = 1;
    }
  }
}
function activeHasNote(track, pitch) {
  if (track < 0 || track >= TRACK_COUNT || pitch < 0 || pitch > 127) return false;
  return seqState.activeNotes[track * 128 + pitch] === 1;
}

// src/seq/colors.ts
var C_BLACK = 0;
var C_WHITE = 120;
var C_DARKGREY = 124;
var C_LIGHTGREY = 118;
var C_GREEN = 11;
var C_REC_RED = 127;
var TRACK_COLOR = [
  65,
  7,
  95,
  23,
  // G1: Bright Red dim, Vivid Yellow, Azure Blue dim, Neon Pink
  9,
  2,
  23,
  95,
  // G2: Bright Lime, Orange Red, Neon Pink, Azure Blue dim
  95,
  23,
  3,
  9,
  // G3: Azure Blue dim, Neon Pink, Bright Orange, Bright Lime
  23,
  95,
  9,
  69
  // G4: Neon Pink, Azure Blue dim, Bright Lime, Bright Orange dim
];
var TRACK_COLOR_DIM = [
  71,
  77,
  103,
  109,
  // Tan dim, Vivid Yellow dim, Electric Violet dim, Neon Pink dim
  81,
  71,
  109,
  103,
  // Bright Lime dim, Tan dim, Neon Pink dim, Electric Violet dim
  103,
  109,
  6,
  81,
  // Electric Violet dim, Neon Pink dim, Ochre, Bright Lime dim
  109,
  103,
  81,
  71
  // Neon Pink dim, Electric Violet dim, Bright Lime dim, Tan dim
];
function trackColor(track) {
  return TRACK_COLOR[track & 15];
}
function trackColorDim(track) {
  return TRACK_COLOR_DIM[track & 15];
}
var ANIM_NONE = 0;
var ANIM_PULSE_FAST = 8;
var ANIM_PULSE = 9;
var ANIM_PULSE_SLOW = 10;
var WHITE_OFF = 0;
var WHITE_DIM = 16;
var WHITE_BRIGHT = 124;

// src/seq/held.ts
var lastHeld = Array.from({ length: TRACK_COUNT }, () => /* @__PURE__ */ new Set());
function setHeldSet(track, pitches) {
  if (track < 0 || track >= TRACK_COUNT) return;
  const s = lastHeld[track];
  s.clear();
  for (const p of pitches) s.add(p);
}
function noteHeld(track, pitch) {
  return track >= 0 && track < TRACK_COUNT && lastHeld[track].has(pitch);
}
function heldSetList(track) {
  if (track < 0 || track >= TRACK_COUNT) return [];
  return [...lastHeld[track]];
}

// src/seq/scales.ts
var SCALES = [
  { name: "Major", degrees: [0, 2, 4, 5, 7, 9, 11] },
  { name: "Minor", degrees: [0, 2, 3, 5, 7, 8, 10] },
  { name: "Dorian", degrees: [0, 2, 3, 5, 7, 9, 10] },
  { name: "Phrygian", degrees: [0, 1, 3, 5, 7, 8, 10] },
  { name: "Lydian", degrees: [0, 2, 4, 6, 7, 9, 11] },
  { name: "Mixolydian", degrees: [0, 2, 4, 5, 7, 9, 10] },
  { name: "Locrian", degrees: [0, 1, 3, 5, 6, 8, 10] },
  { name: "Harm Min", degrees: [0, 2, 3, 5, 7, 8, 11] },
  { name: "Mel Min", degrees: [0, 2, 3, 5, 7, 9, 11] },
  { name: "Maj Penta", degrees: [0, 2, 4, 7, 9] },
  { name: "Min Penta", degrees: [0, 3, 5, 7, 10] },
  { name: "Blues", degrees: [0, 3, 5, 6, 7, 10] },
  { name: "Chromatic", degrees: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
];
var SCALE_NAMES = SCALES.map((s) => s.name);
function inScaleFor(pitch, root, scaleIdx) {
  const s = SCALES[scaleIdx] ?? SCALES[0];
  const deg = ((pitch - root) % 12 + 12) % 12;
  return s.degrees.includes(deg);
}

// src/keyboard/layouts.ts
var COLS = 8;
var ROWS = 4;
var PAD_COUNT = COLS * ROWS;
var MODE_CHROMATIC = 0;
var MODE_IN_KEY = 1;
var MODE_NAMES = ["Chromatic", "In Key"];
var LAYOUT_PIANO = 1;
var LAYOUT_INLINE = 1;
var LAYOUTS_CHROMATIC = ["4th", "Piano"];
var LAYOUTS_IN_KEY = ["4th", "Inline"];
function layoutNames(mode) {
  return mode === MODE_IN_KEY ? LAYOUTS_IN_KEY : LAYOUTS_CHROMATIC;
}
var CHROM_ROW_STEP = 5;
var CHROM_ROOT_COL = 3;
var KEY_ROW_STEP = 3;
var PIANO_WHITE = [0, 2, 4, 5, 7, 9, 11, 12];
var PIANO_BLACK = [-1, 1, 3, -1, 6, 8, 10, -1];
function degreeToPitch(base2, degrees, i) {
  const len = degrees.length;
  const oct = Math.floor(i / len);
  return base2 + oct * 12 + degrees[i - oct * len];
}
function buildPadMap(mode, layout, scaleIdx, base2) {
  const map = new Int16Array(PAD_COUNT);
  const degrees = (SCALES[scaleIdx] ?? SCALES[0]).degrees;
  for (let i = 0; i < PAD_COUNT; i++) {
    const row = i / COLS | 0;
    const col = i % COLS;
    let pitch;
    if (mode === MODE_IN_KEY) {
      const step = layout === LAYOUT_INLINE ? degrees.length : KEY_ROW_STEP;
      pitch = degreeToPitch(base2, degrees, row * step + col);
    } else if (layout === LAYOUT_PIANO) {
      const off = row & 1 ? PIANO_BLACK[col] : PIANO_WHITE[col];
      pitch = off < 0 ? -1 : base2 + (row >> 1) * 12 + off;
    } else {
      pitch = base2 + row * CHROM_ROW_STEP + col - CHROM_ROOT_COL;
    }
    map[i] = Number.isFinite(pitch) && pitch >= 0 && pitch <= 127 ? pitch : -1;
  }
  return map;
}
function isPianoLayout(mode, layout) {
  return mode === MODE_CHROMATIC && layout === LAYOUT_PIANO;
}

// src/keyboard/state.ts
var OCT_MIN = 0;
var OCT_MAX = 8;
var keyboardState = {
  rootPc: 0,
  /* 0..11 tonic pitch class          (global) */
  scale: 0,
  /* index into SCALES                (global) */
  mode: 0,
  /* MODE_CHROMATIC | MODE_IN_KEY     (global) */
  layout: 0,
  /* index into layoutNames(mode)     (global) */
  octave: new Array(TRACK_COUNT).fill(4),
  /* per-track; 4 → C3 */
  /* most recent pad-played MIDI note — the sequencer's step-entry value */
  lastPlayedNote: 60
};
function resetOctaves() {
  keyboardState.octave = new Array(TRACK_COUNT).fill(4);
}
function baseNoteFor(track) {
  return keyboardState.octave[track & TRACK_COUNT - 1] * 12 + keyboardState.rootPc;
}
var cacheKey = "";
var cacheMap = null;
var builds = 0;
function padMapFor(track) {
  const base2 = baseNoteFor(track);
  const key = keyboardState.mode + ":" + keyboardState.layout + ":" + keyboardState.scale + ":" + base2;
  if (cacheMap === null || key !== cacheKey) {
    cacheKey = key;
    cacheMap = buildPadMap(keyboardState.mode, keyboardState.layout, keyboardState.scale, base2);
    builds++;
  }
  return cacheMap;
}

// src/seq/pads.ts
function padPitch(track, padNote, padMin) {
  return padMapFor(track)[padNote - padMin] ?? -1;
}
function padColor(padNote, padMin, track, isPlaying, holdNotes = null) {
  const idx2 = padNote - padMin;
  const pitch = padMapFor(track)[idx2] ?? -1;
  if (pitch < 0) return C_BLACK;
  if (isPlaying) return C_GREEN;
  const white = holdNotes !== null ? holdNotes.includes(pitch) : noteHeld(track, pitch);
  if (white) return C_WHITE;
  if (((pitch - keyboardState.rootPc) % 12 + 12) % 12 === 0) return trackColor(track);
  if (!inScaleFor(pitch, keyboardState.rootPc, keyboardState.scale)) {
    return isPianoLayout(keyboardState.mode, keyboardState.layout) ? C_DARKGREY : C_BLACK;
  }
  return C_LIGHTGREY;
}

// src/keyboard/held-notes.ts
var live = /* @__PURE__ */ new Map();
function noteSounded(padNote, track, pitch) {
  live.set(padNote, { padNote, track, pitch });
}
function noteReleased(padNote) {
  const n = live.get(padNote);
  if (n !== void 0) live.delete(padNote);
  return n;
}
function soundingTrack(padNote) {
  return live.get(padNote)?.track;
}
function soundingPitch(padNote) {
  return live.get(padNote)?.pitch;
}
function isSounding(padNote) {
  return live.has(padNote);
}
function drainAll() {
  const out2 = [...live.values()];
  live.clear();
  return out2;
}
function drainTrack(track) {
  const out2 = [];
  for (const [padNote, n] of live) {
    if (n.track === track) {
      out2.push(n);
      live.delete(padNote);
    }
  }
  return out2;
}

// src/midi/external-ledger.ts
var EXT_KEY_BASE = 1e3;
var held = /* @__PURE__ */ new Map();
function extHold(key, track) {
  held.set(key, track);
}
function extRelease(key) {
  const t = held.get(key);
  held.delete(key);
  return t;
}
function extHeldTrack(key) {
  return held.get(key);
}

// src/seq/set-settle.ts
var CAP_MS = 1e4;
var start = 0;
var baseMark = -1;
function beginSettle() {
  start = Date.now();
  baseMark = engineMark();
}
function settleCheck() {
  const capped = Date.now() - start >= CAP_MS;
  if (engineCaughtUp(baseMark) && seqState.chainPending === 0) return "done";
  return capped ? "capped" : "wait";
}
function settleWaited() {
  return Date.now() - start;
}
function settleOutstanding() {
  return "chpend=" + seqState.chainPending;
}

// src/track/engine-port.ts
var WRITE_LOG_MAX = 128;
var EnginePort = class {
  constructor() {
    /* Every engine param read is a round trip through the single-slot SHM, so
     * callers that can batch must. */
    this.bulkReads = true;
    /* The write log is kept in PORT-LEVEL keys — the form the caller passed and
     * the form a cache in front of this port holds — not the engine key. */
    this.wseq = 0;
    this.wlog = [];
  }
  /* Logged whether or not the engine took it: treating a write as "nothing
   * changed" is the one direction that can leave a cache holding a value the
   * engine does not have. */
  noteWrite(key) {
    this.wseq++;
    this.wlog.push(key);
    if (this.wlog.length > WRITE_LOG_MAX) this.wlog.shift();
  }
  writeSeq() {
    return this.wseq;
  }
  writesSince(seq) {
    const n = this.wseq - seq;
    if (n <= 0) return [];
    if (n > this.wlog.length) return null;
    return this.wlog.slice(this.wlog.length - n);
  }
  getParam(key) {
    return paramGet(this.key(key));
  }
  setParam(key, value2) {
    this.noteWrite(key);
    return paramSet(this.key(key), value2);
  }
  getMany(keys) {
    return paramGetMany(keys.map((k) => this.key(k)));
  }
  setMany(pairs) {
    for (const [k] of pairs) this.noteWrite(k);
    return paramSetMany(pairs.map(([k, v]) => [this.key(k), v]));
  }
};

// src/track/movy-chain-port.ts
var MovyChainPort = class extends EnginePort {
  constructor(index) {
    super();
    this.track = trackRef(index);
    this.chain = chainInstance(index);
  }
  /** `synth:cutoff` on track 7 becomes `ch3:synth:cutoff` in the engine. */
  key(k) {
    return "ch" + this.chain + ":" + k;
  }
  /* Live notes reach the chain through the engine. The channel nibble is
   * dropped: a chain instance has one synth and does not filter by channel,
   * so the chain number in the key is the routing. */
  sendMidi(statusType, d1, d2) {
    this.setParam("midi", statusType + "." + d1 + "." + d2);
  }
};

// src/track/send-port.ts
var EngineRootPort = class extends EnginePort {
  constructor() {
    super();
    this.track = trackRef(0);
  }
  /** Verbatim: the caller's component key already names the destination. */
  key(k) {
    return k;
  }
  /* A send bus has no synth and no notes: nothing plays it, tracks feed it
   * audio. Silently ignored rather than left undefined, because the shape
   * requires it and a throw here would break a generic caller. */
  sendMidi(_statusType, _d1, _d2) {
  }
};

// src/chain/master-prefix.ts
var MASTER_PREFIX = "mfx:";
function masterSuffix(componentKey2) {
  return componentKey2.startsWith(MASTER_PREFIX) ? componentKey2.slice(MASTER_PREFIX.length) : null;
}

// src/chain/config.ts
var CHAIN_SLOTS = [
  { componentKey: "midi_fx1", label: "MIDI FX", scanDir: "midi_fx", expectedType: "midi_fx" },
  { componentKey: "synth", label: "SYNTH", scanDir: "sound_generators", expectedType: "sound_generator" },
  { componentKey: "fx1", label: "FX 1", scanDir: "audio_fx", expectedType: "audio_fx" },
  { componentKey: "fx2", label: "FX 2", scanDir: "audio_fx", expectedType: "audio_fx" },
  { componentKey: "lfo", label: "LFO", scanDir: "", expectedType: "" },
  { componentKey: "mix", label: "MIX", scanDir: "", expectedType: "" }
];
var LFO_CHAIN_INDEX = 4;
var MIX_CHAIN_INDEX = 5;
function isLfoSlot(chainIndex2) {
  return chainIndex2 === LFO_CHAIN_INDEX;
}
function isMixSlot(chainIndex2) {
  return chainIndex2 === MIX_CHAIN_INDEX;
}
var LAST_CHAIN_INDEX = CHAIN_SLOTS.length - 1;
var MASTER_FX_SLOTS = [
  /* Movy's own send buses, and deliberately FIRST: they are left of the master
   * FX on the page because they are left of them in the signal path — a send's
   * output joins movy's stereo out, which the master FX then process. */
  { componentKey: "snd0", label: "SEND 1", scanDir: "audio_fx", expectedType: "audio_fx" },
  { componentKey: "snd1", label: "SEND 2", scanDir: "audio_fx", expectedType: "audio_fx" },
  { componentKey: "snd2", label: "SEND 3", scanDir: "audio_fx", expectedType: "audio_fx" },
  { componentKey: "mfx:fx1", label: "MFX 1", scanDir: "audio_fx", expectedType: "audio_fx" },
  { componentKey: "mfx:fx2", label: "MFX 2", scanDir: "audio_fx", expectedType: "audio_fx" },
  { componentKey: "mfx:fx3", label: "MFX 3", scanDir: "audio_fx", expectedType: "audio_fx" },
  { componentKey: "mfx:fx4", label: "MFX 4", scanDir: "audio_fx", expectedType: "audio_fx" },
  /* Virtual, exactly as the track chain's is: the master chain's two LFOs
   * (`mfx:lfoN:*`), which can modulate any of the four FX above. */
  { componentKey: "mfx:lfo", label: "LFO", scanDir: "", expectedType: "" }
];
var MASTER_LFO_INDEX = MASTER_FX_SLOTS.length - 1;
function isMasterLfoSlot(i) {
  return i === MASTER_LFO_INDEX;
}
var LAST_MASTER_INDEX = MASTER_FX_SLOTS.length - 1;
function isVirtualSlot(slot) {
  return !!slot && slot.scanDir === "";
}
function isMasterComponent(componentKey2) {
  return componentKey2 === "mfx" || componentKey2.startsWith(MASTER_PREFIX);
}
function isLfoComponent(componentKey2) {
  return componentKey2.endsWith("lfo");
}
function isMovyOwnComponent(componentKey2) {
  return componentKey2 === "mix" || isLfoComponent(componentKey2);
}
var CLIP_PARAMS_COMPONENT = "clipparams";
var SET_PARAMS_COMPONENT = "setparams";
var STEP_PARAMS_COMPONENT = "stepparams";
var MIXER_COMPONENT = "mixer";
function isVirtualPageComponent(componentKey2) {
  return componentKey2 === CLIP_PARAMS_COMPONENT || componentKey2 === SET_PARAMS_COMPONENT || componentKey2 === STEP_PARAMS_COMPONENT || componentKey2 === MIXER_COMPONENT;
}
var SEND_BUSES = 3;
var SEND_COMPONENT = "fx1";
function isSendComponent(componentKey2) {
  return sendBusOf(componentKey2) >= 0;
}
function sendBusOf(componentKey2) {
  if (!componentKey2.startsWith("snd")) return -1;
  const rest = componentKey2.slice(3);
  if (!/^[0-9]+$/.test(rest)) return -1;
  const bus = Number(rest);
  return bus < SEND_BUSES ? bus : -1;
}
function moduleReadKey(componentKey2) {
  if (isSendComponent(componentKey2)) return componentKey2 + ":module";
  return componentKey2.includes(":") ? componentKey2 + ":module" : componentKey2 + "_module";
}

// src/track/registry.ts
var ports = [];
function portFor(index) {
  let p = ports[index];
  if (!p) {
    p = new MovyChainPort(index);
    ports[index] = p;
  }
  return p;
}
var enginePort;
function engineRootPort() {
  if (!enginePort) enginePort = new EngineRootPort();
  return enginePort;
}
function componentPort(index, componentKey2) {
  if (isSendComponent(componentKey2) || isMasterComponent(componentKey2)) return engineRootPort();
  return portFor(index);
}

// src/track/chain-payload.ts
var pending = [];
function armChainPayloads(list) {
  pending = list;
}
function resetChainPayloads() {
  pending = [];
}
function deliverChainPayloads() {
  if (pending.length === 0) return true;
  const left = [];
  for (const p of pending) {
    if (p.bus !== void 0) {
      if (!engineRootPort().setMany(p.pairs)) left.push(p);
      continue;
    }
    if (!portFor(p.t).setMany(p.pairs)) left.push(p);
  }
  pending = left;
  if (pending.length > 0) {
    mlog("chains: " + pending.length + " chain payload(s) NOT DELIVERED (no engine) \u2014 set file left intact");
  }
  return true;
}

// src/app/model-refresh.ts
function shownModel() {
  if (seqState.sessionMode)
    return appState.masterFxModels[appState.masterChainIndex] ?? null;
  const t = appState.activeTrack.index;
  return appState.trackModels[t]?.[appState.trackChainIndex[t]] ?? null;
}
function refreshModelsForSet() {
  for (const chain of appState.trackModels) for (const m of chain ?? []) m?.reload();
  for (const m of appState.masterFxModels) m?.reload();
  const shown = shownModel();
  shown?.reloadNow();
  leaveEmptyModulePages(shown);
  appState.dirty = true;
}
function leaveEmptyModulePages(shown) {
  const t = appState.activeTrack.index;
  for (let i = 0; i < appState.trackView.length; i++)
    if (i !== t && appState.trackView[i] === VIEW_KNOBS) appState.trackView[i] = VIEW_CHAIN;
  if (seqState.sessionMode || appState.currentView !== VIEW_KNOBS) return;
  if (!shown || shown.getViewModel().isEmpty) appState.currentView = VIEW_CHAIN;
}

// src/seq/ui-dirty.ts
var uiDirty = false;
function markUiStateDirty() {
  uiDirty = true;
}
function takeUiDirty() {
  const d = uiDirty;
  uiDirty = false;
  return d;
}
function uiStateDirty() {
  return uiDirty;
}
function clearUiDirty() {
  uiDirty = false;
}

// src/modules/plaits.json
var plaits_default = {
  id: "plaits",
  name: "Plaits",
  banks: [
    {
      name: "OSC",
      rows: [
        [
          { key: "engine", short: "ENGI", full: "Engine", type: "enum" },
          { key: "harmonics", short: "HARM", full: "Harmonics", type: "float" },
          { key: "timbre", short: "TIMB", full: "Timbre", type: "float" },
          { key: "morph", short: "MRPH", full: "Morph", type: "float" }
        ],
        [
          { key: "decay", short: "DCAY", full: "Decay", type: "float" },
          { key: "lpg_colour", short: "LPGC", full: "LPG Color", type: "float" },
          { key: "fm_amount", short: "FM", full: "FM Amount", type: "float" },
          { key: "aux_mix", short: "MIX", full: "Aux Mix", type: "float" }
        ]
      ]
    },
    {
      name: "MOD",
      rows: [
        [
          { key: "attack", short: "ATK", full: "Attack", type: "float" },
          { key: "timbre_mod", short: "TMOD", full: "Timbre Mod", type: "float" },
          { key: "morph_mod", short: "MMOD", full: "Morph Mod", type: "float" },
          { key: "velocity_sensitivity", short: "VEL", full: "Vel Sens", type: "float" }
        ],
        [
          { key: "legato", short: "LGTO", full: "Legato", type: "enum" },
          { key: "octave_transpose", short: "OCT", full: "Octave", type: "int" },
          null,
          null
        ]
      ]
    }
  ]
};

// src/modules/wurl.json
var wurl_default = {
  id: "wurl",
  name: "Wurl",
  banks: [
    {
      name: "WURL",
      rows: [
        [
          { key: "volume", short: "VOL", full: "Volume", type: "float", render: "vbar" },
          { key: "tremolo", short: "TREM", full: "Tremolo", type: "float" },
          { key: "attack", short: "ATK", full: "Attack", type: "float" },
          { key: "decay", short: "DCY", full: "Decay", type: "float" }
        ],
        [
          { key: "brightness", short: "BGHT", full: "Brightness", type: "float" },
          { key: "darken", short: "DARK", full: "Darken", type: "float" },
          { key: "bark", short: "BARK", full: "Bark", type: "float" },
          { key: "reverb", short: "REVB", full: "Reverb", type: "float", render: "vbar" }
        ]
      ]
    },
    {
      name: "FX",
      rows: [
        [
          { key: "speaker", short: "SPKR", full: "Speaker", type: "float" },
          { key: "tune", short: "TUNE", full: "Tune", type: "float" },
          null,
          null
        ],
        [null, null, null, null]
      ]
    }
  ]
};

// src/modules/mrdrums.json
var mrdrums_default = {
  id: "mrdrums",
  name: "MrDrums",
  drum: {
    padCount: 16,
    padNoteStart: 36,
    rawMidi: false,
    currentPadParam: "ui_current_pad",
    padScoping: { aliasPrefix: "pad_", concreteKeyTemplate: "p{pad}_{suffix}", padDigits: 2 }
  },
  setOnLoad: { ui_auto_select_pad: "off" },
  banks: [
    {
      name: "Main",
      padSpecific: true,
      rows: [
        [
          { key: "pad_sample_path", short: "SAMPL", full: "Sample", type: "file", fileRoot: "/data", fileFilter: [".wav", ".aif", ".aiff"], fileStartPath: "/data/CoreLibrary/Samples/Drums" },
          { key: "pad_vol", short: "VOL", full: "Volume", type: "float", min: 0, max: 2 },
          { key: "pad_pan", short: "PAN", full: "Pan", type: "float", min: -1, max: 1 },
          { key: "pad_tune", short: "TUNE", full: "Tune", type: "float", min: -24, max: 24 }
        ],
        [
          { key: "pad_start", short: "START", full: "Start", type: "wav_position", min: 0, max: 1 },
          { key: "pad_attack_ms", short: "ATTK", full: "Attack", type: "float", min: 0, max: 5e3 },
          { key: "pad_decay_ms", short: "DECAY", full: "Decay", type: "float", min: 0, max: 5e3 },
          { key: "pad_mode", short: "MODE", full: "Mode", type: "enum" }
        ]
      ]
    },
    {
      name: "Rand",
      padSpecific: true,
      rows: [
        [
          { key: "pad_rand_pan_amt", short: "RNDPN", full: "Rnd Pan", type: "float", min: 0, max: 1 },
          { key: "pad_rand_vol_amt", short: "RNDVL", full: "Rnd Vol", type: "float", min: 0, max: 1 },
          { key: "pad_rand_decay_amt", short: "RNDDC", full: "Rnd Decay", type: "float", min: 0, max: 1 },
          { key: "pad_chance_pct", short: "CHNCE", full: "Chance", type: "float", min: 0, max: 100 }
        ],
        [
          { key: "pad_choke_group", short: "CHOKE", full: "Choke Group", type: "int", min: 0, max: 16 },
          null,
          null,
          null
        ]
      ]
    },
    {
      name: "Global",
      global: true,
      rows: [
        [
          { key: "g_master_vol", short: "MSVOL", full: "Master Vol", type: "float", min: 0, max: 2 },
          { key: "g_polyphony", short: "POLY", full: "Polyphony", type: "int", min: 1, max: 64 },
          { key: "g_vel_curve", short: "VELCV", full: "Vel Curve", type: "enum", options: ["linear", "soft", "hard"] },
          { key: "g_humanize_ms", short: "HUMAN", full: "Humanize", type: "float", min: 0, max: 50 }
        ]
      ]
    },
    {
      name: "Preset",
      rows: [
        [
          { key: "ui_preset_path", short: "PRSET", full: "Load Preset", type: "file", fileRoot: "/data", fileFilter: [".ablpreset", ".json"], fileStartPath: "/data/CoreLibrary/Track Presets/Drums/Electronic", fileRequireContains: "drumRack" }
        ]
      ]
    }
  ]
};

// src/modules/weird-dreams.json
var weird_dreams_default = {
  id: "weird-dreams",
  name: "Weird Dreams",
  drum: {
    padCount: 8,
    padNoteStart: 36,
    rawMidi: false,
    shiftSelectMidi: true,
    padScoping: {
      aliasPrefix: "cv_",
      concreteKeyTemplate: "v{pad}_{suffix}",
      padDigits: 1
    }
  },
  banks: [
    {
      name: "Voice",
      padSpecific: true,
      rows: [
        [
          {
            key: "cv_vol",
            short: "VOL",
            full: "Volume",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "cv_pan",
            short: "PAN",
            full: "Pan",
            type: "float",
            min: -1,
            max: 1
          },
          {
            key: "cv_freq",
            short: "FREQ",
            full: "Freq",
            type: "float",
            min: 20,
            max: 2e4
          },
          {
            key: "cv_decay",
            short: "DECAY",
            full: "Decay",
            type: "float",
            min: 0,
            max: 4
          }
        ],
        [
          {
            key: "cv_wave",
            short: "WAVE",
            full: "Wave",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "cv_mix",
            short: "MIX",
            full: "Mix",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "cv_cutoff",
            short: "CUTOF",
            full: "Cutoff",
            type: "float",
            min: 20,
            max: 18e3
          },
          {
            key: "cv_preset",
            short: "PRSET",
            full: "Preset",
            type: "int",
            min: 0,
            max: 40,
            render: "preset",
            capturesModuleState: true
          }
        ]
      ]
    },
    {
      name: "Patch",
      rows: [
        [
          {
            key: "kit",
            short: "KIT",
            full: "Kit",
            type: "int",
            min: 0,
            max: 63,
            render: "preset",
            capturesModuleState: true
          },
          {
            key: "rnd_kit",
            short: "RNKIT",
            full: "Rnd Kit",
            type: "enum",
            behavior: "trigger",
            capturesModuleState: true,
            options: [
              "Idle",
              "Trigger"
            ]
          },
          {
            key: "rnd_voice",
            short: "RNDVC",
            full: "Rnd Voice",
            type: "enum",
            behavior: "trigger",
            capturesModuleState: true,
            options: [
              "Idle",
              "Trigger"
            ]
          },
          {
            key: "rnd_pitch",
            short: "RNDPT",
            full: "Rnd Pitch",
            type: "enum",
            behavior: "trigger",
            capturesModuleState: true,
            options: [
              "Idle",
              "Trigger"
            ]
          }
        ]
      ]
    },
    {
      name: "FX",
      rows: [
        [
          {
            key: "rev_mix",
            short: "RVMIX",
            full: "Rev Mix",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "rev_type",
            short: "RVTYP",
            full: "Rev Type",
            type: "int",
            min: 0,
            max: 2
          },
          {
            key: "rev_size",
            short: "RVSIZ",
            full: "Rev Size",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "rev_decay",
            short: "RVDCY",
            full: "Rev Decay",
            type: "float",
            min: 0,
            max: 1
          }
        ],
        [
          {
            key: "dly_mix",
            short: "DLMIX",
            full: "Dly Mix",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "dly_rate",
            short: "DLRAT",
            full: "Dly Rate",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "dly_fdbk",
            short: "DLFBK",
            full: "Dly Fdbk",
            type: "float",
            min: 0,
            max: 0.95
          },
          {
            key: "dly_tone",
            short: "DLTON",
            full: "Dly Tone",
            type: "float",
            min: 0,
            max: 1
          }
        ]
      ]
    },
    {
      name: "EQ",
      rows: [
        [
          {
            key: "eq_lo",
            short: "EQLO",
            full: "EQ Low",
            type: "float",
            min: -12,
            max: 12
          },
          {
            key: "eq_mid",
            short: "EQMID",
            full: "EQ Mid",
            type: "float",
            min: -12,
            max: 12
          },
          {
            key: "eq_hi",
            short: "EQHI",
            full: "EQ High",
            type: "float",
            min: -12,
            max: 12
          },
          {
            key: "dj_filter",
            short: "DJFLT",
            full: "DJ Filter",
            type: "float",
            min: 0,
            max: 1
          }
        ],
        [
          {
            key: "lo_freq",
            short: "LOFRQ",
            full: "Low Freq",
            type: "int",
            min: 20,
            max: 500
          },
          {
            key: "mid_freq",
            short: "MDFRQ",
            full: "Mid Freq",
            type: "int",
            min: 200,
            max: 8e3
          },
          {
            key: "hi_freq",
            short: "HIFRQ",
            full: "High Freq",
            type: "int",
            min: 2e3,
            max: 18e3
          },
          {
            key: "comp",
            short: "COMP",
            full: "Comp",
            type: "float",
            min: 0,
            max: 1
          }
        ]
      ]
    },
    {
      name: "Master",
      rows: [
        [
          {
            key: "q_lo",
            short: "QLO",
            full: "Q Low",
            type: "float",
            min: 0.3,
            max: 8
          },
          {
            key: "q_mid",
            short: "QMID",
            full: "Q Mid",
            type: "float",
            min: 0.3,
            max: 8
          },
          {
            key: "q_hi",
            short: "QHI",
            full: "Q High",
            type: "float",
            min: 0.3,
            max: 8
          },
          {
            key: "master",
            short: "MASTR",
            full: "Master",
            type: "float",
            min: 0,
            max: 1
          }
        ],
        [
          {
            key: "all_mono",
            short: "MONO",
            full: "Mono",
            type: "enum",
            options: [
              "Stereo",
              "Mono"
            ]
          },
          null,
          null,
          null
        ]
      ]
    }
  ]
};

// src/modules/krautdrums.json
var krautdrums_default = {
  id: "krautdrums",
  name: "KrautDrums",
  drum: {
    padCount: 16,
    padNoteStart: 68,
    rawMidi: true
  },
  banks: [
    {
      name: "Levels",
      rows: [
        [
          { key: "lvl_bass", short: "BASS", full: "Bass", type: "float", min: 0, max: 1 },
          { key: "lvl_conga", short: "CONGA", full: "Conga", type: "float", min: 0, max: 1 },
          { key: "lvl_tom1", short: "TOM1", full: "Tom 1", type: "float", min: 0, max: 1 },
          { key: "lvl_tom2", short: "TOM2", full: "Tom 2", type: "float", min: 0, max: 1 },
          { key: "lvl_claves", short: "CLVS", full: "Claves", type: "float", min: 0, max: 1 },
          { key: "lvl_snare", short: "SNARE", full: "Snare", type: "float", min: 0, max: 1 },
          { key: "lvl_cowbell", short: "COWBL", full: "Cowbell", type: "float", min: 0, max: 1 },
          { key: "lvl_cymbals", short: "CYMBL", full: "Cymbals", type: "float", min: 0, max: 1 }
        ]
      ]
    },
    {
      name: "FX",
      rows: [
        [
          { key: "delay_mix", short: "DLMIX", full: "Delay Mix", type: "float", min: 0, max: 1 },
          { key: "delay_time", short: "DLTIM", full: "Delay Time", type: "float", min: 0, max: 1 },
          { key: "delay_fb", short: "DLFBK", full: "Delay Fdbk", type: "float", min: 0, max: 1 },
          { key: "reverb_mix", short: "RVMIX", full: "Reverb Mix", type: "float", min: 0, max: 1 },
          { key: "reverb_decay", short: "RVDCY", full: "Reverb Dcy", type: "float", min: 0, max: 1 },
          { key: "reverb_tone", short: "RVTON", full: "Reverb Tone", type: "float", min: 0, max: 1 },
          { key: "bus_comp", short: "COMP", full: "Bus Comp", type: "float", min: 0, max: 1 },
          { key: "all_decay", short: "ALDCY", full: "All Decay", type: "float", min: 0, max: 1 }
        ]
      ]
    },
    {
      name: "Attitude",
      rows: [
        [
          { key: "preamp_drive", short: "DRIVE", full: "Drive", type: "float", min: 0, max: 1 },
          { key: "tape_amount", short: "TAPE", full: "Tape", type: "float", min: 0, max: 1 },
          { key: "hpf_freq", short: "HPF", full: "HPF", type: "float", min: 30, max: 500 },
          { key: "eq_body", short: "BODY", full: "Body", type: "float", min: -6, max: 6 },
          { key: "eq_air", short: "AIR", full: "Air", type: "float", min: -6, max: 6 },
          { key: "filter_cutoff", short: "CUTOF", full: "Cutoff", type: "float", min: 100, max: 15e3 },
          { key: "filter_reso", short: "RESO", full: "Reso", type: "float", min: 0, max: 1 },
          { key: "phaser_amount", short: "PHASE", full: "Phaser", type: "float", min: 0, max: 1 }
        ]
      ]
    },
    {
      name: "General",
      rows: [
        [
          { key: "tempo", short: "TEMPO", full: "Tempo", type: "float", min: 60, max: 200 },
          { key: "drift", short: "DRIFT", full: "Drift", type: "float", min: 0, max: 1 },
          { key: "master_vol", short: "MSVOL", full: "Master Vol", type: "float", min: 0, max: 1 },
          { key: "density", short: "DNSTY", full: "Density", type: "float", min: 0, max: 1 },
          null,
          null,
          null,
          null
        ]
      ]
    },
    {
      name: "Rhythm",
      rows: [
        [
          { key: "rhythm_1", short: "R1", full: "Rhythm 1", type: "enum", options: ["Off", "Waltz", "Tango", "Polka", "Paso Doble", "Swing", "Slow", "Beguine", "Cha-Cha", "Rumba", "Samba", "Mambo", "Bossa-Nova", "Rock", "Slow Rock", "Shake", "R & Blues"] },
          { key: "rhythm_2", short: "R2", full: "Rhythm 2", type: "enum", options: ["Off", "Waltz", "Tango", "Polka", "Paso Doble", "Swing", "Slow", "Beguine", "Cha-Cha", "Rumba", "Samba", "Mambo", "Bossa-Nova", "Rock", "Slow Rock", "Shake", "R & Blues"] },
          { key: "rhythm_3", short: "R3", full: "Rhythm 3", type: "enum", options: ["Off", "Waltz", "Tango", "Polka", "Paso Doble", "Swing", "Slow", "Beguine", "Cha-Cha", "Rumba", "Samba", "Mambo", "Bossa-Nova", "Rock", "Slow Rock", "Shake", "R & Blues"] },
          { key: "rhythm_4", short: "R4", full: "Rhythm 4", type: "enum", options: ["Off", "Waltz", "Tango", "Polka", "Paso Doble", "Swing", "Slow", "Beguine", "Cha-Cha", "Rumba", "Samba", "Mambo", "Bossa-Nova", "Rock", "Slow Rock", "Shake", "R & Blues"] },
          { key: "rhythm_5", short: "R5", full: "Rhythm 5", type: "enum", options: ["Off", "Waltz", "Tango", "Polka", "Paso Doble", "Swing", "Slow", "Beguine", "Cha-Cha", "Rumba", "Samba", "Mambo", "Bossa-Nova", "Rock", "Slow Rock", "Shake", "R & Blues"] },
          { key: "rhythm_6", short: "R6", full: "Rhythm 6", type: "enum", options: ["Off", "Waltz", "Tango", "Polka", "Paso Doble", "Swing", "Slow", "Beguine", "Cha-Cha", "Rumba", "Samba", "Mambo", "Bossa-Nova", "Rock", "Slow Rock", "Shake", "R & Blues"] },
          { key: "rhythm_7", short: "R7", full: "Rhythm 7", type: "enum", options: ["Off", "Waltz", "Tango", "Polka", "Paso Doble", "Swing", "Slow", "Beguine", "Cha-Cha", "Rumba", "Samba", "Mambo", "Bossa-Nova", "Rock", "Slow Rock", "Shake", "R & Blues"] },
          { key: "rhythm_8", short: "R8", full: "Rhythm 8", type: "enum", options: ["Off", "Waltz", "Tango", "Polka", "Paso Doble", "Swing", "Slow", "Beguine", "Cha-Cha", "Rumba", "Samba", "Mambo", "Bossa-Nova", "Rock", "Slow Rock", "Shake", "R & Blues"] }
        ]
      ]
    },
    {
      name: "Global",
      rows: [
        [
          { key: "tempo_mode", short: "TMODE", full: "Tempo Mode", type: "enum", options: ["Free", "Sync"] },
          { key: "limiter", short: "LIMIT", full: "Limiter", type: "enum", options: ["Off", "On"] },
          { key: "delay_type", short: "DTYPE", full: "Delay Type", type: "enum", options: ["Tape", "Magnetic", "Space"] },
          { key: "reverb_type", short: "RTYPE", full: "Reverb Type", type: "enum", options: ["Plate", "Spring", "Chamber"] },
          { key: "delay_sync", short: "DSYNC", full: "Delay Sync", type: "enum", options: ["Free", "Synced"] },
          null,
          null,
          null
        ]
      ]
    }
  ]
};

// src/modules/libpo32.json
var libpo32_default = {
  id: "po32-drum",
  name: "Libpo32",
  drum: {
    padCount: 8,
    padNoteStart: 36,
    rawMidi: false
  },
  banks: [
    {
      name: "Main",
      rows: [
        [
          { key: "kit", short: "KIT", full: "Kit", type: "int", min: 0, max: 31 },
          { key: "level", short: "LEVEL", full: "Level", type: "float", min: 0, max: 1 },
          { key: "decay", short: "DECAY", full: "Decay", type: "float", min: 0.1, max: 3 },
          null
        ]
      ]
    }
  ]
};

// src/modules/essaim.json
var essaim_default = {
  id: "essaim",
  name: "Essaim",
  drum: {
    padCount: 32,
    padNoteStart: 68,
    rawMidi: true
  },
  banks: [
    {
      name: "Global",
      rows: [
        [
          { key: "root_note", short: "ROOT", full: "Root Note", type: "int", min: 0, max: 127 },
          { key: "scale", short: "SCALE", full: "Scale", type: "int", min: 0, max: 95 },
          { key: "rnd_patch", short: "RNDPT", full: "Rnd Patch", type: "float", min: 0, max: 1 },
          { key: "same_freq", short: "SFREQ", full: "Same Freq", type: "float", min: 0, max: 1 },
          { key: "init_freq", short: "IFREQ", full: "Init Freq", type: "float", min: 0, max: 1 },
          { key: "same_speed", short: "SPEED", full: "Same Speed", type: "float", min: 0.05, max: 100 },
          { key: "rnd_mod", short: "RNDMD", full: "Rnd Mod", type: "float", min: 0, max: 1 },
          { key: "rnd_pan", short: "RNDPN", full: "Rnd Pan", type: "float", min: 0, max: 1 }
        ]
      ]
    },
    {
      name: "FX",
      rows: [
        [
          { key: "transpose", short: "XPOSE", full: "Transpose", type: "int", min: -24, max: 24 },
          { key: "fine", short: "FINE", full: "Fine", type: "float", min: -1, max: 1 },
          { key: "saturation", short: "SAT", full: "Saturation", type: "float", min: 0, max: 1 },
          { key: "filter", short: "FILTR", full: "Filter", type: "float", min: 0, max: 1 },
          { key: "dly_mix", short: "DLMIX", full: "Dly Mix", type: "float", min: 0, max: 1 },
          { key: "dly_rate", short: "DLRAT", full: "Dly Rate", type: "float", min: 4e-3, max: 4 },
          { key: "dly_feedback", short: "DLFBK", full: "Dly Fdbk", type: "float", min: 0, max: 0.95 },
          { key: "dly_tone", short: "DLTON", full: "Dly Tone", type: "float", min: 0, max: 1 }
        ]
      ]
    },
    {
      name: "Voice",
      rows: [
        [
          { key: "speed", short: "SPEED", full: "Speed", type: "float", min: 0.1, max: 40 },
          { key: "mod", short: "MOD", full: "Mod", type: "float", min: 0, max: 1 },
          { key: "decay", short: "DECAY", full: "Decay", type: "float", min: 5e-3, max: 2 },
          { key: "timbre", short: "TIMBR", full: "Timbre", type: "float", min: 0, max: 1 },
          { key: "frequency", short: "FREQ", full: "Frequency", type: "float", min: 0, max: 1 },
          { key: "noisiness", short: "NOISE", full: "Noisiness", type: "float", min: 0, max: 1 },
          { key: "cutoff", short: "CUTOF", full: "Cutoff", type: "float", min: 0, max: 1 },
          { key: "volume", short: "VOL", full: "Volume", type: "float", min: 0, max: 1 }
        ]
      ]
    }
  ]
};

// src/modules/chordism.json
var chordism_default = {
  id: "chordism",
  name: "Chordism",
  banks: [
    {
      name: "Preset",
      rows: [
        [
          { key: "preset", short: "PRSET", full: "Preset", type: "enum", render: "preset" },
          null,
          null,
          null
        ]
      ]
    },
    {
      name: "Main",
      rows: [
        [
          { key: "chord_type", short: "CHORD", full: "Chord Type", type: "enum" },
          { key: "width", short: "WIDTH", full: "Width", type: "float" },
          { key: "filter_cutoff", short: "CUTOF", full: "Cutoff", type: "float" },
          { key: "filter_resonance", short: "RESO", full: "Resonance", type: "float" }
        ],
        [
          { key: "drive", short: "DRIVE", full: "Drive", type: "float" },
          { key: "shape", short: "SHAPE", full: "Shape", type: "float" },
          { key: "detune", short: "DETUN", full: "Detune", type: "float" },
          { key: "volume", short: "VOL", full: "Volume", type: "float" }
        ]
      ]
    },
    {
      name: "Osc Wave",
      rows: [
        [
          { key: "wave_1", short: "WAV1", full: "Wave 1", type: "enum" },
          { key: "wave_2", short: "WAV2", full: "Wave 2", type: "enum" },
          { key: "wave_3", short: "WAV3", full: "Wave 3", type: "enum" },
          { key: "wave_4", short: "WAV4", full: "Wave 4", type: "enum" }
        ],
        [
          { key: "shape_1", short: "SHP1", full: "Shape 1", type: "float" },
          { key: "shape_2", short: "SHP2", full: "Shape 2", type: "float" },
          { key: "shape_3", short: "SHP3", full: "Shape 3", type: "float" },
          { key: "shape_4", short: "SHP4", full: "Shape 4", type: "float" }
        ]
      ]
    },
    {
      name: "Filter",
      rows: [
        [
          { key: "filter_cutoff", short: "CUTOF", full: "Cutoff", type: "float" },
          { key: "filter_resonance", short: "RESO", full: "Resonance", type: "float" },
          { key: "filter_mode", short: "MODE", full: "Mode", type: "enum" },
          { key: "filter_slope", short: "SLOPE", full: "Slope", type: "enum" }
        ],
        [
          { key: "filter_env_attack", short: "FEATK", full: "Env Attack", type: "float" },
          { key: "filter_env_decay", short: "FEDEC", full: "Env Decay", type: "float" },
          { key: "filter_env_depth", short: "FEDPT", full: "Env Depth", type: "float" },
          { key: "fenv_mode", short: "FEMOD", full: "Env Mode", type: "enum" }
        ]
      ]
    },
    {
      name: "Flt LFO",
      rows: [
        [
          { key: "filter_lfo_rate", short: "RATE", full: "Rate", type: "float" },
          { key: "filter_lfo_depth", short: "DEPTH", full: "Depth", type: "float" },
          { key: "filter_lfo_shape", short: "SHAPE", full: "Shape", type: "enum" },
          { key: "filter_lfo_spread", short: "SPRD", full: "Spread", type: "float" }
        ],
        [
          { key: "filter_lfo_mode", short: "MODE", full: "Mode", type: "enum" },
          null,
          null,
          null
        ]
      ]
    },
    {
      name: "Vibrato",
      rows: [
        [
          { key: "lfo_shape", short: "SHAPE", full: "LFO Shape", type: "enum" },
          { key: "lfo_rate", short: "RATE", full: "LFO Rate", type: "float" },
          { key: "lfo_depth", short: "DEPTH", full: "LFO Depth", type: "float" },
          { key: "vib_depth", short: "VIBD", full: "Vib Depth", type: "float" }
        ],
        [
          { key: "vib_speed", short: "VIBS", full: "Vib Speed", type: "float" },
          { key: "vib_delay", short: "VIBDL", full: "Vib Delay", type: "float" },
          { key: "vib_stray", short: "STRAY", full: "Vib Stray", type: "enum" },
          { key: "sweep_amount", short: "SWEEP", full: "Sweep Amt", type: "float" }
        ]
      ]
    },
    {
      name: "Amp",
      rows: [
        [
          { key: "attack", short: "ATTK", full: "Attack", type: "float" },
          { key: "release", short: "REL", full: "Release", type: "float" },
          { key: "volume", short: "VOL", full: "Volume", type: "float" },
          { key: "vca_mode", short: "VCA", full: "VCA Mode", type: "enum" }
        ],
        [
          { key: "vca_hard_reset", short: "HARD", full: "Hard Reset", type: "enum" },
          { key: "vca_drone", short: "DRONE", full: "Drone", type: "enum" },
          { key: "glide_rate", short: "GLIDE", full: "Glide Rate", type: "float" },
          { key: "glide_legato", short: "LEGTO", full: "Glide Legato", type: "enum" }
        ]
      ]
    },
    {
      name: "Chord A",
      rows: [
        [
          { key: "chord_pc_0", short: "C", full: "Chord C", type: "enum" },
          { key: "chord_pc_1", short: "C#", full: "Chord C#", type: "enum" },
          { key: "chord_pc_2", short: "D", full: "Chord D", type: "enum" },
          { key: "chord_pc_3", short: "D#", full: "Chord D#", type: "enum" }
        ],
        [
          { key: "chord_pc_4", short: "E", full: "Chord E", type: "enum" },
          { key: "chord_pc_5", short: "F", full: "Chord F", type: "enum" },
          { key: "chord_pc_6", short: "F#", full: "Chord F#", type: "enum" },
          { key: "chord_pc_7", short: "G", full: "Chord G", type: "enum" }
        ]
      ]
    },
    {
      name: "Chord B",
      rows: [
        [
          { key: "chord_pc_8", short: "G#", full: "Chord G#", type: "enum" },
          { key: "chord_pc_9", short: "A", full: "Chord A", type: "enum" },
          { key: "chord_pc_10", short: "A#", full: "Chord A#", type: "enum" },
          { key: "chord_pc_11", short: "B", full: "Chord B", type: "enum" }
        ],
        [
          { key: "tuning_mode", short: "TUNE", full: "Tuning Mode", type: "enum" },
          { key: "scale_index", short: "SCALE", full: "Scale", type: "enum" },
          { key: "scale_root", short: "ROOT", full: "Scale Root", type: "enum" },
          null
        ]
      ]
    },
    {
      name: "Spread/FM",
      rows: [
        [
          { key: "chord_spread", short: "SPRD", full: "Chord Spread", type: "float" },
          { key: "chord_rotation", short: "ROT", full: "Chord Rotation", type: "float" },
          { key: "fm_modulator", short: "FMMOD", full: "FM Modulator", type: "int" },
          { key: "fm_amount", short: "FMAMT", full: "FM Amount", type: "float" }
        ],
        [
          { key: "mix_1", short: "MIX1", full: "Mix 1", type: "float" },
          { key: "mix_2", short: "MIX2", full: "Mix 2", type: "float" },
          { key: "mix_3", short: "MIX3", full: "Mix 3", type: "float" },
          { key: "mix_4", short: "MIX4", full: "Mix 4", type: "float" }
        ]
      ]
    },
    {
      name: "FM/Intvl",
      rows: [
        [
          { key: "fm_amount_1", short: "FMA1", full: "FM Amount 1", type: "float" },
          { key: "fm_amount_2", short: "FMA2", full: "FM Amount 2", type: "float" },
          { key: "fm_amount_3", short: "FMA3", full: "FM Amount 3", type: "float" },
          { key: "fm_amount_4", short: "FMA4", full: "FM Amount 4", type: "float" }
        ],
        [
          { key: "interval_1", short: "INT1", full: "Interval 1", type: "int" },
          { key: "interval_2", short: "INT2", full: "Interval 2", type: "int" },
          { key: "interval_3", short: "INT3", full: "Interval 3", type: "int" },
          null
        ]
      ]
    },
    {
      name: "Reverb",
      rows: [
        [
          { key: "reverb_mix", short: "MIX", full: "Mix", type: "float" },
          { key: "reverb_decay", short: "DECAY", full: "Decay", type: "float" },
          { key: "reverb_damp", short: "DAMP", full: "Damp", type: "float" },
          { key: "reverb_shimmer", short: "SHIMM", full: "Shimmer", type: "float" }
        ],
        [
          { key: "reverb_lowcut", short: "LOCUT", full: "Low Cut", type: "float" },
          { key: "reverb_size", short: "SIZE", full: "Size", type: "float" },
          { key: "reverb_mod_rate", short: "MODR", full: "Mod Rate", type: "float" },
          { key: "reverb_mod_depth", short: "MODD", full: "Mod Depth", type: "float" }
        ]
      ]
    },
    {
      name: "Delay",
      rows: [
        [
          { key: "delay_mix", short: "MIX", full: "Mix", type: "float" },
          { key: "delay_time", short: "TIME", full: "Time", type: "float" },
          { key: "delay_feedback", short: "FEEDB", full: "Feedback", type: "float" },
          { key: "delay_mode", short: "MODE", full: "Mode", type: "enum" }
        ],
        [
          { key: "delay_tone", short: "TONE", full: "Tone", type: "float" },
          { key: "delay_tone_hi", short: "TONHI", full: "Tone Hi", type: "float" },
          { key: "delay_tone_lo", short: "TONLO", full: "Tone Lo", type: "float" },
          { key: "delay_mod_rate", short: "MODR", full: "Mod Rate", type: "float" }
        ]
      ]
    },
    {
      name: "Morph",
      rows: [
        [
          { key: "morph_index", short: "MRPH", full: "Morph", type: "float" },
          { key: "morph_intensity", short: "MINT", full: "Morph Int", type: "float" },
          { key: "pan_morph_index", short: "PMRPH", full: "Pan Morph", type: "float" },
          { key: "pan_morph_intensity", short: "PMINT", full: "Pan Int", type: "float" }
        ],
        [
          { key: "lm_lfo_rate", short: "LMRAT", full: "Lvl Morph Rate", type: "float" },
          { key: "lm_lfo_depth", short: "LMDPT", full: "Lvl Morph Depth", type: "float" },
          { key: "pm_lfo_rate", short: "PMRAT", full: "Pan Morph Rate", type: "float" },
          { key: "pm_lfo_depth", short: "PMDPT", full: "Pan Morph Depth", type: "float" }
        ]
      ]
    },
    {
      name: "Amp LFO",
      rows: [
        [
          { key: "amp_lfo_rate", short: "RATE", full: "Amp LFO Rate", type: "float" },
          { key: "amp_lfo_depth", short: "DEPTH", full: "Amp LFO Depth", type: "float" },
          { key: "amp_lfo_shape", short: "SHAPE", full: "Amp LFO Shape", type: "enum" },
          { key: "lfo_phase_1", short: "PHS1", full: "LFO Phase 1", type: "float" }
        ],
        [
          { key: "lfo_phase_2", short: "PHS2", full: "LFO Phase 2", type: "float" },
          { key: "lfo_phase_3", short: "PHS3", full: "LFO Phase 3", type: "float" },
          { key: "lfo_phase_4", short: "PHS4", full: "LFO Phase 4", type: "float" },
          null
        ]
      ]
    },
    {
      name: "Arp",
      rows: [
        [
          { key: "arp_enabled", short: "ARP", full: "Arp", type: "enum" },
          { key: "arp_tempo", short: "TEMPO", full: "Tempo", type: "float" },
          { key: "arp_direction", short: "DIR", full: "Direction", type: "enum" },
          { key: "arp_hold", short: "HOLD", full: "Hold", type: "enum" }
        ],
        [
          { key: "arp_euclid_steps", short: "STEPS", full: "Euclid Steps", type: "int" },
          { key: "arp_euclid_beats", short: "BEATS", full: "Euclid Beats", type: "int" },
          { key: "arp_clock_sync", short: "SYNC", full: "Clock Sync", type: "enum" },
          { key: "arp_clock_division", short: "DIV", full: "Clock Div", type: "enum" }
        ]
      ]
    },
    {
      name: "Ctrl Src",
      rows: [
        [
          { key: "ctrl_source", short: "SRC", full: "Source", type: "enum" },
          { key: "ctrl_cc", short: "CC", full: "CC", type: "int" },
          { key: "ctrl_to_cutoff", short: ">CUT", full: "To Cutoff", type: "float" },
          { key: "ctrl_to_morph", short: ">MRPH", full: "To Morph", type: "float" }
        ],
        [
          { key: "ctrl_to_vib", short: ">VIB", full: "To Vibrato", type: "float" },
          { key: "ctrl_to_shape", short: ">SHP", full: "To Shape", type: "float" },
          { key: "ctrl_to_fm", short: ">FM", full: "To FM", type: "float" },
          { key: "sweep_rate", short: "SWPRT", full: "Sweep Rate", type: "float" }
        ]
      ]
    }
  ]
};

// src/modules/sfz.json
var sfz_default = {
  id: "sfz",
  name: "SFZ",
  banks: [
    {
      name: "Amp",
      rows: [
        [
          { key: "attack", short: "ATTK", full: "Attack", type: "float" },
          { key: "decay", short: "DECAY", full: "Decay", type: "float" },
          { key: "sustain", short: "SUST", full: "Sustain", type: "float" },
          { key: "release", short: "REL", full: "Release", type: "float" }
        ],
        [
          { key: "cutoff", short: "CUTOF", full: "Cutoff", type: "float" },
          { key: "reso", short: "RESO", full: "Resonance", type: "float" },
          { key: "gain", short: "GAIN", full: "Gain", type: "float" },
          { key: "voices", short: "VOICE", full: "Voices", type: "int" }
        ]
      ]
    },
    {
      name: "Tune",
      rows: [
        [
          { key: "tune", short: "TUNE", full: "Tune", type: "float" },
          { key: "octave_transpose", short: "OCT", full: "Octave", type: "int" },
          { key: "preset", short: "PRSET", full: "Preset", type: "int", render: "preset" },
          null
        ]
      ]
    },
    {
      name: "Macros",
      rows: [
        [
          { key: "knob_0", short: "MAC1", full: "Macro 1", type: "float" },
          { key: "knob_1", short: "MAC2", full: "Macro 2", type: "float" },
          { key: "knob_2", short: "MAC3", full: "Macro 3", type: "float" },
          { key: "knob_3", short: "MAC4", full: "Macro 4", type: "float" }
        ],
        [
          { key: "knob_4", short: "MAC5", full: "Macro 5", type: "float" },
          { key: "knob_5", short: "MAC6", full: "Macro 6", type: "float" },
          { key: "knob_6", short: "MAC7", full: "Macro 7", type: "float" },
          { key: "knob_7", short: "MAC8", full: "Macro 8", type: "float" }
        ]
      ]
    }
  ]
};

// src/modules/303.json
var __default = {
  id: "303",
  name: "303",
  banks: [
    {
      name: "Main",
      rows: [
        [
          { key: "cutoff", short: "CUTOF", full: "Cutoff", type: "float" },
          { key: "resonance", short: "RESO", full: "Resonance", type: "float" },
          { key: "env_mod", short: "ENVMD", full: "Env Mod", type: "float" },
          { key: "decay", short: "DECAY", full: "Decay", type: "float" }
        ],
        [
          { key: "accent", short: "ACCNT", full: "Accent", type: "float" },
          { key: "waveform", short: "WAVE", full: "Waveform", type: "enum", options: ["Saw", "Square"] },
          { key: "tuning", short: "TUNE", full: "Tuning", type: "float" },
          { key: "volume", short: "VOL", full: "Volume", type: "float" }
        ]
      ]
    },
    {
      name: "Shape",
      rows: [
        [
          { key: "soft_attack", short: "SATK", full: "Soft Attack", type: "float" },
          { key: "normal_decay", short: "NDEC", full: "Normal Decay", type: "float" },
          { key: "accent_decay", short: "ADEC", full: "Accent Decay", type: "float" },
          { key: "slide_time", short: "SLIDE", full: "Slide Time", type: "float" }
        ],
        [
          { key: "feedback_hpf", short: "FBHPF", full: "Feedback HPF", type: "float" },
          { key: "devil_mod_switch", short: "DEVIL", full: "Devil Mod", type: "enum", options: ["Off", "On"] },
          null,
          null
        ]
      ]
    },
    {
      name: "Drive",
      rows: [
        [
          { key: "drive_model", short: "MODEL", full: "Drive Model", type: "enum", options: ["Soft", "RAT"] },
          { key: "drive", short: "DRIVE", full: "Drive", type: "float" },
          { key: "drive_mix", short: "MIX", full: "Drive Mix", type: "float" },
          { key: "tanh_shaper_drive", short: "TANH", full: "Tanh Drive", type: "float" }
        ]
      ]
    }
  ]
};

// src/modules/chiptune.json
var chiptune_default = {
  id: "chiptune",
  name: "Chiptune",
  banks: [
    {
      name: "Env",
      rows: [
        [
          { key: "env_attack", short: "ATTK", full: "Attack", type: "int" },
          { key: "env_decay", short: "DECAY", full: "Decay", type: "int" },
          { key: "env_sustain", short: "SUST", full: "Sustain", type: "int" },
          { key: "env_release", short: "REL", full: "Release", type: "int" }
        ],
        [
          { key: "duty", short: "DUTY", full: "Duty", type: "int" },
          { key: "volume", short: "VOL", full: "Volume", type: "int" },
          { key: "detune", short: "DTUNE", full: "Detune", type: "int" },
          { key: "octave_transpose", short: "OCT", full: "Octave", type: "int" }
        ]
      ]
    },
    {
      name: "Chip",
      rows: [
        [
          { key: "chip", short: "CHIP", full: "Chip", type: "enum", options: ["NES", "GB"] },
          { key: "alloc_mode", short: "ALLOC", full: "Alloc Mode", type: "enum", options: ["Auto", "Lead", "Locked"] },
          { key: "noise_mode", short: "NOISE", full: "Noise Mode", type: "enum", options: ["Long", "Short"] },
          { key: "wavetable", short: "WTBL", full: "Wavetable", type: "int" }
        ],
        [
          { key: "sweep", short: "SWEEP", full: "Sweep", type: "int" },
          { key: "channel_mask", short: "CHMSK", full: "Channel Mask", type: "int" },
          { key: "vibrato_depth", short: "VIBD", full: "Vibrato Depth", type: "int" },
          { key: "vibrato_rate", short: "VIBR", full: "Vibrato Rate", type: "int" }
        ]
      ]
    },
    {
      name: "Pitch",
      rows: [
        [
          { key: "pitch_env_depth", short: "PENVD", full: "Pitch Env Depth", type: "int" },
          { key: "pitch_env_speed", short: "PENVS", full: "Pitch Env Speed", type: "int" },
          { key: "preset", short: "PRSET", full: "Preset", type: "enum", render: "preset" },
          null
        ]
      ]
    }
  ]
};

// src/modules/hush1.json
var hush1_default = {
  id: "hush1",
  name: "Hush1",
  banks: [
    {
      name: "Osc",
      rows: [
        [
          { key: "volume", short: "VOL", full: "Volume", type: "float" },
          { key: "saw", short: "SAW", full: "Saw", type: "float" },
          { key: "pulse", short: "PULSE", full: "Pulse", type: "float" },
          { key: "sub", short: "SUB", full: "Sub", type: "float" }
        ],
        [
          { key: "noise", short: "NOISE", full: "Noise", type: "float" },
          { key: "sub_mode", short: "SUBMD", full: "Sub Mode", type: "enum", options: ["-2 Oct 50% PW", "-2 Oct", "-1 Oct"] },
          { key: "white_noise", short: "WNOIS", full: "White Noise", type: "enum", options: ["Off", "On"] },
          { key: "pulse_width", short: "PW", full: "Pulse Width", type: "float" }
        ]
      ]
    },
    {
      name: "PWM",
      rows: [
        [
          { key: "pwm_mode", short: "PWMMD", full: "PWM Mode", type: "enum", options: ["Env", "Manual", "LFO"] },
          { key: "pwm_depth", short: "PWMD", full: "PWM Depth", type: "float" },
          { key: "pwm_env_depth", short: "PWMEV", full: "PWM Env Depth", type: "float" },
          { key: "bend_range", short: "BEND", full: "Bend Range", type: "float" }
        ],
        [
          { key: "fine_tune", short: "FINE", full: "Fine Tune", type: "float" },
          { key: "transpose", short: "TRANS", full: "Transpose", type: "int" },
          { key: "octave_transpose", short: "OCT", full: "Octave", type: "int" },
          { key: "glide", short: "GLIDE", full: "Glide", type: "float" }
        ]
      ]
    },
    {
      name: "Filter",
      rows: [
        [
          { key: "cutoff", short: "CUTOF", full: "Cutoff", type: "float" },
          { key: "resonance", short: "RESO", full: "Resonance", type: "float" },
          { key: "env_amt", short: "ENVAM", full: "Env Amount", type: "float" },
          { key: "key_follow", short: "KEYFL", full: "Key Follow", type: "float" }
        ],
        [
          { key: "f_attack", short: "FATK", full: "Filter Attack", type: "float" },
          { key: "f_decay", short: "FDEC", full: "Filter Decay", type: "float" },
          { key: "f_sustain", short: "FSUS", full: "Filter Sustain", type: "float" },
          { key: "f_release", short: "FREL", full: "Filter Release", type: "float" }
        ]
      ]
    },
    {
      name: "Amp Env",
      rows: [
        [
          { key: "attack", short: "ATTK", full: "Attack", type: "float" },
          { key: "decay", short: "DECAY", full: "Decay", type: "float" },
          { key: "sustain", short: "SUST", full: "Sustain", type: "float" },
          { key: "release", short: "REL", full: "Release", type: "float" }
        ],
        [
          { key: "velocity_sens", short: "VELSN", full: "Velocity Sens", type: "float" },
          { key: "adsr_declick", short: "DECLK", full: "ADSR Declick", type: "float" },
          { key: "vca_mode", short: "VCA", full: "VCA Mode", type: "enum", options: ["Gate", "Envelope"] },
          { key: "filter_velocity_sens", short: "FVELS", full: "Filter Vel Sens", type: "float" }
        ]
      ]
    },
    {
      name: "LFO",
      rows: [
        [
          { key: "lfo_rate", short: "RATE", full: "LFO Rate", type: "float" },
          { key: "lfo_waveform", short: "WAVE", full: "LFO Waveform", type: "enum", options: ["Tri", "Rect", "Random", "Noise"] },
          { key: "lfo_trigger", short: "TRIG", full: "LFO Trigger", type: "enum", options: ["Free", "Retrig"] },
          { key: "lfo_sync", short: "SYNC", full: "LFO Sync", type: "enum", options: ["Free", "Sync"] }
        ],
        [
          { key: "lfo_pitch", short: "LPTCH", full: "LFO to Pitch", type: "float" },
          { key: "lfo_filter", short: "LFILT", full: "LFO to Filter", type: "float" },
          { key: "lfo_pwm", short: "LPWM", full: "LFO to PWM", type: "float" },
          { key: "lfo_invert", short: "INV", full: "LFO Invert", type: "enum", options: ["Off", "On"] }
        ]
      ]
    },
    {
      name: "Perf",
      rows: [
        [
          { key: "lfo_pitch_snap", short: "SNAP", full: "LFO Pitch Snap", type: "enum", options: ["Off", "On"] },
          { key: "portamento_mode", short: "PORTA", full: "Portamento", type: "enum", options: ["Off", "On", "Auto"] },
          { key: "portamento_linear", short: "PLIN", full: "Porta Curve", type: "enum", options: ["Expo", "Linear"] },
          { key: "retrigger", short: "RETRG", full: "Retrigger", type: "enum", options: ["Legato", "Trig"] }
        ],
        [
          { key: "hold", short: "HOLD", full: "Hold", type: "enum", options: ["Off", "On"] },
          { key: "gate_trig_mode", short: "GATE", full: "Gate/Trig", type: "enum", options: ["Gate", "Gate+Trig", "LFO"] },
          { key: "priority", short: "PRIO", full: "Note Priority", type: "enum", options: ["Last", "Low"] },
          { key: "velocity_mode", short: "VELMD", full: "Velocity Mode", type: "enum", options: ["Off", "Trigger", "Active"] }
        ]
      ]
    },
    {
      name: "Advanced",
      rows: [
        [
          { key: "same_note_quirk", short: "QUIRK", full: "Same Note Quirk", type: "enum", options: ["Off", "On"] },
          { key: "filter_env_full_range", short: "FRANG", full: "Filt Env Range", type: "enum", options: ["Off", "On"] },
          { key: "filter_env_polarity", short: "FPOL", full: "Filt Env Polarity", type: "enum", options: ["Positive", "Negative"] },
          { key: "filter_volume_correction", short: "FVCOR", full: "Filt Vol Corr", type: "float" }
        ],
        [
          { key: "preset", short: "PRSET", full: "Preset", type: "enum", render: "preset" },
          null,
          null,
          null
        ]
      ]
    }
  ]
};

// src/modules/signal.json
var signal_default = {
  id: "signal",
  name: "Signal",
  drum: {
    padCount: 4,
    padNoteStart: 36,
    rawMidi: false,
    shiftSelectMidi: true,
    padScoping: {
      aliasPrefix: "cv_",
      concreteKeyTemplate: "v{pad}_{suffix}",
      padDigits: 1
    }
  },
  banks: [
    {
      name: "Voice",
      padSpecific: true,
      rows: [
        [
          {
            key: "cv_preset",
            short: "PRSET",
            full: "Preset",
            type: "int",
            min: 0,
            max: 50
          },
          {
            key: "cv_vol",
            short: "VOL",
            full: "Volume",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "cv_freq",
            short: "FREQ",
            full: "Freq",
            type: "float",
            min: 20,
            max: 2e4
          },
          {
            key: "cv_wave",
            short: "WAVE",
            full: "Wave",
            type: "enum",
            options: [
              "Sine",
              "Impulse",
              "Noise",
              "Damped",
              "Click",
              "Square",
              "Tri",
              "FM",
              "Pink",
              "Brown",
              "AM",
              "Ping",
              "Train",
              "Kick",
              "Snare",
              "Hat"
            ]
          }
        ],
        [
          {
            key: "cv_tone",
            short: "TONE",
            full: "Tone",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "cv_decay",
            short: "DECAY",
            full: "Decay",
            type: "float",
            min: 1e-4,
            max: 0.5
          },
          {
            key: "cv_detune",
            short: "DETUN",
            full: "Detune",
            type: "float",
            min: 0,
            max: 20
          },
          {
            key: "cv_pan",
            short: "PAN",
            full: "Pan",
            type: "float",
            min: -1,
            max: 1
          }
        ]
      ]
    },
    {
      name: "Voice+",
      padSpecific: true,
      rows: [
        [
          {
            key: "cv_attack",
            short: "ATTK",
            full: "Attack",
            type: "float",
            min: 1e-4,
            max: 0.05
          },
          {
            key: "cv_sub_div",
            short: "SUBDV",
            full: "Sub Div",
            type: "int",
            min: 1,
            max: 8
          },
          {
            key: "cv_sweep",
            short: "SWEEP",
            full: "Sweep",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "cv_tone_rnd",
            short: "TRND",
            full: "Tone Rnd",
            type: "enum",
            options: [
              "0%",
              "1%",
              "2%",
              "3%",
              "4%",
              "5%",
              "6%",
              "7%",
              "8%",
              "9%",
              "10%",
              "11%",
              "12%",
              "13%",
              "14%",
              "15%",
              "16%",
              "17%",
              "18%",
              "19%",
              "20%",
              "21%",
              "22%",
              "23%",
              "24%",
              "25%",
              "26%",
              "27%",
              "28%",
              "29%",
              "30%",
              "31%",
              "32%",
              "33%",
              "34%",
              "35%",
              "36%",
              "37%",
              "38%",
              "39%",
              "40%",
              "41%",
              "42%",
              "43%",
              "44%",
              "45%",
              "46%",
              "47%",
              "48%",
              "49%",
              "50%",
              "51%",
              "52%",
              "53%",
              "54%",
              "55%",
              "56%",
              "57%",
              "58%",
              "59%",
              "60%",
              "61%",
              "62%",
              "63%",
              "64%",
              "65%",
              "66%",
              "67%",
              "68%",
              "69%",
              "70%",
              "71%",
              "72%",
              "73%",
              "74%",
              "75%",
              "76%",
              "77%",
              "78%",
              "79%",
              "80%",
              "81%",
              "82%",
              "83%",
              "84%",
              "85%",
              "86%",
              "87%",
              "88%",
              "89%",
              "90%",
              "91%",
              "92%",
              "93%",
              "94%",
              "95%",
              "96%",
              "97%",
              "98%",
              "99%",
              "100%"
            ]
          }
        ],
        [
          {
            key: "cv_level",
            short: "LEVEL",
            full: "Level",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "cv_vfreq",
            short: "VFREQ",
            full: "Voice Freq",
            type: "float",
            min: 20,
            max: 2e4
          },
          {
            key: "cv_push_pull",
            short: "PUSH",
            full: "Push/Pull",
            type: "float",
            min: -20,
            max: 20
          },
          {
            key: "cv_improv",
            short: "IMPRV",
            full: "Improv",
            type: "float",
            min: 0,
            max: 1
          }
        ]
      ]
    },
    {
      name: "Bank Pitch",
      padSpecific: true,
      rows: [
        [
          {
            key: "cv_bank_mode",
            short: "BMODE",
            full: "Bank Mode",
            type: "enum",
            options: [
              "Off",
              "Rule",
              "Random"
            ]
          },
          {
            key: "cv_ghost_crescendo",
            short: "GHOST",
            full: "Ghost Cresc",
            type: "enum",
            options: [
              "Off",
              "On"
            ]
          },
          {
            key: "cv_bank_pitch_0",
            short: "BP0",
            full: "Bank Pitch 0",
            type: "float",
            min: -24,
            max: 24
          },
          {
            key: "cv_bank_pitch_1",
            short: "BP1",
            full: "Bank Pitch 1",
            type: "float",
            min: -24,
            max: 24
          }
        ],
        [
          {
            key: "cv_bank_pitch_2",
            short: "BP2",
            full: "Bank Pitch 2",
            type: "float",
            min: -24,
            max: 24
          },
          {
            key: "cv_bank_pitch_3",
            short: "BP3",
            full: "Bank Pitch 3",
            type: "float",
            min: -24,
            max: 24
          },
          {
            key: "cv_bank_pitch_4",
            short: "BP4",
            full: "Bank Pitch 4",
            type: "float",
            min: -24,
            max: 24
          },
          null
        ]
      ]
    },
    {
      name: "Seq",
      rows: [
        [
          {
            key: "seq1",
            short: "SEQ1",
            full: "Seq 1",
            type: "int",
            min: 0,
            max: 35
          },
          {
            key: "seq2",
            short: "SEQ2",
            full: "Seq 2",
            type: "int",
            min: 0,
            max: 35
          },
          {
            key: "seq3",
            short: "SEQ3",
            full: "Seq 3",
            type: "int",
            min: 0,
            max: 35
          },
          {
            key: "seq4",
            short: "SEQ4",
            full: "Seq 4",
            type: "int",
            min: 0,
            max: 35
          }
        ],
        [
          {
            key: "syn1",
            short: "SYN1",
            full: "Syn 1",
            type: "int",
            min: 0,
            max: 50
          },
          {
            key: "syn2",
            short: "SYN2",
            full: "Syn 2",
            type: "int",
            min: 0,
            max: 50
          },
          {
            key: "syn3",
            short: "SYN3",
            full: "Syn 3",
            type: "int",
            min: 0,
            max: 50
          },
          {
            key: "syn4",
            short: "SYN4",
            full: "Syn 4",
            type: "int",
            min: 0,
            max: 50
          }
        ]
      ]
    },
    {
      name: "Sequence",
      rows: [
        [
          {
            key: "root",
            short: "ROOT",
            full: "Root",
            type: "enum",
            options: [
              "Free",
              "C",
              "C#",
              "D",
              "D#",
              "E",
              "F",
              "F#",
              "G",
              "G#",
              "A",
              "A#",
              "B"
            ]
          },
          {
            key: "scale",
            short: "SCALE",
            full: "Scale",
            type: "enum",
            options: [
              "Free",
              "Chromatic",
              "Major",
              "Minor",
              "Pentatonic",
              "WholeTone",
              "Diminished",
              "HarmMin"
            ]
          },
          {
            key: "density",
            short: "DENS",
            full: "Density",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "chaos",
            short: "CHAOS",
            full: "Chaos",
            type: "float",
            min: 0,
            max: 1
          }
        ],
        [
          {
            key: "gravity",
            short: "GRAV",
            full: "Gravity",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "clk_div",
            short: "CLK",
            full: "Clk Div",
            type: "int",
            min: 1,
            max: 32
          },
          {
            key: "morse_spd",
            short: "MORSE",
            full: "Morse Spd",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "swing",
            short: "SWING",
            full: "Swing",
            type: "float",
            min: 0,
            max: 1
          }
        ]
      ]
    },
    {
      name: "Mod",
      rows: [
        [
          {
            key: "mod_amount",
            short: "AMT",
            full: "Mod Amt",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "mod_speed",
            short: "SPEED",
            full: "Mod Speed",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "mod_freq",
            short: "FREQ",
            full: "Mod Freq",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "mod_decay",
            short: "DECAY",
            full: "Mod Decay",
            type: "float",
            min: 0,
            max: 1
          }
        ],
        [
          {
            key: "mod_pan",
            short: "PAN",
            full: "Mod Pan",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "mod_density",
            short: "DENS",
            full: "Mod Dens",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "mod_shape",
            short: "SHAPE",
            full: "Mod Shape",
            type: "enum",
            options: [
              "Sine",
              "Tri",
              "Saw",
              "Square",
              "S&H",
              "Random"
            ]
          },
          {
            key: "mod_reset",
            short: "RESET",
            full: "Mod Reset",
            type: "int",
            min: 0,
            max: 127
          }
        ]
      ]
    },
    {
      name: "Patch",
      rows: [
        [
          {
            key: "patch",
            short: "PATCH",
            full: "Patch",
            type: "enum",
            options: [
              "Init",
              "Ikeda Grid",
              "Bernier",
              "Morse CQ",
              "Mathcore",
              "Pink Rain",
              "Heterodyne",
              "Sub Harm",
              "CA Automata",
              "FM Bell",
              "AM Texture",
              "Brown Pulse",
              "Clk Matrix",
              "Sweep Casc",
              "Fibonacci",
              "Digi Glitch",
              "Chirp Field",
              "Phase Cloud",
              "Test Signal",
              "CW Radio",
              "Cantor",
              "Noise Gate",
              "Sub Bass",
              "Thue-Morse",
              "Pink Grid",
              "Metallic FM",
              "Minimal",
              "Maximum",
              "Rule 30",
              "Freq Lat.",
              "Gauss Pings",
              "Ikeda Data",
              "Tuning Fork",
              "Fork Harmony",
              "BL Square",
              "Data Quanta",
              "Resonant Bell",
              "Sine Study",
              "Noise Field",
              "Aleatoric",
              "Amen",
              "Think",
              "Funky Drummer",
              "Piccolo Jungle",
              "Liquid DnB",
              "Holzman Live",
              "Microsound Jungle",
              "Bernier Jungle",
              "Mathcore Break",
              "Bretschneider Roll"
            ]
          },
          {
            key: "scene_morph",
            short: "MORPH",
            full: "Scene Morph",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "rnd_patch",
            short: "RPTCH",
            full: "Rnd Patch",
            type: "int",
            min: 0,
            max: 127
          },
          {
            key: "rnd_rytm",
            short: "RRYTM",
            full: "Rnd Rytm",
            type: "int",
            min: 0,
            max: 127
          }
        ],
        [
          {
            key: "rnd_voices",
            short: "RVCE",
            full: "Rnd Voice",
            type: "int",
            min: 0,
            max: 127
          },
          {
            key: "rnd_mod",
            short: "RMOD",
            full: "Rnd Mod",
            type: "int",
            min: 0,
            max: 127
          },
          {
            key: "rnd_pitch",
            short: "RPTCH2",
            full: "Rnd Pitch",
            type: "int",
            min: 0,
            max: 127
          },
          {
            key: "rnd_pan",
            short: "RPAN",
            full: "Rnd Pan",
            type: "int",
            min: 0,
            max: 127
          }
        ]
      ]
    },
    {
      name: "General",
      rows: [
        [
          {
            key: "bpm",
            short: "BPM",
            full: "BPM",
            type: "float",
            min: 20,
            max: 500
          },
          {
            key: "drift",
            short: "DRIFT",
            full: "Drift",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "jitter",
            short: "JITTR",
            full: "Jitter",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "stereo_w",
            short: "WIDTH",
            full: "Stereo W",
            type: "float",
            min: 0,
            max: 1
          }
        ],
        [
          {
            key: "bit_crush",
            short: "CRUSH",
            full: "Bit Crush",
            type: "int",
            min: 1,
            max: 16
          },
          {
            key: "bit_rate",
            short: "RATE",
            full: "Bit Rate",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "all_decay",
            short: "ADCY",
            full: "All Decay",
            type: "float",
            min: 0,
            max: 1
          },
          {
            key: "master_vol",
            short: "MSVOL",
            full: "Master",
            type: "float",
            min: 0,
            max: 1
          }
        ]
      ]
    },
    {
      name: "Advanced",
      rows: [
        [
          {
            key: "drummer_brain",
            short: "BRAIN",
            full: "Drummer",
            type: "enum",
            options: [
              "Off",
              "Light",
              "Heavy"
            ]
          },
          {
            key: "fill_shape",
            short: "FILL",
            full: "Fill Shape",
            type: "enum",
            options: [
              "Snare Roll",
              "Tom Run",
              "Kick Fill",
              "Hat Splatter",
              "Crash Drop",
              "Random"
            ]
          },
          {
            key: "phrase_length",
            short: "PHRAS",
            full: "Phrase Len",
            type: "enum",
            options: [
              "Off",
              "2",
              "4",
              "8",
              "16"
            ]
          },
          {
            key: "retrig_rate",
            short: "RETRG",
            full: "Retrig",
            type: "enum",
            options: [
              "2x",
              "3x",
              "4x",
              "8x",
              "Rand"
            ]
          }
        ],
        [
          {
            key: "step_grid",
            short: "GRID",
            full: "Step Grid",
            type: "enum",
            options: [
              "8",
              "16",
              "32"
            ]
          },
          {
            key: "tempo_sync",
            short: "TSYNC",
            full: "Tempo Sync",
            type: "enum",
            options: [
              "Free",
              "Sync"
            ]
          },
          {
            key: "out_mode",
            short: "OUT",
            full: "Out Mode",
            type: "enum",
            options: [
              "Stereo",
              "Mono",
              "Spread"
            ]
          },
          {
            key: "morph_curve",
            short: "MCRV",
            full: "Morph Crv",
            type: "enum",
            options: [
              "Linear",
              "Exp",
              "Stepped"
            ]
          }
        ]
      ]
    }
  ]
};

// src/modules/slicer.json
var slicer_default = {
  id: "slicer",
  name: "Slicer",
  drum: {
    padCount: 32,
    padNoteStart: 68,
    rawMidi: true,
    shiftSelectMidi: true
  },
  banks: [
    {
      name: "Main",
      rows: [
        [
          { key: "sample_path", short: "SAMPL", full: "Sample", type: "file", fileRoot: "/data/UserData/UserLibrary", fileFilter: [".wav", ".aif", ".aiff", ".mp3", ".flac"], fileStartPath: "/data/UserData/UserLibrary/Samples" },
          { key: "scan", short: "SCAN", full: "Scan Slices", type: "enum", options: ["idle", "trigger"], behavior: "trigger" },
          { key: "threshold", short: "SENSI", full: "Sensitivity", type: "float", min: 0, max: 1 },
          { key: "slices", short: "SLICE", full: "Slices", type: "enum", options: ["8", "16", "32", "64"] }
        ],
        [
          { key: "pitch", short: "PITCH", full: "Pitch", type: "float", min: -24, max: 24 },
          { key: "velocity_sens", short: "VELOC", full: "Velocity", type: "enum" },
          { key: "global_gain", short: "GAIN", full: "Gain", type: "float", min: 0, max: 1 },
          { key: "mono_mode", short: "MONO", full: "Mono", type: "enum" }
        ]
      ]
    },
    {
      name: "Slice",
      padSpecific: true,
      rows: [
        [
          { key: "slice_start_trim", short: "START", full: "Slice Start", type: "float", automatable: false },
          { key: "slice_end_trim", short: "END", full: "Slice End", type: "float", automatable: false },
          { key: "slice_attack", short: "ATTK", full: "Slice Attack", type: "float", automatable: false },
          { key: "slice_decay", short: "DECAY", full: "Slice Decay", type: "float", automatable: false }
        ],
        [
          { key: "slice_pitch", short: "PTCH", full: "Slice Pitch", type: "float", automatable: false },
          { key: "slice_gain", short: "SGAIN", full: "Slice Gain", type: "float", automatable: false },
          { key: "slice_mode", short: "SMODE", full: "Slice Mode", type: "enum", automatable: false },
          { key: "slice_loop", short: "LOOP", full: "Slice Loop", type: "enum", automatable: false }
        ]
      ]
    },
    {
      name: "Advanced",
      rows: [
        [
          { key: "mode", short: "MODE", full: "Trigger Mode", type: "enum" },
          { key: "slice_algo", short: "ALGO", full: "Slice Algo", type: "enum" },
          { key: "playthrough", short: "PTHRU", full: "Playthrough", type: "enum" },
          { key: "sync", short: "SYNC", full: "Tempo Sync", type: "enum" }
        ],
        [
          { key: "global_attack", short: "GATTK", full: "Global Attack", type: "float" },
          { key: "global_decay", short: "GDECY", full: "Global Decay", type: "float" },
          { key: "reroll", short: "ROLL", full: "Reroll Slices", type: "enum", options: ["idle", "trigger"], behavior: "trigger" },
          { key: "detect_bpm", short: "DBPM", full: "Detect BPM", type: "enum", options: ["idle", "trigger"], behavior: "trigger" }
        ]
      ]
    }
  ]
};

// src/modules/loader.ts
var MOVY_MODULE_ROOT = "/data/UserData/schwung/modules";
var MOVY_TOOL_ROOT = `${MOVY_MODULE_ROOT}/tools/movy`;
var OVERRIDES_MODULE_FILE = /* @__PURE__ */ new Set(["6w6", "8w8", "9w9", "cw78"]);
var CONFIGS = {
  "303": __default,
  chiptune: chiptune_default,
  chordism: chordism_default,
  essaim: essaim_default,
  hush1: hush1_default,
  signal: signal_default,
  krautdrums: krautdrums_default,
  mrdrums: mrdrums_default,
  plaits: plaits_default,
  "po32-drum": libpo32_default,
  sfz: sfz_default,
  slicer: slicer_default,
  "weird-dreams": weird_dreams_default,
  wurl: wurl_default
};
function tryFile(path) {
  try {
    const s = platform.readFile(path);
    if (s) return JSON.parse(s);
  } catch {
  }
  return null;
}
function componentCategory(componentKey2) {
  if (componentKey2 === "synth") return "sound_generators";
  if (componentKey2.startsWith("midi_fx")) return "midi_fx";
  return "audio_fx";
}
function loadModuleJson(moduleId, componentKey2 = "synth") {
  if (!moduleId) return null;
  try {
    const raw2 = platform.readFile(
      `${MOVY_MODULE_ROOT}/${componentCategory(componentKey2)}/${moduleId}/module.json`
    );
    if (raw2) return JSON.parse(raw2);
  } catch {
  }
  return null;
}
var nameCache = /* @__PURE__ */ new Map();
function moduleDisplayName(moduleId, componentKey2 = "synth") {
  let id2 = String(moduleId || "");
  if (id2.includes("/")) {
    const parts = id2.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    id2 = /\.[A-Za-z0-9]+$/.test(last) && parts.length >= 2 ? parts[parts.length - 2] : last;
  }
  if (!id2) return String(moduleId || "");
  const hit = nameCache.get(id2);
  if (hit) return hit;
  const json = loadModuleJson(id2, componentKey2);
  const name = json && json.name || id2;
  nameCache.set(id2, name);
  return name;
}
function loadModuleConfig(moduleId, componentKey2 = "synth") {
  if (!moduleId) return null;
  if (OVERRIDES_MODULE_FILE.has(moduleId)) {
    const override = tryFile(`${MOVY_TOOL_ROOT}/configs/${moduleId}.json`);
    if (override) return override;
    mlog("loadModuleConfig: no override config for " + moduleId + ", falling back to the module's own");
  }
  const bundled = CONFIGS[moduleId] ?? null;
  return tryFile(`${MOVY_MODULE_ROOT}/${componentCategory(componentKey2)}/${moduleId}/movy_config.json`) ?? bundled ?? null;
}

// src/chain/hierarchy-source.ts
function hasLevels(h) {
  const lv = h?.levels;
  return !!lv && Object.keys(lv).length > 0;
}
function levelsOf(text2) {
  if (!text2) return null;
  try {
    const h = JSON.parse(text2);
    if (hasLevels(h)) return h;
  } catch (_e) {
    mlog("hierarchy-source: contract parse error");
  }
  return null;
}
function isContractKey(k) {
  return String(k).endsWith("ui_hierarchy");
}
function createContractSource(io) {
  let manifestId = null;
  let manifestText = null;
  let manifestLevels = null;
  function memoLevels() {
    let from;
    let val = null;
    return (text2) => {
      if (text2 === from) return val;
      from = text2;
      val = levelsOf(text2);
      return val;
    };
  }
  const ownLevels = memoLevels();
  const altLevels = memoLevels();
  function fromManifest() {
    let id2 = null;
    try {
      id2 = io.moduleId();
    } catch (_e) {
      id2 = null;
    }
    if (!id2) return null;
    if (id2 === manifestId) return manifestText;
    manifestId = id2;
    manifestText = null;
    manifestLevels = null;
    try {
      const hier = loadModuleJson(id2, io.componentKey)?.capabilities?.ui_hierarchy;
      if (hasLevels(hier)) {
        manifestLevels = hier;
        manifestText = JSON.stringify(hier);
      }
    } catch (_e) {
    }
    return manifestText;
  }
  return {
    get() {
      const own = io.read("ui_hierarchy");
      const served = own === void 0 ? null : own;
      const ownLv = ownLevels(own);
      if (ownLv) return {
        text: own,
        source: "ui_hierarchy",
        served,
        pending: false,
        levels: ownLv
      };
      const alt = io.read("ui_pages");
      const altLv = altLevels(alt);
      if (altLv) return {
        text: alt,
        source: "ui_pages",
        served,
        pending: false,
        levels: altLv
      };
      const manifest = fromManifest();
      if (manifest) return {
        text: manifest,
        source: "module.json",
        served,
        pending: false,
        levels: manifestLevels
      };
      return {
        text: null,
        source: null,
        served,
        levels: null,
        pending: own === null || own === void 0
      };
    },
    /** Forget the manifest. A re-plan, or a module swap. */
    invalidate() {
      manifestId = null;
      manifestText = null;
      manifestLevels = null;
    }
  };
}
function declaredContract(io) {
  return createContractSource(io).get();
}

// src/seq/lane-value.ts
function norm7(v, min, max) {
  if (max <= min) return 0;
  return Math.max(0, Math.min(127, Math.round((v - min) / (max - min) * 127)));
}
function denorm7(n, min, max) {
  return min + n / 127 * (max - min);
}
function stepCount(e) {
  if (e.type === "enum") {
    if (e.options && e.options.length > 0) return e.options.length;
    return e.max >= e.min ? Math.round(e.max - e.min) + 1 : 0;
  }
  if ((e.type === "int" || e.type === "bool") && e.min === 0 && e.max === 1) return 2;
  return 0;
}
function binCentre(i, n) {
  const k = Math.max(0, Math.min(n - 1, Math.round(i)));
  return Math.min(127, Math.floor((2 * k + 1) * 64 / n));
}
function binOf(v, n) {
  return Math.max(0, Math.min(n - 1, Math.floor(Math.max(0, Math.min(127, v)) * n / 128)));
}
function toLane7(value2, e) {
  const n = stepCount(e);
  return n > 0 ? binCentre(value2 - e.min, n) : norm7(value2, e.min, e.max);
}
function fromLane7(v, e) {
  const n = stepCount(e);
  return n > 0 ? e.min + binOf(v, n) : denorm7(v, e.min, e.max);
}
function stepLane7(cur, delta, e) {
  const n = stepCount(e);
  if (n > 0) return binCentre(binOf(cur, n) + delta, n);
  return Math.max(0, Math.min(127, cur + delta));
}

// src/font/glyphs.ts
var CHARS4 = ` !"'()+,-./:0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ%<>=?*#&_\\^`;
var G4 = [
  [3, 0, 0, 5],
  // ' '
  [2, 0, 1, 5, 1, 1, 1, 0, 1],
  // '!'
  [4, 0, 3, 5, 5, 5, 0, 0, 0],
  // '"'
  [2, 0, 1, 5, 1, 1, 0, 0, 0],
  // "'"
  [3, 0, 2, 5, 2, 1, 1, 1, 2],
  // '('
  [3, 0, 2, 5, 1, 2, 2, 2, 1],
  // ')'
  [4, 0, 3, 5, 0, 2, 7, 2, 0],
  // '+'
  [3, 0, 2, 5, 0, 0, 0, 2, 1],
  // ','
  [4, 0, 3, 5, 0, 0, 7, 0, 0],
  // '-'
  [2, 0, 1, 5, 0, 0, 0, 0, 1],
  // '.'
  [5, 0, 4, 5, 8, 8, 6, 1, 1],
  // '/'
  [2, 0, 1, 5, 0, 1, 0, 1, 0],
  // ':'
  [5, 0, 4, 5, 6, 9, 9, 9, 6],
  // '0'
  [4, 0, 3, 5, 2, 3, 2, 2, 7],
  // '1'
  [5, 0, 4, 5, 7, 8, 6, 1, 15],
  // '2'
  [5, 0, 4, 5, 7, 8, 6, 8, 7],
  // '3'
  [5, 0, 4, 5, 9, 9, 15, 8, 8],
  // '4'
  [5, 0, 4, 5, 15, 1, 7, 8, 7],
  // '5'
  [5, 0, 4, 5, 14, 1, 7, 9, 6],
  // '6'
  [5, 0, 4, 5, 15, 8, 4, 2, 1],
  // '7'
  [5, 0, 4, 5, 6, 9, 6, 9, 6],
  // '8'
  [5, 0, 4, 5, 6, 9, 14, 8, 7],
  // '9'
  [5, 0, 4, 5, 6, 9, 15, 9, 9],
  // 'A'
  [5, 0, 4, 5, 7, 9, 7, 9, 7],
  // 'B'
  [5, 0, 4, 5, 14, 1, 1, 1, 14],
  // 'C'
  [5, 0, 4, 5, 7, 9, 9, 9, 7],
  // 'D'
  [5, 0, 4, 5, 15, 1, 7, 1, 15],
  // 'E'
  [5, 0, 4, 5, 15, 1, 7, 1, 1],
  // 'F'
  [5, 0, 4, 5, 14, 1, 13, 9, 14],
  // 'G'
  [5, 0, 4, 5, 9, 9, 15, 9, 9],
  // 'H'
  [2, 0, 1, 5, 1, 1, 1, 1, 1],
  // 'I'
  [5, 0, 4, 5, 12, 8, 8, 9, 6],
  // 'J'
  [5, 0, 4, 5, 9, 5, 3, 5, 9],
  // 'K'
  [5, 0, 4, 5, 1, 1, 1, 1, 15],
  // 'L'
  [6, 0, 5, 5, 17, 27, 21, 17, 17],
  // 'M'
  [5, 0, 4, 5, 9, 11, 13, 9, 9],
  // 'N'
  [5, 0, 4, 5, 6, 9, 9, 9, 6],
  // 'O'
  [5, 0, 4, 5, 7, 9, 7, 1, 1],
  // 'P'
  [5, 0, 4, 5, 6, 9, 9, 5, 10],
  // 'Q'
  [5, 0, 4, 5, 7, 9, 7, 5, 9],
  // 'R'
  [5, 0, 4, 5, 14, 1, 6, 8, 7],
  // 'S'
  [4, 0, 3, 5, 7, 2, 2, 2, 2],
  // 'T'
  [5, 0, 4, 5, 9, 9, 9, 9, 6],
  // 'U'
  [6, 0, 5, 5, 17, 17, 17, 10, 4],
  // 'V'
  [6, 0, 5, 5, 17, 17, 21, 21, 10],
  // 'W'
  [5, 0, 4, 5, 9, 9, 6, 9, 9],
  // 'X'
  [4, 0, 3, 5, 5, 5, 2, 2, 2],
  // 'Y'
  [5, 0, 4, 5, 15, 8, 6, 1, 15],
  // 'Z'
  [5, 0, 4, 5, 9, 8, 6, 1, 9],
  // '%'
  [4, 0, 3, 5, 4, 2, 1, 2, 4],
  // '<'
  [4, 0, 3, 5, 1, 2, 4, 2, 1],
  // '>'
  [4, 0, 3, 5, 0, 7, 0, 7, 0],
  // '='
  [5, 0, 4, 5, 7, 8, 6, 0, 2],
  // '?'
  [4, 0, 3, 5, 5, 2, 5, 0, 0],
  // '*'
  [5, 0, 4, 5, 10, 15, 10, 15, 10],
  // '#'
  [5, 0, 4, 5, 6, 9, 6, 5, 10],
  // '&'
  [5, 0, 4, 5, 0, 0, 0, 0, 15],
  // '_'
  [5, 0, 4, 5, 1, 1, 6, 8, 8],
  // '\\'
  [4, 0, 3, 5, 2, 5, 0, 0, 0]
  // '^'
];
var CHARS4_EXTRA = ";$@[]{}|~`";
var G4_EXTRA = [
  [3, 0, 2, 5, 0, 2, 0, 2, 1],
  // ';'
  [5, 0, 4, 5, 14, 5, 6, 10, 7],
  // '$'
  [5, 0, 4, 5, 6, 9, 13, 1, 14],
  // '@'
  [3, 0, 2, 5, 3, 1, 1, 1, 3],
  // '['
  [3, 0, 2, 5, 3, 2, 2, 2, 3],
  // ']'
  [4, 0, 3, 5, 6, 2, 1, 2, 6],
  // '{'
  [4, 0, 3, 5, 3, 2, 4, 2, 3],
  // '}'
  [2, 0, 1, 5, 1, 1, 1, 1, 1],
  // '|'
  [5, 0, 4, 5, 0, 6, 9, 0, 0],
  // '~'
  [3, 0, 2, 5, 1, 2, 0, 0, 0]
  // '`'
];

// src/font/blit.ts
function glyphRunWidth(str2, glyphFor4, fallbackAdv, gap) {
  let w = 0;
  for (let i = 0; i < str2.length; i++) {
    const g = glyphFor4(str2.charCodeAt(i));
    w += g ? g[0] : fallbackAdv;
    if (i < str2.length - 1) w += gap;
  }
  return w;
}
function drawGlyphRun(x, y, str2, color, glyphFor4, fallbackAdv, gap, emit) {
  const put = emit ?? ((rx, ry, rw, rh, c) => fill_rect(rx, ry, rw, rh, c));
  let cx = x;
  for (let i = 0; i < str2.length; i++) {
    const g = glyphFor4(str2.charCodeAt(i));
    if (!g) {
      cx += fallbackAdv;
      continue;
    }
    const yOff = g[1], w = g[2], h = g[3];
    for (let row = 0; row < h; row++) {
      const bits = g[4 + row];
      let col = 0;
      while (col < w) {
        if (bits & 1 << col) {
          const s = col;
          while (col < w && bits & 1 << col) col++;
          put(cx + s, y + yOff + row, col - s, 1, color);
        } else {
          col++;
        }
      }
    }
    cx += g[0];
    if (i < str2.length - 1) cx += gap;
  }
}

// src/font/index.ts
var FONT_HEIGHT = 5;
var FALLBACK_ADV = 5;
var glyphFor = (cp) => {
  const ch = String.fromCharCode(cp).toUpperCase();
  const i = CHARS4.indexOf(ch);
  if (i >= 0) return G4[i];
  const j = CHARS4_EXTRA.indexOf(ch);
  return j >= 0 ? G4_EXTRA[j] : null;
};
function fontWidth(str2) {
  const w = glyphRunWidth(str2, glyphFor, FALLBACK_ADV, 0);
  return w > 0 ? w - 1 : 0;
}
function fontPrint(x, y, str2, color) {
  drawGlyphRun(x, y, str2, color, glyphFor, FALLBACK_ADV, 0);
}

// src/renderer/layout.ts
var W = 128;
var HEADER_H = 7;
var BAR_Y = 8;
var TOAST_Y = 58;
var GRID_BODY_RECT = { x: 0, y: 10, w: W, h: 47 };
var TOAST_H = 6;

// src/renderer/overlay.ts
function drawJogToast(text2) {
  fill_rect(0, TOAST_Y, W, TOAST_H, 1);
  const tw = fontWidth(text2);
  const tx = Math.max(1, Math.floor((W - tw) / 2));
  fontPrint(tx, TOAST_Y + 1, text2, 0);
}

// src/seq/loop-strip.ts
var TICKS_PER_STEP = 24;
function playheadX(posTick, loopStartTick, lenSteps, stripW) {
  const lenTicks = Math.max(lenSteps, 16) * TICKS_PER_STEP;
  if (lenTicks <= 0) return 0;
  const x = Math.round((posTick - loopStartTick) / lenTicks * stripW);
  return Math.max(0, Math.min(x, stripW - 1));
}
var STRIP_Y = 62;
function stripWindow() {
  const from = Math.min(loopStartBar(), seqState.barOffset);
  const to = Math.max(loopEndBar(), seqState.barOffset);
  const bars = to - from + 1;
  return { fromBar: from, bars, segW: Math.max(3, Math.floor(W / bars)) };
}
function drawLoopStrip() {
  fill_rect(0, STRIP_Y - 2, W, 4, 0);
  if (seqState.lenSteps === 0) return;
  const first = loopStartBar();
  const last = loopEndBar();
  const { fromBar: from, bars: view, segW } = stripWindow();
  const to = from + view - 1;
  const single = first === last;
  for (let bar = from; bar <= to; bar++) {
    const x0 = (bar - from) * segW;
    const cx = x0 + Math.floor(segW / 2);
    if (bar >= first && bar <= last) {
      const selected = bar === seqState.barOffset;
      const thick = selected && !single;
      fill_rect(x0 + 1, thick ? STRIP_Y - 1 : STRIP_Y, segW - 2, thick ? 2 : 1, 1);
    } else {
      fill_rect(cx - 1, STRIP_Y, 3, 1, 1);
      fill_rect(cx, STRIP_Y - 1, 1, 3, 1);
    }
  }
  const px = stripPlayheadX();
  if (px >= 0) fill_rect(px, STRIP_Y - 2, 1, 4, 1);
}
function stripPlayheadX() {
  if (!seqState.playing || seqState.lenSteps === 0) return -1;
  const first = loopStartBar();
  const { fromBar, segW } = stripWindow();
  return (first - fromBar) * segW + playheadX(
    seqState.posTick,
    first * NUM_STEP_BUTTONS * TICKS_PER_STEP,
    seqState.lenSteps,
    loopBarCount() * segW
  );
}

// src/seq/render.ts
var DEFAULT_TTL = 60;
var headerText = "";
var headerTtl = 0;
function seqHeaderAnnounce(msg, ttlTicks = DEFAULT_TTL) {
  headerText = msg;
  headerTtl = ttlTicks;
}
function seqHeaderActive() {
  return headerTtl > 0;
}
function seqHeaderTick() {
  if (headerTtl > 0) headerTtl--;
}
function drawSeqHeader() {
  if (headerTtl <= 0) return;
  fill_rect(0, 0, W, 9, 1);
  fontPrint(2, 1, headerText, 0);
}
var text = "";
var ttl = 0;
var TOAST_TTL = 196;
function seqToast(msg) {
  text = msg;
  ttl = TOAST_TTL;
}
function seqToastActive() {
  return ttl > 0;
}
function seqToastTick() {
  if (ttl > 0) {
    ttl--;
    return ttl === 0;
  }
  return false;
}
function drawSeqToast() {
  if (ttl > 0) drawJogToast(text);
}
var SONG_GAP = 2;
var lastSongSig = "";
function songBandSig() {
  return seqState.songScenes.join(",") + "@" + seqState.songPos + (songTerminal() ? "!" : "");
}
function drawSongBand() {
  fill_rect(0, TOAST_Y, W, TOAST_H, 1);
  let x = 2;
  fontPrint(x, TOAST_Y + 1, "SONG", 0);
  x += fontWidth("SONG") + SONG_GAP * 2;
  const end = songTerminal();
  const endW = end ? fontWidth("END") + SONG_GAP * 2 : 0;
  const { tokens, leading } = songBandTokens(
    seqState.songScenes,
    seqState.songPos,
    W - x - 2 - endW,
    fontWidth
  );
  if (leading) {
    fontPrint(x, TOAST_Y + 1, ".", 0);
    x += fontWidth(".") + SONG_GAP;
  }
  for (const t of tokens) {
    const w = fontWidth(t.label);
    if (x + w > W - 1) break;
    if (t.current) {
      fill_rect(x - 1, TOAST_Y, w + 2, TOAST_H, 0);
      fontPrint(x, TOAST_Y + 1, t.label, 1);
    } else {
      fontPrint(x, TOAST_Y + 1, t.label, 0);
    }
    x += w + SONG_GAP;
  }
  if (end) {
    fontPrint(x + SONG_GAP, TOAST_Y + 1, "END", 0);
  }
}
function songBandTick(viewRepainted) {
  if (!songBandVisible()) {
    lastSongSig = "";
    return;
  }
  const sig = songBandSig();
  if (!viewRepainted && sig === lastSongSig) return;
  lastSongSig = sig;
  drawSongBand();
}

// src/undo/label.ts
var UNDO_TOAST_TICKS = 120;
function failBody(reason, redo) {
  if (reason === "drift") return ["UNAVAILABLE", "MODULE CHANGED"];
  if (reason === "busy") return ["BUSY", "RESTORE IN PROGRESS"];
  return [redo ? "NOTHING TO REDO" : "NOTHING TO UNDO"];
}
function undoToastVM(r, redo) {
  if (!r.ok) {
    const [verb, detail] = failBody(r.reason, redo);
    return { head: redo ? "REDO" : "UNDO", verb, detail: detail ?? "" };
  }
  const parts = [];
  if (r.target) parts.push(r.target);
  if (r.detail) parts.push(r.detail);
  return {
    head: redo ? "REDO" : "UNDO",
    verb: r.verb,
    detail: parts.join(": ")
  };
}
function trackLabel(track) {
  return "T" + (track + 1);
}
function clipTarget(track, slot) {
  return trackLabel(track) + " CLIP " + (slot + 1);
}
function noteCount(n) {
  return n + (n === 1 ? " NOTE" : " NOTES");
}
function tidyNumber(v) {
  if (!/^-?\d+\.\d+$/.test(v)) return v;
  return v.replace(/0+$/, "").replace(/\.$/, "");
}
function basename(v) {
  const parts = v.split("/").filter((p) => p !== "");
  return parts.length > 0 ? parts[parts.length - 1] : v;
}
function tidy(v) {
  if (v.indexOf("/") >= 0) return basename(v);
  return tidyNumber(v);
}
function moduleName(v) {
  if (v === "") return "NONE";
  if (v.indexOf("/") < 0) return v;
  const parts = v.split("/").filter((p) => p !== "" && !p.endsWith(".so"));
  return parts[parts.length - 1] ?? v;
}
function valueChange(from, to) {
  return tidy(from) + " -> " + tidy(to);
}
function changeDetail(e, undoing) {
  if (e.moduleOp) {
    const { oldWrite, newWrite } = e.moduleOp;
    return valueChange(
      moduleName(undoing ? newWrite : oldWrite),
      moduleName(undoing ? oldWrite : newWrite)
    );
  }
  const ops = [...e.paramOps, ...e.uiOps];
  if (ops.length === 0) return "";
  if (ops.length === 1) {
    const o = ops[0];
    return valueChange(undoing ? o.new : o.old, undoing ? o.old : o.new);
  }
  return ops.length + " VALUES";
}

// src/renderer/schwung-canvas.ts
var MODULES_ROOT = "/data/UserData/schwung/modules";
var SEARCH_DIRS = [
  "",
  "sound_generators/",
  "audio_fx/",
  "midi_fx/",
  "utilities/",
  "tools/",
  "other/"
];
var DEFAULT_CANVAS = "canvas.js";
var GUARDED = [
  "init",
  "tick",
  "onMidiMessageInternal",
  "onMidiMessageExternal",
  "canvas_overlay",
  "canvas_overlays"
];
function readFile2(path) {
  try {
    return platform.readFile(path);
  } catch (_e) {
    return null;
  }
}
function getPath(root, path) {
  let cur = root;
  for (const part of path.split(".")) {
    if (!cur || typeof cur !== "object" && typeof cur !== "function") return void 0;
    cur = cur[part];
  }
  return cur;
}
function overlayFor(ref) {
  const cands = [];
  if (ref) {
    cands.push(getPath(globalThis, ref));
    cands.push(globalThis[ref]);
    cands.push(getPath(globalThis.canvas_overlays, ref));
  }
  cands.push(globalThis.canvas_overlay);
  for (let c of cands) {
    if (typeof c === "function") {
      try {
        c = c();
      } catch (_e) {
        c = null;
      }
    }
    if (c && typeof c === "object") return c;
  }
  return null;
}
function loadOverlay(path, ref) {
  return guardedEval(path, [], () => overlayFor((ref || "").trim()));
}
function loadExport(path, name) {
  return guardedEval(path, [name], () => {
    const fn = globalThis[name];
    return typeof fn === "function" ? fn : null;
  });
}
function guardedEval(path, extra, pick) {
  const names = GUARDED.concat(extra);
  const saved = {};
  const had = {};
  for (const k of names) {
    had[k] = Object.prototype.hasOwnProperty.call(globalThis, k);
    saved[k] = globalThis[k];
  }
  let out2 = null;
  try {
    if (platform.loadUiModule(path)) out2 = pick();
  } catch (_e) {
    out2 = null;
  } finally {
    for (const k of names) {
      if (had[k]) globalThis[k] = saved[k];
      else delete globalThis[k];
    }
  }
  return out2;
}
function splitSpec(value2) {
  const raw2 = value2.trim();
  const hash = raw2.indexOf("#");
  if (hash < 0) return { file: raw2, ref: "" };
  return {
    file: raw2.slice(0, hash).trim() || DEFAULT_CANVAS,
    ref: raw2.slice(hash + 1).trim()
  };
}
function scriptOf(meta) {
  const raw2 = (meta && meta.capabilities && meta.capabilities.canvas_script) ?? (meta && meta.canvas_script);
  return typeof raw2 === "string" && raw2.trim() ? raw2.trim() : DEFAULT_CANVAS;
}
function findOverlay(moduleId) {
  const m = moduleDir(moduleId);
  if (!m) return null;
  const spec = splitSpec(scriptOf(m.meta));
  return loadOverlay(joinPath(m.dir, spec.file), spec.ref);
}
function moduleFilePath(moduleId, file) {
  if (file.startsWith("/")) return file;
  const m = moduleDir(moduleId);
  return m ? joinPath(m.dir, file) : null;
}
function joinPath(dir, file) {
  return file.startsWith("/") ? file : `${dir}/${file}`;
}
function moduleDir(moduleId) {
  if (!moduleId) return null;
  for (const sub of SEARCH_DIRS) {
    const dir = `${MODULES_ROOT}/${sub}${moduleId}`;
    const raw2 = readFile2(`${dir}/module.json`);
    if (!raw2) continue;
    let meta = null;
    try {
      meta = JSON.parse(raw2);
    } catch (_e) {
      meta = null;
    }
    return { dir, meta };
  }
  return null;
}

// src/renderer/schwung-canvas-page.ts
var SCREEN_H = 64;
var overlays = /* @__PURE__ */ new Map();
var disabled = /* @__PURE__ */ new Set();
var states = /* @__PURE__ */ new Map();
var MISS_LIMIT = 3;
function createCanvasPageIo(moduleId, owner2, read, write2) {
  const resolved = /* @__PURE__ */ new WeakMap();
  function cacheKey2(canvas) {
    if (!canvas || !canvas.script) return null;
    let r = resolved.get(canvas);
    if (!r) resolved.set(canvas, r = { path: null, misses: 0 });
    if (r.path === null && r.misses < MISS_LIMIT) {
      r.path = moduleFilePath(moduleId(), canvas.script);
      if (r.path === null) r.misses++;
    }
    return r.path === null ? null : `${r.path}|${canvas.overlay || ""}`;
  }
  function overlay(key) {
    if (disabled.has(key)) return null;
    if (!overlays.has(key)) {
      const bar = key.lastIndexOf("|");
      overlays.set(key, loadOverlay(key.slice(0, bar), key.slice(bar + 1)) || null);
    }
    return overlays.get(key);
  }
  function stateOf(key) {
    const k = `${owner2}|${key}`;
    let st = states.get(k);
    if (!st) states.set(k, st = {});
    return st;
  }
  function drawCanvasPage(drawCtx, band, canvas, payload) {
    const key = cacheKey2(canvas);
    const ov = key ? overlay(key) : null;
    if (!key || !ov || typeof ov.drawPage !== "function") return;
    const lib3 = schwungLib();
    if (typeof lib3.frameCtx !== "function") return;
    const p = payload || {};
    try {
      ov.drawPage(lib3.frameCtx(drawCtx, band), {
        key: canvas.key,
        values: p.values || {},
        base: p.base || {},
        keys: p.keys || [],
        touched: typeof p.touched === "number" ? p.touched : -1,
        preset: p.preset || null,
        nowMs: typeof p.nowMs === "number" ? p.nowMs : Date.now(),
        width: band.w,
        height: band.h,
        state: stateOf(key)
      });
    } catch (_e) {
      disabled.add(key);
    }
  }
  function canvasPageHook(canvas, hook2, payload) {
    const key = cacheKey2(canvas);
    const ov = key ? overlay(key) : null;
    if (!key || !ov || typeof ov[hook2] !== "function") return void 0;
    let closed = false;
    const ctx = {
      width: W,
      height: SCREEN_H,
      state: stateOf(key),
      getParam: (k) => read(String(k)),
      setParam: (k, v) => {
        write2(String(k), String(v));
        return true;
      },
      getValue: () => canvas.key ? read(canvas.key) || "" : "",
      setValue: (v) => {
        if (!canvas.key) return false;
        write2(canvas.key, String(v));
        return true;
      },
      measureText: (t) => fontWidth(String(t == null ? "" : t)),
      shiftHeld: () => appState.shiftHeld,
      now: () => Date.now(),
      random: () => Math.random(),
      close: () => {
        closed = true;
        return true;
      }
    };
    try {
      const r = ov[hook2](ctx, payload || {});
      return closed ? { close: true } : r;
    } catch (_e) {
      disabled.add(key);
      return void 0;
    }
  }
  function loadCard(scriptPath, exportRef) {
    if (!scriptPath || !exportRef) return null;
    const path = moduleFilePath(moduleId(), scriptPath);
    return path ? loadExport(path, exportRef) : null;
  }
  return { drawCanvasPage, canvasPageHook, loadCard };
}

// src/chain/set-param.ts
function setChainParam(port, key, value2, oldVal) {
  if (oldVal !== null && oldVal !== value2) recordParamOp(port.track.index, key, oldVal, value2);
  return port.setParam(key, value2);
}
function setChainParamUntracked(port, key, value2) {
  return port.setParam(key, value2);
}

// src/renderer/schwung-page-io.ts
function pageWriter(port, readOld) {
  const track = port.track;
  if (!track) return (key, v) => port.setParam(key, v);
  return (key, v) => {
    const field = key.slice(key.lastIndexOf(":") + 1).toUpperCase();
    beginGesture(
      "knob:" + track.index + ":" + key,
      field,
      isMasterComponent(key) ? "MASTER" : "T" + (track.index + 1),
      false
    );
    const ok = setChainParam(port, key, v, readOld(key));
    mlog("set slot=" + track.index + " key=" + key + " val=" + v + " set_param returned " + ok);
    return ok;
  };
}
function createPageIo(port, qualify2, cache2, hierarchy, componentKey2, modulatedKeys, automation = null, focus = null) {
  const io = (k) => focus ? focus.ioKey(qualify2(k)) : qualify2(k);
  const read = (k) => cache2.get(io(k));
  const write2 = pageWriter(port, (full) => cache2.get(full));
  const prefix = componentKey2 + ":";
  const isModulated = (k) => {
    const full = String(k);
    const keys = modulatedKeys ? modulatedKeys() : null;
    if (!keys) return false;
    return keys.has(full.startsWith(prefix) ? full.slice(prefix.length) : full);
  };
  const SUF_BASE = ":base", SUF_EFF = ":effective";
  const decorated = (k) => {
    const auto = automation ? automation() : null;
    if (!auto) return null;
    if (k.endsWith(SUF_BASE)) {
      const bare = k.slice(0, -SUF_BASE.length);
      const b = auto.baseOf(qualify2(bare));
      return b === null ? null : String(b);
    }
    if (k.endsWith(SUF_EFF)) {
      const bare = k.slice(0, -SUF_EFF.length);
      return auto.isAutomated(qualify2(bare)) ? read(bare) : null;
    }
    return null;
  };
  const canvas = createCanvasPageIo(
    () => String(cache2.get(moduleReadKey(componentKey2)) || ""),
    `${port?.track?.index ?? "?"}:${componentKey2}`,
    read,
    (k, v) => write2(qualify2(k), v)
  );
  return {
    ...canvas,
    /* A virtual component's custom page has no module script: the source
     * draws it (`schwung-virtual-canvas.ts`). */
    ...port.drawCanvasPage ? { drawCanvasPage: port.drawCanvasPage } : {},
    /*
     * `ui_hierarchy` IS ANSWERED BY schwung-page-hierarchy, not read here.
     * The module's own word comes from `chain/hierarchy-source` — its own
     * contract, then `ui_pages` for a module that ships its own chain
     * editor, then `module.json` — and movy's config translated (SP-14) is
     * the page's own last rung for a rack that published none of the three.
     * One ladder, because `focusVoice` climbs the same one and two readers
     * of one contract is precisely how a pad press ended up with no page to
     * jump to.
     */
    getParam: (k) => {
      if (isContractKey(k)) return hierarchy.raw();
      const f = focus ? focus.answer(k) : void 0;
      if (f !== void 0) return f;
      const d = decorated(String(k));
      return d === null ? read(k) : d;
    },
    /* A TURN UNDER THIS PAGE IS AN EDIT OF THE BASE, so the record of the
     * base moves with it — otherwise the next `:base` read snaps the
     * pointer back to what the user set before this turn. The engine hears
     * the same number on the release (`abaseq`, seq/automation.ts); this is
     * the half that keeps the SCREEN honest in between. */
    setParam: (k, v) => {
      const auto = automation ? automation() : null;
      if (auto) {
        const n = parseFloat(v);
        if (!isNaN(n)) auto.noteBase(qualify2(k), n);
      }
      if (focus) focus.wrote(k, v);
      write2(io(k), v);
    },
    /* THE THREE MARKS ON A CELL, and which channel each one rides.
     *
     * `isModulated` is the wave-mark tilde — "something is MOVING this",
     * which movy reads from its own LFO routing. The mod dot is not asked
     * for here: the controller follows it by reading `<key>:effective` on a
     * bounded lane and handing the values to the renderer, so it arrives for
     * free once this channel answers. `locked` is a different channel again
     * — `setDecorations`, driven by the automation view — which is the whole
     * reason a tilde and a lock can be told apart at all; under `page` with
     * no `isModulated` both collapsed to the lock mark. */
    isModulated,
    /*
     * NO SCHWUNG STEP IS EVER HELD UNDER A MOVY PAGE, whatever the finger
     * is doing.
     *
     * Left unanswered, the controller asks the shim
     * (`shadow_get_held_step`), which reports the PHYSICAL step button —
     * and with one down it turns every write into Schwung's own p-lock
     * (`lanes:plock_step …`) and draws Schwung's lanes as the cell's
     * locks. A held step is movy's gesture: movy's engine records the
     * lock (seq/automation.ts) and the step page edits the trig itself.
     * Under the shim's answer the step page's every turn went to
     * `lanes:plock_step`, which no movy source owns, and was dropped —
     * touches worked, turns did nothing. The device harness could not see
     * it: an injected step press never reaches the shim's held mask.
     */
    heldStep: () => -1,
    /* SU-8 (SP-59, Schwung #541): the lane's own channel — the 2x2 beside
     * the label and the same `:base`/`:effective` motion an LFO gets,
     * without the LFO's tilde. Asked on the controller's rotation stop,
     * never per draw — a lane-registry scan of eight. */
    isAutomated: (k) => {
      const auto = automation ? automation() : null;
      return !!auto && auto.isAutomated(qualify2(String(k)));
    },
    /* SU-17 (Schwung #543): the source knows which of its cells already
     * show the whole option, so the panel would cover a legible answer
     * with the same answer. It can only decline; null leaves Schwung's
     * own rules to decide, which is what every real module's port gets. */
    allowEnumPeek: port.peekSuppressed ? (fullKey) => port.peekSuppressed(fullKey) ? false : null : void 0,
    /* movy has its own screen-reader path; nothing to say from here yet. */
    announce: () => {
    },
    /* Both undefined for a real module's port today, unchanged — only a
     * source that declares them (SP-53's virtual components) supplies
     * anything here. Passed straight through: the SOURCE decides what a
     * key looks like, this file only wires the hook up. */
    vizOverrides: port.vizOverrides ? (k) => port.vizOverrides(k) : void 0,
    formatValue: port.formatValue ? (fullKey, raw2, surface) => port.formatValue(fullKey, raw2, surface) : void 0
  };
}

// src/renderer/schwung-page-batch.ts
var KEEP_EPOCHS = 2;
var BATCH_MAX_KEYS = 48;
var BATCH_VALUE_MAX = 16384;
function batchKeys(entries, epoch) {
  const live3 = [];
  const keys = [];
  for (const [k, e] of entries) {
    if (epoch - e.asked > KEEP_EPOCHS) {
      entries.delete(k);
      continue;
    }
    if (e.len > BATCH_VALUE_MAX) continue;
    live3.push(e);
    keys.push(k);
  }
  if (keys.length <= BATCH_MAX_KEYS) return keys;
  const order = keys.map((k, i) => [k, live3[i].asked]).sort((a, b) => b[1] - a[1]);
  return order.slice(0, BATCH_MAX_KEYS).map(([k]) => k);
}
function fill(port, entries, epoch, prefetch = null) {
  const keys = batchKeys(entries, epoch);
  const extra = prefetch ? prefetch.take(BATCH_MAX_KEYS - keys.length, new Set(keys)) : [];
  if (keys.length === 0 && extra.length === 0) return;
  const values = apply(port, entries, epoch, keys, extra);
  for (let i = 0; i < extra.length; i++) {
    const v = values[keys.length + i];
    if (typeof v === "string" && v !== "") prefetch.store(extra[i], v, epoch);
  }
}
function warm(port, entries, epoch, keys) {
  const ask = [];
  for (const k of keys) {
    if (!k) continue;
    const e = entries.get(k);
    if (e && e.epoch === epoch) {
      e.asked = epoch;
      continue;
    }
    ask.push(k);
  }
  if (ask.length === 0) return;
  apply(port, entries, epoch, ask.slice(0, BATCH_MAX_KEYS));
}
function apply(port, entries, epoch, keys, extra = []) {
  const values = port.getMany(extra.length ? keys.concat(extra) : keys);
  for (let i = 0; i < keys.length; i++) {
    const v = values[i];
    if (v === null || v === void 0) {
      const e0 = entries.get(keys[i]);
      if (e0 && e0.value === "") e0.epoch = epoch;
      continue;
    }
    const e = entries.get(keys[i]);
    if (!e) {
      entries.set(keys[i], { value: v, epoch, asked: epoch, len: v.length });
      continue;
    }
    e.value = v;
    e.epoch = epoch;
    e.len = v.length;
  }
  return values;
}

// src/renderer/schwung-page-prefetch.ts
var MAX_AGE_EPOCHS = 48;
function createPrefetch() {
  let keys = [];
  let cursor = 0;
  const got = /* @__PURE__ */ new Map();
  return {
    want(k) {
      if (k === keys) return;
      keys = k;
      cursor = 0;
      const keep = new Set(k);
      for (const key of [...got.keys()]) if (!keep.has(key)) got.delete(key);
    },
    take(room, skip) {
      const out2 = [];
      for (let n = 0; n < keys.length && out2.length < room; n++) {
        const k = keys[cursor];
        cursor = (cursor + 1) % keys.length;
        if (!skip.has(k)) out2.push(k);
      }
      return out2;
    },
    store(key, value2, epoch) {
      got.set(key, { value: value2, epoch });
    },
    get(key, epoch) {
      const e = got.get(key);
      return e && epoch - e.epoch <= MAX_AGE_EPOCHS ? e.value : void 0;
    },
    drop(key) {
      got.delete(key);
    },
    clear() {
      got.clear();
    }
  };
}

// src/renderer/schwung-page-cache.ts
var FILL_TICKS = 8;
function passthrough(port) {
  return { get: (k) => port.getParam(k), tick() {
  }, warm() {
  }, invalidateAll() {
  }, prefetch() {
  } };
}
function createPageReadCache(port) {
  if (!port.bulkReads || typeof port.getMany !== "function") return passthrough(port);
  const trackPort = port;
  const entries = /* @__PURE__ */ new Map();
  const bg = createPrefetch();
  let epoch = 1;
  let sinceFill = 0;
  let seenWrites = typeof port.writeSeq === "function" ? port.writeSeq() : 0;
  function drainWrites() {
    if (typeof port.writeSeq !== "function" || typeof port.writesSince !== "function") return;
    const seq = port.writeSeq();
    if (seq === seenWrites) return;
    const keys = port.writesSince(seenWrites);
    seenWrites = seq;
    if (keys === null) {
      entries.clear();
      bg.clear();
      return;
    }
    for (const k of keys) invalidate(k);
  }
  function invalidate(key) {
    if (key.endsWith(":module")) {
      entries.clear();
      bg.clear();
      return;
    }
    entries.delete(key);
    bg.drop(key);
    const prefix = key + ":";
    for (const k of entries.keys()) if (k.startsWith(prefix)) entries.delete(k);
  }
  function adopt(key) {
    const v = bg.get(key, epoch);
    if (v === void 0) return void 0;
    entries.set(key, { value: v, epoch, asked: epoch, len: v.length });
    return v;
  }
  return {
    get(key) {
      drainWrites();
      let e = entries.get(key);
      if (e && e.epoch === epoch) {
        e.asked = epoch;
        return e.value;
      }
      const pre = adopt(key);
      if (pre !== void 0) return pre;
      const v = port.getParam(key);
      if (v === null) {
        entries.delete(key);
        return v;
      }
      if (!e) {
        e = { value: v, epoch, asked: epoch, len: v.length };
        entries.set(key, e);
      } else {
        e.value = v;
        e.epoch = epoch;
        e.asked = epoch;
        e.len = v.length;
      }
      return v;
    },
    tick() {
      drainWrites();
      if (++sinceFill < FILL_TICKS) return;
      sinceFill = 0;
      epoch++;
      fill(trackPort, entries, epoch, bg);
    },
    warm(keys) {
      drainWrites();
      const ask = keys.filter((k) => entries.get(k)?.epoch === epoch || adopt(k) === void 0);
      warm(trackPort, entries, epoch, ask);
    },
    invalidateAll() {
      entries.clear();
      bg.clear();
    },
    prefetch: (keys) => bg.want(keys)
  };
}

// src/model/page-rotation.ts
function voiceRunLength(pads) {
  let n = 0;
  while (n < pads.length && pads[n] !== void 0) n++;
  return n;
}

// src/model/config-viz.ts
var ENV_ROLE = { a: "attack", d: "decay", s: "sustain", r: "release" };
var LFO_ROLES = /* @__PURE__ */ new Set(["shape", "rate", "depth", "phase"]);
function vizOf(slot, group) {
  if (slot.env === false) return false;
  if (slot.env && ENV_ROLE[slot.env]) return { group: group + ":env", role: ENV_ROLE[slot.env], kind: "envelope" };
  if (slot.filter) return { group: group + ":filter", role: slot.filter, kind: "filter" };
  if (slot.lfo && LFO_ROLES.has(slot.lfo)) return { group: group + ":lfo", role: slot.lfo, kind: "lfo" };
  if (slot.render === "vbar" || slot.render === "hbar") return { kind: "fader" };
  return void 0;
}
var ROW_WIDTH = 4;
function settleSpans(params) {
  const groups = /* @__PURE__ */ new Map();
  params.forEach((p, i) => {
    const g = p && p.viz && p.viz.group;
    if (g) (groups.get(g) || groups.set(g, []).get(g)).push(i);
  });
  for (const slots of groups.values()) {
    const first = slots[0];
    let end = first;
    while (slots.includes(end + 1) && Math.floor((end + 1) / ROW_WIDTH) === Math.floor(first / ROW_WIDTH)) end++;
    for (const s of slots) if (s > end) params[s].viz = { ...params[s].viz, span: false };
  }
}

// src/model/config-hierarchy.ts
function slug(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "bank";
}
function slotsOf(bank) {
  const out2 = [];
  (bank.rows || []).forEach((row, r) => {
    for (const slot of row || []) if (slot && slot.key) out2.push({ slot, row: r });
  });
  return out2;
}
function paramOf(slot, group) {
  const p = { key: slot.key, type: slot.type };
  const label2 = slot.full || slot.short;
  if (label2) p.label = label2;
  if (slot.options) p.options = slot.options;
  if (slot.min !== void 0) p.min = slot.min;
  if (slot.max !== void 0) p.max = slot.max;
  if (slot.step !== void 0) p.step = slot.step;
  if (slot.uiType) p.ui_type = slot.uiType;
  if (slot.filepathParam) p.filepath_param = slot.filepathParam;
  if (slot.fileRoot) p.root = slot.fileRoot;
  if (slot.fileFilter) p.filter = slot.fileFilter;
  if (slot.fileStartPath) p.start_path = slot.fileStartPath;
  const viz = vizOf(slot, group);
  if (viz !== void 0) p.viz = viz;
  return p;
}
function isPadScopedRack(cfg) {
  const d = cfg.drum;
  return !!d && !d.rawMidi && !!(d.padScoping || d.currentPadParam);
}
function hierarchyFromConfig(cfg) {
  const banks = cfg && cfg.banks;
  if (!banks || !banks.length) return null;
  const voiceCount = voiceRunLength(banks.map((b) => b.pad));
  if (voiceCount === 0) return isPadScopedRack(cfg) ? padScopedHierarchy(cfg, banks) : null;
  const start2 = cfg.drum && cfg.drum.padNoteStart;
  if (!Number.isFinite(start2)) return null;
  const levels2 = levelsOf2(cfg, banks, (bank, i) => i < voiceCount ? start2 + bank.pad - 1 : void 0);
  return { pad_layout: "drums", levels: levels2 };
}
function levelOf(bank) {
  const slots = slotsOf(bank);
  const level = {
    name: bank.name,
    params: slots.map((x) => paramOf(x.slot, bank.name + ":" + x.row)),
    knobs: slots.map((x) => x.slot.key)
  };
  settleSpans(level.params);
  if (bank.padSpecific) level[PAD_SCOPED_FIELD] = true;
  return level;
}
var PAD_SCOPED_FIELD = "movy_pad_scoped";
function rootOf(cfg, nav) {
  return { name: cfg.name || cfg.id || "Module", params: nav, knobs: [] };
}
function padScopedHierarchy(cfg, banks) {
  return { levels: levelsOf2(cfg, banks, () => void 0) };
}
function levelsOf2(cfg, banks, noteOf) {
  const levels2 = {};
  const nav = [];
  const taken = /* @__PURE__ */ new Set(["root"]);
  banks.forEach((bank, i) => {
    let key = slug(bank.name);
    while (taken.has(key)) key += "_";
    taken.add(key);
    const level = levelOf(bank);
    const note = noteOf(bank, i);
    if (note !== void 0) level.note = note;
    levels2[key] = level;
    nav.push({ label: bank.name, level: key });
  });
  levels2.root = rootOf(cfg, nav);
  return levels2;
}

// src/model/modern-rack.ts
function declaresModernRack(h) {
  if (!h || typeof h !== "object") return false;
  if (h.pad_layout === "drums") return true;
  for (const lvl of Object.values(h.levels || {})) {
    if (!lvl || typeof lvl !== "object") continue;
    if (lvl.child_prefix) return true;
    if (typeof lvl.child_key_template === "string" && lvl.child_key_template.indexOf("{index}") >= 0) return true;
  }
  return false;
}

// src/renderer/schwung-page-hierarchy.ts
var ID_MISS_LIMIT = 3;
function createPageHierarchy(port, qualify2, cache2, componentKey2) {
  const read = (k) => cache2.get(qualify2(k));
  const moduleId = () => {
    try {
      return cache2.get(moduleReadKey(componentKey2));
    } catch (_e) {
      return null;
    }
  };
  const declared = createContractSource({ read, moduleId, componentKey: componentKey2 });
  let synthId = null;
  let synthText = null;
  let parsedFrom = null;
  let parsedVal = null;
  function translated() {
    const id2 = moduleId();
    if (!id2) return null;
    if (id2 === synthId) return synthText;
    synthId = id2;
    synthText = null;
    try {
      const h = hierarchyFromConfig(loadModuleConfig(id2, componentKey2));
      if (h) synthText = JSON.stringify(h);
    } catch (_e) {
    }
    return synthText;
  }
  let lastRaw = null;
  function raw2() {
    const r = readRaw();
    if (r) lastRaw = r;
    return r;
  }
  function parse(s) {
    if (!s) {
      parsedFrom = null;
      parsedVal = null;
      return null;
    }
    if (s === parsedFrom) return parsedVal;
    parsedFrom = s;
    try {
      parsedVal = JSON.parse(s);
    } catch (_e) {
      parsedVal = null;
    }
    return parsedVal;
  }
  let verdictFrom = null;
  let verdictVal = null;
  let idMisses = 0;
  function latch(text2, val) {
    verdictFrom = text2;
    verdictVal = val;
    idMisses = 0;
    return val;
  }
  function overDeclared(text2, levels2) {
    if (text2 === verdictFrom) return verdictVal;
    if (declaresModernRack(levels2)) return latch(text2, text2);
    if (!moduleId()) return ++idMisses >= ID_MISS_LIMIT ? latch(text2, text2) : text2;
    return latch(text2, translated() ?? text2);
  }
  function readRaw() {
    const d = declared.get();
    if (d.text) return overDeclared(d.text, d.levels);
    if (d.pending) return null;
    return translated() ?? d.served;
  }
  return {
    raw: raw2,
    parsed: () => parse(raw2()),
    peek: () => parse(lastRaw),
    padScopedLevel(level) {
      const h = level ? parse(lastRaw) : null;
      return !!(h && h.levels && h.levels[level] && h.levels[level][PAD_SCOPED_FIELD]);
    },
    invalidate() {
      synthId = null;
      synthText = null;
      parsedFrom = null;
      parsedVal = null;
      lastRaw = null;
      verdictFrom = null;
      verdictVal = null;
      idMisses = 0;
      declared.invalidate();
    }
  };
}

// src/app/perf-probe.ts
var SAMPLE_TICKS = 120;
var counts = {};
var ticks = 0;
var callsTick = 0;
var maxCalls = 0;
var installed = false;
function label(kind, key) {
  if (key === void 0) return kind;
  const k = typeof key === "string" ? key : String(key);
  const colon = k.indexOf(":");
  if (colon > 0) return kind + " " + k.slice(0, colon) + ":*";
  return kind + " " + k.replace(/[0-9]+/g, "N");
}
var TRACE_LABEL = "";
var tracedThisWindow = false;
function record(name, ms) {
  const b = counts[name] ?? (counts[name] = { n: 0, ms: 0 });
  b.n++;
  b.ms += ms;
  callsTick++;
  if (TRACE_LABEL && !tracedThisWindow && name.indexOf(TRACE_LABEL) >= 0) {
    tracedThisWindow = true;
    const st = new Error().stack ?? "(no stack)";
    mlog("perf_who " + name + " <- " + st.replace(/\n/g, " | ").slice(0, 400));
  }
}
var SINK = "__movyPerfSink";
function sink(name, ms) {
  const f = globalThis[SINK];
  if (typeof f === "function") f(name, ms);
}
function wrap(fnName, kind, keyArg) {
  const g = globalThis;
  const cur = g[fnName];
  if (typeof cur !== "function") return;
  const fn = cur._movyProbe ? cur._movyOrig ?? cur : cur;
  const wrapped = function(...args) {
    const t0 = Date.now();
    const r = fn.apply(null, args);
    sink(label(kind, keyArg >= 0 ? args[keyArg] : void 0), Date.now() - t0);
    return r;
  };
  wrapped._movyProbe = true;
  wrapped._movyOrig = fn;
  g[fnName] = wrapped;
}
function installPerfProbe() {
  globalThis[SINK] = record;
  if (installed) return;
  installed = true;
  for (const [name, kind, keyArg] of platform.ipcCalls) wrap(name, kind, keyArg);
}
var phases = {};
var phaseStart = 0;
var phaseName = "";
function perfPhase(name) {
  const now2 = Date.now();
  if (phaseName !== "") phases[phaseName] = (phases[phaseName] ?? 0) + (now2 - phaseStart);
  phaseName = name;
  phaseStart = now2;
}
function perfPhaseEnd() {
  if (phaseName === "") return;
  phases[phaseName] = (phases[phaseName] ?? 0) + (Date.now() - phaseStart);
  phaseName = "";
}
var tickStart = 0;
var inTickMs = 0;
var periodMs = 0;
var lastEntry = 0;
var maxPeriod = 0;
function perfProbeEnter() {
  tickStart = Date.now();
  if (lastEntry > 0) {
    const p = tickStart - lastEntry;
    periodMs += p;
    if (p > maxPeriod) maxPeriod = p;
  }
  lastEntry = tickStart;
}
function perfProbeTick() {
  inTickMs += Date.now() - tickStart;
  if (callsTick > maxCalls) maxCalls = callsTick;
  callsTick = 0;
  if (++ticks < SAMPLE_TICKS) return;
  const names = Object.keys(counts);
  let total = 0, totalMs = 0;
  for (const n of names) {
    total += counts[n].n;
    totalMs += counts[n].ms;
  }
  names.sort((a, b) => counts[b].ms - counts[a].ms);
  let line = "";
  for (let i = 0; i < names.length && i < 6; i++) {
    const b = counts[names[i]];
    line += " | " + names[i] + " n=" + (b.n / ticks).toFixed(1) + " ms=" + (b.ms / ticks).toFixed(1);
  }
  const pnames = Object.keys(phases).sort((a, b) => phases[b] - phases[a]);
  let pline = "";
  for (let i = 0; i < pnames.length && i < 6; i++) {
    pline += " " + pnames[i] + "=" + (phases[pnames[i]] / ticks).toFixed(1);
    delete phases[pnames[i]];
  }
  for (const k of Object.keys(phases)) delete phases[k];
  if (pline) mlog("perf_phase" + pline);
  mlog("perf_ipc calls/tick=" + (total / ticks).toFixed(1) + " peak=" + maxCalls + " ipc_ms=" + (totalMs / ticks).toFixed(1) + " tick_ms=" + (inTickMs / ticks).toFixed(1) + " period_ms=" + (periodMs / ticks).toFixed(1) + " peak_period=" + maxPeriod + line);
  counts = {};
  tracedThisWindow = false;
  ticks = 0;
  maxCalls = 0;
  inTickMs = 0;
  periodMs = 0;
  maxPeriod = 0;
}

// src/renderer/schwung-widgets.ts
function registerWidget2(kind, impl) {
  try {
    schwungLib().registerWidget(kind, impl);
  } catch (_e) {
  }
}
function libClear() {
  try {
    schwungLib().clearWidgets();
  } catch (_e) {
  }
}
function clearWidgets2() {
  owned.clear();
  libClear();
}
function isWidgetAvailable2(kind) {
  try {
    return !!schwungLib().isWidgetAvailable(kind);
  } catch (_e) {
    return false;
  }
}
var owned = /* @__PURE__ */ new Map();
function replayRegistry() {
  libClear();
  for (const [kind, w] of owned) registerWidget2(kind, { draw: w.draw, nominal: w.nominal });
}
function setOwnerWidgets(owner2, widgets) {
  for (const [kind, w] of owned) if (w.owner === owner2) owned.delete(kind);
  for (const w of widgets) owned.set(w.kind, { owner: owner2, draw: w.draw, nominal: w.nominal });
  replayRegistry();
}
function declaresCustomWidget(chainParams) {
  if (!Array.isArray(chainParams)) return false;
  return chainParams.some((p) => {
    const k = p && p.viz && p.viz.kind;
    return typeof k === "string" && k.startsWith("custom:");
  });
}
function overlayWidgets(ov) {
  const out2 = [];
  if (!ov || typeof ov !== "object") return out2;
  const fallback = typeof ov.drawCell === "function" ? ov.drawCell.bind(ov) : null;
  const nominal = ov.widgetNominal || null;
  const add = (kind, draw, nom) => {
    if (typeof kind !== "string" || !kind.startsWith("custom:")) return;
    if (typeof draw !== "function") return;
    out2.push({ kind, draw, nominal: nom || nominal });
  };
  if (typeof ov.widgetKind === "string") add(ov.widgetKind, fallback, nominal);
  const many = ov.widgetKinds;
  if (Array.isArray(many)) {
    for (const k of many) add(k, fallback, nominal);
  } else if (many && typeof many === "object") {
    for (const k of Object.keys(many)) {
      const e = many[k];
      if (typeof e === "function") add(k, e.bind(ov), nominal);
      else if (e && typeof e === "object") {
        const d = typeof e.draw === "function" ? e.draw : typeof e.drawCell === "function" ? e.drawCell : null;
        add(k, d ? d.bind(ov) : null, e.nominal || e.widgetNominal);
      }
    }
  }
  return out2;
}
function registerModuleWidgets(owner2, readId, chainParams) {
  if (!Array.isArray(chainParams) || chainParams.length === 0) return false;
  if (!declaresCustomWidget(chainParams)) {
    setOwnerWidgets(owner2, []);
    return true;
  }
  const moduleId = readId();
  if (!moduleId) return false;
  setOwnerWidgets(owner2, []);
  const ov = findOverlay(moduleId);
  if (!ov) {
    mlog(`widgets: ${moduleId} declares a custom kind but its canvas.js did not load`);
    return false;
  }
  const kinds = overlayWidgets(ov);
  setOwnerWidgets(owner2, kinds);
  mlog(kinds.length ? `widgets: ${moduleId} registered ${kinds.map((w) => w.kind).join(", ")}` : `widgets: ${moduleId} declares a custom kind but its canvas.js draws none`);
  return true;
}

// src/renderer/schwung-page-widget-sync.ts
var WIDGET_TRIES = 3;
function createWidgetSync(ctl, port, componentKey2) {
  let widgetDone = false;
  let widgetTries = 0;
  const owner2 = `${port?.track?.index ?? "?"}:${componentKey2}`;
  function moduleId() {
    try {
      return String(port.getParam(moduleReadKey(componentKey2)) || "");
    } catch (_e) {
      return "";
    }
  }
  function sync() {
    if (widgetDone) return;
    const params = ctl.state && ctl.state.chainParams;
    if (!Array.isArray(params) || params.length === 0) return;
    if (registerModuleWidgets(owner2, moduleId, params)) {
      widgetTries = 0;
      widgetDone = true;
      return;
    }
    widgetDone = ++widgetTries >= WIDGET_TRIES;
  }
  function afterReplan(adopted) {
    if (adopted) {
      widgetTries = 0;
      widgetDone = false;
    }
    if (adopted || !widgetDone) sync();
  }
  return { sync, afterReplan };
}

// src/renderer/schwung-page-visible.ts
function asBool(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v === null || v === void 0) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}
function same(actual, expected) {
  if (typeof expected === "boolean") return asBool(actual) === expected;
  if (typeof expected === "number") {
    const n = Number(actual);
    return Number.isFinite(n) && n === expected;
  }
  return actual === String(expected);
}
function threshold(c, ...names) {
  for (const n of names) if (c[n] !== void 0) {
    const t = Number(c[n]);
    return Number.isFinite(t) ? t : NaN;
  }
  return null;
}
function conditionHoldsFor(c, raw2) {
  if (c.equals !== void 0) return same(raw2, c.equals);
  if (c.not_equals !== void 0) return !same(raw2, c.not_equals);
  const num2 = Number(raw2);
  const gt = threshold(c, "gt", "greater_than", "greater");
  if (gt !== null) return Number.isFinite(num2) && num2 > gt;
  const lt = threshold(c, "lt", "smaller_than", "smaller");
  if (lt !== null) return Number.isFinite(num2) && num2 < lt;
  if (c.truthy !== void 0) return asBool(c.truthy) ? asBool(raw2) : !asBool(raw2);
  const f = c.falsey !== void 0 ? c.falsey : c.falsy;
  if (f !== void 0) return asBool(f) ? !asBool(raw2) : asBool(raw2);
  return asBool(raw2);
}
var listedOn = (lvl, key) => {
  const hit = (k) => (typeof k === "string" ? k : k && k.key) === key;
  return !!lvl && ((lvl.knobs || []).some(hit) || (lvl.params || []).some(hit));
};
function createPageVisible(ctl, lib3, read, qualify2) {
  function wireKey(lvl, key) {
    if (key.indexOf(":") >= 0) return key;
    if (!listedOn(lvl, key) || typeof lib3.resolveChildKey !== "function" || typeof lib3.childIndexParam !== "function") return qualify2(key);
    const cip = lib3.childIndexParam(lvl);
    const at = cip ? lib3.childIndexFromWire(lvl, read(qualify2(cip))) : null;
    return qualify2(at === null ? key : lib3.resolveChildKey(lvl, at, key) || key);
  }
  return function visible(cond, lvl) {
    if (!cond || typeof cond !== "object") return true;
    const c = cond;
    const key = String(c.param || c.key || c.param_key || "");
    if (!key) return true;
    const vals = ctl.state && ctl.state.values;
    let raw2 = vals ? vals[key] : void 0;
    if (raw2 === void 0 || raw2 === null) raw2 = read(wireKey(lvl, key));
    if (raw2 === void 0 || raw2 === null || raw2 === "") return true;
    return conditionHoldsFor(c, String(raw2));
  };
}
function markGatesDue(ctl) {
  const s = ctl && ctl.state;
  if (s && "gatesDue" in s && s.conditionKeys && s.conditionKeys.size) s.gatesDue = true;
}

// src/renderer/schwung-page-sample.ts
function advanceSample(ctl, lib3) {
  if (typeof ctl.vizGroups !== "function" || !lib3.wavPeaksTick || !lib3.wavPeaksDone) return;
  const groups = ctl.vizGroups();
  if (!groups) return;
  for (const g of groups) {
    if (g.kind !== lib3.VIZ_SAMPLE || !g.roles.value) continue;
    const path = ctl.state.values[g.roles.value];
    if (!path) continue;
    if (lib3.wavPeaksDone(String(path))) continue;
    lib3.wavPeaksTick(String(path));
    break;
  }
}

// src/renderer/schwung-page-contract.ts
var RELOAD_POLL_TICKS = 16;
function createPageContract(ctl, port, componentKey2, cache2, hier, lib3, trackIndex) {
  let loaded = false;
  let attempts = 0;
  let waitingSince2 = Date.now();
  let sinceRetry = 0;
  function refreshLoaded() {
    if (ctl.contractUnresolved) return;
    const has = !!(ctl.pages && ctl.pages.length);
    if (has === loaded) return;
    loaded = has;
    if (has) mlog("page ready ck=" + componentKey2 + " ms=" + (Date.now() - waitingSince2));
    else waitingSince2 = Date.now();
    if (!loaded) {
      attempts = 0;
      sinceRetry = 0;
    }
  }
  const widgets = createWidgetSync(ctl, port, componentKey2);
  const moduleVisible = createPageVisible(
    ctl,
    lib3,
    cache2.get,
    (k) => k.indexOf(":") >= 0 ? k : componentKey2 + ":" + k
  );
  function reload() {
    cache2.invalidateAll();
    hier.invalidate();
    const visible = port.visible ? (c) => port.visible(c) : moduleVisible;
    ctl.load({ slot: trackIndex, component: componentKey2, visible });
    refreshLoaded();
    try {
      widgets.sync();
    } catch (_e) {
    }
  }
  reload();
  const RETRY_TICKS = 12;
  const RETRY_LIMIT = 60;
  const IDLE_RETRY_TICKS = MODULE_LOAD_TICKS;
  let sinceReload = 0;
  function tick2() {
    if (!loaded) {
      sinceRetry++;
      const urgent = attempts < RETRY_LIMIT;
      if (sinceRetry >= (urgent ? RETRY_TICKS : IDLE_RETRY_TICKS)) {
        sinceRetry = 0;
        if (urgent) attempts++;
        reload();
      }
      if (!loaded) return;
    }
    if (++sinceReload >= RELOAD_POLL_TICKS) {
      sinceReload = 0;
      perfPhase("ctlreload");
      try {
        const adopted = ctl.reloadIfChanged(ctl.state && ctl.state.lastLoadOpts);
        perfPhase("refreshloaded");
        refreshLoaded();
        perfPhase("reloadwidgets");
        widgets.afterReplan(adopted);
      } finally {
        perfPhaseEnd();
      }
    }
    perfPhase("ctltick");
    ctl.tick();
    perfPhaseEnd();
    advanceSample(ctl, lib3);
  }
  return { reload, tick: tick2, isReady: () => loaded };
}

// src/renderer/schwung-page-decorations.ts
function decorationsFor(auto, keys) {
  if (!auto || !auto.held) return null;
  const decs = keys.map((k) => {
    if (!k) return null;
    const lane2 = auto.laneForKey(k);
    const on = lane2 >= 0 && (auto.activeLanes & 1 << lane2) !== 0;
    if (!on) return null;
    const held5 = auto.heldValues.get(lane2);
    return held5 === void 0 ? null : { locked: true, value: held5, exact: false };
  });
  return decs.some(Boolean) ? decs : null;
}

// src/renderer/schwung-ctx.ts
function movyCtx() {
  return {
    fillRect: (x, y, w, h, c) => fill_rect(x, y, w, h, c ? 1 : 0),
    print: (x, y, t, c) => fontPrint(x, y, t, c ? 1 : 0),
    textWidth: (t) => fontWidth(t),
    fontHeight: FONT_HEIGHT
  };
}

// src/model/enum-value.ts
function enumUsesIndex(options2, raw2) {
  if (!options2 || !options2.length || raw2 === null) return true;
  return options2.indexOf(raw2) < 0;
}

// src/renderer/schwung-page-render.ts
var BANDS = { header: false, bank: false, footer: false };
var RESERVED_FOOTER = [];
function enumLane(m, raw2) {
  if (m.type !== "enum" || !Array.isArray(m.options) || m.options.length < 2) return null;
  const options2 = m.options.map(String);
  const s = raw2 === void 0 || raw2 === null ? null : String(raw2);
  const wiresNames = !!m.options_as_string || m.wire_format === "name" || m.wire_format !== "index" && s !== null && !enumUsesIndex(options2, s);
  let index = 0;
  if (s !== null) {
    const i = schwungLib().enumIndexOf(m, s);
    index = Math.max(0, Math.min(options2.length - 1, typeof i === "number" && i >= 0 ? i : 0));
  }
  return { options: options2, index, wiresNames };
}
function createPageRender(ctl, deps2) {
  const { keyAt, keysOf, componentKey: componentKey2, normalizedOf: normalizedOf2, automation, focusedChild } = deps2;
  const prefix = componentKey2 + ":";
  const lib3 = schwungLib();
  const childKeyOf = (k) => {
    const p = ctl.page;
    if (!p || !p.childLevel || !lib3 || typeof lib3.resolveChildKey !== "function") return k;
    if (!Array.isArray(p.keys) || p.keys.indexOf(k) < 0) return k;
    const at = focusedChild(p.level) ?? (typeof ctl.childIndexOf === "function" ? ctl.childIndexOf(p.level) : 0);
    return lib3.resolveChildKey(p.childLevel, at, k) || k;
  };
  const laneKeyOf = (k) => {
    const ck2 = childKeyOf(k);
    const auto = automation ? automation() : null;
    if (!auto) return ck2;
    const full = auto.laneKey(prefix + ck2);
    return full.startsWith(prefix) ? full.slice(prefix.length) : ck2;
  };
  return {
    /*
     * THE LANE MUST TARGET SCHWUNG'S PARAMETER, not movy's.
     *
     * movy builds an automation lane from `model.getKnobParamInfo(k)` —
     * its OWN idea of which param knob k drives. Under Schwung pagination
     * that is a different parameter: the two planners put different keys in
     * the same cell (9 of them across the mock presets). Left alone, moving
     * a knob to create a lane would have bound the lane to whatever movy
     * thought was there, which is a silent mis-target rather than a visible
     * failure — the lane would work perfectly, on the wrong param.
     *
     * AND IT MUST TARGET PAD N'S PARAMETER, not the cell's template. The
     * engine writes a lane's key straight to the module (plan D1), so a lane
     * bound to `tune` on a template rack, or to `pad_vol` on an alias rack,
     * played into whichever pad had focus when the step came round — the
     * lock followed the last pad pressed. `ioKey` is the concrete key;
     * `key` stays the cell's own, which is what the router asks for.
     *
     * Shaped as movy's KnobParamInfo (store.ts) so the automation layer
     * needs no special case for where it came from.
     */
    knobParamInfo(slot) {
      const k = keyAt(slot);
      if (!k || !ctl.metaIndex) return null;
      const m = ctl.metaIndex.getOrGuess(k);
      if (!m) return null;
      const raw2 = ctl.state && ctl.state.values ? ctl.state.values[k] : void 0;
      const enumOf = enumLane(m, raw2);
      const min = enumOf ? 0 : typeof m.min === "number" ? m.min : 0;
      const max = enumOf ? enumOf.options.length - 1 : typeof m.max === "number" ? m.max : 1;
      const value2 = enumOf ? enumOf.index : raw2 === void 0 || raw2 === null ? min : parseFloat(String(raw2));
      return {
        gi: slot,
        key: k,
        ioKey: laneKeyOf(k),
        target: componentKey2,
        value: isNaN(value2) ? min : value2,
        min,
        max,
        type: enumOf ? "enum" : m.type || (m.kind === "enum" ? "enum" : "float"),
        ...enumOf ? { options: enumOf.options, wiresNames: enumOf.wiresNames } : {},
        /* Same rule movy applies: a numeric range or an enum with two
         * or more options is automatable (D14), a door or a trigger is
         * not — EXCEPT the LFO page (SP-55): its
         * cells are real ranged params (so the generic rule below
         * would say yes) but the movy model has always answered
         * `automatable: false` for them (`lfo/inert.ts` — an LFO
         * modulating another LFO's own knob has no engine support).
         * `chain_params` carries no field schwung's own metaIndex
         * would read as an override (checked: `param_meta.mjs` has
         * no `automatable` key), so the component key is the one
         * signal available here, same test `isMovyOwnComponent` uses.
         * An inferred trigger is `writeOnly` in Schwung's meta, so a
         * two-option ACTION never gets here as an enum lane. */
        automatable: !isLfoComponent(componentKey2) && m.kind !== "opaque" && !m.writeOnly && !m.readOnly && (enumOf !== null || typeof m.min === "number" && typeof m.max === "number")
      };
    },
    /*
     * THE EIGHT KNOB LEDS, AND THE REPAINT SIGNAL, FROM THE DRAWN CELLS.
     *
     * movy's LED row used to be lit from movy's own view model, which under
     * this page is a different set of parameters (design §3, symptom 5).
     * These are the values the page on screen is showing — and, because
     * movy's own per-tick refresh no longer dirties the model for a
     * delegated component, a change in them is now also the only thing that
     * asks for the frame back (app/page-poll.ts).
     *
     * `normalizedOf` is Schwung's, not a second copy: "how full is this
     * control, or unknown", which measures an enum across its OPTION LIST
     * and distinguishes unread from zero. A cell with nothing bound, or a
     * value not read back yet, is `null` — an unlit knob, which is the
     * honest reading of a cell that will do nothing if you turn it.
     *
     * A page with no knobs (a preset browser, an items list) has no keys,
     * so every entry is null and the row goes dark — the same answer
     * Schwung's own host gives it.
     */
    knobLevels() {
      const out2 = [null, null, null, null, null, null, null, null];
      if (!ctl.metaIndex) return out2;
      const keys = keysOf();
      const live3 = ctl.state ? ctl.state.modValues : null;
      for (let slot = 0; slot < 8; slot++) {
        const k = keys[slot];
        if (!k) continue;
        const lv = live3 ? live3[k] : void 0;
        const raw2 = lv !== void 0 && lv !== null ? lv : ctl.state && ctl.state.values ? ctl.state.values[k] : null;
        out2[slot] = normalizedOf2(ctl.metaIndex.getOrGuess(k), raw2) ?? null;
      }
      return out2;
    },
    /*
     * WHICH CELLS WEAR A MODULATION OR LANE MARK, as one number: bit `slot`
     * for modulated, bit `8 + slot` for a lane.
     *
     * Read off the controller's CACHE, the thing the renderer draws from,
     * because that is what lags: a lane cleared under the hand is learnt on
     * the read rotation a few ticks after the gesture's own frame was drawn,
     * and none of the values move, so without this the dot stayed until
     * something else asked for a frame. `isAutomatedCached` is #541's —
     * absent, that half reads zero, as the mark itself does.
     */
    marks() {
      const keys = keysOf();
      let m = 0;
      for (let slot = 0; slot < 8; slot++) {
        const k = keys[slot];
        if (!k) continue;
        if (ctl.isModulatedCached && ctl.isModulatedCached(k)) m |= 1 << slot;
        if (ctl.isAutomatedCached && ctl.isAutomatedCached(k)) m |= 1 << 8 + slot;
      }
      return m;
    },
    render(title, auto, _touched = -1) {
      ctl.setDecorations(decorationsFor(auto, keysOf().map((k) => k ? childKeyOf(k) : k)));
      const ctx = movyCtx();
      const presetBody = !ctl.pickerOpen && ctl.page && ctl.page.kind === lib3.PAGE_PRESET;
      ctl.render(ctx, {
        title,
        bands: BANDS,
        rect: GRID_BODY_RECT,
        footer: presetBody ? RESERVED_FOOTER : void 0
      });
      ctl.renderOverlays(ctx, { clearScreen: () => clear_screen() });
    }
  };
}

// src/seq/detent.ts
var DETENT_DIV = 8;
function countDetents(accum, k, delta, div = DETENT_DIV) {
  let rem = (accum[k] ?? 0) + delta;
  let n = 0;
  while (rem >= div) {
    rem -= div;
    n++;
  }
  while (rem <= -div) {
    rem += div;
    n--;
  }
  accum[k] = rem;
  return n;
}

// src/renderer/schwung-preset-knob.ts
function parseItems(raw2) {
  try {
    const v = raw2 ? JSON.parse(raw2) : null;
    return Array.isArray(v) ? v.map((it, i) => ({ index: it && typeof it.index === "number" ? it.index : i })) : [];
  } catch {
    return [];
  }
}
function createPresetKnob(ctl, lib3, port, qualify2, hier) {
  const listState = /* @__PURE__ */ new Map();
  const bankAccum = [];
  const doorPage = () => {
    const p = ctl.page;
    if (!p || p.kind !== lib3.PAGE_PRESET) return null;
    return Array.isArray(p.keys) && p.keys[0] ? null : p;
  };
  const bankPage = (p) => {
    const entries = hier.peek()?.levels?.[p.level]?.params ?? [];
    const linked = (lvl) => entries.some((e) => e && typeof e === "object" && e.level === lvl);
    return (ctl.pages || []).find((q) => q && q.kind === lib3.PAGE_ITEMS && q.itemsParam && q.selectParam && !q.childOf && !Array.isArray(q.derivedLabels) && (q.navigateTo === p.level || linked(q.level))) ?? null;
  };
  const stepList = (dir, n) => {
    const s = ctl.state;
    const was = s.menuEntered;
    s.menuEntered = ctl.page.name;
    try {
      for (let i = 0; i < n; i++) ctl.onJog(dir, { shift: false });
    } finally {
      s.menuEntered = was;
    }
  };
  const stepBank = (p, q, delta) => {
    const banks = parseItems(port.getParam(qualify2(q.itemsParam)));
    if (banks.length < 2) return false;
    const steps = countDetents(bankAccum, 0, delta, lib3.DETENTS_PER_ENTRY || 6);
    if (!steps) return true;
    const cur = parseInt(port.getParam(qualify2(q.selectParam)) ?? "", 10);
    const at = Math.max(0, banks.findIndex((b) => b.index === cur));
    const next = ((at + steps) % banks.length + banks.length) % banks.length;
    ctl.revalue();
    port.setParam(qualify2(q.selectParam), String(banks[next].index));
    port.setParam(qualify2(p.listParam), "0");
    const s = ctl.state;
    const st = s.preset && s.preset[p.name];
    if (st) {
      st.index = 0;
      st.name = null;
    }
    s.settleUntil[p.listParam] = s.tickCount + (lib3.SETTLE_TICKS || 9);
    ctl.selectionChanged();
    return true;
  };
  const seedDoor = (p) => {
    const s = ctl.state;
    if (!s || !p) return;
    if (!s.preset) s.preset = {};
    const st = s.preset[p.name] || (s.preset[p.name] = { count: 0, index: 0, name: null, read: 0 });
    const c = parseInt(port.getParam(qualify2(p.countParam)) ?? "", 10);
    if (isFinite(c) && c >= 0) st.count = c;
    if ((s.settleUntil && s.settleUntil[p.listParam] || 0) > s.tickCount) return;
    const i = parseInt(port.getParam(qualify2(p.listParam)) ?? "", 10);
    if (isFinite(i) && i >= 0) st.index = i;
  };
  return {
    turn(delta, shift) {
      const p = doorPage();
      if (!p) return false;
      if (shift) {
        const q = bankPage(p);
        if (q && stepBank(p, q, delta)) return true;
      }
      if (typeof lib3.listKnobInit !== "function" || typeof lib3.listKnobStep !== "function") return false;
      let st = listState.get(p.name);
      if (!st) {
        st = lib3.listKnobInit();
        listState.set(p.name, st);
      }
      const raw2 = port.getParam(qualify2(p.countParam));
      const length = raw2 ? parseInt(raw2, 10) || 0 : 0;
      const steps = lib3.listKnobStep(st, delta, Date.now(), length);
      if (steps) stepList(steps > 0 ? 1 : -1, Math.abs(steps));
      return true;
    },
    /* The controller's own cursor, so the LED moves with the list the
     * screen shows. A count not read yet still lights it, at the bottom:
     * the knob already works, and a dark LED would say it does not. */
    level() {
      const p = doorPage();
      if (!p) return null;
      const st = ctl.state && ctl.state.preset ? ctl.state.preset[p.name] : null;
      return st && st.count > 1 ? Math.min(1, Math.max(0, st.index / (st.count - 1))) : 0;
    },
    stepAnywhere(delta) {
      const pages2 = ctl.pages || [];
      const door = pages2.findIndex((p) => p && p.kind === lib3.PAGE_PRESET && !(Array.isArray(p.keys) && p.keys[0]));
      if (door < 0) return false;
      const back = ctl.pageIndex;
      if (back !== door) ctl.goToPage(door, { remember: false });
      try {
        seedDoor(pages2[door]);
        return this.turn(delta, false);
      } finally {
        if (back !== door) ctl.goToPage(back, { remember: false });
      }
    }
  };
}

// src/renderer/schwung-page-input.ts
function createPageInput(ctl, lib3, port, qualify2, hier, warm2, focus, seat) {
  const jump = (i, childIndex, opts) => {
    const p = ctl.pages && ctl.pages[i];
    if (p && Array.isArray(p.keys)) {
      const keys = p.keys.filter((k) => !!k);
      const concrete = (k) => {
        if (!p.childLevel || typeof lib3.resolveChildKey !== "function") return k;
        const cip = p.childLevel.child_index_param;
        const at = cip ? childIndex : typeof ctl.childIndexOf === "function" ? ctl.childIndexOf(p.level) : 0;
        return typeof at === "number" ? lib3.resolveChildKey(p.childLevel, at, k) || k : k;
      };
      warm2(keys.map((k) => qualify2(concrete(k))));
    }
    ctl.goToPage(i, opts);
  };
  const preset = createPresetKnob(ctl, lib3, port, qualify2, hier);
  const turnAccum = [];
  return {
    /*
     * ONE DETENT PER UNIT OF DELTA. Move's encoders accumulate: a quick
     * flick arrives as a single CC carrying 3, 6, more. movy scales by that
     * magnitude; `onKnobTurn` takes a DIRECTION and moves one detent, so
     * collapsing to +-1 threw the rest away and the knob moved at the speed
     * of the slowest possible turn whatever you did with it. Reported as
     * "knobs move very very slowly like shift is held" — which is what it
     * feels like, though `fine` is never set on this path: measured, movy
     * travelled 0.30 where this travelled 0.005 for the same gesture.
     *
     * Schwung's own host collapses to +-1 too and feels right, because it
     * is fed by a path that has already expanded the accumulation. This one
     * is not, so it expands it here.
     *
     * Capped because a delta arrives as a signed byte: a garbled CC should
     * cost a bounded number of steps, not 63 of them.
     */
    knobTurn: (slot, delta, shift = false) => {
      if (slot === 0 && preset.turn(delta, shift)) return;
      const dir = delta > 0 ? 1 : -1;
      const key = typeof ctl.keyAt === "function" ? ctl.keyAt(slot) : null;
      const per = key && port.rawPerDetent ? port.rawPerDetent(qualify2(key)) || 1 : 1;
      let n;
      if (per > 1) {
        const steps = countDetents(turnAccum, slot, delta, per);
        if (steps === 0) return;
        n = Math.abs(steps);
      } else {
        n = Math.min(Math.abs(delta) | 0, 63) || 1;
      }
      for (let i = 0; i < n; i++) ctl.onKnobTurn(slot, dir);
    },
    knobTouch: (slot, down) => {
      ctl.onKnobTouch(slot, down);
    },
    presetKnobLevel: preset.level,
    presetStep: (delta) => preset.stepAnywhere(delta),
    /*
     * The whole ladder, Schwung's. The old binding was `ctl.onClick()` with
     * no slot and the return discarded, which silently dropped three
     * behaviours: onClick never learned which knob was under the hand (so a
     * divable param could not be opened), the "open" intent went nowhere,
     * and openPicker was never reached — leaving the section picker
     * unreachable on a module with 24 pages.
     */
    click: (shift = false) => lib3.applyInput(
      ctl,
      { type: "click", shift },
      { nowMs: Date.now() }
    ) ?? null,
    back: () => lib3.applyInput(ctl, { type: "back" }, { nowMs: Date.now() }) ?? null,
    /*
     * A PAD PRESS FOCUSES THAT VOICE, and turns the page by the seat's
     * rule (D7) — `schwung-page-seat.ts` maps voice -> level -> pages.
     *
     * The module's own focus param is written too, so the module agrees
     * about which voice is selected rather than only movy's screen moving.
     * Its value is a LEVEL NAME (voices.mjs), not an index.
     *
     * Only on a press. movy keeps the focused pad authoritative and does
     * NOT follow the DSP during playback — hierarchy.ts records what
     * happened when it did: the engine's playback-drifted pad leaked into
     * the UI and moved the page under the user's hands.
     */
    focusVoice(pad, note) {
      const hierarchy = hier.peek() ?? hier.parsed();
      const s = surfaceOf(hierarchy);
      const byNote = note === void 0 ? null : padForNote(s, note);
      const vi = byNote ?? pad - 1;
      const v = s.voices[vi];
      if (!hierarchy || !v) return false;
      if (v.level && v.childIndex !== null && v.childIndex !== void 0) {
        focus.choose(v.level, v.childIndex);
      }
      if (v.childIndex !== null && v.childIndex !== void 0) {
        const lvl = hierarchy.levels && hierarchy.levels[v.level];
        const cip = lvl && lvl.child_index_param;
        if (cip) {
          const wire = typeof lib3.childIndexToWire === "function" ? lib3.childIndexToWire(lvl, v.childIndex) : String(v.childIndex);
          port.setParam(qualify2(cip), wire);
        }
      }
      if (s.focusParam) port.setParam(qualify2(s.focusParam), v.level);
      const to = seat.press(vi + 1);
      if (to >= 0 && to !== ctl.pageIndex) jump(to, v.childIndex, { remember: false });
      else if (to < 0 && !seat.active()) mlog("focusVoice no page for " + v.level + "/" + v.name);
      return true;
    },
    focusedChild: focus.focusedChild,
    /* The seat re-orders only the PAGE step. A picker or an entered door
     * owns the jog itself — `onJog`'s own ladder, all of it behind those
     * two questions — so those go to it untouched. The page step's own
     * side effects (`onJog` drops a hint and the enum peek) are kept. */
    jog(dir) {
      const entered = typeof ctl.menuEntered === "function" && ctl.menuEntered();
      if (!seat.active() || ctl.pickerOpen || entered) {
        ctl.onJog(dir);
        return;
      }
      const to = seat.step(dir);
      if (to < 0) return;
      if (ctl.state && ctl.state.hintLines && typeof ctl.dismissHint === "function") ctl.dismissHint();
      if (typeof ctl.dismissPeek === "function") ctl.dismissPeek();
      const p = ctl.pages[to];
      const lvl = p && p.childLevel && hier.peek()?.levels?.[p.level];
      const at = lvl && lvl.child_index_param ? focus.focusedChild(p.level) : null;
      jump(to, at, { remember: false });
    }
  };
}

// src/renderer/schwung-page-focus.ts
function createPageFocus(hier, lib3, qualify2, automation) {
  const byKey = /* @__PURE__ */ new Map();
  const byLevel = /* @__PURE__ */ new Map();
  let parsed = null;
  let focusKey = null;
  const keyOfLevel = /* @__PURE__ */ new Map();
  const defOfKey = /* @__PURE__ */ new Map();
  const current2 = () => {
    const h = hier.peek();
    if (h === parsed) return h;
    parsed = h;
    byKey.clear();
    byLevel.clear();
    keyOfLevel.clear();
    defOfKey.clear();
    const fp = h && typeof lib3.focusParamOf === "function" ? lib3.focusParamOf(h) : null;
    focusKey = fp ? qualify2(fp) : null;
    const levels2 = h && h.levels || {};
    for (const name of Object.keys(levels2)) {
      const cip = typeof lib3.childIndexParam === "function" ? lib3.childIndexParam(levels2[name]) : null;
      if (!cip) continue;
      keyOfLevel.set(name, qualify2(cip));
      if (!defOfKey.has(qualify2(cip))) defOfKey.set(qualify2(cip), levels2[name]);
    }
    return h;
  };
  return {
    answer(fullKey) {
      if (!current2()) return void 0;
      const k = qualify2(String(fullKey));
      if (k === focusKey) return null;
      const def = defOfKey.get(k);
      if (!def) return void 0;
      const at = byKey.get(k);
      if (at === void 0) return null;
      return typeof lib3.childIndexToWire === "function" ? lib3.childIndexToWire(def, at) : String(at);
    },
    wrote(fullKey, value2) {
      if (!current2()) return;
      const k = qualify2(String(fullKey));
      const def = defOfKey.get(k);
      if (!def || typeof lib3.childIndexFromWire !== "function") return;
      const i = lib3.childIndexFromWire(def, value2);
      if (i !== null) byKey.set(k, i);
    },
    choose(level, index) {
      current2();
      const k = keyOfLevel.get(level);
      if (k) byKey.set(k, index);
      else byLevel.set(level, index);
    },
    focusedChild(level) {
      current2();
      const k = keyOfLevel.get(level);
      return (k ? byKey.get(k) : byLevel.get(level)) ?? null;
    },
    /* AN ALIAS RACK'S PAGE EDITS MOVY'S PAD, not the module's. `pad_vol`
     * names whichever pad the module has focused, and forge and mrdrums
     * move that focus on every note — sequenced ones included — so the
     * knobs drifted to the pad the pattern last played. The concrete key
     * is the one MOVY mode has always used (`paramIoKey`) and the lane
     * binds (`laneKey`), so the page, the lane and the arc name one key. */
    ioKey: (fullKey) => {
      const auto = automation ? automation() : null;
      return auto ? auto.laneKey(fullKey) : fullKey;
    }
  };
}

// src/renderer/schwung-page-seat.ts
function createPageSeat(ctl, lib3, hier, qualify2, canvasOnly = false) {
  let fromH = void 0;
  let fromPages = void 0;
  let fromLen = -1;
  let plan = null;
  let seat = -1;
  let landFor = null;
  let landedFor = null;
  let landFrom = -1;
  const indexParam = (lvl) => (lvl && typeof lib3.childIndexParam === "function" ? lib3.childIndexParam(lvl) : null) || null;
  const shown = (p) => !canvasOnly || !!(p && p.canvas);
  function build2(h, pages2) {
    const voices = canvasOnly ? [] : surfaceOf(h).voices;
    if (!voices.length && !canvasOnly || !pages2.length) return null;
    const levels2 = h && h.levels || {};
    const blocks = voices.map((v) => blockOf(v, levels2, pages2));
    if (voices.length && !blocks.some((b) => b.length)) return null;
    const inBlock = /* @__PURE__ */ new Set();
    for (const b of blocks) for (const i of b) inBlock.add(i);
    const others = [];
    for (let i = 0; i < pages2.length; i++) if (!inBlock.has(i) && shown(pages2[i])) others.push(i);
    return { voices, blocks, others, keys: keysOf(voices, blocks, pages2) };
  }
  function blockOf(v, levels2, pages2) {
    const out2 = [];
    const ip = v.childIndex !== null && v.childIndex !== void 0 ? indexParam(levels2[v.level]) : null;
    for (let i = 0; i < pages2.length; i++) {
      const p = pages2[i];
      if (!p) continue;
      if (p.level === v.level || ip && p.childLevel && indexParam(levels2[p.level]) === ip) out2.push(i);
    }
    if (out2.length) return out2;
    const want = String(v.name || "").toUpperCase();
    const byName = want ? pages2.findIndex((p) => p && String(p.name || "").toUpperCase() === want) : -1;
    return byName >= 0 ? [byName] : [];
  }
  function keysOf(voices, blocks, pages2) {
    const seen = /* @__PURE__ */ new Set();
    voices.forEach((v, vi) => {
      for (const i of blocks[vi]) {
        const p = pages2[i];
        for (const k of Array.isArray(p.keys) ? p.keys : []) {
          if (!k) continue;
          const at = v.childIndex;
          const c = p.childLevel && at !== null && at !== void 0 && typeof lib3.resolveChildKey === "function" ? lib3.resolveChildKey(p.childLevel, at, k) || k : k;
          seen.add(qualify2(c));
        }
      }
    });
    return [...seen];
  }
  function current2() {
    const h = hier.peek();
    const pages2 = ctl.pages || [];
    if (h !== fromH || pages2 !== fromPages || pages2.length !== fromLen) {
      fromH = h;
      fromPages = pages2;
      fromLen = pages2.length;
      plan = h ? build2(h, pages2) : null;
      if (!plan || seat >= plan.voices.length) seat = -1;
      if (plan && h !== landedFor && h !== landFor) {
        landFor = h;
        landFrom = ctl.pageIndex;
      }
    }
    if (!plan) return null;
    const at = ctl.pageIndex;
    if (seat < 0 || plan.blocks[seat].indexOf(at) < 0) {
      const w = plan.blocks.findIndex((b) => b.indexOf(at) >= 0);
      if (w >= 0) seat = w;
      else if (seat < 0) seat = plan.blocks.findIndex((b) => b.length > 0);
    }
    return plan;
  }
  const order = (p) => (seat >= 0 ? p.blocks[seat] : []).concat(p.others);
  return {
    active: () => current2() !== null,
    count() {
      const p = current2();
      return p ? order(p).length : ctl.pages ? ctl.pages.length : 0;
    },
    index() {
      const p = current2();
      if (!p) return ctl.pageIndex;
      const i = order(p).indexOf(ctl.pageIndex);
      return i >= 0 ? i : 0;
    },
    realOf(i) {
      const p = current2();
      if (!p) return i;
      const o = order(p);
      return o[Math.max(0, Math.min(o.length - 1, i))];
    },
    /* Does not wrap, like page_nav's `step`: an overshoot keeps its place. */
    step(dir) {
      const p = current2();
      if (!p) return -1;
      const o = order(p);
      const i = o.indexOf(ctl.pageIndex) + (dir > 0 ? 1 : -1);
      return i >= 0 && i < o.length && o.indexOf(ctl.pageIndex) >= 0 ? o[i] : -1;
    },
    press(pad) {
      const p = current2();
      const v = pad - 1;
      if (!p || v < 0 || v >= p.voices.length || !p.blocks[v].length) return -1;
      const off = seat >= 0 ? p.blocks[seat].indexOf(ctl.pageIndex) : -1;
      seat = v;
      if (off < 0) return -1;
      const b = p.blocks[v];
      return b[Math.min(off, b.length - 1)];
    },
    keys() {
      const p = current2();
      return p ? p.keys : [];
    },
    landing() {
      const p = current2();
      if (!p || landFor === null || landFor === landedFor) return -1;
      landedFor = landFor;
      const b = seat >= 0 ? p.blocks[seat] : order(p);
      return ctl.pageIndex === landFrom && b.indexOf(ctl.pageIndex) < 0 && b.length ? b[0] : -1;
    },
    onBlock() {
      const p = current2();
      return !!p && seat >= 0 && p.blocks[seat].indexOf(ctl.pageIndex) >= 0;
    }
  };
}

// src/renderer/schwung-page-anim.ts
var STILL = Object.freeze({ moving: false, streaming: false });
function createPageAnimating(ctl, lib3) {
  const activity2 = typeof lib3.activity === "function" ? lib3.activity : null;
  const bangPhase = typeof lib3.buttonPhase === "function" ? lib3.buttonPhase : null;
  return function animating(nowMs) {
    const a = activity2 ? activity2(ctl.state && ctl.state.anim, nowMs) : STILL;
    if (ctl.page && ctl.page.canvas) return { moving: a.moving, streaming: a.streaming, canvas: true };
    if (a.moving) return a;
    const fired = bangPhase && ctl.triggerFiredAt;
    if (!fired) return a;
    for (const k in fired) {
      const stamps = fired[k];
      if (stamps && stamps.length && bangPhase(stamps, nowMs, false).bursts.length) {
        return { moving: true, streaming: a.streaming };
      }
    }
    return a;
  };
}

// src/renderer/held-header-fit.ts
var HEADER_GAP = 4;
function fitHeldHeader(h) {
  const right = h.right ? String(h.right) : "";
  const room = Math.max(0, W - 4 - fontWidth(String(h.left || "")) - HEADER_GAP);
  if (!right || fontWidth(right) <= room) return h;
  const measure = { textWidth: (t) => fontWidth(t) };
  let fitted = String(schwungLib().fitHeadTail(measure, right, room));
  while (fitted.length > 1 && fontWidth(fitted) > room) fitted = fitted.slice(0, -1);
  return { ...h, right: fitted };
}

// src/renderer/schwung-file-param.ts
var FILE_TYPES = { filepath: true, file: true };
function isFileParam(meta) {
  return !!meta && typeof meta.type === "string" && FILE_TYPES[meta.type] === true;
}
function clickOnlyVerb(meta) {
  if (!meta || !meta.divable) return null;
  if (isFileParam(meta)) return "BROWSE";
  if (meta.type === "canvas") return "OPEN";
  return null;
}
function clickOnlyFooter(ctl) {
  if (!ctl || ctl.pickerOpen || ctl.menuEntered && ctl.menuEntered()) return null;
  const held5 = ctl.state ? ctl.state.touched : -1;
  const verb = clickOnlyVerb(held5 >= 0 && ctl.metaAt ? ctl.metaAt(held5) : null);
  return verb ? [["CLK", verb]] : null;
}

// src/renderer/schwung-page-chrome.ts
function chromeFor(ctl, lib3, paging, padScoped = false) {
  const held5 = !!(ctl && ctl.state && ctl.state.touched >= 0);
  return {
    header: heldHeaderFor(ctl),
    pageLabel: pageLabelFor(ctl),
    padScoped,
    /* A HAND ON A KNOB MAY TAKE THE BOTTOM ROWS — only for a hint it
     * cannot do without (see the header: the click is the only way in).
     *
     * The hint band and the Loop strip occupy overlapping rows — the
     * footer's 57..63 against the strip's 60..63, which it clears on EVERY
     * tick, outside the dirty-frame block, so anything drawn there without
     * the claim below keeps only its top three rows. They cannot both have
     * it, and the persistent readout is not the one that should lose
     * without reason: the strip is live musical feedback.
     *
     * So the footer is a TRANSIENT occupant, on exactly the terms movy's
     * own bottom-row toasts already take the row (`jogHintVisible()` —
     * the jog under a finger). */
    footer: !held5 ? null : paging ? pageFooterFor(ctl, lib3) : clickOnlyFooter(ctl)
  };
}
function pageLabelFor(ctl) {
  if (!ctl || typeof ctl.pageLabel !== "function") return null;
  const name = ctl.pageLabel();
  return name === void 0 || name === null || name === "" ? null : String(name);
}
function heldHeaderFor(ctl) {
  if (!ctl || !ctl.state || ctl.state.touched < 0) return null;
  const h = ctl.describePage({}).header;
  return h && h.inverted ? fitHeldHeader(h) : null;
}
function doorVerbs(lib3, kind) {
  switch (kind) {
    case lib3.PAGE_MENU:
      return [["JOG", "SEL"], ["CLK", "OPEN"], ["BACK", "OUT"]];
    case lib3.PAGE_ITEMS:
      return [["JOG", "SEL"], ["CLK", "LOAD"], ["BACK", "OUT"]];
  }
  return null;
}
function pageFooterFor(ctl, lib3) {
  if (!ctl) return null;
  if (ctl.pickerOpen) return [["JOG", "SECT"], ["CLK", "GO"], ["BACK", "EXIT"]];
  const p = ctl.page;
  const entered = !!(ctl.menuEntered && ctl.menuEntered());
  const verbs = p ? doorVerbs(lib3, p.kind) : null;
  if (p && p.kind === lib3.PAGE_PRESET) return null;
  if (verbs) {
    return entered ? verbs : [["JOG", "PAGE"], ["CLK", "ENTER"]];
  }
  return clickOnlyFooter(ctl);
}
function regularKnob(meta, lib3) {
  return !!meta && !!lib3.isTurnable && lib3.isTurnable(meta) && meta.kind !== lib3.KIND_ENUM;
}
function claimsBottomBand(ctl, lib3) {
  if (!ctl) return false;
  if (typeof ctl.enumPeek === "function" && ctl.enumPeek()) return true;
  if (ctl.pickerOpen) return true;
  if (ctl.state && ctl.state.hintLines) return true;
  const p = ctl.page;
  return !!p && p.kind !== void 0 && p.kind !== lib3.PAGE_KNOBS && p.kind !== lib3.PAGE_PRESET;
}

// src/renderer/schwung-canvas-live.ts
function liveCycleFor(meta) {
  const ms = meta ? Number(meta.fullscreen_live_ms) : 0;
  const keys = meta && Array.isArray(meta.extra_keys) ? meta.extra_keys.slice(0, 4).map(String) : [];
  if (!(ms > 0) || keys.length === 0) return null;
  return { keys, intervalMs: Math.max(50, ms), last: 0, cursor: 0, values: {} };
}
function stepLive(c, read, now2) {
  if (c.cursor === 0) {
    if (now2 - c.last < c.intervalMs) return null;
    c.last = now2;
    c.values = {};
  }
  const key = c.keys[c.cursor];
  c.values[key] = read(key);
  c.cursor++;
  if (c.cursor < c.keys.length) return null;
  c.cursor = 0;
  return c.values;
}

// src/renderer/schwung-canvas-dive.ts
var H = 64;
var CC_JOG = 14;
var CC_CLICK = 3;
var dive = null;
var states2 = /* @__PURE__ */ new Map();
function scriptSpec(meta) {
  const cs = meta && meta.canvas_script;
  let file = "canvas.js", ref = "";
  if (typeof cs === "string") file = cs.trim() || "canvas.js";
  else if (cs && typeof cs === "object") {
    file = String(cs.script || cs.file || cs.path || "canvas.js");
    ref = String(cs.overlay || cs.target || cs.entry || cs.element || "").trim();
  }
  const over = [meta?.canvas_overlay, meta?.overlay, meta?.canvas_target].find((v) => typeof v === "string" && v.trim());
  if (over) ref = over.trim();
  const parsed = splitSpec(file);
  return { file: parsed.file || "canvas.js", ref: ref || parsed.ref };
}
function setPx(x, y, c) {
  fill_rect(Math.round(x), Math.round(y), 1, 1, c ? 1 : 0);
}
function makeCtx(d, state7) {
  const ctx = {
    width: W,
    height: H,
    state: state7,
    clear: () => fill_rect(0, 0, W, H, 0),
    setPixel: setPx,
    fillRect: (x, y, w, h, c) => fill_rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h), c ? 1 : 0),
    drawRect(x, y, w, h, c) {
      ctx.fillRect(x, y, w, 1, c);
      ctx.fillRect(x, y + h - 1, w, 1, c);
      ctx.fillRect(x, y, 1, h, c);
      ctx.fillRect(x + w - 1, y, 1, h, c);
    },
    drawLine(x1, y1, x2, y2, c) {
      const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
      for (let i = 0; i <= n; i++) setPx(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n, c);
    },
    print: (x, y, t, c = 1) => fontPrint(Math.round(x), Math.round(y), String(t), c ? 1 : 0),
    measureText: (t) => fontWidth(String(t == null ? "" : t)),
    now: () => Date.now(),
    random: () => Math.random(),
    shiftHeld: () => appState.shiftHeld,
    sourcePath: () => ""
  };
  d.drawCtx = { ...ctx };
  ctx.getParam = (k) => d.host.read(String(k));
  ctx.setParam = (k, v) => {
    d.host.write(String(k), String(v));
    return true;
  };
  ctx.getValue = () => d.host.read(d.key) || "";
  ctx.setValue = (v) => {
    d.host.write(d.key, String(v));
    return true;
  };
  ctx.close = () => {
    d.closeWanted = true;
    return true;
  };
  return ctx;
}
var ABSENT = {};
function hook(name, payload = {}) {
  const d = dive;
  if (!d || d.dead || !d.ov || typeof d.ov[name] !== "function") return ABSENT;
  try {
    return d.ov[name](name === "draw" || name === "tick" ? d.drawCtx : d.ctx, payload);
  } catch (e) {
    d.dead = true;
    d.error = `${name} error: ${e}`;
    return ABSENT;
  }
}
function settle() {
  if (dive && dive.closeWanted) closeCanvasDive(false);
}
function canvasDiveActive() {
  return dive !== null;
}
function openCanvasDive(key, meta, host) {
  if (!meta || meta.type !== "canvas") return false;
  const spec = scriptSpec(meta);
  const path = moduleFilePath(host.moduleId(), spec.file);
  const sk = `${host.owner}|${path}|${spec.ref}`;
  if (!states2.has(sk)) states2.set(sk, {});
  const d = {
    key,
    meta,
    host,
    ov: null,
    dead: false,
    closeWanted: false,
    error: "",
    ctx: null,
    drawCtx: null,
    live: liveCycleFor(meta)
  };
  d.ov = path ? loadOverlay(path, spec.ref) : null;
  if (!d.ov) d.error = path ? "No module canvas overlay" : "No canvas script found";
  d.ctx = makeCtx(d, states2.get(sk));
  dive = d;
  hook("onOpen", { param_key: key, module_id: host.moduleId(), script_path: path || "" });
  settle();
  return true;
}
function closeCanvasDive(cancelled) {
  const d = dive;
  if (!d) return;
  hook("onClose", { cancelled });
  hook("onExit", { cancelled });
  dive = null;
  d.host.closed();
}
var enterable = () => !!(dive && dive.meta && dive.meta.enterable);
function canvasDiveMidi(data) {
  if (!dive) return false;
  hook("onMidi", { source: "internal", data: data.slice() });
  settle();
  return true;
}
function canvasDiveJog(delta) {
  if (!dive) return;
  if (appState.shiftHeld) {
    closeCanvasDive(true);
    return;
  }
  canvasDiveMidi([176, CC_JOG, delta > 0 ? Math.min(delta, 63) : 128 + Math.max(delta, -63)]);
}
function canvasDiveClick() {
  if (!dive) return;
  if (!enterable()) {
    closeCanvasDive(false);
    return;
  }
  canvasDiveMidi([176, CC_CLICK, 127]);
}
function canvasDiveBack() {
  if (!dive) return;
  if (enterable() && hook("handleBack") === true) {
    settle();
    return;
  }
  closeCanvasDive(true);
}
function canvasDivePad(note, velocity) {
  if (dive && dive.ov && dive.ov.wantsPads) canvasDiveMidi([144, note, velocity]);
}
function tickCanvasDive() {
  const d = dive;
  if (!d) return;
  if (d.live && !d.dead && d.ov && typeof d.ov.onValues === "function") {
    const now2 = Date.now();
    const values = stepLive(d.live, d.host.read, now2);
    if (values) hook("onValues", { values, nowMs: now2 });
  }
  hook("tick");
  settle();
}
function renderCanvasDive() {
  const d = dive;
  if (!d) return;
  fill_rect(0, 0, W, H, 0);
  if (hook("draw") !== ABSENT) return;
  const title = String(d.meta && (d.meta.label || d.meta.name) || "Canvas");
  fontPrint(Math.max(0, W - fontWidth(title) >> 1), 10, title, 1);
  fontPrint(3, 29, d.error.slice(0, 30), 1);
  fontPrint(3, 52, enterable() ? "BACK: RETURN" : "CLICK/BACK: RETURN", 1);
}

// src/renderer/schwung-page.ts
function createSchwungPage(port, componentKey2 = "synth", modulatedOf = null, automationOf = null, trackIndex = 0) {
  const qualify2 = (k) => k.indexOf(":") >= 0 ? k : componentKey2 + ":" + k;
  const lib3 = schwungLib();
  const cache2 = createPageReadCache(port);
  const diveWrite = pageWriter(port, (full) => cache2.get(full));
  const hier = createPageHierarchy(port, qualify2, cache2, componentKey2);
  const automation = automationOf ? () => automationOf(trackIndex) : null;
  const focus = createPageFocus(hier, lib3, qualify2, automation);
  const ctl = lib3.createController(createPageIo(
    port,
    qualify2,
    cache2,
    hier,
    componentKey2,
    modulatedOf ? () => modulatedOf(trackIndex, componentKey2) : null,
    automation,
    focus
  ));
  ctl.setLayout(lib3.LAYOUT_MOVY);
  function keysOf() {
    const p = ctl.page;
    return p && Array.isArray(p.keys) ? p.keys : [];
  }
  const keyAt = (slot) => keysOf()[slot] || null;
  const contract = createPageContract(ctl, port, componentKey2, cache2, hier, lib3, trackIndex);
  const seat = createPageSeat(ctl, lib3, hier, qualify2, !!port.canvasOnly);
  const input = createPageInput(ctl, lib3, port, qualify2, hier, cache2.warm, focus, seat);
  const page = createPageRender(ctl, {
    keyAt,
    keysOf,
    componentKey: componentKey2,
    normalizedOf: lib3.normalizedOf,
    automation,
    focusedChild: input.focusedChild
  });
  const animating = createPageAnimating(ctl, lib3);
  return {
    /* `contract.reload()` drops the cache itself — a re-plan reads live,
     * including the retry path this binding cannot see. */
    reload: contract.reload,
    /* The fill happens BEFORE the controller's tick, so the cursor's one
     * read this tick is served from the batch rather than arriving a tick
     * ahead of it. */
    tick() {
      cache2.prefetch(seat.keys());
      cache2.tick();
      contract.tick();
      const land = seat.landing();
      if (land >= 0) ctl.goToPage(land, { remember: false });
    },
    get ready() {
      return contract.isReady();
    },
    get ctl() {
      return ctl;
    },
    /* The SEAT's order, not the planner's: the bank bar and every caller
     * indexing pages count the jog movy actually runs. */
    get pageCount() {
      return seat.count();
    },
    get pageIndex() {
      return seat.index();
    },
    /* A jog without a seat is the controller's own `onJog`, unwarmed on
     * purpose (SP-39's ledger entry: its neighbour-prefetch lane keeps the
     * next page warm). A seat jog is a JUMP — the next page in movy's order
     * need not be the planner's neighbour — so it is warmed like a pad
     * jump. See `jog` in schwung-page-input.ts. */
    changePage(delta) {
      input.jog(delta > 0 ? 1 : -1);
    },
    goToPage(i) {
      ctl.goToPage(seat.realOf(i));
    },
    keyAt,
    targetAt: (slot) => {
      const k = keyAt(slot);
      return k ? qualify2(k) : null;
    },
    labelAt: (slot) => {
      const k = keyAt(slot);
      if (!k || !ctl.metaIndex) return null;
      const m = ctl.metaIndex.getOrGuess(k);
      return String(m && (m.label || m.key) || k);
    },
    knobParamInfo: page.knobParamInfo,
    knobLevels: () => {
      const lv = page.knobLevels();
      const preset = input.presetKnobLevel();
      if (preset !== null) lv[0] = preset;
      return lv;
    },
    marks: page.marks,
    animating,
    /* `enumPeek()` is also the reader that RETIRES an expired peek
     * (`page_controller.mjs` clears it past ENUM_PEEK_MS on the way out),
     * so asking the question is what keeps the answer honest as well as
     * what answers it. */
    peekOpen: () => typeof ctl.enumPeek === "function" ? !!ctl.enumPeek() : false,
    render: page.render,
    chrome: (paging) => chromeFor(
      ctl,
      lib3,
      paging,
      seat.onBlock() || hier.padScopedLevel(ctl.pages?.[ctl.pageIndex]?.level)
    ),
    regularKnobAt: (slot) => regularKnob(ctl.metaAt ? ctl.metaAt(slot) : null, lib3),
    knobTurn: input.knobTurn,
    presetStep: input.presetStep,
    knobTouch: input.knobTouch,
    click: input.click,
    back: input.back,
    focusVoice: input.focusVoice,
    focusWritten: focus.wrote,
    picker: (key) => port.picker ? port.picker(qualify2(key)) : null,
    canvasDive: (intent) => openCanvasDive(intent.fullKey || intent.key || "", intent.meta, {
      moduleId: () => String(cache2.get(moduleReadKey(componentKey2)) || ""),
      owner: `${trackIndex}:${componentKey2}`,
      /* LIVE, as upstream's dive ctx is: a script vouches and reads back
       * in one hook (DR32's pad follow), which a cached read would miss. */
      read: (k) => port.getParam(qualify2(k)),
      write: (k, v) => diveWrite(qualify2(k), v),
      /* Upstream re-enters the grid on the way out (enterParamPages).
       * Here: re-read live, and re-ask the gates — a new engine changes
       * no contract byte, only which pages its gates admit. */
      closed: () => {
        contract.reload();
        markGatesDue(ctl);
      }
    }),
    claimsBottomBand: () => claimsBottomBand(ctl, lib3)
  };
}

// src/seq/clip-scale.ts
var SCALE_RATIONALS = [
  [1, 8],
  [1, 4],
  [1, 2],
  [3, 4],
  [1, 1],
  [3, 2],
  [2, 1],
  [4, 1]
];
var SCALE_DEFAULT_IDX = 4;
var SCALE_LABELS = SCALE_RATIONALS.map(([n, d]) => d === 1 ? `${n}X` : `${n}/${d}X`);
function rationalToIdx(num2, den) {
  const i = SCALE_RATIONALS.findIndex(([n, d]) => n === num2 && d === den);
  return i < 0 ? SCALE_DEFAULT_IDX : i;
}

// src/seq/quant.ts
var QUANT_VALUES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
var QUANT_LABELS = QUANT_VALUES.map((v) => v + "%");
var clampPct2 = (v) => Math.max(0, Math.min(100, Math.round(v)));
function quantIndexForPct(pct) {
  let best = 0;
  for (let i = 1; i < QUANT_VALUES.length; i++) {
    if (Math.abs(QUANT_VALUES[i] - pct) < Math.abs(QUANT_VALUES[best] - pct)) best = i;
  }
  return best;
}
function quantCandidates(defPct) {
  const d = clampPct2(defPct);
  return d === 0 || d === 100 ? [0, 100] : [0, d, 100];
}
function nextQuantCandidate(cur, defPct) {
  const c = quantCandidates(defPct);
  return c.find((v) => v > cur) ?? c[0];
}
function candidateIndex(pct, defPct) {
  return quantCandidates(defPct).indexOf(clampPct2(pct));
}

// src/seq/clip-page.ts
var TRANSPOSE_MIN = -36;
var TRANSPOSE_MAX = 36;
var KNOB_VERBS = {
  0: "CLIP SCALE",
  1: "CLIP LENGTH",
  2: "TRANSPOSE",
  3: "CLIP QUANT"
};
var gestureKey = (k, track) => "clip:" + track + ":" + k;
function clipPageActive() {
  return appState.currentView === VIEW_CLIP_PARAMS;
}
function clipPageRelease(k, track) {
  endEdit(gestureKey(k, track));
}
function applyClipScaleIdx(track, idx2) {
  const clamped = Math.max(0, Math.min(SCALE_RATIONALS.length - 1, idx2));
  if (clamped === seqState.clipScaleIdx) return;
  beginGesture(gestureKey(0, track), KNOB_VERBS[0], trackLabel(track));
  seqState.clipScaleIdx = clamped;
  const [n, d] = SCALE_RATIONALS[clamped];
  seqCmd("cscl " + track + " " + n + " " + d);
}
function applyClipLength(track, steps) {
  const next = Math.max(1, Math.min(MAX_STEPS, steps));
  if (next === seqState.lenSteps) return;
  beginGesture(gestureKey(1, track), KNOB_VERBS[1], trackLabel(track));
  seqState.lenSteps = next;
  seqCmd("clen " + track + " " + next);
}
function applyClipTranspose(track, semitones) {
  if (trackIsDrum(track)) return;
  const next = Math.max(TRANSPOSE_MIN, Math.min(TRANSPOSE_MAX, semitones));
  if (next === seqState.clipTranspose) return;
  beginGesture(gestureKey(2, track), KNOB_VERBS[2], trackLabel(track));
  seqState.clipTranspose = next;
  seqCmd("ctr " + track + " " + next);
}
function applyClipQuantIdx(track, idx2) {
  const i = Math.max(0, Math.min(QUANT_VALUES.length - 1, idx2));
  const next = QUANT_VALUES[i];
  if (next === seqState.clipQuant) return;
  beginGesture(gestureKey(3, track), KNOB_VERBS[3], trackLabel(track));
  seqState.clipQuant = next;
  seqCmd("cq " + track + " " + next);
}

// src/renderer/schwung-virtual-source.ts
var HIER_KEY = "ui_hierarchy";
function isPair(c) {
  if (c.type === "toggle") return true;
  if (c.type !== "enum") return false;
  const opts = typeof c.options === "function" ? c.options() : c.options;
  return !!opts && opts.length === 2;
}
var PARAMS_KEY = "chain_params";
function createVirtualSource(componentKey2, cells4) {
  const prefix = componentKey2 + ":";
  const bare = (k) => k.startsWith(prefix) ? k.slice(prefix.length) : k;
  const byKey = new Map(cells4.map((c) => [c.key, c]));
  function hierarchyJson() {
    return JSON.stringify({ levels: { root: { knobs: cells4.map((c) => c.key) } } });
  }
  function chainParamsJson() {
    const out2 = cells4.map((c) => {
      const entry = { key: c.key, name: c.name, type: c.type };
      if (c.shortName) entry.short_name = c.shortName;
      if (c.viz) entry.viz = c.viz;
      if (c.display) entry.display = c.display;
      if (c.type === "enum") {
        entry.turn = "absolute";
        entry.options = (typeof c.options === "function" ? c.options() : c.options) ?? [];
        entry.wire_format = "index";
      } else {
        if (c.min !== void 0) entry.min = c.min;
        if (c.max !== void 0) entry.max = c.max;
        if (c.step !== void 0) entry.step = c.step;
      }
      return entry;
    });
    return JSON.stringify(out2);
  }
  return {
    bulkReads: false,
    getParam(k) {
      const b = bare(k);
      if (b === HIER_KEY) return hierarchyJson();
      if (b === PARAMS_KEY) return chainParamsJson();
      return byKey.get(b)?.get() ?? null;
    },
    setParam(k, v) {
      const c = byKey.get(bare(k));
      if (!c) return false;
      if (isPair(c) && Math.round(Number(v)) === Math.round(Number(c.get()))) return true;
      c.set(v);
      return true;
    },
    formatValue(fullKey, raw2, surface) {
      const c = byKey.get(bare(fullKey));
      return c?.format ? c.format(raw2, surface) : null;
    },
    /* THE RULE IS STATED IN RAW UNITS PER STEP — 8 of them, the number
     * every one of these pages charged before delegation — because that is
     * the quantity a hand measures. It is SPENT per detent, and a detent is
     * worth different amounts by kind: Schwung burns `ENUM_DELTA_DIV` (4)
     * of them per enum option and one per int step. So the two divisors
     * differ precisely so that the felt rate does not.
     *
     * A key this source does not own answers null rather than a default,
     * so a caller can tell "one raw unit, as always" from "not mine". */
    /* The cell's own declaration, not a measurement: movy writes these
     * option lists, so whether a value fits its box is settled here rather
     * than re-derived from a font metric at every turn. */
    peekSuppressed(fullKey) {
      const c = byKey.get(bare(fullKey));
      return !!c && c.peek === false;
    },
    rawPerDetent(fullKey) {
      const c = byKey.get(bare(fullKey));
      if (!c) return null;
      if (c.rawPerDetent !== void 0) return c.rawPerDetent;
      return c.type === "enum" || c.type === "toggle" ? 2 : 8;
    }
  };
}

// src/seq/clip-params-contract.ts
var TRANSPOSE_MIN2 = -36;
var TRANSPOSE_MAX2 = 36;
var activeTrack = () => appState.activeTrack.index;
var asIndex = (v) => Math.round(Number(v)) || 0;
var cells = [
  {
    key: "scale",
    name: "Scale",
    shortName: "SCALE",
    type: "enum",
    options: SCALE_LABELS,
    get: () => String(seqState.clipScaleIdx),
    set: (v) => applyClipScaleIdx(activeTrack(), asIndex(v))
  },
  {
    key: "length",
    name: "Length",
    shortName: "LEN",
    type: "int",
    min: 1,
    max: MAX_STEPS,
    step: 1,
    /* The old page drew this big (`clip-page-vm.ts`'s "big preset");
     * the span (1..256) is over the undeclared big number's cap, so it
     * says so. */
    display: "big",
    get: () => String(seqState.lenSteps),
    set: (v) => applyClipLength(activeTrack(), asIndex(v)),
    /* HEADER ONLY: the word is what tells 16 STEPS from 16 bars, and the
     * 30px cell has no room for it under a label that already says LEN.
     * Same split as TEMPO's bpm. */
    format: (raw2, surface) => raw2 !== null && surface === "header" ? raw2 + " steps" : null
  },
  {
    key: "transpose",
    name: "Transpose",
    shortName: "TRANS",
    type: "int",
    min: TRANSPOSE_MIN2,
    max: TRANSPOSE_MAX2,
    step: 1,
    /* Reports '0' on a drum track — the arc rests at its centre, matching
     * the `off` arm's own `normalizedValue: isDrum ? 0 : ...` (clip-page-vm.ts) —
     * while `format()` below is what actually prints "n/a"; the two must
     * agree or the printed text and the drawn position tell different
     * stories about the same knob. */
    get: () => trackIsDrum(activeTrack()) ? "0" : String(seqState.clipTranspose),
    set: (v) => applyClipTranspose(activeTrack(), asIndex(v)),
    format: (_raw, _surface) => trackIsDrum(activeTrack()) ? "n/a" : null
  },
  {
    key: "quant",
    name: "Clip Quantize",
    shortName: "QUANT",
    type: "enum",
    options: QUANT_LABELS,
    /* The quantize labels fit their square; the old page raised an overlay
     * for SCALE only, which keeps one below. */
    peek: false,
    get: () => String(quantIndexForPct(seqState.clipQuant)),
    set: (v) => applyClipQuantIdx(activeTrack(), asIndex(v))
  }
];
var source = null;
function clipParamsSource() {
  return source ?? (source = createVirtualSource(CLIP_PARAMS_COMPONENT, cells));
}

// src/keyboard/notes.ts
var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function midiNoteName(note) {
  return NOTE_NAMES[note % 12] + (Math.floor(note / 12) - 1);
}

// src/undo/ui-fields.ts
function readUiField(f) {
  if (f === "rootPc") return String(keyboardState.rootPc);
  if (f === "mutes") return JSON.stringify(mutesSnapshot());
  if (f === "defaultQuant") return String(seqState.defaultQuant);
  return String(keyboardState.scale);
}
function writeUiField(f, v) {
  if (f === "mutes") {
    try {
      restoreMutes(JSON.parse(v));
    } catch {
    }
    markUiStateDirty();
    return;
  }
  const n = Number(v);
  if (!isFinite(n)) return;
  if (f === "defaultQuant") {
    const q = Math.max(0, Math.min(100, n));
    seqState.defaultQuant = q;
    seqCmd("dq " + q);
    writePrefDefaultQuant(q);
    markUiStateDirty();
    return;
  }
  if (f === "rootPc") keyboardState.rootPc = n;
  else keyboardState.scale = n;
  markUiStateDirty();
}

// src/keyboard/release.ts
function emitNoteOff(track, pitch) {
  if (!engineOwnsPads(track)) portFor(track).sendMidi(MidiNoteOff, pitch, 0);
}
function releaseAllLive() {
  for (const n of drainAll()) emitNoteOff(n.track, n.pitch);
}
function releaseLiveOnTrack(track) {
  for (const n of drainTrack(track)) emitNoteOff(n.track, n.pitch);
}
function releaseSequencerGates(from, to) {
  let gates = 0;
  for (let t = from; t < to; t++) {
    const base2 = t * 128;
    for (let p = 0; p < 128; p++) {
      if (seqState.activeNotes[base2 + p] === 1) {
        emitNoteOff(t, p);
        gates++;
      }
    }
  }
  return gates;
}

// src/keyboard/handler.ts
function noteOn(padNote, padMin, track, vel) {
  const midiNote = padPitch(track, padNote, padMin);
  if (midiNote < 0) return;
  noteSounded(padNote, track, midiNote);
  keyboardState.lastPlayedNote = midiNote;
  if (!engineOwnsPads(track)) portFor(track).sendMidi(MidiNoteOn, midiNote, vel);
  setLED(padNote, C_GREEN, true);
}
function noteOff(padNote, padMin) {
  const n = noteReleased(padNote);
  if (n === void 0) return;
  emitNoteOff(n.track, n.pitch);
  setLED(padNote, padColor(padNote, padMin, n.track, false), true);
}
function setRootPc(pc2) {
  releaseAllLive();
  keyboardState.rootPc = (pc2 % 12 + 12) % 12;
  markUiStateDirty();
}
function changeOctave(track, delta) {
  const t = track & TRACK_COUNT - 1;
  const next = Math.max(OCT_MIN, Math.min(OCT_MAX, keyboardState.octave[t] + delta));
  if (next === keyboardState.octave[t]) return;
  releaseAllLive();
  keyboardState.octave[t] = next;
  markUiStateDirty();
}

// src/seq/main-page-constants.ts
var BPM_MIN_X100 = 2e3;
var BPM_MAX_X100 = 3e4;
var SWING_MIN = 50;
var SWING_MAX = 80;
var K_TEMPO = 0;
var K_SWING = 1;
var K_QUANT = 3;
var K_ROOT = 4;
var K_KEY = 5;

// src/seq/main-page-apply.ts
var KNOB_VERBS2 = {
  [K_TEMPO]: "TEMPO",
  [K_SWING]: "SWING",
  [K_QUANT]: "DEFAULT QUANT",
  [K_ROOT]: "ROOT",
  [K_KEY]: "KEY"
};
function applyTempoX100(bpmX100) {
  const next = Math.max(BPM_MIN_X100, Math.min(BPM_MAX_X100, bpmX100));
  if (next === seqState.bpmX100) return;
  beginGesture("mainknob:" + K_TEMPO, KNOB_VERBS2[K_TEMPO], "");
  seqState.bpmX100 = next;
  seqCmd("bpm " + next);
}
function applySwing(pct) {
  const next = Math.max(SWING_MIN, Math.min(SWING_MAX, pct));
  if (next === seqState.swingPct) return;
  beginGesture("mainknob:" + K_SWING, KNOB_VERBS2[K_SWING], "");
  seqState.swingPct = next;
  seqCmd("swing " + next);
}
function applyDefaultQuantIdx(idx2) {
  const i = Math.max(0, Math.min(QUANT_VALUES.length - 1, idx2));
  if (QUANT_VALUES[i] === seqState.defaultQuant) return;
  const before = readUiField("defaultQuant");
  beginGesture("mainknob:" + K_QUANT, KNOB_VERBS2[K_QUANT], "");
  writeUiField("defaultQuant", String(QUANT_VALUES[i]));
  recordUiOp("defaultQuant", before, readUiField("defaultQuant"));
}
function applyRootPc(pc2) {
  const before = readUiField("rootPc");
  beginGesture("mainknob:" + K_ROOT, KNOB_VERBS2[K_ROOT], "");
  setRootPc(pc2);
  recordUiOp("rootPc", before, readUiField("rootPc"));
}
function applyScaleIdx(idx2) {
  const clamped = Math.max(0, Math.min(SCALE_NAMES.length - 1, idx2));
  const before = readUiField("scale");
  beginGesture("mainknob:" + K_KEY, KNOB_VERBS2[K_KEY], "");
  keyboardState.scale = clamped;
  markUiStateDirty();
  recordUiOp("scale", before, readUiField("scale"));
}
function applyModeIdx(idx2) {
  const clamped = Math.max(0, Math.min(MODE_NAMES.length - 1, idx2));
  keyboardState.mode = clamped;
  keyboardState.layout = Math.min(keyboardState.layout, layoutNames(clamped).length - 1);
  markUiStateDirty();
}
function applyLayoutIdx(idx2) {
  const names = layoutNames(keyboardState.mode);
  keyboardState.layout = Math.max(0, Math.min(names.length - 1, idx2));
  markUiStateDirty();
}

// src/seq/set-params-contract.ts
var asIndex2 = (v) => Math.round(Number(v)) || 0;
var cells2 = [
  {
    key: "tempo",
    name: "Tempo",
    shortName: "TEMPO",
    type: "int",
    min: 20,
    max: 300,
    step: 1,
    get: () => String(Math.round(seqState.bpmX100 / 100)),
    set: (v) => applyTempoX100(asIndex2(v) * 100),
    /* The raw value stays a plain bpm number (so the arc/knob-state math
     * stays sane); only the PRINTED text carries a suffix, matching the
     * `off` arm's own displayValue (`main-page-vm.ts`).
     *
     * EXT WINS OVER THE UNIT, and only one of them can be shown: when the
     * clock is external, WHERE the tempo comes from is the more useful
     * reading of the two. The unit then rides the HEADER alone — "120 bpm"
     * does not fit a 30px cell, where the label underneath already says
     * TEMPO. */
    format: (raw2, surface) => {
      if (raw2 === null) return null;
      if (seqState.extSync) return raw2 + " EXT";
      return surface === "header" ? raw2 + " bpm" : null;
    }
  },
  {
    key: "swing",
    name: "Swing",
    shortName: "SWING",
    type: "int",
    min: 50,
    max: 80,
    step: 1,
    get: () => String(seqState.swingPct),
    set: (v) => applySwing(asIndex2(v)),
    /* THE PERCENT SIGN IS THE READING, not decoration. Swing is the one
     * value on this page whose bare number reads as a count — 54 of what?
     * — and it is short enough for the 30px cell, so unlike tempo's unit it
     * goes on both surfaces. The `off` arm printed it the same way
     * (`main-page-vm.ts`'s `swing + '%'`). */
    format: (raw2) => raw2 === null ? null : raw2 + "%",
    /* "Show swing the same way as before": the old page drew it in the big
     * preset face with its percent sign. `display: 'big'` draws the text
     * `format()` already gives (widest "80%", 30px of a 30px cell). */
    display: "big"
  },
  {
    key: "quant",
    name: "Default Quantize",
    shortName: "QUANT",
    type: "enum",
    options: QUANT_LABELS,
    peek: false,
    /* the labels fit their square */
    get: () => String(quantIndexForPct(seqState.defaultQuant)),
    set: (v) => applyDefaultQuantIdx(asIndex2(v))
  },
  {
    key: "root",
    name: "Root",
    shortName: "ROOT",
    type: "enum",
    options: NOTE_NAMES,
    /* Big, as the old page drew it. A big enum raises no overlay
     * (Schwung's `drawnBig`: every option fits, so the cell is legible).
     * KEY below keeps its overlay — scale names are words that do not fit
     * a 30px box, which is exactly the case the panel exists for. */
    display: "big",
    get: () => String(keyboardState.rootPc),
    set: (v) => applyRootPc(asIndex2(v))
  },
  {
    key: "key",
    name: "Key",
    shortName: "KEY",
    type: "enum",
    options: SCALE_NAMES,
    get: () => String(keyboardState.scale),
    set: (v) => applyScaleIdx(asIndex2(v))
  },
  {
    key: "mode",
    name: "Note Mode",
    shortName: "MODE",
    type: "enum",
    options: MODE_NAMES,
    get: () => String(keyboardState.mode),
    set: (v) => applyModeIdx(asIndex2(v))
  },
  {
    key: "layout",
    name: "Pad Layout",
    shortName: "LAYOUT",
    type: "enum",
    options: () => layoutNames(keyboardState.mode),
    get: () => String(Math.min(keyboardState.layout, layoutNames(keyboardState.mode).length - 1)),
    set: (v) => applyLayoutIdx(asIndex2(v))
  }
];
var source2 = null;
function setParamsSource() {
  if (!source2) source2 = createVirtualSource(SET_PARAMS_COMPONENT, cells2);
  return source2;
}

// src/seq/header-vm.ts
function headerOnlyVM(title) {
  return {
    moduleName: title,
    headerOverride: title,
    isEmpty: false,
    drumPadCount: 0,
    drumCurrentPad: 0,
    drumCurrentPhysPad: 0,
    drumPadName: "",
    automationHeld: false,
    automationPoolFull: false,
    stepPagePresent: false,
    stepPageSelected: false
  };
}

// src/seq/step-page-vm.ts
var LENGTH_TICKS = [
  12,
  24,
  48,
  96,
  192,
  // 1/32 1/16 1/8 1/4 1/2
  384,
  768,
  1152,
  1536,
  1920,
  2304,
  2688,
  3072,
  3456,
  3840,
  4224,
  // 1..11 bars
  4608,
  4992,
  5376,
  5760,
  6144
  // 12..16 bars
];
var LENGTH_LABELS = [
  "1/32",
  "1/16",
  "1/8",
  "1/4",
  "1/2",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16"
];
var PROB_VALUES = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
var PROB_LABELS = PROB_VALUES.map((v) => v + "%");
var COND_PAIRS = (() => {
  const out2 = [];
  for (let b = 1; b <= 8; b++) for (let a = 1; a <= b; a++) out2.push([a, b]);
  return out2;
})();
var COND_LABELS = COND_PAIRS.map(([a, b]) => a + ":" + b);
function lengthIndexForTicks(ticks2) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < LENGTH_TICKS.length; i++) {
    const d = Math.abs(LENGTH_TICKS[i] - ticks2);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
function probIndexForPct(pct) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < PROB_VALUES.length; i++) {
    const d = Math.abs(PROB_VALUES[i] - pct);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
function condIndexFor(a, b) {
  const i = COND_PAIRS.findIndex(([x, y]) => x === a && y === b);
  return i < 0 ? 0 : i;
}
function buildStepPageVM() {
  return {
    ...headerOnlyVM("step"),
    headerOverride: void 0,
    stepPagePresent: true,
    stepPageSelected: true
  };
}

// src/seq/step-params-contract.ts
var asIndex3 = (v) => Math.round(Number(v)) || 0;
var cells3 = [
  {
    key: "vel",
    name: "Velocity",
    shortName: "VEL",
    type: "int",
    min: 0,
    max: 127,
    step: 8,
    /* The `vbar` picture this file's header recorded as lost, taken back as
     * SCHWUNG'S OWN fader rather than a movy widget — the page stays native
     * and nothing has to be registered or drawn here.
     *
     * Declared because nothing detects it: the fader detector matches on
     * NAME against a closed list of fourteen, `vel` is not among them, and
     * measured over this contract no detector claims any cell at all. A
     * unipolar 0..127 level is what `drawFader` draws honestly — the
     * detector's own "no negative minimum" rule is about guessing, and does
     * not gate a declaration. */
    viz: { kind: "fader" },
    get: () => String(seqState.holdVel),
    set: (v) => applyStepVelocityAbs(asIndex3(v))
  },
  {
    key: "len",
    name: "Length",
    shortName: "LEN",
    type: "enum",
    options: LENGTH_LABELS,
    /* "1/4" and "16" fit the square whole, so the option panel would cover
     * a legible answer with the same answer. The old page raised no
     * overlay here at all (`step-page-vm.ts` built `overlay: null`). */
    peek: false,
    get: () => String(lengthIndexForTicks(seqState.holdGate)),
    set: (v) => applyStepLenIdx(asIndex3(v)),
    /* No "indeterminate" shape in `chain_params` (the ledger's own
     * finding) — the arc rests on whichever length the first held step
     * reports (same tradeoff Clip Params' drum-track TRANSPOSE already
     * made), and only the PRINTED text says the held steps disagree. */
    format: (_raw, _surface) => seqState.holdGateMixed ? "..." : null
  },
  {
    key: "prob",
    name: "Probability",
    shortName: "PROB",
    type: "enum",
    /* Schwung's own turn convention is FIXED, not something a contract can
     * flip: CW always INCREASES the wire index (`knob_engine.mjs`'s enum
     * branch adds a positive step for a positive direction). `PROB_VALUES`
     * is stored DESCENDING (100% first) to match movy's OWN off-arm math,
     * which SUBTRACTS a CW detent from the index for exactly this reason
     * (`step-edit.ts`'s knob-2 branch) — so under delegation the wire has
     * to present the REVERSED list, or a delegated CW turn would LOWER
     * probability, backwards from every other arm of this control. */
    options: [...PROB_LABELS].reverse(),
    peek: false,
    /* "80%" fits the square — see LEN */
    get: () => String(PROB_VALUES.length - 1 - probIndexForPct(seqState.holdProb)),
    set: (v) => applyStepProbIdx(PROB_VALUES.length - 1 - asIndex3(v))
  },
  {
    key: "cond",
    name: "Condition",
    shortName: "COND",
    type: "enum",
    options: COND_LABELS,
    /* THE BIG FACE, as the old page drew it (`renderStyle: 'preset'`).
     * No overlay: a big enum whose options all fit does not peek. */
    display: "big",
    get: () => String(condIndexFor(seqState.holdCondA, seqState.holdCondB)),
    set: (v) => applyStepCondIdx(asIndex3(v))
  },
  {
    key: "invert",
    name: "Invert",
    shortName: "INV",
    type: "toggle",
    get: () => seqState.holdInvert ? "1" : "0",
    set: (v) => applyStepInvertOn(asIndex3(v) === 1)
  }
];
var source3 = null;
function stepParamsSource() {
  return source3 ?? (source3 = createVirtualSource(STEP_PARAMS_COMPONENT, cells3));
}

// src/renderer/schwung-virtual-canvas.ts
var HIER_KEY2 = "ui_hierarchy";
var PARAMS_KEY2 = "chain_params";
function withCanvasPages(base2, componentKey2, pages2, draw) {
  const prefix = componentKey2 + ":";
  const bare = (k) => k.startsWith(prefix) ? k.slice(prefix.length) : k;
  const canvasKeys = new Set(pages2.map((p) => p.canvasKey));
  function hierarchyJson() {
    const levels2 = {};
    pages2.forEach((p, i) => {
      levels2[i === 0 ? "root" : p.canvasKey] = { knobs: [...p.knobs], params: [p.canvasKey] };
    });
    return JSON.stringify({ levels: levels2 });
  }
  function chainParamsJson() {
    const raw2 = base2.getParam(PARAMS_KEY2);
    if (raw2 === null) return null;
    const cells4 = JSON.parse(raw2);
    for (const p of pages2) {
      cells4.push({ key: p.canvasKey, name: p.name, type: "canvas", as_page: true, page_first: true });
    }
    return JSON.stringify(cells4);
  }
  return {
    ...base2,
    getParam(k) {
      const b = bare(k);
      if (b === HIER_KEY2) return hierarchyJson();
      if (b === PARAMS_KEY2) return chainParamsJson();
      if (canvasKeys.has(b)) return "";
      return base2.getParam(k);
    },
    drawCanvasPage: draw,
    canvasOnly: true
  };
}

// src/font/glyphs5x3.ts
var G5 = [
  [4, 0, 0, 0],
  // ' '
  [4, 0, 3, 5, 1, 1, 1, 0, 1],
  // '!'
  [4, 0, 3, 5, 5, 5, 0, 0, 0],
  // '"'
  [4, 0, 3, 5, 2, 2, 0, 0, 0],
  // '\''
  [4, 0, 3, 5, 2, 1, 1, 1, 2],
  // '('
  [4, 0, 3, 5, 1, 2, 2, 2, 1],
  // ')'
  [4, 0, 3, 5, 0, 2, 7, 2, 0],
  // '+'  centred like the source font, not top-aligned
  [4, 0, 3, 5, 0, 0, 3, 3, 2],
  // ','
  [4, 0, 3, 5, 0, 0, 7, 0, 0],
  // '-'
  [4, 0, 3, 5, 0, 0, 0, 3, 3],
  // '.'
  [4, 0, 3, 5, 4, 4, 2, 1, 1],
  // '/'
  [4, 0, 3, 5, 3, 3, 0, 3, 3],
  // ':'
  [4, 0, 3, 5, 7, 5, 5, 5, 7],
  // '0'
  [4, 0, 3, 5, 3, 2, 2, 2, 2],
  // '1'  flag left off a right stem (was mirrored), no foot
  [4, 0, 3, 5, 7, 4, 7, 1, 7],
  // '2'
  [4, 0, 3, 5, 7, 4, 6, 4, 7],
  // '3'
  [4, 0, 3, 5, 5, 5, 7, 4, 4],
  // '4'
  [4, 0, 3, 5, 7, 1, 7, 4, 7],
  // '5'
  [4, 0, 3, 5, 7, 1, 7, 5, 7],
  // '6'
  [4, 0, 3, 5, 7, 4, 4, 4, 4],
  // '7'
  [4, 0, 3, 5, 7, 5, 7, 5, 7],
  // '8'
  [4, 0, 3, 5, 7, 5, 7, 4, 7],
  // '9'
  [4, 0, 3, 5, 2, 7, 5, 5, 5],
  // 'A'
  [4, 0, 3, 5, 7, 5, 3, 5, 7],
  // 'B'
  [4, 0, 3, 5, 7, 1, 1, 1, 7],
  // 'C'
  [4, 0, 3, 5, 3, 5, 5, 5, 3],
  // 'D'
  [4, 0, 3, 5, 7, 1, 3, 1, 7],
  // 'E'
  [4, 0, 3, 5, 7, 1, 3, 1, 1],
  // 'F'
  [4, 0, 3, 5, 7, 1, 5, 5, 7],
  // 'G'
  [4, 0, 3, 5, 5, 5, 7, 5, 5],
  // 'H'
  [4, 0, 3, 5, 7, 2, 2, 2, 7],
  // 'I'
  [4, 0, 3, 5, 4, 4, 4, 5, 7],
  // 'J'
  [4, 0, 3, 5, 5, 5, 3, 5, 5],
  // 'K'
  [4, 0, 3, 5, 1, 1, 1, 1, 7],
  // 'L'
  [4, 0, 3, 5, 5, 7, 5, 5, 5],
  // 'M'
  [4, 0, 3, 5, 5, 3, 5, 5, 5],
  // 'N'
  [4, 0, 3, 5, 7, 5, 5, 5, 7],
  // 'O'
  [4, 0, 3, 5, 7, 5, 7, 1, 1],
  // 'P'
  [4, 0, 3, 5, 3, 5, 5, 7, 2],
  // 'Q'
  [4, 0, 3, 5, 7, 5, 3, 5, 5],
  // 'R'
  [4, 0, 3, 5, 6, 1, 2, 4, 3],
  // 'S'
  [4, 0, 3, 5, 7, 2, 2, 2, 2],
  // 'T'
  [4, 0, 3, 5, 5, 5, 5, 5, 7],
  // 'U'
  [4, 0, 3, 5, 5, 5, 5, 5, 2],
  // 'V'
  [4, 0, 3, 5, 5, 5, 5, 7, 7],
  // 'W'
  [4, 0, 3, 5, 5, 5, 2, 5, 5],
  // 'X'
  [4, 0, 3, 5, 5, 5, 7, 2, 2],
  // 'Y'
  [4, 0, 3, 5, 7, 4, 2, 1, 7],
  // 'Z'
  [4, 0, 3, 5, 5, 4, 2, 1, 5],
  // '%'
  [4, 0, 3, 5, 4, 2, 1, 2, 4],
  // '<'
  [4, 0, 3, 5, 1, 2, 4, 2, 1],
  // '>'
  [4, 0, 3, 5, 0, 7, 0, 7, 0],
  // '='  centred, same top-alignment slip as '+' had
  [4, 0, 3, 5, 7, 4, 6, 0, 2],
  // '?'
  [4, 0, 3, 5, 2, 7, 2, 5, 0]
  // '*'
];

// src/font/index5x3.ts
var CHARS5 = ` !"'()+,-./:0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ%<>=?*`;
var glyphFor2 = (cp) => {
  const idx2 = CHARS5.indexOf(String.fromCharCode(cp));
  return idx2 >= 0 ? G5[idx2] : null;
};
function fontWidth5x3(str2) {
  return glyphRunWidth(str2, glyphFor2, 4, 0);
}
function fontPrint5x3(x, y, str2, color, emit) {
  drawGlyphRun(x, y, str2, color, glyphFor2, 4, 0, emit);
}

// src/mixer/meter.ts
var METER_TRACKS = 16;
var METER_STRIDE = 3;
var BYTE_FLOOR_DB = -60;
var BYTE_STEPS_PER_DB = 2;
var out = new Float32Array(METER_TRACKS * METER_STRIDE);
var decodedFrom = null;
function byteToFrac(b) {
  return b <= 0 ? 0 : volumeFracOfDb(BYTE_FLOOR_DB + (b - 1) / BYTE_STEPS_PER_DB);
}
function decodeMeter(raw2) {
  if (raw2 === decodedFrom) return out;
  decodedFrom = raw2;
  for (let i = 0; i < out.length; i++) {
    const b = parseInt(raw2.substr(i * 2, 2), 16);
    out[i] = Number.isFinite(b) ? byteToFrac(b) : 0;
  }
  return out;
}

// src/renderer/mixer-view.ts
var SCREEN_H2 = 64;
var PITCH = 8;
var STRIP_W = 7;
var LEFT_W = 3;
var LABEL_H = 7;
var DIGIT_Y = 1;
function faderLine(ctx, x, y, topL, topR) {
  ctx.fillRect(x, y, LEFT_W, 1, y >= topL ? 0 : 1);
  ctx.fillRect(x + LEFT_W, y, STRIP_W - LEFT_W, 1, y >= topR ? 0 : 1);
}
function drawMixerBody(ctx, band, levels2, held5) {
  const bottom = Math.min(band.y + band.h, SCREEN_H2);
  const floor = bottom - LABEL_H - 1;
  const travel = floor - band.y;
  const rowOf = (f) => floor - Math.round(Math.max(0, Math.min(1, f)) * travel);
  const emit = (x, y, w, h, c) => ctx.fillRect(x, y, w, h, c);
  ctx.fillRect(band.x, band.y, band.w, bottom - band.y, 0);
  for (let t = 0; t < METER_TRACKS; t++) {
    const x = band.x + t * PITCH;
    const fader = levels2[t * METER_STRIDE];
    const l = levels2[t * METER_STRIDE + 1], r = levels2[t * METER_STRIDE + 2];
    const topL = l > 0 ? rowOf(l) : floor + 1;
    const topR = r > 0 ? rowOf(r) : floor + 1;
    if (topL <= floor) ctx.fillRect(x, topL, LEFT_W, floor - topL + 1, 1);
    if (topR <= floor) ctx.fillRect(x + LEFT_W, topR, STRIP_W - LEFT_W, floor - topR + 1, 1);
    faderLine(ctx, x, rowOf(fader), topL, topR);
    const isHeld = t === held5, c = isHeld ? 0 : 1, ly = floor + 1 + DIGIT_Y;
    if (isHeld) ctx.fillRect(x, floor + 1, STRIP_W, LABEL_H, 1);
    const n = t + 1;
    if (n < 10) fontPrint5x3(x + 2, ly, String(n), c, emit);
    else {
      ctx.fillRect(x + 1, ly, 1, 5, c);
      fontPrint5x3(x + 3, ly, String(n % 10), c, emit);
    }
  }
}

// src/mixer/mix-io.ts
var MIX_KEY = "mix";
function mixerKeyFor(_track) {
  return MIX_KEY;
}
var PAN_MIN = -1;
var PAN_MAX = 1;
var SEND_MAX = 1;
var LANE_RANGE = { min: 0, max: 1, type: "float" };
function fieldFrac(field, value2) {
  if (field === "pan") return (value2 - PAN_MIN) / (PAN_MAX - PAN_MIN);
  return dbFrac(value2, field === "gain" ? VOL_TOP_DB : SEND_TOP_DB);
}
function fieldFromFrac(field, frac) {
  if (field === "pan") return PAN_MIN + frac * (PAN_MAX - PAN_MIN);
  return fracToAmp(frac, field === "gain" ? VOL_TOP_DB : SEND_TOP_DB);
}
function sendField(bus) {
  return "send" + (bus + 1);
}
var FIELD_AT = [
  "gain",
  "pan",
  void 0,
  void 0,
  ...Array.from({ length: SEND_BUSES }, (_, n) => sendField(n))
];
function defaultMix() {
  return { gain: 1, pan: 0, muted: false, send: new Array(SEND_BUSES).fill(0) };
}
var clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
var SEND_WIDTHS = [0, 2, SEND_BUSES];
function isMixValue(raw2) {
  if (typeof raw2 !== "string") return false;
  const f = raw2.split(",");
  if (!SEND_WIDTHS.includes(f.length - 3)) return false;
  return f.every((x, i) => i === 2 || Number.isFinite(parseFloat(x)));
}
function parseMixValue(raw2) {
  const m = defaultMix();
  if (!raw2) return m;
  const f = raw2.split(",");
  if (!SEND_WIDTHS.includes(f.length - 3)) return m;
  const num2 = (s, d) => {
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : d;
  };
  m.gain = clamp(num2(f[0], 1), VOL_MIN, VOL_MAX);
  m.pan = clamp(num2(f[1], 0), PAN_MIN, PAN_MAX);
  m.muted = f[2].trim() !== "0";
  for (let i = 0; i + 3 < f.length; i++) {
    m.send[i] = clamp(num2(f[i + 3], 0), 0, SEND_MAX);
  }
  return m;
}
function packMixValue(v) {
  let n = v.send.length;
  while (n > 2 && (v.send[n - 1] ?? 0) === 0) n--;
  const out2 = [v.gain.toFixed(4), v.pan.toFixed(4), v.muted ? "1" : "0"];
  for (let i = 0; i < n; i++) out2.push((v.send[i] ?? 0).toFixed(4));
  return out2.join(",");
}
function mixGestureKey(track, field) {
  return "mix:" + track + ":" + field;
}
function readMix(track) {
  return parseMixValue(portFor(track).getParam(MIX_KEY));
}
function writeMix(track, v, before) {
  setChainParam(portFor(track), MIX_KEY, packMixValue(v), before);
  markUiStateDirty();
}
function formatDb(amp2) {
  if (amp2 <= 0) return "-INF";
  return (20 * Math.log10(amp2)).toFixed(1) + " dB";
}
function formatPan(pan) {
  const p = Math.round(Math.abs(pan) * 100);
  if (p === 0) return "C";
  return (pan < 0 ? "L" : "R") + p;
}
function formatSend(level) {
  return level <= 0 ? "OFF" : formatDb(level);
}

// src/mixer/mix-apply.ts
function applyMixFieldAbs(track, field, absValue) {
  const v = readMix(track);
  const before = packMixValue(v);
  if (field === "pan") v.pan = absValue;
  else if (field === "gain") v.gain = absValue;
  else v.send[Number(field.slice(4)) - 1] = absValue;
  if (packMixValue(v) === before) return;
  beginGesture(mixGestureKey(track, field), "MIX", "T" + (track + 1), false);
  writeMix(track, v, before);
}

// src/mixer/mix-schwung-cells.ts
var clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
function valueOf(v, field) {
  if (field === "gain") return v.gain;
  if (field === "pan") return v.pan;
  return v.send[Number(field.slice(4)) - 1] ?? 0;
}
var LABELS = {
  gain: { name: "Volume", short: "VOL", format: formatDb },
  pan: { name: "Pan", short: "PAN", format: formatPan },
  send1: { name: "Send 1", short: "SEND1", format: formatSend },
  send2: { name: "Send 2", short: "SEND2", format: formatSend },
  send3: { name: "Send 3", short: "SEND3", format: formatSend }
};
function mixCell(track, field, as) {
  const label2 = LABELS[field];
  return {
    key: as ? as.key : field,
    name: as ? as.name : label2.name,
    shortName: as ? as.short : label2.short,
    type: "float",
    min: 0,
    max: 1,
    step: 1 / 64,
    rawPerDetent: 1,
    get: () => fieldFrac(field, valueOf(readMix(track), field)).toFixed(4),
    set: (v) => applyMixFieldAbs(track, field, fieldFromFrac(field, clamp01(Number(v)))),
    format: (raw2) => raw2 === null ? null : label2.format(fieldFromFrac(field, clamp01(Number(raw2))))
  };
}
function buildCells(track) {
  return FIELD_AT.filter((f) => f !== void 0).map((field) => mixCell(track, field));
}
function mixSchwungSource(track) {
  return createVirtualSource("mix", buildCells(track));
}

// src/mixer/mixer-contract.ts
var MIXER_KNOBS = 8;
var mixerKey = (track) => "t" + (track + 1);
function trackOfMixerKey(key) {
  const m = key ? /^t(\d+)$/.exec(key) : null;
  const t = m ? Number(m[1]) - 1 : -1;
  return t >= 0 && t < METER_TRACKS ? t : -1;
}
function build() {
  const cells4 = Array.from({ length: METER_TRACKS }, (_, t) => mixCell(t, "gain", {
    key: mixerKey(t),
    name: `Track ${t + 1} Volume`,
    short: `T${t + 1}`
  }));
  const pages2 = [0, 1].map((p) => {
    const first = p * MIXER_KNOBS;
    return {
      canvasKey: "mix" + (p + 1),
      name: `${first + 1}-${first + MIXER_KNOBS}`,
      knobs: cells4.slice(first, first + MIXER_KNOBS).map((c) => c.key)
    };
  });
  return withCanvasPages(
    createVirtualSource(MIXER_COMPONENT, cells4),
    MIXER_COMPONENT,
    pages2,
    (ctx, band, _canvas, payload) => {
      const keys = payload.keys || [];
      const touched4 = typeof payload.touched === "number" ? payload.touched : -1;
      drawMixerBody(ctx, band, decodeMeter(seqState.mixMeter), trackOfMixerKey(keys[touched4]));
    }
  );
}
var source4 = null;
function mixerSource() {
  if (!source4) source4 = build();
  return source4;
}

// src/seq/virtual-page-sources.ts
function virtualSourceFor(componentKey2) {
  if (componentKey2 === CLIP_PARAMS_COMPONENT) return clipParamsSource();
  if (componentKey2 === SET_PARAMS_COMPONENT) return setParamsSource();
  if (componentKey2 === STEP_PARAMS_COMPONENT) return stepParamsSource();
  if (componentKey2 === MIXER_COMPONENT) return mixerSource();
  return null;
}

// src/lfo/scope.ts
var TRACK_COMPONENTS = ["synth", "fx1", "fx2", "midi_fx1", "midi_fx2"];
var MASTER_COMPONENTS = ["fx1", "fx2", "fx3", "fx4"];
function trackScope(track) {
  return {
    port: portFor(track),
    keyPrefix: "",
    slot: track,
    label: "T" + (track + 1),
    id: "t" + track,
    components: TRACK_COMPONENTS,
    hasRetrigger: true
  };
}
function masterScope() {
  const keyPrefix = MASTER_PREFIX;
  return {
    port: componentPort(0, keyPrefix + "lfo"),
    keyPrefix,
    slot: 0,
    label: "MASTER",
    id: "m",
    components: MASTER_COMPONENTS,
    hasRetrigger: false
  };
}
function lfoKey(scope, lfoIdx, key) {
  return scope.keyPrefix + "lfo" + (lfoIdx + 1) + ":" + key;
}
function componentKey(scope, comp2) {
  return scope.keyPrefix + comp2;
}
function targetComponent(scope, componentKeyOfKnob) {
  return scope.keyPrefix && componentKeyOfKnob.startsWith(scope.keyPrefix) ? componentKeyOfKnob.slice(scope.keyPrefix.length) : componentKeyOfKnob;
}

// src/lfo/assign.ts
function readLfo(scope, key) {
  return scope.port.getParam(key) ?? "";
}
function setBlocking(scope, key, val) {
  const old = readLfo(scope, key);
  if (old !== val) recordParamOp(scope.slot, key, old, val);
  scope.port.setParam(key, val);
}
var targetEpoch = 0;
function lfoTargetEpoch() {
  return targetEpoch;
}
function lfoTargetsParam(scope, lfoIdx, comp2, param) {
  return !!comp2 && scope.port.getParam(lfoKey(scope, lfoIdx, "target")) === comp2 && scope.port.getParam(lfoKey(scope, lfoIdx, "target_param")) === param;
}
function assignLfoTarget(scope, lfoIdx, comp2, param) {
  undoableEdit("ASSIGN LFO", scope.label + " LFO " + (lfoIdx + 1), () => {
    const driven = scope.keyPrefix + comp2 + ":" + param;
    const before = readLfo(scope, driven);
    if (before !== "") recordParamOp(scope.slot, driven, before, before);
    if (readLfo(scope, lfoKey(scope, lfoIdx, "target")) === "" && !(parseFloat(readLfo(scope, lfoKey(scope, lfoIdx, "depth"))) || 0)) {
      setBlocking(scope, lfoKey(scope, lfoIdx, "depth"), "1");
    }
    setBlocking(scope, lfoKey(scope, lfoIdx, "target"), comp2);
    setBlocking(scope, lfoKey(scope, lfoIdx, "target_param"), param);
    setBlocking(scope, lfoKey(scope, lfoIdx, "enabled"), "1");
  });
  targetEpoch++;
}
function clearLfoTarget(scope, lfoIdx) {
  undoableEdit("CLEAR LFO", scope.label + " LFO " + (lfoIdx + 1), () => {
    setBlocking(scope, lfoKey(scope, lfoIdx, "target"), "");
    setBlocking(scope, lfoKey(scope, lfoIdx, "target_param"), "");
    setBlocking(scope, lfoKey(scope, lfoIdx, "enabled"), "0");
  });
  targetEpoch++;
}

// src/lfo/params.ts
function compLabel(target2) {
  switch (target2) {
    case "synth":
      return "Syn";
    case "fx1":
      return "FX1";
    case "fx2":
      return "FX2";
    case "midi_fx1":
      return "MF1";
    case "midi_fx2":
      return "MF2";
    case "fx3":
      return "FX3";
    case "fx4":
      return "FX4";
    case "lfo1":
      return "LFO1";
    case "lfo2":
      return "LFO2";
    default:
      return target2.slice(0, 4);
  }
}
function shortenTarget(compTag, paramName) {
  const maxParam = Math.max(1, 11 - compTag.length - 1);
  let p = paramName.replace(/\s+/g, "");
  if (p.length > maxParam) p = p.slice(0, maxParam);
  return compTag + ":" + p;
}
function buildTargetOptions(scope, lfoIdx) {
  const opts = [{ label: "None", target: null, param: null }];
  for (const comp2 of scope.components) {
    const raw2 = scope.port.getParam(componentKey(scope, comp2) + ":chain_params");
    if (!raw2) continue;
    let arr;
    try {
      arr = JSON.parse(raw2);
    } catch {
      continue;
    }
    for (const p of arr) {
      if (!p.key) continue;
      if (p.type !== "float" && p.type !== "int" && p.type !== "enum") continue;
      opts.push({ label: shortenTarget(compLabel(comp2), p.name || p.label || p.key), target: comp2, param: p.key });
    }
  }
  const otherIdx = lfoIdx === 0 ? 1 : 0;
  const otherKey = "lfo" + (otherIdx + 1);
  for (const [key, name] of [["depth", "Depth"], ["rate_hz", "Rate"], ["phase_offset", "Phase"]]) {
    opts.push({ label: shortenTarget(compLabel(otherKey), name), target: otherKey, param: key });
  }
  return opts;
}
function targetIndex(opts, target2, param) {
  if (!target2) return 0;
  const i = opts.findIndex((o) => o.target === target2 && o.param === param);
  return i >= 0 ? i : 0;
}

// src/lfo/lfo-target-list.ts
var LFO_TARGET_PARAMS = [
  { key: "depth", label: "Depth" },
  { key: "rate_hz", label: "Rate Hz" },
  { key: "phase_offset", label: "Phase Offset" }
];
var MODULATABLE = /* @__PURE__ */ new Set(["float", "int", "enum"]);
var MODULE_CHECK_MS = 1500;
function lfoTargetLists(scope, lp, params) {
  const knob = typeof lp.lfoTargetOptions === "function" && typeof lp.lfoTargetIndex === "function";
  const read = (k) => scope.port.getParam(k);
  const key = (bank, name) => scope.keyPrefix + "lfo" + (bank + 1) + ":" + name;
  const stored = (bank) => ({ target: read(key(bank, "target")) || "", param: read(key(bank, "target_param")) || "" });
  const lists = [null, null];
  let modules = null;
  let checkedAt = -Infinity;
  function fresh3() {
    const now2 = Date.now();
    if (now2 - checkedAt < MODULE_CHECK_MS) return;
    checkedAt = now2;
    const sig = scope.components.map((c, i) => read(moduleReadKey(componentKey(scope, c))) ?? (modules ? modules[i] : "") ?? "");
    if (modules && sig.join("|") !== modules.join("|")) {
      lists[0] = null;
      lists[1] = null;
    }
    modules = sig;
  }
  function build2(bank, current2) {
    const cps = /* @__PURE__ */ new Map();
    const components = [];
    for (const comp2 of scope.components) {
      const ck2 = componentKey(scope, comp2);
      let arr = [];
      try {
        arr = JSON.parse(read(ck2 + ":chain_params") || "[]");
      } catch {
        arr = [];
      }
      if (!Array.isArray(arr) || !arr.length) continue;
      const seen = /* @__PURE__ */ new Set();
      const flat = [];
      for (const p of arr) {
        if (!p || !p.key || seen.has(p.key) || !MODULATABLE.has(p.type)) continue;
        seen.add(p.key);
        flat.push({ key: p.key, label: String(p.name || p.label || p.key) });
      }
      cps.set(comp2, flat);
      const id2 = read(moduleReadKey(ck2)) || "";
      components.push({ key: comp2, label: compLabel(comp2) + ": " + (id2 ? moduleDisplayName(id2, ck2) : comp2) });
    }
    const other = bank === 0 ? 2 : 1;
    cps.set("lfo" + other, LFO_TARGET_PARAMS);
    components.push({ key: "lfo" + other, label: "LFO " + other });
    return lp.lfoTargetOptions({
      components,
      paramsFor: (k) => cps.get(k) || [],
      current: current2 || stored(bank)
    });
  }
  function listFor(bank, current2) {
    const have = lists[bank];
    if (have && (!current2 || lp.lfoTargetIndex(have.routes, current2.target, current2.param) >= 0)) {
      return have;
    }
    return lists[bank] = build2(bank, current2);
  }
  let json = "";
  let jsonFor = [];
  return {
    knob,
    chainParams() {
      if (!knob) return JSON.stringify(params);
      fresh3();
      const a = listFor(0, null), b = listFor(1, null);
      if (json && jsonFor[0] === a && jsonFor[1] === b) return json;
      jsonFor = [a, b];
      json = JSON.stringify(lp.lfoParams(1, scope.keyPrefix, { targets: a }).concat(lp.lfoParams(2, scope.keyPrefix, { targets: b })));
      return json;
    },
    read(bank) {
      const cur = stored(bank);
      return String(Math.max(0, lp.lfoTargetIndex(listFor(bank, cur).routes, cur.target, cur.param)));
    },
    commit(bank, value2) {
      const routes = listFor(bank, null).routes;
      const route = routes[Math.max(0, Math.min(routes.length - 1, parseInt(value2, 10) || 0))];
      if (!route || !route.target) clearLfoTarget(scope, bank);
      else assignLfoTarget(scope, bank, route.target, route.param);
    },
    format(bank, raw2, surface) {
      const long = listFor(bank, null).options[parseInt(raw2 || "0", 10) || 0];
      if (long === void 0) return null;
      const at = long.indexOf(": ");
      return surface === "header" || at < 0 ? long : long.slice(at + 2);
    }
  };
}

// src/lfo/io.ts
function writeLfoKey(scope, full, val) {
  const old = scope.port.getParam(full);
  const field = full.slice(full.lastIndexOf(":") + 1);
  beginGesture("lfo:" + scope.id + ":" + full, field.toUpperCase(), scope.label, false);
  setChainParam(scope.port, full, val, old);
}

// src/lfo/lfo-schwung-source.ts
var HIER_KEY3 = "ui_hierarchy";
var PARAMS_KEY3 = "chain_params";
var NONE = "None";
var prettify = (k) => k.replace(/[_:]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
function lfoSchwungSource(scope) {
  const lp = schwungLfoPage();
  if (!lp) return null;
  const prefix = scope.keyPrefix + "lfo:";
  const real = (k) => k.startsWith(prefix) ? k.slice(prefix.length) : k;
  const read = (k) => scope.port.getParam(k);
  const targetOf = (k) => {
    const m = /lfo([12]):target$/.exec(k);
    return m ? Number(m[1]) - 1 : -1;
  };
  const params = lp.lfoParams(1, scope.keyPrefix).concat(lp.lfoParams(2, scope.keyPrefix));
  const targets = lfoTargetLists(scope, lp, params);
  const hierarchy = JSON.stringify({ modes: null, levels: Object.assign({
    root: { label: "LFO", knobs: [], params: [
      { level: "lfo1", label: "LFO 1" },
      { level: "lfo2", label: "LFO 2" }
    ] }
  }, lp.lfoLevels([1, 2], scope.keyPrefix)) });
  const REFRESH_MS = 1e3;
  const named = [];
  function describe(bank, raw2) {
    const t = raw2 || "";
    const now2 = Date.now();
    const hit = named[bank];
    if (hit && hit.t === t && hit.epoch === lfoTargetEpoch() && now2 - hit.at < REFRESH_MS) return hit;
    const p = t ? read(scope.keyPrefix + "lfo" + (bank + 1) + ":target_param") || "" : "";
    const name = t && p ? paramName(t, p) : NONE;
    named[bank] = {
      t,
      epoch: lfoTargetEpoch(),
      at: now2,
      short: name,
      long: t && p ? compLabel(t) + ": " + name : NONE
    };
    return named[bank];
  }
  function paramName(t, p) {
    try {
      const arr = JSON.parse(read(componentKey(scope, t) + ":chain_params") || "[]");
      const hit = Array.isArray(arr) ? arr.find((e) => e && e.key === p) : null;
      return String(hit && (hit.name || hit.label) || prettify(p));
    } catch {
      return prettify(p);
    }
  }
  return {
    bulkReads: false,
    getParam(k) {
      const r = real(k);
      if (r === HIER_KEY3) return hierarchy;
      if (r === PARAMS_KEY3) return targets.chainParams();
      const bank = targetOf(r);
      if (bank >= 0 && targets.knob) return targets.read(bank);
      return read(r);
    },
    setParam(k, v) {
      const r = real(k);
      const bank = targetOf(r);
      if (bank >= 0) {
        if (!targets.knob) return false;
        targets.commit(bank, v);
        return true;
      }
      writeLfoKey(scope, r, v);
      return true;
    },
    formatValue(k, raw2, surface) {
      const bank = targetOf(real(k));
      if (bank < 0) return null;
      if (targets.knob) return targets.format(bank, raw2, surface);
      const d = describe(bank, raw2);
      return surface === "header" ? d.long : d.short;
    },
    /* `equals` / `not_equals` — all the LFO contract declares.
     *
     * A condition param that reads NOTHING (an LFO never written) is at its
     * declared default, and an index enum with none sits at its first
     * option — Sync reads Free. Failing open instead, as Schwung's
     * evaluator does, shows BOTH rate cells: nine keys, and LFO 1 spills
     * onto a page of its own that the jog and an assign then land on. */
    visible(c) {
      if (!c || typeof c !== "object" || !c.param) return true;
      let v = read(String(c.param));
      if (v === null || v === "") {
        const def = params.find((p) => p.key === c.param);
        if (def && def.default !== void 0) v = String(def.default);
        else if (def && def.type === "enum") v = "0";
        else return true;
      }
      if (c.equals !== void 0) return String(v) === String(c.equals);
      if (c.not_equals !== void 0) return String(v) !== String(c.not_equals);
      return true;
    },
    picker(k) {
      const bank = targetOf(real(k));
      if (bank < 0) return null;
      const opts = buildTargetOptions(scope, bank);
      const cur = targetIndex(
        opts,
        read(scope.keyPrefix + "lfo" + (bank + 1) + ":target") || "",
        read(scope.keyPrefix + "lfo" + (bank + 1) + ":target_param") || ""
      );
      return {
        title: "LFO " + (bank + 1) + " Target",
        options: opts.map((o) => o.label),
        index: cur,
        commit(i) {
          const o = opts[Math.max(0, Math.min(opts.length - 1, i))];
          if (!o || !o.target) clearLfoTarget(scope, bank);
          else assignLfoTarget(scope, bank, o.target, o.param);
        }
      };
    }
  };
}

// src/chain/own-component-source.ts
function ownComponentSourceFor(track, componentKey2) {
  if (componentKey2 === "mix") return mixSchwungSource(track);
  if (isLfoComponent(componentKey2)) {
    const scope = isMasterComponent(componentKey2) ? masterScope() : trackScope(track);
    return lfoSchwungSource(scope);
  }
  return null;
}

// src/renderer/schwung-grid.ts
var pages = /* @__PURE__ */ new Map();
function schwungPageFor(trackIndex, componentKey2, modulatedOf, automationOf) {
  const id2 = trackIndex + ":" + componentKey2;
  let p = pages.get(id2);
  if (!p) {
    const source6 = isVirtualPageComponent(componentKey2) ? virtualSourceFor(componentKey2) : isMovyOwnComponent(componentKey2) ? ownComponentSourceFor(trackIndex, componentKey2) : componentPort(trackIndex, componentKey2);
    if (!source6) return pages.get(id2) ?? deadPage(componentKey2);
    p = createSchwungPage(
      source6,
      componentKey2,
      modulatedOf ?? null,
      automationOf ?? null,
      trackIndex
    );
    p.reload();
    pages.set(id2, p);
  }
  return p;
}
function deadPage(componentKey2) {
  mlog("schwung-grid: no virtual source for " + componentKey2);
  return {
    reload() {
    },
    tick() {
    },
    pageCount: 0,
    pageIndex: 0,
    changePage() {
    },
    goToPage() {
    },
    presetStep: () => false,
    keyAt: () => null,
    targetAt: () => null,
    labelAt: () => null,
    knobParamInfo: () => null,
    knobLevels: () => new Array(8).fill(null),
    marks: () => 0,
    animating: () => STILL,
    peekOpen: () => false,
    render() {
    },
    chrome: () => ({ header: null, footer: null, pageLabel: null, padScoped: false }),
    regularKnobAt: () => false,
    knobTurn() {
    },
    knobTouch() {
    },
    click: () => null,
    back: () => null,
    focusVoice: () => false,
    focusWritten() {
    },
    picker: () => null,
    claimsBottomBand: () => false,
    ready: false,
    ctl: null
  };
}
function schwungGridDrop(trackIndex, componentKey2) {
  pages.delete(trackIndex + ":" + componentKey2);
}

// src/app/modulated-keys.ts
function componentModelOf(track, componentKey2) {
  const chain = isMasterComponent(componentKey2) ? appState.masterFxModels : appState.trackModels[track];
  if (!chain) return null;
  for (const m of chain) {
    if (!m || typeof m.getComponentKey !== "function") continue;
    if (m.getComponentKey() === componentKey2) return m;
  }
  return null;
}
function modulatedKeysOf(track, componentKey2) {
  const m = componentModelOf(track, componentKey2);
  return m && typeof m.modulatedKeys === "function" ? m.modulatedKeys() : null;
}

// src/seq/automation-base.ts
var bases = /* @__PURE__ */ new Map();
var id = (track, lane2) => track + ":" + lane2;
function noteLaneBase(track, lane2, raw2) {
  if (lane2 < 0 || lane2 >= AUTO_LANES || !isFinite(raw2)) return;
  bases.set(id(track, lane2), raw2);
}
function laneBase(track, lane2) {
  const v = bases.get(id(track, lane2));
  return v === void 0 ? null : v;
}
function clearLaneBase(track, lane2) {
  bases.delete(id(track, lane2));
}
function seedFromEngine(abases, rangeOf) {
  const tracks = abases.split(",");
  for (let t = 0; t < tracks.length; t++) {
    const lanes = tracks[t].split(".");
    for (let l = 0; l < AUTO_LANES && l < lanes.length; l++) {
      const s = lanes[l];
      if (!s || s === "-") continue;
      if (bases.has(id(t, l))) continue;
      const v7 = parseInt(s, 10);
      if (!isFinite(v7)) continue;
      const r = rangeOf(t, l);
      if (!r) continue;
      bases.set(id(t, l), fromLane7(Math.max(0, Math.min(127, v7)), r));
    }
  }
}

// src/model/pad-scope.ts
var escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function templateRegex(tpl, padDigits, suffixPat) {
  if (!tpl || padDigits === void 0) return null;
  const padIdx = tpl.indexOf("{pad}");
  const sufIdx = tpl.indexOf("{suffix}");
  if (padIdx < 0 || sufIdx < 0) return null;
  const pre = escRe(tpl.slice(0, padIdx));
  const mid = escRe(tpl.slice(padIdx + 5, sufIdx));
  const post = escRe(tpl.slice(sufIdx + 8));
  return new RegExp("^" + pre + "\\d{" + Math.max(1, padDigits) + ",}" + mid + suffixPat + post + "$");
}
function concreteKey(ps, pad, key) {
  if (!ps || !key.startsWith(ps.aliasPrefix)) return key;
  const suffix = key.slice(ps.aliasPrefix.length);
  const table = ps.padKeys?.[suffix];
  if (table && pad - 1 < table.length) {
    return table[pad - 1] ?? key;
  }
  const o = ps.suffixOverrides?.[suffix];
  const tpl = o && (o.maxPad === void 0 || pad <= o.maxPad) ? o.template : ps.concreteKeyTemplate;
  if (!tpl) return key;
  const padStr = String(pad).padStart(ps.padDigits ?? 0, "0");
  return tpl.replace("{pad}", padStr).replace("{suffix}", suffix);
}
function aliasFromConcrete(ps, key) {
  if (!ps) return null;
  const m = templateRegex(ps.concreteKeyTemplate, ps.padDigits, "(.+)")?.exec(key);
  if (m) return ps.aliasPrefix + m[1];
  for (const suffix in ps.suffixOverrides ?? {}) {
    const o = ps.suffixOverrides[suffix];
    if (templateRegex(o.template, ps.padDigits, escRe(suffix))?.test(key)) {
      return ps.aliasPrefix + suffix;
    }
  }
  return null;
}

// src/app/automated-keys.ts
var cache = [];
function automationFor(track) {
  const hit = cache[track];
  if (hit) return hit;
  const laneKey = (fullKey) => {
    const colon = fullKey.indexOf(":");
    if (colon < 0) return fullKey;
    const m = componentModelOf(track, fullKey.slice(0, colon));
    const ps = m && typeof m.getDrumConfig === "function" ? m.getDrumConfig()?.padScoping : void 0;
    if (!ps) return fullKey;
    return fullKey.slice(0, colon + 1) + concreteKey(ps, m.getDrumCurrentPad(), fullKey.slice(colon + 1));
  };
  const laneOf = (fullKey) => {
    const lane2 = laneForParam(track, laneKey(fullKey));
    if (lane2 < 0) return -1;
    return (seqState.autoActive & 1 << lane2) !== 0 ? lane2 : -1;
  };
  const view = {
    isAutomated: (fullKey) => laneOf(fullKey) >= 0,
    baseOf(fullKey) {
      const lane2 = laneOf(fullKey);
      return lane2 < 0 ? null : laneBase(track, lane2);
    },
    noteBase(fullKey, value2) {
      const lane2 = laneForParam(track, laneKey(fullKey));
      if (lane2 >= 0) noteLaneBase(track, lane2, value2);
    },
    laneKey
  };
  cache[track] = view;
  return view;
}
function laneRangeOf(track, lane2) {
  return automationRegistry()[track]?.[lane2] ?? null;
}
function anyLaneNeedsBase() {
  const reg = automationRegistry();
  for (let t = 0; t < reg.length; t++) {
    const lanes = reg[t];
    if (!lanes) continue;
    for (let l = 0; l < lanes.length; l++) {
      if (lanes[l] && laneBase(t, l) === null) return true;
    }
  }
  return false;
}
function validateTrackLane(track, tp) {
  const comp2 = tp.slice(0, tp.indexOf(":"));
  const model = componentModelOf(track, comp2);
  if (!model || !model.hasLoadedParams()) return "unknown";
  const ps = model.getDrumConfig()?.padScoping ?? null;
  return validateLane(
    tp,
    ps,
    (key) => model.paramRangeByKey(key),
    (key) => model.childTemplateOf(key)
  );
}

// src/app/page-owner.ts
var MASTER_PAGE_TRACK = 0;
function pageRefOf(model) {
  if (!model || typeof model.getComponentKey !== "function") return null;
  const componentKey2 = model.getComponentKey();
  const track = isMasterComponent(componentKey2) || isSendComponent(componentKey2) || isVirtualPageComponent(componentKey2) ? MASTER_PAGE_TRACK : appState.activeTrack.index;
  return { track, componentKey: componentKey2 };
}
var NO_PAGE = {
  ref: null,
  page: null,
  pageIndex: 0,
  pageCount: 0,
  reason: "no-model",
  poll() {
  },
  knobParamInfo: () => null,
  changePage() {
  },
  goToPage() {
  }
};
function ownerOf(ref, page) {
  const live3 = () => page.ready;
  return {
    ref,
    get page() {
      return live3() ? page : null;
    },
    get reason() {
      return (live3() ? "ok" : "not-ready") + ` track=${ref.track} ck=${ref.componentKey} pages=${page.pageCount}` + (live3() ? ` at=${page.pageIndex}` : "");
    },
    get pageIndex() {
      return live3() ? page.pageIndex : 0;
    },
    get pageCount() {
      return live3() ? page.pageCount : 0;
    },
    /* OUTSIDE THE GATE at every caller, so a page that is not live keeps
     * asking: the first load sees no hierarchy and without this its empty
     * answer stood for the whole session. */
    poll() {
      page.tick();
    },
    knobParamInfo(slot) {
      return live3() ? page.knobParamInfo(slot) ?? null : null;
    },
    changePage(delta) {
      if (live3()) page.changePage(delta);
    },
    goToPage(index) {
      if (live3()) page.goToPage(index);
    }
  };
}
function pageOwnerOf(model) {
  const ref = pageRefOf(model);
  if (!ref) return NO_PAGE;
  if (model.getViewModel?.().isEmpty) return { ...NO_PAGE, ref, reason: "empty-slot" };
  return ownerOf(ref, schwungPageFor(ref.track, ref.componentKey, modulatedKeysOf, automationFor));
}

// src/seq/step-page.ts
var stepPageState = {
  /** The step page (page 0) is the currently selected page this session. */
  selected: false,
  /** Carried across sessions: the prior session ended on the step page. */
  lastSessionStepPage: false
};
function dropStepParamsPage() {
  schwungGridDrop(MASTER_PAGE_TRACK, STEP_PARAMS_COMPONENT);
}
function onSessionStart() {
  stepPageState.selected = stepPageState.lastSessionStepPage;
}
function onSessionEnd() {
  stepPageState.lastSessionStepPage = stepPageState.selected;
  stepPageState.selected = false;
  dropStepParamsPage();
}
function setStepPageSelected(v) {
  stepPageState.selected = v;
}
function stepPageAvailable() {
  return seqState.stepAutoMode && occHasStep(seqState.holdStep);
}
function resetStepPage() {
  stepPageState.selected = false;
  stepPageState.lastSessionStepPage = false;
  dropStepParamsPage();
}

// src/seq/watch.ts
function watchedTrack() {
  return appState.activeTrack.index;
}
var pushedTrack = -1;
var pushedLane = -2;
function syncWatch(send2) {
  const track = watchedTrack();
  if (track !== pushedTrack) {
    pushedTrack = track;
    send2("watch " + track);
  }
  if (seqState.watchLane !== pushedLane) {
    pushedLane = seqState.watchLane;
    send2("wlane " + (pushedLane < 0 ? -1 : pushedLane));
  }
}
function noteReportedTrack(track) {
  if (pushedTrack >= 0 && track !== pushedTrack) pushedTrack = -1;
}
function resetWatchPush() {
  pushedTrack = -1;
  pushedLane = -2;
}

// src/seq/step-edit.ts
var TICKS_PER_STEP2 = 24;
var VEL_STEP = 4;
var LEN_STEP = Math.round(TICKS_PER_STEP2 / 10);
var NUDGE_COARSE = LEN_STEP;
var NUDGE_FINE = 1;
var heldRanges = /* @__PURE__ */ new Map();
var gestured = /* @__PURE__ */ new Set();
var pressMs = /* @__PURE__ */ new Map();
var coPressed = /* @__PURE__ */ new Set();
var lastLenTarget = null;
var STEP_AUTO_MS = 300;
function anyStepHeld() {
  return heldRanges.size > 0;
}
function editStepDown(button) {
  if (heldRanges.has(button)) {
    heldRanges.delete(button);
    gestured.delete(button);
    coPressed.delete(button);
    pressMs.delete(button);
    lastLenTarget = null;
    if (heldRanges.size === 0) endStepAutomation();
  }
  let range;
  if (seqState.loopMode) {
    const base2 = button * NUM_STEP_BUTTONS;
    range = { s0: base2, s1: base2 + NUM_STEP_BUTTONS - 1 };
  } else {
    const step = seqState.barOffset * NUM_STEP_BUTTONS + button;
    range = { s0: step, s1: step };
  }
  heldRanges.set(button, range);
  pressMs.set(button, Date.now());
  if (heldRanges.size >= 2) {
    for (const b of heldRanges.keys()) {
      coPressed.add(b);
      gestured.delete(b);
    }
    if (seqState.stepAutoMode) endStepAutomation();
  }
}
function beginStepAutomation() {
  const r = heldRange();
  if (!r) return -1;
  markGestured();
  if (!seqState.stepAutoMode) {
    seqState.stepAutoMode = true;
    onSessionStart();
    seqState.holdStep = r.s0;
    seqCmd("hold " + watchedTrack() + " " + r.s0);
  }
  return r.s0;
}
function stepAutoTick() {
  if (seqState.stepAutoMode || heldRanges.size !== 1) return;
  const button = [...heldRanges.keys()][0];
  if (coPressed.has(button)) return;
  const t = pressMs.get(button);
  if (t !== void 0 && Date.now() - t >= STEP_AUTO_MS) beginStepAutomation();
}
function endStepAutomation() {
  if (seqState.stepAutoMode) onSessionEnd();
  seqState.stepAutoMode = false;
  seqState.heldLocks.clear();
}
function editStepUp(button) {
  if (heldRanges.has(button)) lastLenTarget = null;
  const wasTap = heldRanges.has(button) && !gestured.has(button);
  heldRanges.delete(button);
  gestured.delete(button);
  coPressed.delete(button);
  pressMs.delete(button);
  return wasTap;
}
function markGestured() {
  for (const b of heldRanges.keys()) gestured.add(b);
}
function lane() {
  return seqState.watchLane;
}
function forEach(emit) {
  markGestured();
  for (const r of heldRanges.values()) emit(r);
}
function heldKey(kind) {
  return "held:" + kind + ":" + watchedTrack() + ":" + heldStepAbs();
}
function editVelocity(delta) {
  if (!anyStepHeld()) return false;
  const d = (delta > 0 ? 1 : -1) * VEL_STEP;
  beginGesture(heldKey("vel"), "VELOCITY", trackLabel(watchedTrack()));
  forEach((r) => seqCmd(`evel ${watchedTrack()} ${r.s0} ${r.s1} ${lane()} ${d}`));
  seqToast(d > 0 ? "Velocity +" : "Velocity -");
  return true;
}
function editNudge(dir, shift) {
  if (!anyStepHeld()) return false;
  const d = dir * (shift ? NUDGE_FINE : NUDGE_COARSE);
  beginGesture(heldKey("nudge"), "NUDGE", trackLabel(watchedTrack()));
  forEach((r) => seqCmd(`enudge ${watchedTrack()} ${r.s0} ${r.s1} ${lane()} ${d}`));
  seqToast(dir > 0 ? "Nudge >" : "Nudge <");
  return true;
}
function editTranspose(semitones) {
  if (!anyStepHeld() || seqState.watchLane >= 0) return false;
  beginGesture(heldKey("trn"), "TRANSPOSE", trackLabel(watchedTrack()));
  forEach((r) => seqCmd(`etrn ${watchedTrack()} ${r.s0} ${r.s1} -1 ${semitones}`));
  seqToast(semitones > 0 ? "Transpose +" : "Transpose -");
  return true;
}
function editPad(pitch, vel) {
  if (!anyStepHeld()) return false;
  const t = watchedTrack();
  undoableEdit("ADD NOTE", trackLabel(t), () => {
    forEach((r) => {
      if (r.s0 === r.s1) {
        seqCmd(`ltog ${t} ${r.s0} ${pitch} ${vel}`);
      } else {
        seqCmd(`addp ${t} ${r.s0} ${r.s1} ${pitch} ${vel}`);
      }
    });
  });
  return true;
}
function heldRange() {
  if (heldRanges.size !== 1) return null;
  const r = [...heldRanges.values()][0];
  return { s0: r.s0, s1: r.s1 };
}
function heldStepList() {
  const out2 = [];
  for (const r of heldRanges.values()) for (let s = r.s0; s <= r.s1; s++) out2.push(s);
  return out2;
}
function markHeldGestured() {
  markGestured();
}
function heldStepAbs() {
  if (heldRanges.size !== 1) return -1;
  const r = [...heldRanges.values()][0];
  return r.s0 === r.s1 ? r.s0 : -1;
}
function setLengthTo(absB) {
  const a = heldStepAbs();
  if (a < 0 || absB <= a) return false;
  markGestured();
  let atEnd = true;
  if (lastLenTarget && lastLenTarget.a === a && lastLenTarget.b === absB) {
    atEnd = !lastLenTarget.atEnd;
  }
  lastLenTarget = { a, b: absB, atEnd };
  const steps = atEnd ? absB - a + 1 : absB - a;
  undoableEdit(
    "NOTE LENGTH",
    trackLabel(watchedTrack()),
    () => seqCmd(`slen ${watchedTrack()} ${a} ${a} ${lane()} ${steps * TICKS_PER_STEP2}`)
  );
  seqToast("Length " + steps);
  return true;
}
function resetStepEdit() {
  heldRanges.clear();
  gestured.clear();
  coPressed.clear();
  pressMs.clear();
  lastLenTarget = null;
}
function clampIdx(i, len) {
  return Math.max(0, Math.min(len - 1, i));
}
function applyStepVelocityAbs(target2) {
  const t = watchedTrack(), ln = lane();
  const d = Math.round(target2) - seqState.holdVel;
  if (d === 0) return;
  beginGesture(heldKey("tvel"), "VELOCITY", trackLabel(t));
  forEach((r) => seqCmd(`evel ${t} ${r.s0} ${r.s1} ${ln} ${d}`));
}
function applyStepLenIdx(idx2) {
  const t = watchedTrack(), ln = lane();
  let clamped = clampIdx(idx2, LENGTH_TICKS.length);
  let ticks2 = LENGTH_TICKS[clamped];
  const cap = seqState.holdMaxGate;
  if (cap > 0 && ticks2 > cap) {
    for (let i = LENGTH_TICKS.length - 1; i >= 0; i--) {
      if (LENGTH_TICKS[i] <= cap) {
        clamped = i;
        break;
      }
    }
    ticks2 = LENGTH_TICKS[clamped];
    seqToast("Max \u2014 blocked by next note");
  }
  beginGesture(heldKey("tlen"), "NOTE LENGTH", trackLabel(t));
  forEach((r) => seqCmd(`slen ${t} ${r.s0} ${r.s1} ${ln} ${ticks2}`));
  seqState.holdGate = ticks2;
  seqState.holdGateMixed = false;
}
function applyStepProbIdx(idx2) {
  const t = watchedTrack(), ln = lane();
  const clamped = clampIdx(idx2, PROB_VALUES.length);
  const pct = PROB_VALUES[clamped];
  beginGesture(heldKey("tprob"), "PROBABILITY", trackLabel(t));
  forEach((r) => seqCmd(`eprob ${t} ${r.s0} ${r.s1} ${ln} ${pct}`));
  seqState.holdProb = pct;
}
function applyStepCondIdx(idx2) {
  const t = watchedTrack(), ln = lane();
  const clamped = clampIdx(idx2, COND_PAIRS.length);
  const [a, b] = COND_PAIRS[clamped];
  beginGesture(heldKey("tcond"), "CONDITION", trackLabel(t));
  forEach((r) => seqCmd(`econd ${t} ${r.s0} ${r.s1} ${ln} ${a} ${b}`));
  seqState.holdCondA = a;
  seqState.holdCondB = b;
}
function applyStepInvertOn(on) {
  const t = watchedTrack(), ln = lane();
  beginGesture(heldKey("tinv"), "INVERT", trackLabel(t));
  forEach((r) => seqCmd(`einv ${t} ${r.s0} ${r.s1} ${ln} ${on ? 1 : 0}`));
  seqState.holdInvert = on;
}

// src/seq/automation.ts
var registry = Array.from({ length: TRACK_COUNT }, () => new Array(AUTO_LANES).fill(null));
var liveVal = /* @__PURE__ */ new Map();
var liveCtx = /* @__PURE__ */ new Map();
var liveTurn = /* @__PURE__ */ new Map();
function liveTurnValues(track) {
  const out2 = /* @__PURE__ */ new Map();
  for (const [k, v] of liveTurn) {
    const [t, l] = k.split(":");
    if (+t === track) out2.set(+l, v);
  }
  return out2;
}
function automationRegistry() {
  return registry;
}
var lastDisplaySig = "";
function displaySig() {
  let sig = "";
  if (seqState.stepAutoMode) {
    sig = "s";
    const lanes = [...seqState.heldLocks.entries()].sort((a, b) => a[0] - b[0]);
    for (const [l, v] of lanes) sig += l + ":" + v + ".";
  }
  const live3 = [...liveTurn.entries()].sort();
  for (const [k, v] of live3) sig += "|" + k + "=" + v;
  return sig;
}
function automationDisplayDirty() {
  const sig = displaySig();
  if (sig === lastDisplaySig) return false;
  lastDisplaySig = sig;
  return true;
}
function laneKeysForTrack(track) {
  const out2 = [];
  for (const e of registry[track]) if (e) out2.push(e.shortName);
  return out2;
}
function poolIsFull(track) {
  return registry[track].every((e) => e !== null);
}
function laneForParam(track, targetParam) {
  const lanes = registry[track];
  for (let l = 0; l < AUTO_LANES; l++) if (lanes[l]?.targetParam === targetParam) return l;
  return -1;
}
function assignLane(track, slot, info, setMapping) {
  const tp = info.target + ":" + info.ioKey;
  const existing = laneForParam(track, tp);
  if (existing >= 0) return existing;
  const lane2 = registry[track].findIndex((e) => e === null);
  if (lane2 < 0) return -1;
  if (!setMapping(lane2)) return -1;
  registry[track][lane2] = {
    targetParam: tp,
    shortName: info.ioKey,
    min: info.min,
    max: info.max,
    type: info.type,
    options: info.options,
    wiresNames: info.wiresNames
  };
  seqCmd("alabel " + track + " " + lane2 + " " + tp);
  seqCmd("abase " + track + " " + lane2 + " " + toLane7(info.value, info));
  noteLaneBase(track, lane2, info.value);
  return lane2;
}
function clearLane(track, lane2, undoable2 = true) {
  if (lane2 < 0 || lane2 >= AUTO_LANES) return;
  const name = registry[track][lane2]?.shortName;
  registry[track][lane2] = null;
  clearLaneBase(track, lane2);
  liveVal.delete(track + ":" + lane2);
  liveCtx.delete(track + ":" + lane2);
  liveTurn.delete(track + ":" + lane2);
  const clear = () => seqCmd("aclr " + track + " " + lane2);
  if (!undoable2) {
    seqSideEffect(clear);
    return;
  }
  undoableEdit("CLEAR LANE", "T" + (track + 1), clear);
  if (name) seqToast(name + " lane cleared");
}
function accumLive(track, lane2, ctx, seed, delta, shape) {
  const k = track + ":" + lane2;
  if (liveCtx.get(k) !== ctx) {
    liveVal.set(k, seed);
    liveCtx.set(k, ctx);
  }
  const next = stepLane7(liveVal.get(k) ?? seed, delta, shape);
  liveVal.set(k, next);
  return next;
}
var touchedNotTurned = /* @__PURE__ */ new Set();
function automationKnobTouched(physK) {
  if (seqState.stepAutoMode) touchedNotTurned.add(physK);
}
function handleAutomationKnob(track, physK, info, delta, setMapping) {
  const recArmed = seqState.recording && seqState.playing;
  if (!info.automatable) {
    if (seqState.stepAutoMode || !recArmed && heldRange() !== null) {
      seqToast("NO LOCK: " + info.ioKey);
      return true;
    }
    return false;
  }
  if (!seqState.stepAutoMode && !recArmed && beginStepAutomation() < 0) {
    return false;
  }
  const held5 = seqState.stepAutoMode;
  if (!held5 && !recArmed) return false;
  touchedNotTurned.delete(physK);
  const tp = info.target + ":" + info.ioKey;
  let lane2 = laneForParam(track, tp);
  if (lane2 < 0) lane2 = assignLane(track, track, info, setMapping);
  if (lane2 < 0) return true;
  const step = held5 ? seqState.holdStep : seqState.curStep;
  const ctx = held5 ? "h" + step : "r";
  const seed = held5 ? seqState.heldLocks.get(lane2) ?? toLane7(info.value, info) : toLane7(info.value, info);
  const next = accumLive(track, lane2, ctx, seed, delta, info);
  const r = held5 ? heldRange() : null;
  beginGesture("stepauto:" + track + ":" + tp, "AUTOMATION", "T" + (track + 1));
  const quiet = held5 ? " 1" : "";
  if (r && r.s1 > r.s0) {
    seqCmd("asetr " + track + " " + lane2 + " " + r.s0 + " " + r.s1 + " " + next + quiet);
  } else {
    seqCmd("aset " + track + " " + lane2 + " " + step + " " + next + quiet);
  }
  if (held5) seqState.heldLocks.set(lane2, next);
  if (!held5) liveTurn.set(track + ":" + lane2, next);
  return true;
}
function automationKnobReleased(track, physK, info) {
  endEdit("knob:" + track + ":" + info.target + ":" + info.ioKey);
  endEdit("stepauto:" + track + ":" + info.target + ":" + info.ioKey);
  const lane2 = laneForParam(track, info.target + ":" + info.ioKey);
  const wasTap = touchedNotTurned.delete(physK);
  if (lane2 >= 0) {
    liveTurn.delete(track + ":" + lane2);
    liveCtx.delete(track + ":" + lane2);
    liveVal.delete(track + ":" + lane2);
  }
  if (seqState.stepAutoMode && wasTap) {
    if (lane2 >= 0 && seqState.heldLocks.has(lane2)) {
      undoableEdit(
        "CLEAR AUTOMATION",
        "T" + (track + 1),
        () => seqCmd("aclrs " + track + " " + lane2 + " " + seqState.holdStep)
      );
      seqState.heldLocks.delete(lane2);
      liveCtx.delete(track + ":" + lane2);
      requestLabelSync();
      seqToast(info.key + " cleared");
    }
    return;
  }
  if (lane2 < 0) return;
  if (!seqState.stepAutoMode) {
    seqCmd("abaseq " + track + " " + lane2 + " " + toLane7(info.value, info));
    noteLaneBase(track, lane2, info.value);
  }
}
function clearStepAllAutomation(track, step) {
  undoableEdit(
    "CLEAR AUTOMATION",
    "T" + (track + 1),
    () => seqCmd("aclrstep " + track + " " + step)
  );
  requestLabelSync();
  if (seqState.stepAutoMode && seqState.holdStep === step) seqState.heldLocks.clear();
}
function clearLaneForKnob(track, info) {
  const lane2 = laneForParam(track, info.target + ":" + info.ioKey);
  if (lane2 >= 0) clearLane(track, lane2);
}
function validateLane(tp, ps, paramRange, childTemplate = null) {
  const key = tp.slice(tp.indexOf(":") + 1);
  if (ps && key.startsWith(ps.aliasPrefix)) return "drop";
  const template = childTemplate ? childTemplate(key) : null;
  if (template === "bare") return "drop";
  const lookup = template ?? (ps && aliasFromConcrete(ps, key) || key);
  return paramRange(lookup) ?? "drop";
}
function syncLabelsFromEngine(alabels, apply4, validate) {
  let pending4 = false;
  const tracks = alabels.split(",");
  for (let t = 0; t < TRACK_COUNT && t < tracks.length; t++) {
    const lanes = tracks[t].split(".");
    for (let l = 0; l < AUTO_LANES && l < lanes.length; l++) {
      const tp = lanes[l];
      if (registry[t][l]?.targetParam !== tp) clearLaneBase(t, l);
      if (!tp || tp === "-") {
        registry[t][l] = null;
        continue;
      }
      const v = validate(t, tp);
      if (v === "drop") {
        clearLane(t, l, false);
        continue;
      }
      const r = v === "unknown" ? { min: 0, max: 1, type: "float" } : v;
      const e = {
        targetParam: tp,
        shortName: tp.split(":")[1] ?? tp,
        min: r.min,
        max: r.max,
        type: r.type,
        options: r.options,
        wiresNames: r.wiresNames
      };
      registry[t][l] = e;
      if (v === "unknown") {
        pending4 = true;
        continue;
      }
      apply4(t, l, e);
    }
  }
  return pending4;
}

// src/undo/module-dump.ts
var STATE_READ_TRIES = 4;
function captureModuleState(slot, componentKey2) {
  for (let i = 0; i < STATE_READ_TRIES; i++) {
    const raw2 = componentPort(slot, componentKey2).getParam(componentKey2 + ":state");
    if (raw2) return raw2;
  }
  return null;
}
var METADATA = /^(ui_hierarchy|chain_params|preset_names?|preset_name_\d+|preset_count|program_count|plugin_count|mode_count|name|module)$/;
var ACTION = /(^|_)(rnd|save|reset|init|load|clear|randomi[sz]e)(_|$)/i;
var SELECTOR = /^(rom_index|bank_index|plugin_index|patchbank|bank|rom|kit)$/;
var SELECTOR_ORDER = (key) => /^(rom_index|rom)$/.test(key) ? 0 : 1;
var PRESET = /(^|_)(preset|program|patchnumber)$|^(preset_index|current_preset)$/;
function paramTier(key, listParam) {
  if (SELECTOR.test(key)) return 0;
  if (key === listParam || PRESET.test(key)) return 1;
  return 2;
}
function restorable(cp) {
  if (!cp.key || cp.readonly) return false;
  if (METADATA.test(cp.key)) return false;
  if (ACTION.test(cp.key)) return false;
  return true;
}
function engineDrivenKeys(slot, componentKey2) {
  const out2 = /* @__PURE__ */ new Set();
  if (isMasterComponent(componentKey2)) return out2;
  for (let i = 1; i <= 2; i++) {
    if (componentPort(slot, componentKey2).getParam("lfo" + i + ":target") !== componentKey2) continue;
    const tp = componentPort(slot, componentKey2).getParam("lfo" + i + ":target_param");
    if (tp) out2.add(tp);
  }
  for (const k of laneKeysForTrack(slot)) out2.add(k);
  return out2;
}
function listParamOf(slot, componentKey2) {
  const port = componentPort(slot, componentKey2);
  const h = declaredContract({
    read: (k) => port.getParam(componentKey2 + ":" + k),
    moduleId: () => port.getParam(moduleReadKey(componentKey2)),
    componentKey: componentKey2
  }).levels;
  return h?.levels?.root?.list_param ?? "";
}
var LFO_ASSIGN_KEYS = ["target", "target_param", "enabled"];
function captureLfoAssignments(slot, componentKey2) {
  const out2 = [];
  if (isMasterComponent(componentKey2)) return out2;
  for (let i = 1; i <= 2; i++) {
    const prefix = "lfo" + i + ":";
    if (componentPort(slot, componentKey2).getParam(prefix + "target") !== componentKey2) continue;
    for (const k of LFO_ASSIGN_KEYS) {
      const v = componentPort(slot, componentKey2).getParam(prefix + k);
      if (v !== null) out2.push([prefix + k, v]);
    }
  }
  return out2;
}
function stateIsParsable(raw2) {
  return !!raw2 && raw2.charAt(0) === "{";
}
function valuesFromState(raw2) {
  if (!raw2 || raw2.charAt(0) !== "{") return null;
  let obj;
  try {
    obj = JSON.parse(raw2);
  } catch {
    return null;
  }
  const out2 = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === "string") out2[k] = v;
    else if (typeof v === "number") out2[k] = String(v);
    else if (typeof v === "boolean") out2[k] = v ? "1" : "0";
  }
  return out2;
}
function dumpModuleParams(slot, componentKey2, stateBlob) {
  const empty = { params: [], leadCount: 0 };
  const raw2 = componentPort(slot, componentKey2).getParam(componentKey2 + ":chain_params");
  if (!raw2) return empty;
  let arr;
  try {
    arr = JSON.parse(raw2);
  } catch (e) {
    mlog("undo: chain_params parse failed \u2014 module undo will be partial: " + e);
    return empty;
  }
  const _t0 = typeof Date !== "undefined" && Date.now ? Date.now() : 0;
  const fromState = valuesFromState(stateBlob ?? null);
  const listParam = listParamOf(slot, componentKey2);
  const modulated = engineDrivenKeys(slot, componentKey2);
  const tiers = [[], [], []];
  const taken = /* @__PURE__ */ new Set();
  for (const cp of arr) {
    if (!restorable(cp)) continue;
    if (modulated.has(cp.key)) continue;
    const v = (fromState ? fromState[cp.key] : void 0) ?? componentPort(slot, componentKey2).getParam(componentKey2 + ":" + cp.key);
    if (v === null || v === void 0) continue;
    taken.add(cp.key);
    tiers[paramTier(cp.key, listParam)].push([cp.key, v]);
  }
  if (listParam && !taken.has(listParam)) {
    const v = (fromState ? fromState[listParam] : void 0) ?? componentPort(slot, componentKey2).getParam(componentKey2 + ":" + listParam);
    if (v !== null && v !== void 0) tiers[paramTier(listParam, listParam)].push([listParam, v]);
  }
  tiers[0].sort((a, b) => SELECTOR_ORDER(a[0]) - SELECTOR_ORDER(b[0]));
  const params = [...tiers[0], ...tiers[1], ...tiers[2]];
  const leadCount = tiers[0].length + tiers[1].length;
  mlog("undo: dumped " + params.length + " params from " + componentKey2 + " (" + leadCount + " lead" + (modulated.size > 0 ? ", " + modulated.size + " engine-driven skipped" : "") + (fromState ? ", from state" : "") + (typeof Date !== "undefined" && Date.now ? ", " + (Date.now() - _t0) + " ms" : "") + ")");
  return { params, leadCount };
}

// src/undo/verbs.ts
var UNDOABLE_VERBS = [
  // step entry and note editing
  "tog",
  "addp",
  "del",
  "evel",
  "elen",
  "enudge",
  "etrn",
  "slen",
  "eprob",
  "econd",
  "einv",
  // clip shape and clip-level edits
  "clen",
  "cscl",
  "ctr",
  "cq",
  "dbl",
  "loop",
  "ltog",
  "pst",
  // whole-clip gestures
  "clipdel",
  "clipdelat",
  "clipdup",
  "clippaste",
  // automation edits
  "aset",
  "asetr",
  "aclr",
  "aclrs",
  "aclrstep",
  // set-level settings
  "mute",
  "bpm",
  "swing",
  /* Per-voice drum settings, beside the whole-track mute they share a
   * gesture with: a pad mute is the same kind of edit one voice down. */
  "pmute",
  "psolo",
  /* Retroactive capture writes the buffered phrase into the clip, and a
   * tempo re-selection rewrites it — both are edits. `capclr`/`capdone` only
   * touch the runtime input buffer and the overlay, so they stay control. */
  "cap",
  "capsel"
];
var CONTROL_VERBS = [
  "play",
  "stop",
  "rec",
  "metro",
  "launch",
  "stoptrk",
  /* Song mode: building an arrangement is a performance gesture, not an
   * edit — the same call `launch` gets, and for the same reason. */
  "song",
  "songadd",
  "watch",
  "wlane",
  "clipsel",
  "hold",
  "tdrum",
  /* Clipboard fills: they change no musical state — only the paste does. */
  "cpy",
  "cpyclr",
  "clipcopy",
  "non",
  "nof",
  "abase",
  "abaseq",
  "alabel",
  /* `dq` applies a setting the UI owns and persists (ui-state.ts + prefs),
   * so its undo entry is a UI-field op — an engine snapshot could not
   * restore it, because the default is not in the engine's own blob. */
  "dq",
  "capclr",
  "capdone",
  "usnap",
  "uswap",
  "ucommit",
  "udrop",
  "uclr",
  "cmd"
];
var undoable = new Set(UNDOABLE_VERBS);
var control = new Set(CONTROL_VERBS);
function verbOf(op) {
  const sp = op.indexOf(" ");
  return sp < 0 ? op : op.slice(0, sp);
}
function isUndoableVerb(verb) {
  return undoable.has(verb);
}
function isControlVerb(verb) {
  return control.has(verb);
}

// src/undo/record.ts
var strict = false;
var lastViolation = "";
function violation(what) {
  lastViolation = what;
  if (strict) throw new Error("undo: " + what);
  mlog("undo: " + what);
}
function installEditGuard() {
  setEditGuard((op) => {
    if (sideEffectDepth > 0) return;
    const verb = verbOf(op);
    if (isUndoableVerb(verb)) {
      if (!groupOpen()) violation('ungrouped edit "' + op + '"');
      else noteEditActivity();
    } else if (!isControlVerb(verb)) {
      violation('unclassified verb "' + verb + '"');
    }
  });
}
var sideEffectDepth = 0;
function seqSideEffect(fn) {
  sideEffectDepth++;
  try {
    fn();
  } finally {
    sideEffectDepth--;
  }
}
function seqCtl(op) {
  seqCmd(op);
}
function recordParamOp(slot, key, oldVal, newVal) {
  if (oldVal === null) {
    violation('param write with no prior value "' + key + '"');
    return;
  }
  if (!groupOpen()) {
    violation('ungrouped param write "' + key + '"');
    return;
  }
  const op = { slot, key, old: oldVal, new: newVal };
  addParamOp(op);
}
function recordUiOp(field, oldVal, newVal) {
  if (!groupOpen()) {
    violation('ungrouped ui write "' + field + '"');
    return;
  }
  addUiOp({ field, old: oldVal, new: newVal });
}

// src/mixer/track-mutes.ts
var solo = new Array(TRACK_COUNT).fill(false);
var base = null;
function anySoloOn() {
  return solo.some((s) => s);
}
function isMuted(track) {
  return base ? base[track] : seqState.muted[track];
}
function setEngineMute(track, want) {
  if (seqState.muted[track] === want) return;
  seqState.muted[track] = want;
  if (want) releaseLiveOnTrack(track);
  seqCmd("mute " + track + " " + (want ? 1 : 0));
}
function asOneEdit(verb, target2, fn) {
  const before = readUiField("mutes");
  beginEdit({
    key: "mutes:" + verb + ":" + target2,
    verb,
    target: target2,
    close: CLOSE.IMMEDIATE,
    seq: true
  });
  fn();
  recordUiOp("mutes", before, readUiField("mutes"));
  endEdit();
}
function apply2() {
  if (anySoloOn()) {
    if (!base) base = [...seqState.muted];
    for (let t = 0; t < TRACK_COUNT; t++) setEngineMute(t, !solo[t]);
  } else if (base) {
    for (let t = 0; t < TRACK_COUNT; t++) setEngineMute(t, base[t]);
    base = null;
  }
}
function toggleMute(track) {
  if (track < 0 || track >= TRACK_COUNT) return;
  asOneEdit(isMuted(track) ? "UNMUTE" : "MUTE", trackLabel(track), () => {
    if (base) base[track] = !base[track];
    else setEngineMute(track, !seqState.muted[track]);
    apply2();
  });
  mlog("mute t=" + track + " -> " + (isMuted(track) ? 1 : 0));
  markUiStateDirty();
  seqToast("T" + (track + 1) + (isMuted(track) ? " MUTED" : " UNMUTED"));
}
function toggleSolo(track) {
  if (track < 0 || track >= TRACK_COUNT) return;
  const was = solo[track];
  asOneEdit(was ? "UNSOLO" : "SOLO", trackLabel(track), () => {
    for (let t = 0; t < TRACK_COUNT; t++) solo[t] = false;
    solo[track] = !was;
    apply2();
  });
  mlog("solo t=" + track + " -> " + (solo[track] ? 1 : 0) + " set=" + solo.map((s) => s ? 1 : 0).join("") + " mutes=" + seqState.muted.map((m) => m ? 1 : 0).join("") + " base=" + (base ? base.map((b) => b ? 1 : 0).join("") : "-"));
  markUiStateDirty();
  seqToast(soloToast());
}
function soloToast() {
  for (let t = 0; t < TRACK_COUNT; t++) if (solo[t]) return "T" + (t + 1) + " SOLO";
  return "SOLO OFF";
}
function resetTrackMutes() {
  for (let t = 0; t < TRACK_COUNT; t++) solo[t] = false;
  base = null;
}
function mutesSnapshot() {
  return {
    solo: solo.map((s) => s ? 1 : 0),
    base: base ? base.map((b) => b ? 1 : 0) : null
  };
}
function restoreMutes(o) {
  if (Array.isArray(o?.solo)) {
    let seen = false;
    for (let t = 0; t < TRACK_COUNT; t++) {
      solo[t] = !seen && o.solo[t] === 1;
      if (solo[t]) seen = true;
    }
  }
  base = Array.isArray(o?.base) ? Array.from({ length: TRACK_COUNT }, (_, t) => o.base[t] === 1) : null;
}

// src/track/midi-in.ts
var MIDI_IN_SEL = 0;
var MIDI_IN_MAX = 16;
var midiIn = new Array(TRACK_COUNT).fill(MIDI_IN_SEL);
var clamp2 = (v) => typeof v === "number" && isFinite(v) ? Math.max(MIDI_IN_SEL, Math.min(MIDI_IN_MAX, v | 0)) : MIDI_IN_SEL;
function trackMidiIn(track) {
  return midiIn[track] ?? MIDI_IN_SEL;
}
function setTrackMidiIn(track, ch) {
  if (track >= 0 && track < TRACK_COUNT) midiIn[track] = clamp2(ch);
}
function stepTrackMidiIn(track, dir) {
  setTrackMidiIn(track, trackMidiIn(track) + (dir > 0 ? 1 : -1));
}
function midiInLabel(ch) {
  return ch === MIDI_IN_SEL ? "SEL" : "CH " + ch;
}
function trackForChannel(ch) {
  if (ch < 1 || ch > MIDI_IN_MAX) return -1;
  return midiIn.indexOf(ch);
}
function midiInSnapshot() {
  return midiIn.slice();
}
function restoreMidiIn(v) {
  for (let t = 0; t < TRACK_COUNT; t++) midiIn[t] = Array.isArray(v) ? clamp2(v[t]) : MIDI_IN_SEL;
}
function resetMidiIn() {
  midiIn.fill(MIDI_IN_SEL);
}

// src/seq/ui-state.ts
var clampInt = (v, lo, hi, dflt) => typeof v === "number" && isFinite(v) ? Math.max(lo, Math.min(hi, v | 0)) : dflt;
function serializeUiState() {
  return JSON.stringify({
    // `root` is kept as track 0's absolute base so an older build reading a
    // newer file still lands on a sane note.
    root: keyboardState.octave[0] * 12 + keyboardState.rootPc,
    rootPc: keyboardState.rootPc,
    scale: keyboardState.scale,
    mode: keyboardState.mode,
    layout: keyboardState.layout,
    oct: keyboardState.octave.slice(),
    mutes: mutesSnapshot(),
    midiIn: midiInSnapshot(),
    defaultQuant: seqState.defaultQuant
  });
}
function applyUiState(blob) {
  try {
    const o = JSON.parse(blob);
    if (Array.isArray(o.oct)) {
      for (let t = 0; t < TRACK_COUNT; t++)
        keyboardState.octave[t] = clampInt(o.oct[t], OCT_MIN, OCT_MAX, 4);
      keyboardState.rootPc = (clampInt(o.rootPc, -1e6, 1e6, 0) % 12 + 12) % 12;
    } else if (typeof o.root === "number") {
      const r = clampInt(o.root, 0, 103, 48);
      keyboardState.rootPc = r % 12;
      const oct = clampInt(Math.floor(r / 12), OCT_MIN, OCT_MAX, 4);
      for (let t = 0; t < TRACK_COUNT; t++) keyboardState.octave[t] = oct;
    }
    keyboardState.scale = clampInt(o.scale, 0, SCALES.length - 1, keyboardState.scale);
    keyboardState.mode = clampInt(o.mode, 0, MODE_NAMES.length - 1, 0);
    keyboardState.layout = clampInt(o.layout, 0, layoutNames(keyboardState.mode).length - 1, 0);
    if (o.mutes) restoreMutes(o.mutes);
    restoreMidiIn(o.midiIn);
    applyDefaultQuant(typeof o.defaultQuant === "number" ? clampInt(o.defaultQuant, 0, 100, readPrefDefaultQuant()) : readPrefDefaultQuant());
  } catch {
  }
}
function applyDefaultQuant(pct) {
  seqState.defaultQuant = pct;
  seqCmd("dq " + pct);
}
function resetUiState() {
  keyboardState.rootPc = 0;
  keyboardState.scale = 0;
  keyboardState.mode = 0;
  keyboardState.layout = 0;
  resetOctaves();
  resetTrackMutes();
  resetMidiIn();
  applyDefaultQuant(readPrefDefaultQuant());
}

// src/track/send-persist.ts
function sendDocSlot(bus) {
  return MOVY_CHAINS + bus;
}
function busOfDocSlot(slot) {
  const bus = slot - MOVY_CHAINS;
  return bus >= 0 && bus < SEND_BUSES ? bus : -1;
}
function sendTriples(saved) {
  const flat = [];
  if (!Array.isArray(saved)) return flat;
  const seen = /* @__PURE__ */ new Set();
  for (const s of saved) {
    if (!s || typeof s.b !== "number" || typeof s.m !== "string") continue;
    if (s.b < 0 || s.b >= SEND_BUSES || s.m === "") continue;
    if (seen.has(s.b)) continue;
    seen.add(s.b);
    flat.push(String(sendDocSlot(s.b)), SEND_COMPONENT, s.m);
  }
  return flat;
}
function sendPayloadPairs(s) {
  if (!s || typeof s.s !== "string" || s.s === "") return null;
  return [["snd" + s.b + ":state", s.s]];
}

// src/track/lfo-persist.ts
var LFO_KEYS = [
  "enabled",
  "shape",
  "sync",
  "rate_hz",
  "rate_div",
  "depth",
  "polarity",
  "phase_offset",
  "target",
  "target_param",
  "retrigger"
];
var LFO_COUNT = 2;
function lfoStateKeys() {
  const keys = [];
  for (let i = 1; i <= LFO_COUNT; i++) for (const k of LFO_KEYS) keys.push("lfo" + i + ":" + k);
  return keys;
}
function lfoPairs(saved) {
  if (!Array.isArray(saved)) return null;
  const keys = lfoStateKeys();
  if (saved.length !== keys.length) return null;
  const pairs = [];
  for (let i = 0; i < keys.length; i++) {
    const v = saved[i];
    if (typeof v !== "string") return null;
    pairs.push([keys[i], v]);
  }
  return pairs;
}

// src/track/chains-file.ts
var FIELDS = 6;
function parseChainsFile(raw2) {
  const items = decodeBulk(raw2);
  if (!items || items.length % FIELDS !== 0) return null;
  const byTrack = /* @__PURE__ */ new Map();
  const sends = [];
  const lfoLen = lfoStateKeys().length;
  for (let i = 0; i < items.length; i += FIELDS) {
    const slot = Number(items[i]);
    const [c, m, s, mix, lfo2] = items.slice(i + 1, i + FIELDS);
    if (!Number.isInteger(slot) || m === "") continue;
    const bus = busOfDocSlot(slot);
    if (bus >= 0) {
      sends.push(s ? { b: bus, m, s } : { b: bus, m });
      continue;
    }
    if (slot < 0 || slot >= TRACK_COUNT) continue;
    const comp2 = s ? { c, m, s } : { c, m };
    const track = byTrack.get(slot) ?? { t: slot, comp: [] };
    track.comp.push(comp2);
    if (mix) track.mix = mix;
    if (lfo2) {
      const vals = decodeBulk(lfo2);
      if (vals && vals.length === lfoLen) track.lfo = vals;
    }
    byTrack.set(slot, track);
  }
  return {
    chains: [...byTrack.keys()].sort((a, b) => a - b).map((t) => byTrack.get(t)),
    sends
  };
}

// src/track/mix-persist.ts
function mixPair(saved) {
  return isMixValue(saved) ? [MIX_KEY, saved] : null;
}

// src/track/chain-persist.ts
var CHAIN_SET_KEY = "chains";
function writeChainSet(doc) {
  return paramSet(CHAIN_SET_KEY, doc);
}
function persistableComponents() {
  return CHAIN_SLOTS.filter((s) => !isVirtualSlot(s)).map((s) => s.componentKey);
}
function chainSetTriples(saved) {
  const known = new Set(persistableComponents());
  const flat = [];
  if (!Array.isArray(saved)) return flat;
  for (const track of saved) {
    const t = track?.t;
    if (typeof t !== "number" || t < 0 || t >= TRACK_COUNT) continue;
    if (!Array.isArray(track.comp)) continue;
    for (const c of track.comp) {
      if (!c || typeof c.c !== "string" || typeof c.m !== "string") continue;
      if (!known.has(c.c) || c.m === "") continue;
      flat.push(String(t), c.c, c.m);
    }
  }
  return flat;
}
function restoreChains(saved, sends) {
  resetChainPayloads();
  const triples = [...chainSetTriples(saved), ...sendTriples(sends)];
  const entries = triples.length / 3;
  if (!writeChainSet(encodeBulk(triples))) {
    mlog("chains: SET NOT DELIVERED \u2014 " + entries + " component(s) still pending");
    return 0;
  }
  if (entries === 0) return 0;
  const sent3 = /* @__PURE__ */ new Set();
  for (let i = 0; i + 2 < triples.length; i += 3) sent3.add(triples[i] + "|" + triples[i + 1]);
  const payloads = [];
  for (const track of Array.isArray(saved) ? saved : []) {
    const t = track?.t;
    if (typeof t !== "number" || t < 0 || t >= TRACK_COUNT) continue;
    const pairs = [];
    for (const c of Array.isArray(track.comp) ? track.comp : []) {
      if (!c || typeof c.c !== "string" || !sent3.has(t + "|" + c.c)) continue;
      if (typeof c.s === "string" && c.s !== "") pairs.push([c.c + ":state", c.s]);
    }
    const lfo2 = lfoPairs(track.lfo);
    if (lfo2) pairs.push(...lfo2);
    const mix = mixPair(track.mix);
    if (mix) pairs.push(mix);
    if (pairs.length === 0) continue;
    payloads.push({ t, pairs });
  }
  for (const s of Array.isArray(sends) ? sends : []) {
    const pairs = sendPayloadPairs(s);
    if (pairs) payloads.push({ t: -1, bus: s.b, pairs });
  }
  armChainPayloads(payloads);
  return entries;
}

// src/seq/set-load.ts
function openSet(id2) {
  paramSet("setsdir", setsDir());
  paramSet("set", "open " + id2);
  requestLabelSync();
}
function restoreSetChains(id2) {
  const raw2 = readChainsFile(id2);
  const saved = parseChainsFile(raw2);
  if (raw2 !== null && !saved) mlog("chains: " + id2 + " has a chains.json that will not parse \u2014 opening with none (kept in BACKUPS)");
  const n = restoreChains(saved ? saved.chains : null, saved ? saved.sends : null);
  if (n > 0) mlog("chains: restoring " + n + " movy chain component(s)");
}
function loadSet(id2) {
  openSet(id2);
  restoreSetChains(id2);
  const ui = readUiBlob(id2);
  if (ui && ui.length > 0) applyUiState(ui);
}

// src/seq/version-wire.ts
var WHYS = ["open", "auto", "exit", "pre-wipe", "pre-restore", "adopted"];
var rows = [];
function parseVersionRows(raw2) {
  if (!raw2) return [];
  const out2 = [];
  for (const line of raw2.split("\n")) {
    const t = line.split(" ");
    if (t.length < 7) continue;
    const n = +t[0], gen = +t[1], ms = +t[2], clips = +t[4];
    if (!isFinite(n) || !isFinite(gen) || !isFinite(ms)) continue;
    if (WHYS.indexOf(t[3]) < 0) continue;
    out2.push({
      n,
      gen,
      ms,
      why: t[3],
      clips: isFinite(clips) ? clips : 0,
      ui: t[5] === "1",
      ch: t[6] === "1"
    });
  }
  return out2;
}
function refreshVersionRows() {
  rows = parseVersionRows(paramGet("versions"));
}
function versionRows() {
  return rows;
}

// src/seq/version-restore.ts
var pending2 = null;
var RESTORE_TRIES = 60;
var MIGRATE_TRIES = 12e3;
function restoreTick() {
  if (!pending2) return false;
  const v = paramGet("vui");
  if (v === null || v === "pending") {
    if (++pending2.tries < (pending2.kind === "migrate" ? MIGRATE_TRIES : RESTORE_TRIES)) return false;
    mlog(pending2.kind + ": never answered \u2014 giving up");
    pending2 = null;
    return false;
  }
  const { uuid, n, kind } = pending2;
  pending2 = null;
  refreshVersionRows();
  if (kind === "migrate") {
    mlog("migrate: done" + (v === "kept" ? ", open Set " + uuid + " not replaced" : ", open Set " + uuid + " replaced"));
    if (v === "kept" || v === "failed") return false;
    if (v !== "none" && v.length > 0) writeUiBlob(uuid, v);
    return true;
  }
  if (v === "failed") {
    mlog("versions: the engine refused the restore");
    return false;
  }
  mlog("versions: restored " + n + " of " + uuid);
  if (v !== "none" && v.length > 0) writeUiBlob(uuid, v);
  return true;
}
function awaitMigration(uuid) {
  pending2 = { uuid, n: 0, tries: 0, kind: "migrate" };
}
function migrationPending() {
  return pending2 !== null && pending2.kind === "migrate";
}
function restoreVersion(uuid, n) {
  paramSet("set", "restore " + n);
  pending2 = { uuid, n, tries: 0, kind: "restore" };
}

// src/seq/sets-lib.ts
var PAGE_ROOTS = [
  "/data/UserData/schwung/set_pages",
  "/data/UserData/dbx-host/set_pages"
];
var SCHWUNG_STATE = "/data/UserData/schwung/set_state";
var NAME_MAX = 48;
var dash = (v) => !v || v === "-" ? "" : v;
function parseLib(raw2) {
  if (!raw2) return null;
  const lines = raw2.split("\n");
  const head2 = {};
  for (const tok of lines[0].split(" ")) {
    const i = tok.indexOf("=");
    if (i > 0) head2[tok.slice(0, i)] = tok.slice(i + 1);
  }
  const rev = parseInt(head2.rev, 10);
  if (!(rev > 0)) return null;
  const rows3 = [];
  for (const line of lines.slice(1)) {
    const t = line.split("	");
    if (t.length < 4 || !t[0]) continue;
    rows3.push({
      id: t[0],
      clips: parseInt(t[1], 10) || 0,
      depth: parseInt(t[2], 10) || 0,
      name: t.slice(3).join("	")
    });
  }
  return {
    rev,
    cur: dash(head2.cur),
    made: dash(head2.made),
    err: dash(head2.err),
    mig: parseInt(head2.mig, 10) || 0,
    rows: rows3
  };
}
var raw = "";
var state = null;
function libState() {
  return state;
}
function libRefresh() {
  const s = paramGet("lib");
  if (s === null || s === raw) return false;
  raw = s;
  state = parseLib(s);
  return true;
}
function libSend(cmd) {
  paramSet("set", "lib " + cmd);
}
function libMigrateCmd(force) {
  return "migrate legacy=" + LEGACY_SETS_DIR + " move=" + MOVE_SETS_DIR + " pages=" + PAGE_ROOTS.join(",") + " state=" + SCHWUNG_STATE + (force ? " force" : "");
}
var pad2 = (n) => (n < 10 ? "0" : "") + n;
function defaultSetName(now2, rows3) {
  const day = now2.getFullYear() + "-" + pad2(now2.getMonth() + 1) + "-" + pad2(now2.getDate());
  let top = 0;
  for (const r of rows3) {
    if (!r.name.startsWith(day + "_")) continue;
    const n = parseInt(r.name.slice(day.length + 1), 10);
    if (n > top) top = n;
  }
  return day + "_" + pad2(top + 1);
}
function dupName(name) {
  const tail = " Copy";
  return name.slice(0, NAME_MAX - tail.length).trimEnd() + tail;
}

// src/seq/migrate-action.ts
var armed = false;
var progress = "";
var polls = 0;
var POLL_TICKS = 8;
function disarmMigrateRow() {
  armed = false;
}
function migrateRowClick(openId) {
  if (migrationPending()) return;
  if (!armed) {
    armed = true;
    return;
  }
  armed = false;
  mlog("migrate: manual run from Settings");
  libSend(libMigrateCmd(true));
  awaitMigration(openId);
}
var pad22 = (n) => (n < 10 ? "0" : "") + n;
function dateOf(ms) {
  const d = new Date(ms);
  return d.getFullYear() + "-" + pad22(d.getMonth() + 1) + "-" + pad22(d.getDate());
}
function migrateRowValue() {
  if (progress) return progress;
  if (migrationPending()) return "...";
  return armed ? "CONFIRM?" : ">";
}
function migrateRowHint() {
  if (armed) return "Click again. Old versions stay in BACKUPS.";
  const mig = libState()?.mig ?? 0;
  return mig > 0 ? "Ran " + dateOf(mig) + ". Again replaces Move Sets." : "Bring every Set over from Move.";
}
function pollMigrationProgress(watching) {
  if (!watching) {
    progress = "";
    polls = 0;
    return;
  }
  if (++polls < POLL_TICKS) return;
  polls = 0;
  progress = paramGet("migp") ?? "";
}
function migrationProgress() {
  return progress;
}

// src/seq/set-save.ts
function saveNeeded() {
  return uiStateDirty();
}
function saveSet(id2, force = false) {
  if ((takeUiDirty() || force) && !writeUiBlob(id2, serializeUiState())) markUiStateDirty();
}

// src/seq/set-lib-session.ts
var bootedGen = -1;
var madeBefore = null;
var pendingDel = "";
function libraryBlocked() {
  return libState()?.err === "save" ? "SETS FOLDER NOT WRITABLE" : "";
}
function libraryIdentity() {
  const gen = engineGeneration();
  if (gen !== bootedGen) {
    bootedGen = gen;
    paramSet("setsdir", setsDir());
    libSend(libMigrateCmd(false));
  }
  libRefresh();
  const st = libState();
  if (!st) return null;
  if (!wantedSet()) {
    if (st.cur && st.rows.some((r) => r.id === st.cur)) wantSet(st.cur);
    else if (st.rows.length > 0) wantSet(st.rows[0].id);
    else if (madeBefore === null) {
      madeBefore = st.made;
      libSend("new " + defaultSetName(/* @__PURE__ */ new Date(), []));
      return null;
    } else if (st.made && st.made !== madeBefore) {
      wantSet(st.made);
    } else {
      return null;
    }
  }
  const id2 = wantedSet();
  const row = st.rows.find((r) => r.id === id2);
  return { uuid: id2, name: row ? row.name : "" };
}
function deleteWhenLeft(id2) {
  pendingDel = id2;
}
function libraryTick(openId, live3) {
  if (pendingDel && live3 && openId !== pendingDel) {
    libSend("del " + pendingDel);
    pendingDel = "";
  }
}

// src/seq/set-session.ts
var SAVE_TICKS = 600;
var SET_POLL_TICKS = 96;
var phase = "booting";
var setId = "";
var setName = "";
var loadedGen = -1;
var openMark = -1;
var saveCountdown = SAVE_TICKS;
var pollCountdown = 1;
var failReason = "";
var failScope = "set";
function sessionPhase() {
  return phase;
}
function sessionError() {
  return failReason;
}
function sessionFailScope() {
  return failScope;
}
function setFailure(reason, scope = "set") {
  failReason = reason;
  failScope = scope;
  phase = "failed";
}
function clearFailure() {
  failReason = "";
  failScope = "set";
  phase = "booting";
  pollCountdown = 1;
}
function sessionReady() {
  return phase === "ready";
}
function live2() {
  return phase === "ready" || phase === "settling";
}
function chainLoadsPending() {
  return phase === "settling" ? seqState.chainPending : 0;
}
function currentSetUuid() {
  return setId;
}
function reloadCurrentSet() {
  if (!setId && !setName) return;
  enterLoading(setId, setName);
}
function enterLoading(id2, name) {
  phase = "loading";
  loadSet(id2);
  openMark = engineMark();
  setId = id2;
  setName = name;
  if (!readUiBlob(id2)) resetUiState();
  clearUiDirty();
  loadedGen = engineGeneration();
  phase = "settling";
  beginSettle();
  mlog("seq: loaded set " + id2);
}
function settleTick() {
  const r = settleCheck();
  if (r === "wait") return;
  if (!deliverChainPayloads() && r !== "capped") return;
  if (r === "capped") mlog("seq: settle cap reached \u2014 " + settleOutstanding());
  refreshModelsForSet();
  phase = "ready";
  mlog("seq: set ready after " + settleWaited() + "ms");
}
function unreadableOpen() {
  if (!setId || seqState.setBad !== setId || !engineCaughtUp(openMark)) return false;
  failReason = "SET FILE UNREADABLE";
  failScope = "set";
  mlog("seq: FAILED \u2014 " + setId + " has a state file that will not parse");
  phase = "failed";
  return true;
}
function identityChanged(id2, name) {
  phase = "switching";
  sessionFlush(true);
  enterLoading(id2, name);
}
function sessionFlush(force = false) {
  if (!setId) return;
  if (engineGeneration() !== loadedGen) return;
  if (!saveNeeded() && !force) return;
  saveSet(setId, force);
  if (force) paramSet("set", "keep exit");
}
function sessionTick() {
  if (engineAbsent()) {
    if (phase !== "failed") {
      const mismatch = engineAbsentReason() === "mismatch";
      failReason = mismatch ? "ENGINE MISMATCH" : "ENGINE DID NOT START";
      failScope = "engine";
      mlog("seq: FAILED \u2014 " + (mismatch ? "the engine is from another build than ui.js" : "the engine never answered"));
      phase = "failed";
    }
    return;
  }
  pollMigrationProgress(!live2() || migrationPending());
  if (restoreTick()) {
    reloadCurrentSet();
    return;
  }
  if (phase === "failed") return;
  if (!engineReady()) {
    if (live2()) phase = "booting";
    return;
  }
  if (live2() && engineGeneration() !== loadedGen) {
    enterLoading(setId, setName);
    return;
  }
  if (libraryBlocked()) {
    setFailure(libraryBlocked(), "engine");
    return;
  }
  libraryTick(setId, live2());
  if (--pollCountdown <= 0) {
    pollCountdown = live2() ? SET_POLL_TICKS : 8;
    const want = libraryIdentity();
    if (want) {
      if (!live2()) enterLoading(want.uuid, want.name);
      else if (want.uuid !== setId) identityChanged(want.uuid, want.name);
    }
    if (!live2()) return;
  }
  if (unreadableOpen()) return;
  if (phase === "settling") {
    settleTick();
    return;
  }
  if (--saveCountdown > 0) return;
  saveCountdown = SAVE_TICKS;
  sessionFlush();
}

// src/undo/state.ts
var MAX_ENTRIES = 64;
var undoStack = [];
var redoStack = [];
var orphanedSnaps = [];
function orphan(e) {
  if (!e.seqSnap) return;
  orphanedSnaps.push(e.seqSnap.before);
  if (e.seqSnap.after >= 0) orphanedSnaps.push(e.seqSnap.after);
}
function takeOrphanedSnaps() {
  return orphanedSnaps.splice(0, orphanedSnaps.length);
}
function pushEntry(e) {
  while (redoStack.length > 0) orphan(redoStack.pop());
  undoStack.push(e);
  while (undoStack.length > MAX_ENTRIES) orphan(undoStack.shift());
}
function popUndo() {
  return undoStack.pop() ?? null;
}
function popRedo() {
  return redoStack.pop() ?? null;
}
function pushRedo(e) {
  redoStack.push(e);
}
function pushUndoBack(e) {
  undoStack.push(e);
}
function canUndo() {
  return undoStack.length > 0;
}
function canRedo() {
  return redoStack.length > 0;
}
function retractEntry(snapId) {
  for (let i = undoStack.length - 1; i >= 0; i--) {
    const e = undoStack[i];
    if (e.seqSnap?.before !== snapId) continue;
    if (e.seqSnap.after >= 0) orphanedSnaps.push(e.seqSnap.after);
    if (e.paramOps.length === 0 && e.uiOps.length === 0 && !e.moduleOp) {
      undoStack.splice(i, 1);
      return true;
    }
    delete e.seqSnap;
    return false;
  }
  return false;
}
function invalidateUndo(reason) {
  if (undoStack.length === 0 && redoStack.length === 0) return;
  mlog("undo: cleared (" + reason + ")");
  while (undoStack.length > 0) orphan(undoStack.pop());
  while (redoStack.length > 0) orphan(redoStack.pop());
}
function resetUndoState() {
  undoStack.length = 0;
  redoStack.length = 0;
  orphanedSnaps.length = 0;
}

// src/undo/group.ts
var CLOSE = {
  IMMEDIATE: 0,
  TOUCH_RELEASE: 1,
  LOOP_WRAP: 2,
  IDLE: 3
};
var IDLE_MS = 600;
var open = null;
var nextSnapId = 1;
function groupOpen() {
  return open !== null;
}
function now() {
  return typeof Date !== "undefined" && Date.now ? Date.now() : 0;
}
function beginEdit(o) {
  if (open) {
    if (open.key === o.key) {
      open.lastActivityMs = now();
      return;
    }
    endEdit();
  }
  const snapId = o.seq ? nextSnapId++ : -1;
  open = {
    key: o.key,
    verb: o.verb,
    target: o.target ?? "",
    detail: o.detail ?? "",
    close: o.close,
    idleMs: o.idleMs ?? IDLE_MS,
    snapId,
    paramOps: [],
    uiOps: [],
    lastActivityMs: now()
  };
  if (snapId >= 0) seqCmd("usnap " + snapId);
}
function addParamOp(op) {
  if (!open) return;
  open.lastActivityMs = now();
  const prev = open.paramOps.find((p) => p.slot === op.slot && p.key === op.key);
  if (prev) prev.new = op.new;
  else open.paramOps.push(op);
}
function addUiOp(op) {
  if (!open) return;
  open.lastActivityMs = now();
  const prev = open.uiOps.find((u) => u.field === op.field);
  if (prev) prev.new = op.new;
  else open.uiOps.push(op);
}
function addModuleOp(op) {
  if (!open) return;
  open.lastActivityMs = now();
  open.moduleOp = op;
}
function noteEditActivity() {
  if (open) open.lastActivityMs = now();
}
function endEdit(key) {
  if (!open) return;
  if (key !== void 0 && open.key !== key) return;
  const g = open;
  open = null;
  const paramOps = g.paramOps.filter((p) => p.old !== p.new);
  const uiOps = g.uiOps.filter((u) => u.old !== u.new);
  const hasSeq = g.snapId >= 0;
  if (paramOps.length === 0 && uiOps.length === 0 && !g.moduleOp && !g.stateOp && !hasSeq) return;
  if (hasSeq) seqCmd("ucommit " + g.snapId);
  const entry = {
    verb: g.verb,
    target: g.target,
    detail: g.detail,
    paramOps,
    uiOps,
    setUuid: currentSetUuid(),
    engineGen: engineGeneration()
  };
  if (g.stateOp) entry.stateOp = g.stateOp;
  if (hasSeq) entry.seqSnap = { before: g.snapId, after: -1 };
  if (g.moduleOp) entry.moduleOp = g.moduleOp;
  pushEntry(entry);
}
function abandonGroup() {
  if (!open) return;
  if (open.snapId >= 0) seqCmd("udrop " + open.snapId);
  open = null;
}
function onLoopWrap() {
  if (open && open.close === CLOSE.LOOP_WRAP) {
    mlog("undo: rec pass closed at wrap");
    endEdit();
  }
}
function undoTick() {
  if (!open) return;
  if (open.close !== CLOSE.IDLE && open.close !== CLOSE.TOUCH_RELEASE) return;
  if (now() - open.lastActivityMs >= open.idleMs) endEdit();
}
function resetUndoGroups() {
  open = null;
  nextSnapId = 1;
}

// src/undo/edit.ts
function undoableEdit(verb, target2, fn) {
  beginEdit({ key: "once:" + verb + ":" + target2, verb, target: target2, close: CLOSE.IMMEDIATE, seq: true });
  try {
    fn();
  } finally {
    endEdit();
  }
}
function beginGesture(key, verb, target2, seq = true) {
  beginEdit({ key, verb, target: target2, close: CLOSE.TOUCH_RELEASE, seq });
}

// src/seq/edit-ops.ts
var delHeld = false;
var delActed = false;
function deleteActive() {
  return delHeld;
}
function markDeleteActed() {
  delActed = true;
}
function absStep(button) {
  return seqState.barOffset * NUM_STEP_BUTTONS + button;
}
function deleteButton(down) {
  if (down) {
    delHeld = true;
    delActed = false;
    if (anyStepHeld()) {
      const steps = heldStepList();
      undoableEdit("CLEAR AUTOMATION", trackLabel(watchedTrack()), () => {
        for (const s of steps) clearStepAllAutomation(watchedTrack(), s);
      });
      if (steps.length > 0) {
        markHeldGestured();
        seqToast("Automation cleared");
        delActed = true;
      }
    }
  } else {
    delHeld = false;
    if (!delActed) {
      undoableEdit(
        "CLEAR CLIP",
        trackLabel(watchedTrack()),
        () => seqCmd("clipdel " + watchedTrack())
      );
      requestLabelSync();
      seqState.barOffset = 0;
      seqToast("Clip deleted");
    }
  }
}
function deleteStep(button) {
  const t = watchedTrack();
  if (seqState.loopMode) {
    const base2 = button * NUM_STEP_BUTTONS;
    undoableEdit("CLEAR BAR", trackLabel(t) + " BAR " + (button + 1), () => {
      seqCmd(`del ${t} ${base2} ${base2 + NUM_STEP_BUTTONS - 1} -1`);
      for (let s = base2; s < base2 + NUM_STEP_BUTTONS; s++) clearStepAllAutomation(t, s);
    });
    seqToast("Bar cleared");
  } else {
    const s = absStep(button);
    undoableEdit("CLEAR STEP", trackLabel(t) + " STEP " + (s + 1), () => {
      seqCmd(`del ${t} ${s} ${s} -1`);
      clearStepAllAutomation(t, s);
    });
    seqToast("Step cleared");
  }
  delActed = true;
}
function deletePad(pitch) {
  undoableEdit(
    "CLEAR PAD",
    trackLabel(watchedTrack()) + " PAD " + pitch,
    () => seqCmd(`del ${watchedTrack()} 0 255 ${pitch}`)
  );
  seqToast("Notes cleared");
  delActed = true;
}
function resetEditOps() {
  delHeld = false;
  delActed = false;
}

// src/seq/step-rec-head.ts
var TICKS_PER_STEP3 = 24;
var MAX_STEPS2 = 256;
var head = 0;
var growMode = false;
var fresh = true;
var previewPending = false;
var grown = 0;
function headStep() {
  return head;
}
function headIsFresh() {
  return fresh;
}
function headWritten() {
  fresh = false;
}
function growModeOn() {
  return growMode;
}
function previewWanted() {
  return previewPending;
}
function requestPreview() {
  previewPending = true;
}
function takePreview() {
  if (!previewPending) return false;
  previewPending = false;
  return true;
}
function headBegin() {
  growMode = seqState.lenSteps === 0;
  grown = seqState.lenSteps;
  setHead(0);
}
function headEnd() {
  previewPending = false;
  seqState.holdStep = -1;
  seqState.holdNotes = [];
  seqCmd("hold " + watchedTrack() + " -1");
}
function headReset() {
  head = 0;
  growMode = false;
  grown = 0;
  fresh = true;
  previewPending = false;
}
function setHead(step) {
  previewPending = false;
  head = step;
  fresh = true;
  seqState.barOffset = Math.min(Math.floor(head / NUM_STEP_BUTTONS), 15);
  seqState.holdStep = head;
  seqState.holdNotes = [];
  seqCmd("hold " + watchedTrack() + " " + head);
}
function growTo(step) {
  if (!growMode) return;
  const want = Math.min(step + 1, MAX_STEPS2);
  if (want <= grown) return;
  grown = want;
  seqState.lenSteps = want;
  seqCmd("clen " + watchedTrack() + " " + want);
}
function advanceHead() {
  growTo(head);
  let next = head + 1;
  if (growMode) {
    if (next >= MAX_STEPS2) next = 0;
  } else if (next >= seqState.lenSteps) {
    next = seqState.loopStart;
  }
  setHead(next);
}

// src/seq/step-rec-preview.ts
var PREVIEW_MS = 150;
var GIVE_UP_MS = 500;
var sounding = [];
var untilMs = 0;
var watchingSince = -1;
function flushPreview() {
  for (const n of sounding) emitNoteOff(n.track, n.pitch);
  sounding.length = 0;
  untilMs = 0;
  watchingSince = -1;
}
function previewTickAt(nowMs) {
  if (sounding.length > 0 && nowMs >= untilMs) flushPreview();
  if (!previewWanted()) {
    watchingSince = -1;
    return;
  }
  if (watchingSince < 0) watchingSince = nowMs;
  if (seqState.holdStep !== headStep() || seqState.holdNotes.length === 0) {
    if (nowMs - watchingSince > GIVE_UP_MS) {
      takePreview();
      watchingSince = -1;
    }
    return;
  }
  takePreview();
  watchingSince = -1;
  const t = watchedTrack();
  const vel = seqState.holdVel > 0 ? seqState.holdVel : 100;
  for (const p of seqState.holdNotes) {
    const pitch = Math.max(0, Math.min(127, p + seqState.clipTranspose));
    portFor(t).sendMidi(MidiNoteOn, pitch, vel);
    sounding.push({ track: t, pitch });
  }
  untilMs = nowMs + PREVIEW_MS;
}

// src/seq/step-rec.ts
var TAP_MS = 500;
var active = false;
var touched2 = false;
var pressMs2 = 0;
var chord = null;
var heldPads = /* @__PURE__ */ new Map();
function stepRecActive() {
  return active;
}
function stepRecHead() {
  return headStep();
}
function stepRecCanGoLeft() {
  if (!active) return false;
  return chord ? chord.tieSteps > 0 : headStep() > 0;
}
function isDrum() {
  return seqState.watchLane >= 0;
}
function stepRecDownAt(nowMs) {
  if (active || seqState.playing) return false;
  active = true;
  touched2 = false;
  pressMs2 = nowMs;
  chord = null;
  heldPads.clear();
  headBegin();
  return true;
}
function stepRecDown(nowMs = Date.now()) {
  return stepRecDownAt(nowMs);
}
function stepRecUpAt(nowMs) {
  if (!active) return false;
  const wasTap = !touched2 && nowMs - pressMs2 < TAP_MS;
  stepRecEnd();
  return wasTap;
}
function stepRecUp(nowMs = Date.now()) {
  return stepRecUpAt(nowMs);
}
function stepRecEnd() {
  if (!active) return;
  active = false;
  chord = null;
  heldPads.clear();
  flushPreview();
  headEnd();
}
function stepRecPad(padNote, pitch, vel) {
  if (!active) return false;
  touched2 = true;
  heldPads.set(padNote, pitch);
  const t = watchedTrack();
  if (!chord) chord = { pitches: [], anchor: headStep(), tieSteps: 0 };
  const step = chord.anchor;
  beginEdit({
    key: "steprec:" + t + ":" + step + ":" + pitch,
    verb: "STEP RECORD",
    target: trackLabel(t) + " STEP " + (step + 1),
    close: CLOSE.IMMEDIATE,
    seq: true
  });
  if (chord.pitches.length === 0 && headIsFresh()) {
    if (!isDrum()) seqCmd(`del ${t} ${step} ${step} -1`);
    mlog(`seq: steprec ${step}`);
  }
  headWritten();
  seqCmd(`addp ${t} ${step} ${step} ${pitch} ${vel}`);
  growTo(step);
  if (chord.tieSteps > 0) {
    seqCmd(`slen ${t} ${step} ${step} ${pitch} ${(chord.tieSteps + 1) * TICKS_PER_STEP3}`);
  }
  endEdit();
  chord.pitches.push(pitch);
  if (!occHasStep(step)) occToggleStep(step);
  return true;
}
function stepRecPadRelease(padNote) {
  if (!active) return false;
  if (!heldPads.delete(padNote)) return true;
  if (heldPads.size > 0) return true;
  chord = null;
  advanceHead();
  return true;
}
function stepRecArrow(dir) {
  if (!active) return false;
  touched2 = true;
  if (chord) {
    if (dir > 0) chord.tieSteps++;
    else if (chord.tieSteps > 0) chord.tieSteps--;
    else return true;
    const ticks2 = (chord.tieSteps + 1) * TICKS_PER_STEP3;
    const t = watchedTrack();
    beginEdit({
      key: "steprec:tie:" + t + ":" + chord.anchor,
      verb: dir > 0 ? "TIE" : "UNTIE",
      target: trackLabel(t) + " STEP " + (chord.anchor + 1),
      close: CLOSE.IMMEDIATE,
      seq: true
    });
    for (const p of chord.pitches) {
      seqCmd(`slen ${t} ${chord.anchor} ${chord.anchor} ${p} ${ticks2}`);
    }
    const open2 = chord;
    const end = open2.anchor + open2.tieSteps;
    growTo(end);
    endEdit();
    setHead(end);
    chord = open2;
    return true;
  }
  if (dir > 0) {
    advanceHead();
  } else {
    setHead(Math.max(0, headStep() - 1));
    requestPreview();
  }
  return true;
}
function stepRecStepTap(button) {
  if (!active) return false;
  touched2 = true;
  const step = seqState.barOffset * NUM_STEP_BUTTONS + button;
  if (!growModeOn() && step >= seqState.lenSteps) return true;
  beginEdit({
    key: "steprec:tap:" + watchedTrack() + ":" + step,
    verb: occHasStep(step) ? "CLEAR STEP" : "MOVE HEAD",
    target: trackLabel(watchedTrack()) + " STEP " + (step + 1),
    close: CLOSE.IMMEDIATE,
    seq: true
  });
  if (occHasStep(step)) {
    const ln = isDrum() ? seqState.watchLane : -1;
    seqCmd(`del ${watchedTrack()} ${step} ${step} ${ln}`);
    occToggleStep(step);
  }
  growTo(step);
  endEdit();
  setHead(step);
  return true;
}
function resetStepRec() {
  active = false;
  touched2 = false;
  pressMs2 = 0;
  chord = null;
  heldPads.clear();
  flushPreview();
  headReset();
}

// src/seq/router-pads.ts
function padsPlayNotes() {
  return !seqState.sessionMode;
}
var heldChord = /* @__PURE__ */ new Map();
function heldChordPitches() {
  return [...heldChord.values()];
}
function resetSeqChord(notifyEngine = false) {
  if (notifyEngine && engineReady()) {
    for (const [padNote, midiNote] of heldChord) {
      const track = soundingTrack(padNote) ?? extHeldTrack(padNote);
      if (track !== void 0) seqCmd(`nof ${track} ${midiNote}`);
    }
  }
  heldChord.clear();
}
function seqNotePadPlayed(track, padNote, midiNote, vel) {
  if (track >= 0 && track < 4) {
    seqState.lastPitch[track] = midiNote;
    seqState.lastVel[track] = vel;
  }
  if (stepRecPad(padNote, midiNote, vel)) return;
  if (deleteActive()) {
    deletePad(midiNote);
    return;
  }
  if (anyStepHeld()) {
    editPad(midiNote, vel);
    return;
  }
  heldChord.set(padNote, midiNote);
  setHeldSet(track, heldChordPitches());
  if (engineReady()) seqCmd(`non ${track} ${midiNote} ${vel}`);
}
function seqNotePadReleased(padNote, track) {
  if (stepRecPadRelease(padNote)) return;
  const midiNote = heldChord.get(padNote);
  heldChord.delete(padNote);
  if (midiNote !== void 0 && engineReady()) {
    seqCmd(`nof ${track} ${midiNote}`);
  }
}

// src/track/pad-route.ts
var PAD_COUNT2 = 32;
var pushed = "";
var pushedVel = "";
function drumConfigFor(track) {
  return appState.trackModels[track]?.[1]?.getDrumConfig() ?? null;
}
function buildMap() {
  const t = appState.activeTrack.index;
  const drum = drumConfigFor(t);
  const shiftSelect = drumShiftSelect(appState.shiftHeld, drum);
  const muteGesture = appState.muteHeld && drum !== null;
  const owns = padsPlayNotes() && !shiftSelect && !muteGesture;
  const chain = owns ? chainInstance(t) : -1;
  const parts = [chain];
  for (let i = 0; i < PAD_COUNT2; i++) {
    const pad = PAD_MIN + i;
    parts.push(chain < 0 ? -1 : drum ? drumNoteOfPhys(pad, PAD_MIN, drum) : padPitch(t, pad, PAD_MIN));
  }
  return parts.join(",");
}
function engineOwnsPads(track) {
  return pushed !== "" && pushed.startsWith(chainInstance(track) + ",");
}
function syncPadRoute(send2) {
  const next = buildMap();
  if (next !== pushed) {
    pushed = next;
    send2("padmap", next);
  }
  const vel = seqState.fullVelocity ? "1" : "0";
  if (vel !== pushedVel) {
    pushedVel = vel;
    send2("padvel", vel);
  }
}
function resetPadRoute() {
  pushed = "";
  pushedVel = "";
}

// src/track/ext-route.ts
var EXT_DRUM_BASE = 36;
var pushed2 = "";
function extDrumPitch(note, cfg) {
  const pad = note - EXT_DRUM_BASE + 1;
  return pad >= 1 && pad <= cfg.padCount ? drumNoteOfPad(pad, cfg) : -1;
}
function destFor(t) {
  const drum = drumConfigFor(t);
  const parts = [chainInstance(t)];
  if (drum && drum.padCount < 1) return "-1";
  if (drum) for (let pad = 1; pad <= drum.padCount; pad++) parts.push(drumNoteOfPad(pad, drum));
  return parts.join(",");
}
function buildMap2() {
  const segs = [destFor(appState.activeTrack.index)];
  for (let ch = 1; ch <= MIDI_IN_MAX; ch++) {
    const t = trackForChannel(ch);
    if (t >= 0 && t < TRACK_COUNT) segs.push(ch + ":" + destFor(t));
  }
  return segs.join(";");
}
function syncExtRoute(send2) {
  const next = buildMap2();
  if (next === pushed2) return;
  pushed2 = next;
  send2("extmap", next);
}
function resetExtRoute() {
  pushed2 = "";
}

// src/seq/label-sync.ts
var labelSyncPending = false;
function requestLabelSync() {
  labelSyncPending = true;
}
function takeLabelSync() {
  if (!labelSyncPending) return false;
  labelSyncPending = false;
  return true;
}

// src/seq/engine-status.ts
var lastChainGen = -1;
var lastSetApplied = -1;
var noopSnapId = -1;
var lastNoop = -1;
function takeNoopSnapId() {
  const id2 = noopSnapId;
  noopSnapId = -1;
  return id2;
}
var lastEnginePlay = null;
function parseStatus(s) {
  seqState.engineOk = true;
  seqState.cpuCost = "";
  seqState.mixMeter = "";
  seqState.cpuWall = "";
  seqState.cpuMask = "";
  seqState.cpuSend = "";
  seqState.cpuMaster = "";
  for (const kv of s.split(" ")) {
    const eq = kv.indexOf("=");
    if (eq <= 0) continue;
    const key = kv.slice(0, eq);
    const val = kv.slice(eq + 1);
    if (key === "play") seqState.playing = val === "1";
    else if (key === "tick") seqState.engineTick = Number(val) || 0;
    else if (key === "bpm") seqState.bpmX100 = Number(val) || seqState.bpmX100;
    else if (key === "ext") seqState.extSync = val === "1";
    else if (key === "swing") seqState.swingPct = Number(val) || seqState.swingPct;
    else if (key === "trk") {
      seqState.reportedTrack = Number(val) || 0;
      noteReportedTrack(seqState.reportedTrack);
    } else if (key === "step") seqState.curStep = Number(val) || 0;
    else if (key === "len") seqState.lenSteps = Number(val) || 0;
    else if (key === "lstart") seqState.loopStart = Number(val) || 0;
    else if (key === "csc") {
      const [n, d] = val.split("/").map(Number);
      seqState.clipScaleIdx = rationalToIdx(n || 1, d || 1);
    } else if (key === "ctr") seqState.clipTranspose = Number(val) || 0;
    else if (key === "quant") seqState.clipQuant = Number(val) || 0;
    else if (key === "dquant") seqState.defaultQuant = Number(val) || 0;
    else if (key === "chgen") {
      const g = Number(val) || 0;
      if (lastChainGen >= 0 && g !== lastChainGen) markUiStateDirty();
      lastChainGen = g;
    } else if (key === "sapl") {
      const a = Number(val) || 0;
      if (a !== lastSetApplied) {
        requestLabelSync();
      }
      lastSetApplied = a;
    } else if (key === "prq") noteProbeGen(Number(val) || 0);
    else if (key === "chpend") seqState.chainPending = Number(val) || 0;
    else if (key === "sbad") seqState.setBad = val === "-" ? "" : val;
    else if (key === "chcost") seqState.cpuCost = val;
    else if (key === "mtr") seqState.mixMeter = val;
    else if (key === "chwall") seqState.cpuWall = val;
    else if (key === "chmask") seqState.cpuMask = val;
    else if (key === "sndcost") seqState.cpuSend = val;
    else if (key === "mfxcost") seqState.cpuMaster = val;
    else if (key === "rec") seqState.recording = val === "1";
    else if (key === "cin") seqState.countingIn = val === "1";
    else if (key === "cap") {
      const [p, g] = val.split(".");
      seqState.capPending = Number(p) || 0;
      seqState.capGen = Number(g) || 0;
    } else if (key === "metro") seqState.metro = val === "1";
    else if (key === "dirty") seqState.dirty = val === "1";
    else if (key === "pos") seqState.posTick = Number(val) || 0;
    else if (key === "hlen") seqState.holdLen = Number(val) || 0;
    else if (key === "hnotes") {
      seqState.holdNotes = val ? val.split(".").map(Number).filter((n) => n >= 0 && n <= 127) : [];
    } else if (key === "hvel") seqState.holdVel = Number(val) || 0;
    else if (key === "hgate") seqState.holdGate = Number(val) || 0;
    else if (key === "hgmix") seqState.holdGateMixed = val === "1";
    else if (key === "hprob") seqState.holdProb = Number(val) || 0;
    else if (key === "hcond") {
      const [a, b] = val.split(":").map(Number);
      seqState.holdCondA = a || 1;
      seqState.holdCondB = b || 1;
    } else if (key === "hinv") seqState.holdInvert = val === "1";
    else if (key === "hlmax") seqState.holdMaxGate = Number(val) || 0;
    else if (key === "act") activeFromStr(val);
    else if (key === "mute") muteFromStr(val);
    else if (key === "wpad") padMutesFromStr(val);
    else if (key === "sess") sessionFromStr(val);
    else if (key === "song") songFromStr(val);
    else if (key === "occ") occFromHex(val);
    else if (key === "nh") seqState.noteHash = val;
    else if (key === "unop") {
      const id2 = Number(val);
      if (id2 !== lastNoop) {
        lastNoop = id2;
        noopSnapId = id2;
      }
    } else if (key === "alanes") seqState.autoAssigned = parseInt(val, 16) || 0;
    else if (key === "aauto") seqState.autoActive = parseInt(val, 16) || 0;
    else if (key === "hauto") {
      seqState.heldLocks.clear();
      if (val) for (const pair of val.split(".")) {
        const [l, v] = pair.split(":").map(Number);
        if (l >= 0 && l < AUTO_LANES) seqState.heldLocks.set(l, v);
      }
    }
  }
  adoptLoopWindow();
  if (lastEnginePlay !== seqState.playing) {
    mlog("seq: play=" + (seqState.playing ? 1 : 0));
    lastEnginePlay = seqState.playing;
  }
}

// src/seq/note-layout.ts
var NV_TOP = 0;
var NV_BOT = 58;
var SPAN = NV_BOT - NV_TOP + 1;
var ROW_CAP = 12;
var MAX_ROWS = SPAN + 1 >> 1;
var TICKS_PER_BAR = 16 * 24;
function foldRows(notes2) {
  const pitches = [...new Set(notes2.map((n) => n.pitch))].sort((a, b) => a - b);
  const per = Math.max(1, Math.ceil(pitches.length / MAX_ROWS));
  const rowOf = /* @__PURE__ */ new Map();
  pitches.forEach((p, i) => rowOf.set(p, Math.floor(i / per)));
  return { rowOf, rows: Math.ceil(pitches.length / per) };
}
function layoutNotes(notes2, win) {
  const runs2 = [];
  if (notes2.length === 0 || win.bars <= 0) return { runs: runs2, noteH: 0 };
  const { rowOf, rows: rows3 } = foldRows(notes2);
  const rowH = Math.min(ROW_CAP, Math.max(2, Math.floor((SPAN + 1) / rows3)));
  const noteH = rowH - 1;
  const vw = win.segW * win.bars;
  const t0 = win.fromBar * TICKS_PER_BAR;
  const total = win.bars * TICKS_PER_BAR;
  const xOf = (t) => Math.floor((t - t0) * vw / total);
  const cnt = new Uint8Array(vw + 1);
  const start2 = new Uint8Array(vw + 1);
  const byRow = Array.from({ length: rows3 }, () => []);
  for (const n of notes2) byRow[rowOf.get(n.pitch)].push(n);
  for (let r = 0; r < rows3; r++) {
    cnt.fill(0);
    start2.fill(0);
    let any = false;
    for (const n of byRow[r]) {
      const a = xOf(n.tick);
      const b = Math.max(a + 1, xOf(n.tick + Math.max(1, n.gate)));
      if (b <= 0 || a >= vw) continue;
      for (let x = Math.max(0, a); x < Math.min(b, vw); x++) if (cnt[x] < 255) cnt[x]++;
      if (a >= 0) start2[a] = 1;
      any = true;
    }
    if (!any) continue;
    const y1 = NV_BOT - r * rowH;
    const y0 = y1 - noteH + 1;
    let runX = 0;
    let runS = 0;
    for (let x = 0; x <= vw; x++) {
      let s = x === vw ? 0 : cnt[x] >= 2 ? 2 : cnt[x] === 1 ? 1 : 0;
      if (s === 1 && start2[x] && x > 0 && cnt[x - 1] && cnt[x + 1]) s = 0;
      if (s === runS) continue;
      if (runS) runs2.push({ x: runX, w: x - runX, y0, h: noteH, hatched: runS === 2 });
      runX = x;
      runS = s;
    }
  }
  return { runs: runs2, noteH };
}
function columnSpans(runs2, x) {
  const spans = [];
  for (const r of runs2) {
    if (x < r.x || x >= r.x + r.w) continue;
    if (!r.hatched) spans.push([r.y0, r.h]);
    else for (const y of hatchRows(r)) spans.push([y, 1]);
  }
  return spans;
}
function hatchRows(r) {
  const ys = [];
  for (let y = r.y0 + r.h - 1; y >= r.y0; y -= 2) ys.push(y);
  return ys;
}

// src/seq/note-view.ts
var FETCH_MS = 100;
var HEADER_H2 = 9;
var notes = [];
var fetchedHash = "";
var lastFetchMs = -FETCH_MS;
var runs = [];
var drawnKey = "";
var playX = -1;
function noteViewActive() {
  if (!seqState.loopMode || seqState.sessionMode) return false;
  const v = appState.currentView;
  return v === VIEW_KNOBS || v === VIEW_CHAIN || v === VIEW_KEYS;
}
function parseNoteList(s) {
  const out2 = [];
  if (!s) return out2;
  for (const item of s.split(",")) {
    const [tick2, gate, pitch] = item.split(".").map(Number);
    if (tick2 >= 0 && gate >= 0 && pitch >= 0 && pitch <= 127) out2.push({ tick: tick2, gate, pitch });
  }
  return out2;
}
function refresh(nowMs) {
  if (seqState.noteHash === fetchedHash || nowMs - lastFetchMs < FETCH_MS) return;
  lastFetchMs = nowMs;
  const s = paramGet("notes");
  if (s === null) return;
  fetchedHash = seqState.noteHash;
  notes = parseNoteList(s);
}
function liveNotes() {
  let heldEnd = -1;
  const list = notes.map((n) => {
    if (n.gate > 0) return n;
    const end = seqState.posTick >= n.tick ? seqState.posTick : (seqState.loopStart + seqState.lenSteps) * 24;
    heldEnd = Math.max(heldEnd, end);
    return { tick: n.tick, gate: Math.max(1, end - n.tick), pitch: n.pitch };
  });
  return { list, heldEnd };
}
function paintColumn(x, top, inverted) {
  fill_rect(x, top, 1, NV_BOT - top + 1, inverted ? 1 : 0);
  for (const [y, h] of columnSpans(runs, x)) {
    const y0 = Math.max(y, top);
    if (y + h > y0) fill_rect(x, y0, 1, y + h - y0, inverted ? 0 : 1);
  }
}
function paintAll(top) {
  fill_rect(0, NV_TOP, W, NV_BOT - NV_TOP + 1, 0);
  for (const r of runs) {
    if (!r.hatched) fill_rect(r.x, r.y0, r.w, r.h, 1);
    else for (const y of hatchRows(r)) fill_rect(r.x, y, r.w, 1, 1);
  }
  if (top > NV_TOP) drawSeqHeader();
}
function noteViewTick(repainted, nowMs = Date.now()) {
  refresh(nowMs);
  const win = stripWindow();
  const { list, heldEnd } = liveNotes();
  const top = seqHeaderActive() ? HEADER_H2 : NV_TOP;
  const heldCol = heldEnd < 0 ? -1 : Math.floor((heldEnd - win.fromBar * 384) * win.segW / 384);
  const key = `${fetchedHash}|${notes.length}|${win.fromBar}|${win.bars}|${win.segW}|${heldCol}`;
  if (repainted || key !== drawnKey) {
    if (key !== drawnKey) runs = layoutNotes(list, win).runs;
    drawnKey = key;
    paintAll(top);
    playX = -1;
  }
  const px = stripPlayheadX();
  if (px === playX) return;
  if (playX >= 0) paintColumn(playX, top, false);
  if (px >= 0) paintColumn(px, top, true);
  playX = px;
}

// src/track/focus.ts
function selectTrack(index) {
  if (index < 0 || index >= TRACK_COUNT) return;
  const moved = index !== appState.activeTrack.index;
  appState.activeTrack = trackRef(index);
  appState.focusGroup = trackGroup(index);
  if (moved) {
    seqState.barOffset = 0;
    requestLoopWindowAdopt();
  }
}
function focusedTrack(n) {
  return appState.focusGroup * GROUP_SIZE + n;
}
var GROUP_DIR_UP = -1;
var GROUP_DIR_DOWN = 1;
function focusGroupStep(dir) {
  const g = appState.focusGroup + dir;
  if (g < 0 || g * GROUP_SIZE >= TRACK_COUNT) return false;
  appState.focusGroup = g;
  return true;
}
function groupStep(dir) {
  const g = appState.focusGroup + dir;
  if (g < 0 || g * GROUP_SIZE >= TRACK_COUNT) return -1;
  return g * GROUP_SIZE;
}

// src/seq/buttons.ts
function backLedColor(_view) {
  return WHITE_DIM;
}
function arrowLedColor(dir, barOffset, maxOffset) {
  const canGo = dir < 0 ? barOffset > 0 : barOffset < maxOffset;
  return canGo ? WHITE_DIM : WHITE_OFF;
}
function stepRecArrowColor(dir, canGoLeft, blink) {
  if (dir < 0 && !canGoLeft) return WHITE_OFF;
  return blink ? WHITE_BRIGHT : WHITE_DIM;
}
function groupArrowColor(dir) {
  return groupStep(dir) >= 0 ? WHITE_DIM : WHITE_OFF;
}
function sampleLedColor() {
  return C_BLACK;
}
function captureLedColor(pending4) {
  return pending4 > 0 ? WHITE_BRIGHT : WHITE_OFF;
}
function undoLedColor(canUndo2, canRedo2, shiftHeld) {
  return (shiftHeld ? canRedo2 : canUndo2) ? WHITE_DIM : WHITE_OFF;
}
var CC_BACK = 51;
var SETS_EDIT_CCS = [52, 60, 119];
function screenButtonColor(cc2, color, s) {
  if (s.keyboard) return cc2 === CC_BACK ? WHITE_DIM : WHITE_OFF;
  if (s.setsEditable !== null && SETS_EDIT_CCS.includes(cc2)) return s.setsEditable ? WHITE_DIM : WHITE_OFF;
  return color;
}

// src/seq/main-page.ts
function mainPageActive() {
  return appState.currentView === VIEW_MAIN_PARAMS;
}
function mainPageRelease(k) {
  endEdit("mainknob:" + k);
}

// src/seq/param-page.ts
var paramPageState = {
  origin: VIEW_CHAIN
  // view to restore when the layer is left
};
function paramPageActive() {
  return appState.currentView === VIEW_MAIN_PARAMS || appState.currentView === VIEW_CLIP_PARAMS || appState.currentView === VIEW_FLAGS || appState.currentView === VIEW_CPU || appState.currentView === VIEW_VERSIONS || appState.currentView === VIEW_SETS;
}
function openParamPage(view) {
  if (appState.currentView === view) return;
  if (!paramPageActive()) paramPageState.origin = appState.currentView;
  clearCpuPage();
  appState.currentView = view;
}
function closeParamPage() {
  clearCpuPage();
  appState.currentView = paramPageState.origin;
  return paramPageState.origin;
}

// src/seq/cpu-page.ts
function cpuPageActive() {
  return appState.currentView === VIEW_CPU;
}
function openCpuPage() {
  openParamPage(VIEW_CPU);
  seqCmd("cpurst");
}
function clearCpuPage() {
}

// src/seq/flags-page.ts
var flagsPageState = {
  selected: 0
  // index into ACTION_ROWS
};
function flagsPageActive() {
  return appState.currentView === VIEW_FLAGS;
}
var ACTION_ROWS = [
  /* First, not last: the device scenarios reach BACKUPS by clamping onto the
   * last row and stepping up one, so MIGRATE FROM MOVE must stay last. */
  { name: "CLICK VOLUME", hint: "Metronome loudness. Turn knob 1: 0 to +11 dB." },
  { name: "BACKUPS", hint: "Older versions of this set. Restore one." },
  /* Its hint and value are live (migrate-action.ts); these are the fallback. */
  { name: "MIGRATE FROM MOVE", hint: "Bring every Set over from Move." }
];
function flagsRowCount() {
  return ACTION_ROWS.length;
}
function actionRowSelected() {
  const i = flagsPageState.selected;
  return i >= 0 && i < ACTION_ROWS.length ? i : -1;
}
function clickRowSelected() {
  return actionRowSelected() === 0;
}
function backupsRowSelected() {
  return actionRowSelected() === 1;
}
function migrateRowSelected() {
  return actionRowSelected() === 2;
}
function flagsPageJog(delta) {
  flagsPageState.selected = Math.max(0, Math.min(flagsRowCount() - 1, flagsPageState.selected + delta));
}
function resetFlagsPage() {
  flagsPageState.selected = 0;
}

// src/renderer/text-entry-lib.ts
var lib2 = null;
try {
  lib2 = await import("/data/UserData/schwung/shared/text_entry.mjs");
} catch {
  lib2 = null;
}
function textEntry() {
  return lib2;
}
function textEntryActive() {
  return !!lib2 && lib2.isTextEntryActive();
}

// src/seq/set-names.ts
var SET_NAME_PAIRS = [
  "Velvet Echo",
  "Midnight Chorus",
  "Silver Cadence",
  "Amber Drift",
  "Paper Moon",
  "Hollow Reed",
  "Golden Hour",
  "Quiet Storm",
  "Neon Rain",
  "Glass Harmonica",
  "Distant Thunder",
  "Slow Bloom",
  "Low Tide",
  "Morning Raga",
  "Copper Bells",
  "Static Bloom",
  "Winter Hymn",
  "Ember Glow",
  "Lunar Tide",
  "Soft Static",
  "Blue Hour",
  "Dust Choir",
  "Night Shift",
  "Silent Pulse",
  "Iron Lullaby",
  "Willow Song",
  "Salt Wind",
  "First Light",
  "Last Waltz",
  "Open Fifths",
  "Broken Chord",
  "Minor Key",
  "Grace Note",
  "Ghost Note",
  "Blue Note",
  "Tape Hiss",
  "Vinyl Crackle",
  "Warm Fuzz",
  "Deep Bass",
  "Long Delay",
  "Spring Reverb",
  "Analog Dream",
  "Pocket Groove",
  "Back Beat",
  "Off Beat",
  "Half Time",
  "Double Time",
  "Swing Shift",
  "Dark Matter",
  "Star Dust",
  "Moon Dance",
  "Sun Ritual",
  "Rain Dance",
  "Wave Form",
  "Echo Chamber",
  "Night Train",
  "Ghost Town",
  "Paper Planes",
  "Glass Garden",
  "Crystal Cave",
  "Cloud Atlas",
  "Fever Dream",
  "Day Dream",
  "Lucid Dream",
  "Waking Life",
  "Northern Lights",
  "Southern Cross",
  "Eastern Wind",
  "Western Sky",
  "Polar Night",
  "Desert Rose",
  "Ocean Floor",
  "River Bend",
  "Mountain Air",
  "Forest Floor",
  "Autumn Leaves",
  "Summer Haze",
  "Winter Light",
  "Spring Thaw",
  "Harvest Moon",
  "Blood Orange",
  "Indigo Child",
  "Violet Hour",
  "Emerald City",
  "Velvet Night",
  "Silk Road",
  "Cotton Clouds",
  "Linen Sky",
  "Heart Beat",
  "Slow Motion",
  "Free Fall",
  "Zero Gravity",
  "High Tide",
  "Rising Sun",
  "Falling Star",
  "Shooting Star",
  "Morning Star",
  "Evening Star",
  "Dawn Chorus",
  "Dusk Song",
  "Twilight Zone",
  "Night Owl",
  "Early Bird",
  "Black Swan",
  "White Noise",
  "Pink Noise",
  "Brown Noise",
  "Red Shift",
  "Gold Rush",
  "Silver Lining",
  "Bronze Age",
  "Stone Circle",
  "Tidal Wave",
  "Sound Wave",
  "Heat Wave",
  "New Wave",
  "Cold Front",
  "Warm Front",
  "Still Life",
  "Night Life",
  "Wild Life",
  "Secret Garden",
  "Hidden Track",
  "Lost Chord",
  "Found Sound",
  "Field Recording",
  "Room Tone",
  "Drone Field",
  "Sub Harmonic",
  "Over Tone",
  "Under Current",
  "Cross Fade",
  "Slow Fade",
  "Hard Cut",
  "Soft Focus",
  "Sharp Edge",
  "Gentle Rain",
  "Heavy Rain",
  "Purple Rain",
  "Summer Rain",
  "Snow Blind",
  "Sun Drunk",
  "Moon Struck",
  "Star Crossed",
  "Love Struck",
  "Paper Heart",
  "Glass Heart",
  "Stone Heart",
  "Wild Heart",
  "Open Heart",
  "Hollow Bones",
  "Silver Bones",
  "Glass Bones",
  "Velvet Bones",
  "Old Bones",
  "Sacred Geometry",
  "Golden Ratio",
  "Perfect Fourth",
  "Tritone Blues",
  "Major Seventh",
  "Modal Drift",
  "Dorian Mood",
  "Lydian Dream",
  "Phrygian Night",
  "Mixolydian Sun",
  "Pentatonic Rain",
  "Chromatic Dust",
  "Whole Tone",
  "Blue Scale",
  "Diminished Light",
  "Pulse Width",
  "Sine Wave",
  "Saw Tooth",
  "Triangle Moon",
  "Filter Sweep",
  "Low Pass",
  "High Pass",
  "Band Pass",
  "Phase Shift",
  "Ring Mod",
  "Bit Crush",
  "Wave Fold",
  "Soft Clip",
  "Hard Sync",
  "Arp Dream",
  "Step Dance",
  "Loop Garden",
  "Clip Show",
  "Scene Change",
  "Tape Loop",
  "Tape Echo",
  "Tape Memory",
  "Dub Siren",
  "Dub Plate",
  "Bass Line",
  "Drum Circle",
  "Kick Drum",
  "Snare Roll",
  "Organ Grinder",
  "Music Box",
  "Toy Piano",
  "Steel Drum",
  "Tin Whistle",
  "Wind Chime",
  "Rain Stick",
  "Thumb Piano",
  "Singing Bowl",
  "Tuning Fork",
  "Cello Suite",
  "Piano Roll",
  "Violin Ghost",
  "Brass Section",
  "String Theory",
  "Choir Loft",
  "Bell Tower",
  "Church Organ",
  "Opera House",
  "Concert Hall",
  "Basement Show",
  "Attic Tapes",
  "Garage Band",
  "Bedroom Pop",
  "Late Night",
  "Small Hours",
  "Witching Hour",
  "Happy Hour",
  "Spring Break",
  "Heart Break",
  "Day Break",
  "Ivory Tower",
  "Lighthouse Keeper",
  "Night Watch",
  "Lantern Light",
  "Candle Wax",
  "Smoke Signal",
  "Morse Code",
  "Radio Silence",
  "Short Wave",
  "Long Wave",
  "Signal Fire",
  "Pilot Light",
  "Neon Sign",
  "Street Light",
  "City Lights",
  "Electric Dreams",
  "Magnetic Field",
  "Static Charge",
  "Solar Wind",
  "Cosmic Ray",
  "Orbit Song",
  "Comet Tail",
  "Nebula Drift",
  "Gravity Well",
  "Event Horizon",
  "Feather Light",
  "Iron Will",
  "Paper Tiger",
  "Velvet Glove",
  "Golden Thread"
];
var DATED = /^\d{4}-\d\d-\d\d_\d+$/;
function isDatedName(name) {
  return DATED.test(name.trim());
}
function generateSetName(rows3, rand = Math.random) {
  const used = new Set(rows3.map((r) => r.name.trim().toLowerCase()));
  const n = SET_NAME_PAIRS.length;
  const start2 = Math.floor(rand() * n) % n;
  for (let i = 0; i < n; i++) {
    const name = SET_NAME_PAIRS[(start2 + i) % n];
    if (!used.has(name.toLowerCase())) return name;
  }
  for (let k = 2; ; k++) {
    const name = SET_NAME_PAIRS[start2] + " " + k;
    if (!used.has(name.toLowerCase())) return name;
  }
}
function renameInitialText(row, rows3, rand) {
  return isDatedName(row.name) ? generateSetName(rows3, rand) : row.name;
}

// src/seq/sets-page.ts
var setsPageState = {
  selected: 0,
  confirming: false
};
var madeBefore2 = null;
var openMade = false;
var replaceThenDelete = "";
var pollIn = 0;
function setsPageActive() {
  return appState.currentView === VIEW_SETS;
}
function rows2() {
  return libState()?.rows ?? [];
}
function resetSetsPage() {
  setsPageState.selected = 0;
  setsPageState.confirming = false;
  madeBefore2 = null;
  openMade = false;
  replaceThenDelete = "";
}
function openSetsPage(openId) {
  resetSetsPage();
  libRefresh();
  const i = rows2().findIndex((r) => r.id === openId);
  setsPageState.selected = i >= 0 ? i + 1 : 0;
  openParamPage(VIEW_SETS);
}
function setsPageTick() {
  if (--pollIn > 0) return false;
  pollIn = madeBefore2 !== null ? 4 : 16;
  if (!libRefresh()) return false;
  const st = libState();
  if (st && madeBefore2 !== null && st.made && st.made !== madeBefore2) {
    madeBefore2 = null;
    const i = st.rows.findIndex((r) => r.id === st.made);
    if (replaceThenDelete) {
      wantSet(st.made);
      deleteWhenLeft(replaceThenDelete);
      replaceThenDelete = "";
    } else if (openMade) {
      openMade = false;
      wantSet(st.made);
      if (setsPageActive()) appState.currentView = closeParamPage();
      appState.dirty = true;
      return true;
    } else if (i >= 0) {
      setsPageState.selected = i + 1;
    }
  }
  const max = rows2().length;
  if (setsPageState.selected > max) setsPageState.selected = max;
  return true;
}
function send(cmd, awaitMade, open2 = false) {
  if (awaitMade) madeBefore2 = libState()?.made ?? "";
  openMade = open2;
  libSend(cmd);
  pollIn = 1;
}
function setsPageJog(delta, shift) {
  if (setsPageState.confirming) return;
  const step = shift ? 8 : 1;
  setsPageState.selected = Math.max(0, Math.min(rows2().length, setsPageState.selected + delta * step));
}
function target() {
  return rows2()[setsPageState.selected - 1] ?? null;
}
function setsPageEditable() {
  return !!target() && !setsPageState.confirming;
}
function setsPageClick(openId) {
  if (setsPageState.confirming) {
    setsPageState.confirming = false;
    const t2 = target();
    if (t2) deleteSet(t2, openId);
    return false;
  }
  if (setsPageState.selected === 0) {
    send("new " + defaultSetName(/* @__PURE__ */ new Date(), rows2()), true, true);
    return false;
  }
  const t = target();
  if (!t) return false;
  if (t.id !== openId) wantSet(t.id);
  appState.currentView = closeParamPage();
  return true;
}
function deleteSet(t, openId) {
  if (t.id !== openId) {
    send("del " + t.id, false);
    return;
  }
  const list = rows2();
  const i = list.findIndex((r) => r.id === t.id);
  const next = list[i + 1] ?? list[i - 1];
  if (next) {
    wantSet(next.id);
    deleteWhenLeft(t.id);
  } else {
    replaceThenDelete = t.id;
    send("new " + defaultSetName(/* @__PURE__ */ new Date(), list), true);
  }
}
function setsPageBack() {
  if (!setsPageState.confirming) return false;
  setsPageState.confirming = false;
  return true;
}
function setsPageButton(b) {
  const t = target();
  if (!t || setsPageState.confirming) return;
  if (b === "delete") {
    setsPageState.confirming = true;
    return;
  }
  if (b === "copy") {
    send("dup " + t.id + " " + dupName(t.name), true);
    return;
  }
  const te = textEntry();
  if (!te) {
    seqToast("RENAME NEEDS NEWER SCHWUNG");
    return;
  }
  te.openTextEntry({
    /* No title: the keyboard prints it in front of the name on the one
     * line it has, where it costs width and reads as part of the name. */
    title: "",
    initialText: renameInitialText(t, rows2()),
    onConfirm: (text2) => {
      const name = text2.trim();
      if (name && name !== t.name) send("rename " + t.id + " " + name, false);
      appState.dirty = true;
    },
    onCancel: () => {
      appState.dirty = true;
    }
  });
}

// src/seq/voice-copy.ts
function voiceCopyArgs(track) {
  if (track !== watchedTrack() || seqState.watchLane < 0) return "";
  const model = componentModelOf(track, "synth");
  const keys = model && typeof model.voiceKeysOf === "function" ? model.voiceKeysOf(model.getDrumCurrentPad()) : null;
  if (!keys) return "";
  const own = new Set(keys.map((k) => model.getComponentKey() + ":" + k));
  let mask = 0;
  automationRegistry()[track].forEach((e, lane2) => {
    if (e && own.has(e.targetParam)) mask |= 1 << lane2;
  });
  return " " + seqState.watchLane + " " + (mask >>> 0);
}

// src/seq/duplicate.ts
var held2 = false;
var source5 = null;
function dupActive() {
  return held2;
}
function copyButton(down) {
  held2 = down;
  source5 = null;
}
function onUnit(u) {
  if (!held2) return;
  if (source5 === null) {
    source5 = u;
    copySource(u);
    seqToast("Copied");
  } else {
    pasteTo(u);
    seqToast("Pasted");
  }
}
function copySource(u) {
  if (u.kind === "clip") seqCmd(`clipcopy ${u.track} ${u.slot}`);
  else if (u.kind === "step") seqCmd(`cpy ${u.track} ${u.step} ${u.step}${voiceCopyArgs(u.track)}`);
  else seqCmd(`cpy ${u.track} ${u.bar * 16} ${u.bar * 16 + 15}${voiceCopyArgs(u.track)}`);
}
function pasteTo(dest) {
  const label2 = dest.kind === "clip" ? "PASTE CLIP" : dest.kind === "step" ? "PASTE STEP" : "PASTE BAR";
  undoableEdit(label2, trackLabel(dest.track), () => {
    if (dest.kind === "clip") {
      seqCmd(`clippaste ${dest.track} ${dest.slot}`);
      requestLabelSync();
    } else if (dest.kind === "step") seqCmd(`pst ${dest.track} ${dest.step}`);
    else seqCmd(`pst ${dest.track} ${dest.bar * 16}`);
  });
}
function resetDuplicate() {
  held2 = false;
  source5 = null;
}

// src/seq/session.ts
var COLS2 = 8;
var ROWS2 = 4;
var deleteHeld = false;
function rowTrack(rowFromBottom) {
  return focusedTrack(ROWS2 - 1 - rowFromBottom);
}
function padToCell(padNote, padMin) {
  const idx2 = padNote - padMin;
  if (idx2 < 0 || idx2 >= ROWS2 * COLS2) return null;
  return { track: rowTrack(Math.floor(idx2 / COLS2)), slot: idx2 % COLS2 };
}
function sessionDeleteButton(down) {
  deleteHeld = down;
}
function sessionPad(padNote, padMin) {
  const cell = padToCell(padNote, padMin);
  if (!cell) return;
  const { track, slot } = cell;
  if (deleteHeld) {
    undoableEdit(
      "DELETE CLIP",
      clipTarget(track, slot),
      () => seqCmd(`clipdelat ${track} ${slot}`)
    );
    requestLabelSync();
    seqToast("Clip deleted");
    return;
  }
  if (dupActive()) {
    onUnit({ kind: "clip", track, slot });
    return;
  }
  selectTrack(track);
  appState.dirty = true;
  seqCmd(`launch ${track} ${slot}`);
}
function sessionCellColor(c) {
  const tc = c.muted ? trackColorDim(c.track) : trackColor(c.track);
  if (c.isQueued) return { base: c.exists ? tc : C_BLACK, anim: C_WHITE, channel: ANIM_PULSE_FAST };
  if (c.isPlaying) return { base: tc, anim: C_WHITE, channel: ANIM_PULSE };
  if (c.isSel && c.exists) return { base: tc, anim: C_WHITE, channel: ANIM_PULSE_SLOW };
  if (c.isSel) return { base: C_DARKGREY, anim: C_DARKGREY, channel: ANIM_NONE };
  if (c.exists) return { base: tc, anim: tc, channel: ANIM_NONE };
  return { base: C_BLACK, anim: C_BLACK, channel: ANIM_NONE };
}
function sessionPaintGrid(setLed, padMin) {
  for (let idx2 = 0; idx2 < ROWS2 * COLS2; idx2++) {
    const slot = idx2 % COLS2;
    const track = rowTrack(Math.floor(idx2 / COLS2));
    const st = seqState.session[track];
    const exists = (st.exist & 1 << slot) !== 0;
    const isSel = st.selected === slot;
    const isPlaying = st.playing === slot;
    const isQueued = st.queued === slot;
    const led = sessionCellColor({
      exists,
      isSel,
      isPlaying,
      isQueued,
      track,
      muted: seqState.muted[track]
    });
    setLed(padMin + idx2, led.base, led.anim, led.channel);
  }
}

// src/app/jog-hint.ts
var state2 = { pressMs: 0, shown: false };
function jogHintTouch(down) {
  const was = state2.shown;
  state2.pressMs = down ? Date.now() : 0;
  state2.shown = false;
  return was;
}
function jogHintTick() {
  if (state2.shown || !state2.pressMs) return false;
  if (Date.now() - state2.pressMs < HOLD_MS) return false;
  state2.shown = true;
  return true;
}
function jogHintVisible() {
  return state2.shown;
}

// src/track/switch.ts
function beginTrackSwitch() {
  if (paramPageActive()) appState.currentView = closeParamPage();
  return {
    track: appState.activeTrack.index,
    view: appState.currentView === VIEW_BROWSE ? appState.browseOrigin : appState.currentView,
    session: seqState.sessionMode,
    loop: seqState.loopMode
  };
}
function logSwitch(track) {
  mlog("track: active=" + track + " chain=" + chainInstance(track));
}
function repaint() {
  appState.initLedsDone = false;
  appState.initLedIndex = 0;
  appState.dirty = true;
}
function switchToTrack(track, prev) {
  appState.trackView[prev.track] = prev.view;
  seqState.sessionMode = false;
  seqState.loopMode = false;
  appState.masterDetail = false;
  releaseAllLive();
  selectTrack(track);
  appState.currentView = appState.trackView[track];
  jogHintTouch(false);
  logSwitch(track);
  repaint();
}
function restoreTrackState(prev) {
  releaseAllLive();
  seqState.sessionMode = prev.session;
  seqState.loopMode = prev.loop;
  selectTrack(prev.track);
  appState.currentView = prev.view;
  logSwitch(prev.track);
  repaint();
}

// src/seq/momentary.ts
var HOLD_MS2 = 500;
var active2 = null;
function momentaryDownAt(button, nowMs, restore) {
  active2 = { button, pressMs: nowMs, restore, gestured: false };
}
function momentaryGesture() {
  if (active2) active2.gestured = true;
}
function momentaryUpAt(button, nowMs) {
  if (!active2 || active2.button !== button) return "none";
  const revert = active2.gestured || nowMs - active2.pressMs >= HOLD_MS2;
  const restore = active2.restore;
  active2 = null;
  if (revert) {
    restore();
    return "revert";
  }
  return "tap";
}
function momentaryCancel(button) {
  if (active2 && active2.button === button) active2 = null;
}
function momentaryPlainHold(button, nowMs, minMs) {
  return !!active2 && active2.button === button && !active2.gestured && nowMs - active2.pressMs >= minMs;
}
function momentaryDown(button, restore) {
  momentaryDownAt(button, Date.now(), restore);
}
function momentaryUp(button) {
  return momentaryUpAt(button, Date.now());
}
function resetMomentary() {
  active2 = null;
}

// src/seq/track-select.ts
var STEP_PEEK = 20816;
var sessionBtnDown = false;
var peekStep = -1;
function trackSelectActive() {
  return seqState.sessionMode || seqState.trackSelectHold;
}
function sessionButtonHeld() {
  return sessionBtnDown;
}
function sessionStepLed(step, focusGroup, selectedTrack, muted = false) {
  if (step < 0 || step >= TRACK_COUNT) return { base: C_BLACK, anim: C_BLACK, channel: ANIM_NONE };
  const tc = muted ? trackColorDim(step) : trackColor(step);
  if (step === selectedTrack) return { base: C_WHITE, anim: C_WHITE, channel: ANIM_NONE };
  return trackGroup(step) === focusGroup ? { base: C_BLACK, anim: tc, channel: ANIM_PULSE } : { base: tc, anim: tc, channel: ANIM_NONE };
}
function sessionButtonDown(down) {
  sessionBtnDown = down;
  if (!down && seqState.trackSelectHold) {
    seqState.trackSelectHold = false;
    appState.dirty = true;
  }
}
function sessionStepPress(step) {
  if (step < 0 || step >= TRACK_COUNT) return;
  const prev = beginTrackSwitch();
  if (sessionBtnDown) {
    momentaryCancel(CC_NOTE_SESSION);
    switchToTrack(step, prev);
    seqState.trackSelectHold = true;
    return;
  }
  peekStep = step;
  momentaryDown(STEP_PEEK, () => restoreTrackState(prev));
  switchToTrack(step, prev);
}
function sessionStepRelease(step) {
  if (step !== peekStep) return false;
  peekStep = -1;
  momentaryUp(STEP_PEEK);
  appState.dirty = true;
  return true;
}
function resetTrackSelect() {
  sessionBtnDown = false;
  peekStep = -1;
  seqState.trackSelectHold = false;
}

// src/undo/module-apply.ts
var RESTORE_TIMEOUT_TICKS = 200;
var SETTLE_TICKS2 = 50;
var VERIFY_ROUNDS = 3;
var VERIFY_TICKS = 30;
var pending3 = null;
function moduleRestorePending() {
  return pending3 !== null && pending3.blocksUndo;
}
function beginModuleRestore(op, undoing) {
  pending3 = {
    op,
    state: (undoing ? op.oldState : op.newState) ?? null,
    params: undoing ? op.oldParams : op.newParams ?? [],
    leadCount: undoing ? op.leadCount : op.newLeadCount ?? 0,
    wantIds: undoing ? op.oldIds : op.newIds,
    blocksUndo: true,
    phase: "wait",
    ticksLeft: RESTORE_TIMEOUT_TICKS,
    settleLeft: SETTLE_TICKS2,
    verifyLeft: VERIFY_TICKS,
    roundsLeft: VERIFY_ROUNDS
  };
}
function beginParamRestore(slot, componentKey2, params, leadCount, verifyOnly = false) {
  if (params.length === 0) return;
  pending3 = {
    op: {
      slot,
      componentKey: componentKey2,
      oldWrite: "",
      newWrite: "",
      oldIds: [],
      newIds: [],
      oldParams: [],
      leadCount: 0
    },
    state: null,
    params,
    leadCount,
    wantIds: [],
    blocksUndo: false,
    /* verifyOnly: a state blob has already restored the module, so writing
     * the params again would be worse than useless. The lead is the preset,
     * and re-writing it makes the DSP RELOAD that preset — throwing away
     * what the blob just restored, then taking hundreds of individual writes
     * while it is mid-load. Surge XT came back silent or noisy from exactly
     * that. Verify instead: read back, and rewrite only what the module
     * actually failed to restore. */
    phase: verifyOnly ? "verify" : "lead",
    ticksLeft: RESTORE_TIMEOUT_TICKS,
    settleLeft: SETTLE_TICKS2,
    verifyLeft: VERIFY_TICKS,
    roundsLeft: VERIFY_ROUNDS
  };
}
function liveModuleId(op) {
  return componentPort(op.slot, op.componentKey).getParam(moduleReadKey(op.componentKey)) || "";
}
function moduleIsReady(p) {
  const live3 = liveModuleId(p.op);
  if (p.wantIds.length === 0) return live3 === "";
  if (!p.wantIds.includes(live3)) return false;
  if (p.state === null && p.params.length === 0) return true;
  const cp = componentPort(p.op.slot, p.op.componentKey).getParam(p.op.componentKey + ":chain_params");
  return !!cp && cp !== "[]";
}
function write(p, from, to) {
  for (let i = from; i < to; i++) {
    const [key, val] = p.params[i];
    setChainParamUntracked(
      componentPort(p.op.slot, p.op.componentKey),
      p.op.componentKey + ":" + key,
      val
    );
  }
}
function sameValue(a, b) {
  if (a === b) return true;
  const x = parseFloat(a), y = parseFloat(b);
  if (isNaN(x) || isNaN(y)) return false;
  return Math.abs(x - y) < 1e-4;
}
function rewriteDrifted(p) {
  let fixed = 0;
  for (let i = p.leadCount; i < p.params.length; i++) {
    const [key, want] = p.params[i];
    const full = p.op.componentKey + ":" + key;
    const port = componentPort(p.op.slot, p.op.componentKey);
    const live3 = port.getParam(full);
    if (live3 === null || sameValue(live3, want)) continue;
    setChainParamUntracked(port, full, want);
    fixed++;
  }
  return fixed;
}
function toVerify(p, op) {
  if (p.params.length <= p.leadCount) {
    finish(op);
    return;
  }
  p.phase = "verify";
}
function finish(op) {
  for (const [key, val] of op.oldLfo ?? []) {
    componentPort(op.slot, op.componentKey).setParam(key, val);
  }
  if ((op.oldLfo?.length ?? 0) > 0) mlog("undo: restored " + op.oldLfo.length + " LFO assignment fields");
  requestLabelSync();
  pending3 = null;
}
function moduleRestoreTick() {
  if (!pending3) return;
  const { op } = pending3;
  if (pending3.phase === "lead") {
    write(pending3, 0, pending3.leadCount);
    if (pending3.leadCount > 0) {
      mlog("undo: restored " + pending3.leadCount + " selector/preset params");
      pending3.phase = "settle";
      return;
    }
    write(pending3, 0, pending3.params.length);
    mlog("undo: replayed " + pending3.params.length + " params");
    toVerify(pending3, op);
    return;
  }
  if (pending3.phase === "wait") {
    if (!moduleIsReady(pending3)) {
      if (--pending3.ticksLeft > 0) return;
      mlog("undo: module restore timed out (" + pending3.wantIds.join("|") + ")");
      pending3 = null;
      invalidateUndo("module restore timeout");
      return;
    }
    if (pending3.state !== null) {
      setChainParamUntracked(
        componentPort(op.slot, op.componentKey),
        op.componentKey + ":state",
        pending3.state
      );
      mlog("undo: restored module state (" + pending3.state.length + " bytes)");
      if (pending3.params.length > pending3.leadCount) pending3.phase = "verify";
      else finish(op);
      return;
    }
    write(pending3, 0, pending3.leadCount);
    if (pending3.leadCount > 0) {
      mlog("undo: restored " + pending3.leadCount + " selector/preset params");
      pending3.phase = "settle";
      return;
    }
    write(pending3, 0, pending3.params.length);
    mlog("undo: replayed " + pending3.params.length + " params");
    toVerify(pending3, op);
    return;
  }
  if (pending3.phase === "settle") {
    if (--pending3.settleLeft > 0) return;
    write(pending3, pending3.leadCount, pending3.params.length);
    mlog("undo: replayed " + pending3.params.length + " params (" + pending3.leadCount + " lead + " + (pending3.params.length - pending3.leadCount) + " after settle)");
    toVerify(pending3, op);
    return;
  }
  if (--pending3.verifyLeft > 0) return;
  pending3.verifyLeft = VERIFY_TICKS;
  const fixed = rewriteDrifted(pending3);
  if (fixed > 0) mlog("undo: verify rewrote " + fixed + " param(s) the DSP had overwritten");
  if (fixed > 0 && --pending3.roundsLeft > 0) return;
  if (fixed > 0) mlog("undo: " + fixed + " param(s) would not hold their value");
  finish(op);
}

// src/undo/param-sync.ts
function refreshModels(slot) {
  for (const m of appState.trackModels[slot] ?? []) m.reload();
  appState.dirty = true;
}

// src/undo/apply.ts
var nextRestoreId = 1e6;
function setChain(slot, key, value2) {
  const colon = key.indexOf(":");
  componentPort(slot, colon > 0 ? key.slice(0, colon) : key).setParam(key, value2);
}
function flushOrphanedSnaps() {
  for (const id2 of takeOrphanedSnaps()) seqCmd("udrop " + id2);
}
function moduleDrifted(e, _undoing) {
  const op = e.moduleOp;
  if (!op) return false;
  const live3 = componentPort(op.slot, op.componentKey).getParam(moduleReadKey(op.componentKey)) || "";
  if (live3 === "") return false;
  return !op.oldIds.includes(live3) && !op.newIds.includes(live3);
}
function applyEntry(e, undoing) {
  const op = e.moduleOp;
  if (op) {
    if (undoing && op.newParams === void 0 && op.newState === void 0) {
      const st = captureModuleState(op.slot, op.componentKey);
      if (st !== null) {
        op.newState = st;
        op.newParams = [];
        op.newLeadCount = 0;
      } else {
        const d = dumpModuleParams(op.slot, op.componentKey);
        op.newParams = d.params;
        op.newLeadCount = d.leadCount;
      }
    }
    setChain(op.slot, op.componentKey + ":module", undoing ? op.oldWrite : op.newWrite);
    beginModuleRestore(op, undoing);
  }
  for (let i = e.uiOps.length - 1; i >= 0; i--) {
    const u = e.uiOps[i];
    writeUiField(u.field, undoing ? u.old : u.new);
  }
  if (e.stateOp && (undoing || e.paramOps.length === 0)) {
    const op2 = e.stateOp;
    if (undoing && op2.newState === void 0 && e.paramOps.length === 0) {
      op2.newState = captureModuleState(op2.slot, op2.componentKey) ?? "";
      const d = dumpModuleParams(op2.slot, op2.componentKey, op2.newState);
      op2.newParams = d.params;
      op2.newLeadCount = d.leadCount;
    }
    const blob = undoing ? op2.oldState : op2.newState;
    if (blob) {
      setChain(op2.slot, op2.componentKey + ":state", blob);
      mlog("undo: restored " + op2.componentKey + " state (" + blob.length + " bytes)");
    }
    const ps = undoing ? op2.oldParams : op2.newParams;
    const lead = (undoing ? op2.oldLeadCount : op2.newLeadCount) ?? 0;
    const derivedFromBlob = stateIsParsable(blob);
    if (ps && ps.length > 0 && !derivedFromBlob) {
      beginParamRestore(op2.slot, op2.componentKey, ps, lead, !!blob);
    }
    refreshModels(op2.slot);
  } else {
    for (let i = e.paramOps.length - 1; i >= 0; i--) {
      const p = e.paramOps[i];
      setChain(p.slot, p.key, undoing ? p.old : p.new);
    }
  }
  if (e.seqSnap) {
    const restore = undoing ? e.seqSnap.before : e.seqSnap.after;
    const capture = nextRestoreId++;
    seqCmd("uswap " + restore + " " + capture);
    if (undoing) e.seqSnap.after = capture;
    else e.seqSnap.before = capture;
    requestLabelSync();
  }
}
function result(e, undoing) {
  const change = changeDetail(e, undoing);
  return { ok: true, verb: e.verb, target: e.target, detail: change || e.detail };
}
var NOTHING = (reason) => ({ ok: false, verb: "", target: "", detail: "", reason });
function undoOnce() {
  endEdit();
  if (moduleRestorePending()) return NOTHING("busy");
  if (!canUndo()) return NOTHING("empty");
  const e = popUndo();
  if (moduleDrifted(e, true)) {
    invalidateUndo("module drift");
    return NOTHING("drift");
  }
  applyEntry(e, true);
  pushRedo(e);
  mlog("undo: " + e.verb + " " + e.target);
  return result(e, true);
}
function redoOnce() {
  endEdit();
  if (moduleRestorePending()) return NOTHING("busy");
  if (!canRedo()) return NOTHING("empty");
  const e = popRedo();
  if (moduleDrifted(e, false)) {
    invalidateUndo("module drift");
    return NOTHING("drift");
  }
  applyEntry(e, false);
  pushUndoBack(e);
  mlog("redo: " + e.verb + " " + e.target);
  return result(e, false);
}
var lastUuid = null;
var lastGen = -1;
function undoWatchContext() {
  const uuid = currentSetUuid();
  if (lastUuid !== null && uuid !== lastUuid) {
    abandonGroup();
    invalidateUndo("set switch");
  }
  lastUuid = uuid;
  const gen = engineGeneration();
  if (lastGen >= 0 && gen !== lastGen) {
    abandonGroup();
    invalidateUndo("engine reload");
  }
  lastGen = gen;
}
function onEngineNoop(snapId) {
  if (retractEntry(snapId)) mlog("undo: dropped no-op " + snapId);
}

// src/undo/toast.ts
var vm = null;
var ticksLeft = 0;
function showUndoToast(r, redo) {
  vm = undoToastVM(r, redo);
  ticksLeft = UNDO_TOAST_TICKS;
  appState.dirty = true;
}
function undoToastActive() {
  return vm !== null;
}
function undoToast() {
  return vm;
}
function undoToastTick() {
  if (vm === null) return false;
  if (--ticksLeft > 0) return false;
  vm = null;
  return true;
}
function resetUndoToast() {
  vm = null;
  ticksLeft = 0;
}

// src/seq/capture.ts
var JOG_TOUCH = 9;
function blank() {
  return { overlay: "none", cands: [], idx: 0, detected: 0, bpm: 0, why: "", bars: 0, stretchPermille: 0 };
}
var captureState = blank();
var seenGen2 = -1;
function captureOverlayActive() {
  return captureState.overlay !== "none";
}
function parseInfo(info) {
  const f = {};
  for (const kv of info.split(" ")) {
    const eq = kv.indexOf("=");
    if (eq > 0) f[kv.slice(0, eq)] = kv.slice(eq + 1);
  }
  const mode = f.mode || "none";
  captureState.overlay = mode === "sel" ? "select" : mode === "fix" ? "fixed" : "none";
  captureState.cands = f.cands ? f.cands.split(",").map(Number).filter((n) => n > 0) : [];
  captureState.idx = Number(f.idx) || 0;
  captureState.detected = Number(f.det) || 0;
  captureState.bpm = Number(f.bpm) || 0;
  captureState.why = f.why === "ext" ? "ext" : f.why === "notes" ? "notes" : "";
  captureState.bars = Number(f.bars) || 0;
  captureState.stretchPermille = Number(f.stretch) || 0;
  if (captureState.overlay !== "none" || mode === "none") {
    mlog("seq: capture " + (captureState.overlay === "none" ? "closed" : captureState.overlay) + " bpm=" + captureState.bpm + " bars=" + captureState.bars + (captureState.why ? " why=" + captureState.why : ""));
  }
  appState.dirty = true;
}
function captureTick() {
  if (seqState.capGen === seenGen2 || seqState.capGen < 0) return;
  const info = paramGet("capinfo");
  if (info === null) return;
  seenGen2 = seqState.capGen;
  parseInfo(info);
}
function captureClear() {
  if (!engineReady()) return;
  seqCmd("capclr " + watchedTrack());
  seqState.capPending = 0;
}
function captureButton(clearHeld) {
  if (!engineReady()) return;
  if (clearHeld) {
    markDeleteActed();
    seqToast(seqState.capPending > 0 ? "Capture cleared" : "Nothing buffered");
    captureClear();
    return;
  }
  if (seqState.capPending === 0) {
    seqToast("Nothing to capture");
    return;
  }
  const track = watchedTrack();
  beginEdit({
    key: "capture:" + track,
    verb: "CAPTURE",
    target: trackLabel(track),
    detail: noteCount(seqState.capPending),
    close: CLOSE.IDLE,
    idleMs: 2e3,
    seq: true
  });
  seqCmd("cap " + track);
  mlog("seq: capture commit trk=" + track + " n=" + seqState.capPending);
  seqState.capPending = 0;
  if (seqState.playing) seqToast("Captured");
}
function captureJog(delta) {
  if (captureState.overlay !== "select" || delta === 0) return;
  const n = captureState.cands.length;
  if (n < 2) return;
  const next = Math.max(0, Math.min(n - 1, captureState.idx + (delta > 0 ? 1 : -1)));
  if (next === captureState.idx) return;
  captureState.idx = next;
  captureState.bpm = captureState.cands[next];
  captureState.detected = captureState.bpm;
  seqCmd("capsel " + next);
  appState.dirty = true;
}
function captureOverlayAction(data) {
  const type = data[0] & 240;
  if (type === 176 && data[1] === MoveMainKnob) return "jog";
  if ((type === 144 || type === 128) && data[1] === JOG_TOUCH) return "swallow";
  if ((type === 144 || type === 176) && data[2] > 0) return "dismiss";
  return "through";
}
function captureDismiss(by) {
  if (captureState.overlay === "none") return;
  captureState.overlay = "none";
  if (by) mlog("seq: capture dismissed by " + by.map((b) => b.toString(16)).join(" "));
  seqCmd("capdone");
  endEdit("capture:" + watchedTrack());
  appState.dirty = true;
}

// src/seq/loop-mode.ts
var MAX_BARS = 16;
var DOUBLE_TAP_MS = 450;
var CC_LOOP_BTN = 58;
var held3 = false;
var loopPrev = false;
var heldBars = /* @__PURE__ */ new Set();
var lastTapBar = -1;
var lastTapMs = -DOUBLE_TAP_MS;
function loopButton(down) {
  songLoopHold(down);
  if (down) {
    held3 = true;
    if (seqState.sessionMode) return;
    loopPrev = seqState.loopMode;
    momentaryDown(CC_LOOP_BTN, () => {
      seqState.loopMode = loopPrev;
      appState.dirty = true;
      seqHeaderAnnounce(loopPrev ? "Loop" : "Note");
    });
    seqState.loopMode = true;
    appState.dirty = true;
    seqHeaderAnnounce("Loop");
  } else {
    held3 = false;
    if (momentaryUp(CC_LOOP_BTN) === "tap" && loopPrev && !seqState.sessionMode) {
      seqState.loopMode = false;
      appState.dirty = true;
      seqHeaderAnnounce("Note");
    }
  }
}
function loopHeld() {
  return held3;
}
function loopWheel(delta) {
  if (!held3 || seqState.sessionMode) return false;
  momentaryGesture();
  const start2 = loopStartBar();
  const bars = clipBars();
  const next = Math.max(1, Math.min(bars + (delta > 0 ? 1 : -1), MAX_BARS - start2));
  setLoopBars(start2, start2 + next - 1);
  return true;
}
function loopStepOnAt(bar, nowMs) {
  heldBars.add(bar);
  momentaryGesture();
  if (heldBars.size >= 2) {
    const bars = [...heldBars];
    setLoopBars(Math.min(...bars), Math.max(...bars));
    heldBars.clear();
    return;
  }
  if (bar === lastTapBar && nowMs - lastTapMs <= DOUBLE_TAP_MS) {
    setLoopBars(bar, bar);
  } else {
    seqState.barOffset = bar;
  }
  lastTapBar = bar;
  lastTapMs = nowMs;
}
function loopStepOn(bar) {
  loopStepOnAt(bar, Date.now());
}
function loopStepOff(bar) {
  heldBars.delete(bar);
}
function setLoopBars(startBar, endBar) {
  const s = Math.max(0, Math.min(startBar, MAX_BARS - 1));
  const e = Math.max(s, Math.min(endBar, MAX_BARS - 1));
  const startStep = s * NUM_STEP_BUTTONS;
  const lenStep = (e - s + 1) * NUM_STEP_BUTTONS;
  undoableEdit(
    "SET LOOP",
    trackLabel(watchedTrack()),
    () => seqCmd(`loop ${watchedTrack()} ${startStep} ${lenStep}`)
  );
  seqState.loopStart = startStep;
  seqState.lenSteps = lenStep;
  seqState.barOffset = Math.max(s, Math.min(seqState.barOffset, e));
  seqHeaderAnnounce(s === e ? `Loop ${s + 1}` : `Loop ${s + 1}-${e + 1}`);
}
function doubleLoop() {
  undoableEdit(
    "DOUBLE LOOP",
    trackLabel(watchedTrack()),
    () => seqCmd("dbl " + watchedTrack())
  );
  const bars = clipBars();
  if (loopStartBar() + bars * 2 <= MAX_BARS) {
    seqState.lenSteps = bars * 2 * NUM_STEP_BUTTONS;
    seqToast("Loop doubled");
  }
}
function resetLoopMode() {
  held3 = false;
  loopPrev = false;
  heldBars.clear();
  lastTapBar = -1;
  lastTapMs = -DOUBLE_TAP_MS;
}

// src/seq/mixer-page.ts
var MIXER_HOLD_MS = 300;
var armed2 = false;
var origin = VIEW_MIXER;
function mixerPageActive() {
  return appState.currentView === VIEW_MIXER;
}
function mixerHoldArm(latched2) {
  armed2 = latched2;
}
function mixerHoldTick(nowMs) {
  if (!armed2 || mixerPageActive()) return false;
  if (!momentaryPlainHold(CC_NOTE_SESSION, nowMs, MIXER_HOLD_MS)) {
    if (!momentaryPlainHold(CC_NOTE_SESSION, nowMs, 0)) armed2 = false;
    return false;
  }
  armed2 = false;
  origin = appState.currentView;
  appState.currentView = VIEW_MIXER;
  momentaryCancel(CC_NOTE_SESSION);
  appState.dirty = true;
  return true;
}
function mixerRelease() {
  armed2 = false;
  if (!mixerPageActive()) return false;
  appState.currentView = origin;
  appState.dirty = true;
  return true;
}
var METER_FRAME_MS = 33;
var lastMeter = "";
var lastMeterMs = -Infinity;
function mixerMeterDue(nowMs, raw2) {
  if (!mixerPageActive() || raw2 === lastMeter || nowMs - lastMeterMs < METER_FRAME_MS) return false;
  lastMeter = raw2;
  lastMeterMs = nowMs;
  return true;
}

// src/seq/router-buttons.ts
var CC_LOOP = 58;
var CC_COPY = 60;
var CC_DELETE = 119;
var CC_CAPTURE = 52;
var CC_UNDO = 56;
function setMuteHeld(down) {
  appState.muteHeld = down;
}
function muteHeld() {
  return appState.muteHeld;
}
var muteShift = false;
function muteShiftHeld() {
  return muteShift;
}
var muteGestured = false;
function muteMarkGestured() {
  muteGestured = true;
}
function muteTrack(track) {
  toggleMute(track);
}
var sessionPrev = false;
function seqHandleButtonCc(d1, d2, shiftHeld) {
  if (setsPageActive() && d2 > 0 && (d1 === CC_CAPTURE || d1 === CC_COPY || d1 === CC_DELETE)) {
    setsPageButton(d1 === CC_CAPTURE ? "capture" : d1 === CC_COPY ? "copy" : "delete");
    appState.dirty = true;
    return true;
  }
  if (d1 === CC_MUTE) {
    if (d2 > 0) {
      setMuteHeld(true);
      muteShift = shiftHeld;
      muteGestured = false;
    } else {
      setMuteHeld(false);
      if (!muteGestured && !seqState.sessionMode) {
        if (muteShift || shiftHeld) toggleSolo(appState.activeTrack.index);
        else muteTrack(appState.activeTrack.index);
        appState.dirty = true;
      }
      muteShift = false;
    }
    return true;
  }
  if (d1 === CC_LOOP) {
    loopButton(d2 > 0);
    return true;
  }
  if (d1 === CC_NOTE_SESSION) {
    sessionButtonDown(d2 > 0);
    if (d2 > 0) {
      sessionPrev = seqState.sessionMode;
      momentaryDown(d1, () => {
        seqState.sessionMode = sessionPrev;
      });
      mixerHoldArm(sessionPrev);
      if (paramPageActive()) appState.currentView = closeParamPage();
      releaseAllLive();
      captureClear();
      seqState.sessionMode = true;
    } else if (mixerRelease()) {
    } else if (momentaryUp(d1) === "tap" && sessionPrev) {
      seqState.sessionMode = false;
    }
    return true;
  }
  if (d1 === CC_COPY) {
    copyButton(d2 > 0);
    return true;
  }
  if (d1 === CC_DELETE) {
    if (seqState.sessionMode) sessionDeleteButton(d2 > 0);
    else deleteButton(d2 > 0);
    return true;
  }
  if (d1 === CC_CAPTURE) {
    if (d2 > 0) captureButton(deleteActive());
    return true;
  }
  if (d1 === CC_UNDO) {
    if (d2 > 0) {
      const redo = shiftHeld;
      showUndoToast(redo ? redoOnce() : undoOnce(), redo);
    }
    return true;
  }
  return false;
}

// src/seq/button-held.ts
var held4 = /* @__PURE__ */ new Set();
function setButtonHeld(cc2, down) {
  if (down) held4.add(cc2);
  else held4.delete(cc2);
}
function buttonHeld(cc2) {
  return held4.has(cc2);
}

// src/seq/led-cache.ts
var lastNoteLed = /* @__PURE__ */ new Map();
var lastButtonLed = /* @__PURE__ */ new Map();
var FRAME_BUDGET = 40;
var sentThisFrame = 0;
function ledFrameReset() {
  sentThisFrame = 0;
}
function ledBudgetTake(n = 1) {
  if (sentThisFrame + n > FRAME_BUDGET) return false;
  sentThisFrame += n;
  return true;
}
function cachedSetLED(note, color) {
  if (lastNoteLed.get(note) === color) return;
  if (sentThisFrame >= FRAME_BUDGET) return;
  lastNoteLed.set(note, color);
  setLED(note, color, true);
  sentThisFrame++;
}
function cachedSetButtonLED(cc2, color) {
  if (color === WHITE_DIM && buttonHeld(cc2)) color = WHITE_BRIGHT;
  if (lastButtonLed.get(cc2) === color) return;
  if (sentThisFrame >= FRAME_BUDGET) return;
  lastButtonLed.set(cc2, color);
  setButtonLED(cc2, color, true);
  sentThisFrame++;
}
var lastAnimLed = /* @__PURE__ */ new Map();
function emitLed(note, color, channel) {
  platform.surfaceSend([9, 144 | channel, note, color]);
}
function cachedSetAnimLED(note, base2, animColor, channel) {
  const prev = lastAnimLed.get(note);
  if (channel === ANIM_NONE) {
    if (prev && prev.base === base2 && prev.anim === ANIM_NONE) return;
    if (sentThisFrame >= FRAME_BUDGET) return;
    emitLed(note, base2, ANIM_NONE);
    lastAnimLed.set(note, { base: base2, anim: ANIM_NONE, animColor: base2 });
    sentThisFrame++;
    return;
  }
  if (!prev || prev.base !== base2) {
    if (sentThisFrame >= FRAME_BUDGET) return;
    emitLed(note, base2, ANIM_NONE);
    lastAnimLed.set(note, { base: base2, anim: ANIM_NONE, animColor: base2 });
    sentThisFrame++;
    return;
  }
  if (prev.anim === channel && prev.animColor === animColor) return;
  if (sentThisFrame >= FRAME_BUDGET) return;
  emitLed(note, animColor, channel);
  lastAnimLed.set(note, { base: base2, anim: channel, animColor });
  sentThisFrame++;
}
function seqLedsInvalidate() {
  lastNoteLed.clear();
  lastButtonLed.clear();
  lastAnimLed.clear();
}

// src/seq/leds.ts
var CC_BACK2 = 51;
var CC_CAPTURE2 = 52;
var CC_UNDO2 = 56;
var CC_LOOP2 = 58;
var CC_COPY2 = 60;
var CC_LEFT = 62;
var CC_RIGHT = 63;
var CC_MUTE2 = 88;
var CC_SAMPLE = 118;
var CC_DELETE_BTN = 119;
var CC_UP = 55;
var CC_DOWN = 54;
var STEP_ICON_CC_BASE = 16;
var ICON_METRO = 5;
var ICON_FULLVEL = 9;
var ICON_DBLLOOP = 14;
var ICON_QUANT = 15;
var ICON_MAIN = [4, 6, 8];
var ICON_CLIP = 2;
var ICON_CPU = 11;
var ICON_FLAGS = 1;
var ICON_SETS = 0;
var lastLoopMode = false;
var lastSelector = false;
var BLINK_MS = 250;
function blinkPhase() {
  return Math.floor(Date.now() / BLINK_MS) % 2 === 0;
}
function loopBarColor(c) {
  if (c.isPlayhead) return { base: C_BLACK, anim: C_GREEN, channel: ANIM_PULSE };
  if (c.selected) return { base: C_BLACK, anim: C_WHITE, channel: ANIM_PULSE };
  if (c.inLoop) return { base: C_BLACK, anim: trackColor(c.track), channel: ANIM_PULSE };
  return { base: C_DARKGREY, anim: C_DARKGREY, channel: ANIM_NONE };
}
function paintLoopBars() {
  const start2 = loopStartBar();
  const end = loopEndBar();
  const playBar = seqState.playing ? Math.floor(seqState.curStep / NUM_STEP_BUTTONS) : -1;
  for (let bar = 0; bar < NUM_STEP_BUTTONS; bar++) {
    const led = loopBarColor({
      isPlayhead: bar === playBar,
      selected: bar === seqState.barOffset,
      inLoop: bar >= start2 && bar <= end,
      track: watchedTrack()
    });
    cachedSetAnimLED(STEP_NOTE_BASE + bar, led.base, led.anim, led.channel);
  }
}
function transportPlayColor(playing) {
  return playing ? C_GREEN : C_DARKGREY;
}
function transportRecColor(recording, countingIn, blink = true) {
  if (countingIn) return blink ? C_REC_RED : C_DARKGREY;
  return recording ? C_REC_RED : C_DARKGREY;
}
function paintTransport() {
  cachedSetButtonLED(CC_PLAY, transportPlayColor(seqState.playing));
  cachedSetButtonLED(
    CC_REC,
    transportRecColor(seqState.recording, seqState.countingIn, blinkPhase())
  );
}
function stepIconColor(idx2, c) {
  const active3 = idx2 === ICON_METRO && c.metro || idx2 === ICON_FULLVEL && c.fullVel || c.mainPage && ICON_MAIN.includes(idx2) || c.clipPage && idx2 === ICON_CLIP || c.cpuPage && idx2 === ICON_CPU || c.flagsPage && idx2 === ICON_FLAGS || c.setsPage && idx2 === ICON_SETS;
  if (active3) return WHITE_BRIGHT;
  const clipAvail = idx2 === ICON_CLIP && !c.session;
  if (c.shift && (idx2 === ICON_METRO || idx2 === ICON_FULLVEL || idx2 === ICON_DBLLOOP || idx2 === ICON_QUANT || ICON_MAIN.includes(idx2) || clipAvail || idx2 === ICON_CPU || idx2 === ICON_FLAGS || idx2 === ICON_SETS)) {
    return WHITE_DIM;
  }
  return WHITE_OFF;
}
function paintStepIcons(shift) {
  const ctx = {
    shift,
    metro: seqState.metro,
    fullVel: seqState.fullVelocity,
    mainPage: mainPageActive(),
    clipPage: clipPageActive(),
    cpuPage: cpuPageActive(),
    flagsPage: flagsPageActive(),
    setsPage: appState.currentView === VIEW_SETS,
    session: seqState.sessionMode
  };
  for (let i = 0; i < NUM_STEP_BUTTONS; i++) {
    cachedSetButtonLED(STEP_ICON_CC_BASE + i, stepIconColor(i, ctx));
  }
}
function trackButtonColor(track, active3, muted) {
  if (active3) return C_WHITE;
  return muted ? trackColorDim(track) : trackColor(track);
}
function trackHasActiveNote(track) {
  const base2 = track * 128;
  for (let p = 0; p < 128; p++) if (seqState.activeNotes[base2 + p]) return true;
  return false;
}
function paintTrackButtons() {
  for (let n = 0; n < GROUP_SIZE; n++) {
    const t = focusedTrack(n);
    const cc2 = CC_TRACK_END - n;
    cachedSetButtonLED(cc2, trackButtonColor(t, trackHasActiveNote(t), seqState.muted[t]));
  }
}
function paintAffordances(view, barOffset, maxOff, shiftHeld) {
  const screen = {
    keyboard: textEntryActive(),
    setsEditable: view === VIEW_SETS ? setsPageEditable() : null
  };
  const paint = (cc2, color) => cachedSetButtonLED(cc2, screenButtonColor(cc2, color, screen));
  paint(CC_BACK2, backLedColor(view));
  if (stepRecActive()) {
    const blink = blinkPhase();
    const canLeft = stepRecCanGoLeft();
    paint(CC_LEFT, stepRecArrowColor(-1, canLeft, blink));
    paint(CC_RIGHT, stepRecArrowColor(1, canLeft, blink));
  } else {
    paint(CC_LEFT, arrowLedColor(-1, barOffset, maxOff));
    paint(CC_RIGHT, arrowLedColor(1, barOffset, maxOff));
  }
  paint(CC_SAMPLE, sampleLedColor());
  paint(CC_CAPTURE2, captureLedColor(seqState.capPending));
  paint(CC_UNDO2, undoLedColor(canUndo(), canRedo(), shiftHeld));
  paint(CC_LOOP2, seqState.loopMode ? WHITE_BRIGHT : WHITE_DIM);
  paint(CC_NOTE_SESSION, seqState.sessionMode ? WHITE_BRIGHT : WHITE_DIM);
  paint(CC_COPY2, WHITE_DIM);
  paint(CC_DELETE_BTN, WHITE_DIM);
  paint(CC_MUTE2, seqState.muted.some((m) => m) ? WHITE_BRIGHT : WHITE_DIM);
  if (seqState.sessionMode) {
    paint(CC_DOWN, groupArrowColor(GROUP_DIR_DOWN));
    paint(CC_UP, groupArrowColor(GROUP_DIR_UP));
  }
}
function lengthSpanColor(absStep2, holdStep, holdLen, _track) {
  if (holdStep < 0 || holdLen <= 1) return -1;
  if (absStep2 > holdStep && absStep2 <= holdStep + holdLen - 1) return C_LIGHTGREY;
  return -1;
}
function displayHoldNotes() {
  return seqState.holdNotes.map((p) => Math.max(0, Math.min(127, p + seqState.clipTranspose)));
}
function metronomeStep(stepInBar, engineTick) {
  return Math.floor(stepInBar / 4) === Math.floor(engineTick / 96) % 4;
}
function paintTrackSelector() {
  const selected = sessionButtonHeld() ? appState.activeTrack.index : -1;
  for (let i = 0; i < NUM_STEP_BUTTONS; i++) {
    const led = sessionStepLed(i, appState.focusGroup, selected, seqState.muted[i]);
    cachedSetAnimLED(STEP_NOTE_BASE + i, led.base, led.anim, led.channel);
  }
}
function paintSceneRow() {
  for (let i = 0; i < NUM_STEP_BUTTONS; i++) {
    const led = sceneStepLed(i, seqState.songScenes);
    cachedSetAnimLED(STEP_NOTE_BASE + i, led.base, led.anim, led.channel);
  }
}
function seqLedsTick(shiftHeld = false, currentView = 0, barOffset = 0, maxOff = 0) {
  ledFrameReset();
  const selector = trackSelectActive() || muteHeld();
  if (seqState.loopMode !== lastLoopMode || selector !== lastSelector) {
    lastLoopMode = seqState.loopMode;
    lastSelector = selector;
    seqLedsInvalidate();
  }
  if (seqState.sessionMode) {
    sessionPaintGrid(cachedSetAnimLED, PAD_MIN);
    if (songSceneRowActive()) paintSceneRow();
    else paintTrackSelector();
    paintTrackButtons();
    paintStepIcons(shiftHeld);
    paintAffordances(currentView, barOffset, maxOff, shiftHeld);
    paintTransport();
    return;
  }
  paintTrackButtons();
  paintStepIcons(shiftHeld);
  paintAffordances(currentView, barOffset, maxOff, shiftHeld);
  if (muteHeld()) {
    paintTrackSelector();
    paintTransport();
    return;
  }
  if (seqState.trackSelectHold) {
    paintTrackSelector();
    paintTransport();
    return;
  }
  if (seqState.loopMode) {
    paintLoopBars();
    paintTransport();
    return;
  }
  const bar = seqState.barOffset;
  const base2 = bar * NUM_STEP_BUTTONS;
  const playStep = seqState.playing ? seqState.curStep : -1;
  const dimTrack = trackColorDim(watchedTrack());
  const { holdStep, holdLen } = seqState;
  const watchTrack = watchedTrack();
  const emptyMetro = seqState.lenSteps === 0 && seqState.playing;
  const recHead = stepRecActive() ? stepRecHead() : -1;
  const headBlink = blinkPhase();
  for (let i = 0; i < NUM_STEP_BUTTONS; i++) {
    const step = base2 + i;
    let color;
    if (step === recHead) {
      color = headBlink ? C_REC_RED : C_BLACK;
    } else if (emptyMetro) {
      color = metronomeStep(i, seqState.engineTick) ? C_GREEN : C_BLACK;
    } else if (seqState.lenSteps > 0 && !stepInLoop(step)) {
      color = C_BLACK;
    } else {
      const span = lengthSpanColor(step, holdStep, holdLen, watchTrack);
      if (span >= 0) color = span;
      else if (step === playStep) color = seqState.recording ? C_REC_RED : C_GREEN;
      else if (occHasStep(step)) color = C_WHITE;
      else if (seqState.lenSteps > 0 && stepInLoop(step)) color = dimTrack;
      else color = C_DARKGREY;
    }
    cachedSetLED(STEP_NOTE_BASE + i, color);
  }
  paintTransport();
}

// src/seq/piano-range.ts
var PIANO_W = 128;
var SLOT_WIDTHS = [5, 4, 3, 2];
function isBlackKey(m) {
  const pc2 = (m % 12 + 12) % 12;
  return pc2 === 1 || pc2 === 3 || pc2 === 6 || pc2 === 8 || pc2 === 10;
}
function windowAt(lo, k) {
  let n = Math.min(Math.floor((PIANO_W - 1) / k), 128 - lo);
  while (n > 1 && isBlackKey(lo + n - 1)) n--;
  return { lo, k, n };
}
function contains(w, min, max) {
  return min >= w.lo && max <= w.lo + w.n - 1;
}
function octaveFloor(m) {
  return Math.max(0, Math.floor(m / 12) * 12);
}
function fresh2(min, max, kCap) {
  const lo0 = octaveFloor(min);
  let k = SLOT_WIDTHS[SLOT_WIDTHS.length - 1];
  for (const c of SLOT_WIDTHS) {
    if (c <= kCap && contains(windowAt(lo0, c), min, max)) {
      k = c;
      break;
    }
  }
  const w = windowAt(lo0, k);
  const spare = w.lo + w.n - 1 - max;
  const lo = Math.max(0, lo0 - 12 * Math.round(spare / 24));
  return windowAt(lo, k);
}
function fitWindow(notes2, prev, anchor, holding) {
  if (notes2.length === 0) {
    if (holding && prev) return prev;
    notes2 = [anchor];
  }
  let min = 127, max = 0;
  for (const p of notes2) {
    if (p < min) min = p;
    if (p > max) max = p;
  }
  const best = fresh2(min, max, SLOT_WIDTHS[0]);
  if (prev && contains(prev, min, max) && (holding || prev.k === best.k)) return prev;
  return holding && prev && prev.k < best.k ? fresh2(min, max, prev.k) : best;
}

// src/seq/step-piano.ts
var windows = /* @__PURE__ */ new Map();
var shownTrack = -1;
var shownStep = -1;
var latched = false;
function stepPianoVM() {
  const step = seqState.loopMode || seqState.sessionMode || seqState.watchLane >= 0 ? -1 : heldStepAbs();
  if (step < 0 || seqState.holdStep !== step) {
    shownStep = -1;
    return null;
  }
  const t = watchedTrack();
  if (t !== shownTrack || step !== shownStep) latched = false;
  shownTrack = t;
  shownStep = step;
  const sel = displayHoldNotes();
  const win = fitWindow(sel, windows.get(t) ?? null, seqState.lastPitch[t] ?? 60, latched);
  if (sel.length > 0) latched = true;
  windows.set(t, win);
  return { win, sel, x0: Math.floor((PIANO_W - (win.n * win.k + 1)) / 2) };
}
function stepPianoKey(vm2) {
  return vm2.win.lo + ":" + vm2.win.k + ":" + vm2.sel.join(".");
}

// src/seq/engine.ts
var PARSE_TICKS = 4;
var cmdQueue = [];
var bootState = "probe";
var absentReason = "silent";
var generation = 0;
var lastSnapSeq = 0;
var parseCountdown = 0;
var lastServed = -1;
var uiTickCount = 0;
function engineGeneration() {
  return generation;
}
function engineReady() {
  return bootState === "ok";
}
function engineAbsent() {
  return bootState === "absent";
}
function engineAbsentReason() {
  return absentReason;
}
function engineMark() {
  return platform.engineSubmitted();
}
function engineCaughtUp(mark) {
  return lastServed >= mark;
}
var editGuard = null;
function setEditGuard(fn) {
  editGuard = fn;
}
function seqCmd(op) {
  if (editGuard) editGuard(op);
  cmdQueue.push(op);
}
function seqCmdFlush() {
  if (!engineReady() || cmdQueue.length === 0) return;
  paramSet("cmd", cmdQueue.join(";"));
  cmdQueue.length = 0;
}
function seqEngineTick() {
  uiTickCount++;
  if (bootState === "absent") return;
  if (bootState === "probe") {
    boot();
    return;
  }
  syncPadRoute(paramSet);
  syncExtRoute(paramSet);
  syncWatch(seqCmd);
  seqCmdFlush();
  readSnapshot();
  probeBridgeTick(paramGet, paramSet);
}
function readSnapshot() {
  if (--parseCountdown > 0) return;
  const seq = platform.engineSnapshotSeq();
  if (seq === lastSnapSeq) return;
  const snap = platform.engineSnapshot();
  if (!snap) return;
  parseCountdown = PARSE_TICKS;
  lastSnapSeq = snap.seq;
  lastServed = snap.served;
  parseStatus(snap.text);
}
function boot() {
  const pong = paramGet("ping");
  if (pong !== "pong " + ENGINE_VERSION) {
    absentReason = pong === null ? "silent" : "mismatch";
    mlog("seq: engine " + (pong === null ? "did not answer" : "is " + pong + ", ui.js wants " + ENGINE_VERSION));
    bootState = "absent";
    cmdQueue.length = 0;
    return;
  }
  mlog("seq: engine ready v" + ENGINE_VERSION);
  bootState = "ok";
  generation++;
  parseCountdown = 0;
  paramSet("chblock", readPrefModuleBlacklist().join(","));
  pushMasterVolume(paramSet);
  pushClickVolume(paramSet);
  paramSet("chain_host", CHAIN_MODULE_DIR + "|" + MOVY_MODULE_DIR);
  resetPadRoute();
  resetExtRoute();
  resetWatchPush();
  requestLabelSync();
}

// src/seq/song.ts
var NUM_SCENES = 8;
var holdStarted = false;
var scenePresses = 0;
var loopHold = false;
function songLoopHold(down) {
  loopHold = down;
  if (down) holdStarted = false;
}
function songSceneRowActive() {
  return seqState.sessionMode && loopHold;
}
function sceneForStep(step) {
  if (step < 0 || step >= NUM_SCENES * 2 || step % 2 !== 0) return -1;
  return step >> 1;
}
function songSceneStep(step, on) {
  const bit = 1 << step;
  if (!on) {
    scenePresses &= ~bit;
    return;
  }
  scenePresses |= bit;
  const scene = sceneForStep(step);
  if (scene < 0) return;
  if (holdStarted) {
    seqCmd("songadd " + scene);
  } else {
    seqCmd("song " + scene);
    holdStarted = true;
  }
  appState.dirty = true;
}
function songSceneReleasePending(step) {
  return (scenePresses & 1 << step) !== 0;
}
function sceneStepLed(step, songScenes) {
  const scene = sceneForStep(step);
  if (scene < 0) return { base: C_BLACK, anim: C_BLACK, channel: ANIM_NONE };
  if (songScenes.indexOf(scene) >= 0) {
    return { base: C_BLACK, anim: C_GREEN, channel: ANIM_PULSE };
  }
  return { base: C_GREEN, anim: C_GREEN, channel: ANIM_NONE };
}
function resetSong() {
  holdStarted = false;
  scenePresses = 0;
  loopHold = false;
}
function entryEnd(scenes, pos) {
  let i = pos;
  while (i < scenes.length && scenes[i] === scenes[pos]) i++;
  return i;
}
function songBandTokens(scenes, pos, maxW, width) {
  if (scenes.length === 0) return { tokens: [], leading: false };
  const curFrom = Math.min(Math.max(pos, 0), scenes.length - 1);
  const curTo = entryEnd(scenes, curFrom);
  const must = entryEnd(scenes, Math.min(curTo, scenes.length - 1)) - 1;
  const label2 = (i) => String(scenes[i] + 1);
  const GAP2 = 2;
  const span = (a, b) => {
    let w = 0;
    for (let i = a; i <= b; i++) w += (i > a ? GAP2 : 0) + width(label2(i));
    return w;
  };
  let from = curFrom;
  let to = must;
  let used = span(from, to);
  while (to < scenes.length - 1 && used + GAP2 + width(label2(to + 1)) <= maxW) {
    used += GAP2 + width(label2(to + 1));
    to++;
  }
  while (from > 0 && used + GAP2 + width(label2(from - 1)) <= maxW) {
    used += GAP2 + width(label2(from - 1));
    from--;
  }
  const tokens = [];
  for (let i = from; i <= to; i++) {
    tokens.push({ label: label2(i), current: i >= curFrom && i < curTo });
  }
  return { tokens, leading: from > 0 };
}
function songTerminal() {
  const n = seqState.songScenes.length;
  if (n === 0) return false;
  const scene = seqState.songScenes[Math.min(seqState.songPos, n - 1)];
  return !seqState.session.some((st) => (st.exist & 1 << scene) !== 0);
}
function songBandVisible() {
  if (!seqState.sessionMode) return false;
  return loopHold || seqState.songScenes.length > 0;
}

// src/model/virtual-slot.ts
var NO_MODULATION = /* @__PURE__ */ new Set();
function createVirtualSlotModel(name, componentKey2, extra = {}) {
  const touched4 = [];
  let dirty = true;
  return {
    handleKnobTouch(k) {
      const i = touched4.indexOf(k);
      if (i >= 0) touched4.splice(i, 1);
      touched4.push(k);
      dirty = true;
    },
    handleKnobRelease(k) {
      if (k === void 0) touched4.length = 0;
      else {
        const i = touched4.indexOf(k);
        if (i >= 0) touched4.splice(i, 1);
      }
      dirty = true;
    },
    clearTouch() {
      if (touched4.length) {
        touched4.length = 0;
        dirty = true;
      }
    },
    getModuleName() {
      return name;
    },
    reset() {
      touched4.length = 0;
      dirty = true;
    },
    tick() {
      const d = dirty;
      dirty = false;
      return d;
    },
    getViewModel() {
      return { ...headerOnlyVM(name), headerOverride: void 0 };
    },
    reload() {
      dirty = true;
    },
    reloadNow() {
      dirty = true;
    },
    getComponentKey() {
      return componentKey2;
    },
    getPressParam() {
      return null;
    },
    hasLoadedParams() {
      return true;
    },
    getFileBrowseTarget() {
      return null;
    },
    fileBrowseTargetForKey() {
      return null;
    },
    setFileValue() {
    },
    refreshModulation() {
    },
    modulatedKeys() {
      return NO_MODULATION;
    },
    paramRangeByKey() {
      return null;
    },
    childTemplateOf() {
      return null;
    },
    voiceKeysOf() {
      return null;
    },
    getDrumConfig() {
      return null;
    },
    getDrumPadCount() {
      return 0;
    },
    getDrumPadNames() {
      return [];
    },
    getDrumCurrentPad() {
      return 0;
    },
    getDrumCurrentPhysPad() {
      return 0;
    },
    updateDrumPad() {
    },
    dumpLayout() {
      return {
        moduleId: componentKey2,
        moduleName: name,
        componentKey: componentKey2,
        banks: [],
        hasConfig: false,
        hiddenKeys: [],
        drum: null,
        params: []
      };
    },
    ...extra
  };
}

// src/lfo/model.ts
function createLfoModel(track) {
  return createScopedLfoModel(trackScope(track));
}
function createScopedLfoModel(scope) {
  return createVirtualSlotModel("LFO", scope.keyPrefix + "lfo");
}

// src/mixer/mix-model.ts
function createMixModel(_track) {
  return createVirtualSlotModel("MIX", "mix", {
    paramRangeByKey(key) {
      return FIELD_AT.includes(key) ? { ...LANE_RANGE } : null;
    }
  });
}

// src/model/state.ts
function createModelState(port, componentKey2) {
  return {
    port,
    componentKey: componentKey2,
    knobParams: [],
    enumFmt: [],
    touchedSlots: [],
    hiddenKeys: /* @__PURE__ */ new Set(),
    visibilityRules: [],
    activeModuleName: "\u2014",
    moduleId: "",
    moduleConfig: null,
    bankNames: [],
    hierarchyKey: "",
    pollCountdown: NAME_POLL_TICKS,
    metaRetries: 0,
    hierarchyRetryCountdown: -1,
    hierarchyRetries: 0,
    presetDeclared: false,
    degenerateKeys: [],
    dirty: false,
    drumPadCount: 0,
    drumConfig: null,
    drumPadNames: [],
    childLevels: [],
    voiceKeys: [],
    declared: null,
    pressParam: null,
    drumCurrentPad: 1,
    drumCurrentPhysPad: 0,
    modulatedKeys: /* @__PURE__ */ new Set()
  };
}

// src/model/toggle.ts
var OFF_WORDS = [
  "off",
  "no",
  "disabled",
  "disable",
  "none",
  "bypass",
  "bypassed",
  "out",
  "false",
  "0"
];
var ON_WORDS = ["on", "yes", "enabled", "enable", "active", "in", "true", "1"];
var norm = (s) => String(s ?? "").trim().toLowerCase();
var ACTION_PREFIX = /^(rnd|rdm|init|reset|save|load|recall)_/;
var ACTION_EXACT = ["trigger", "mutate"];
var ACTION_SUFFIX = /_init$/;
function isActionParam(p) {
  if (!isToggleShaped(p)) return false;
  const k = p.key.toLowerCase();
  return ACTION_PREFIX.test(k) || ACTION_SUFFIX.test(k) || ACTION_EXACT.indexOf(k) >= 0;
}
function isToggleShaped(p) {
  if (p.type === "int") return p.min === 0 && p.max === 1;
  if (p.type !== "enum" || (p.options?.length ?? 0) !== 2) return false;
  const [a, b] = p.options.map(norm);
  return OFF_WORDS.indexOf(a) >= 0 && ON_WORDS.indexOf(b) >= 0;
}
function isToggleParam(p) {
  return isToggleShaped(p) && !isActionParam(p);
}

// src/model/knob-step.ts
var NARROW_RANGE_MAX = 8;

// src/model/step-labels.ts
var OCTAVE_LIKE = /(^|_)oct(ave|aves)?(_|$)/;
var SIGNED_RANGE = /_range$/;
var COUNT_LIKE = /voice_count|voices|polyphony/;
function cellStyleFor(key, type, min, max) {
  if (type === "int" && min === 0 && max === 1) return { renderStyle: "switch" };
  if (type !== "int" || max - min < 2) return { renderStyle: "arc" };
  const k = key.toLowerCase();
  if (k.includes("rnd")) return { renderStyle: "arc" };
  if (COUNT_LIKE.test(k) || k === "unison") return { renderStyle: "steps" };
  if (max - min > NARROW_RANGE_MAX) return { renderStyle: "arc" };
  if (OCTAVE_LIKE.test(k) || SIGNED_RANGE.test(k) && min < 0)
    return min < 0 ? { renderStyle: "steps", signed: true } : { renderStyle: "steps" };
  return { renderStyle: "arc" };
}

// src/model/access.ts
function readAccess(...declared) {
  for (const v of declared) {
    if (typeof v !== "string") continue;
    const s = v.trim().toLowerCase();
    if (s === "read" || s === "write") return s;
    if (s === "readwrite") return null;
  }
  return null;
}

// src/model/file-decl.ts
var asBool2 = (v) => v === true || v === 1 || ["1", "true", "on", "yes"].includes(String(v ?? "").trim().toLowerCase());
function actions(raw2) {
  if (!Array.isArray(raw2)) return [];
  const out2 = [];
  for (const a of raw2) {
    if (!a || typeof a !== "object") continue;
    const key = typeof a.key === "string" ? a.key.trim() : "";
    if (!key) continue;
    const v = a.value;
    out2.push({ key, value: v === void 0 || v === null ? "" : String(v), restore: asBool2(a.restore) });
  }
  return out2;
}
function fileBrowseDeclOf(...defs) {
  const pick = (k) => {
    for (const d of defs) if (d && d[k] !== void 0) return d[k];
    return void 0;
  };
  const live3 = asBool2(pick("live_preview"));
  const h = pick("browser_hooks");
  const hooks = {
    onOpen: actions(h && h.on_open),
    onPreview: actions(h && h.on_preview),
    onCancel: actions(h && h.on_cancel),
    onCommit: actions(h && h.on_commit)
  };
  const any = hooks.onOpen.length + hooks.onPreview.length + hooks.onCancel.length + hooks.onCommit.length;
  return live3 || any ? { live: live3, hooks } : null;
}
function hookValue(raw2, path) {
  if (raw2 === "$path" || raw2 === "$selected_path") return path;
  if (raw2 === "$filename" || raw2 === "$selected_filename") {
    const i = path.lastIndexOf("/");
    return i >= 0 ? path.slice(i + 1) : path;
  }
  return raw2;
}

// src/model/param-build.ts
function declaredShortName(level, param) {
  for (const v of [level.short_name, param.short_name]) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}
function optionList(...candidates) {
  for (const c of candidates) if (Array.isArray(c)) return c;
  return null;
}
function inferBehavior(explicit, options2, access = null) {
  if (access === "write") return "trigger";
  if (explicit === "trigger") return "trigger";
  const normalized = (options2 ?? []).map((v) => String(v).trim().toLowerCase());
  return normalized.includes("idle") && normalized.includes("trigger") ? "trigger" : void 0;
}
function inferAcceleration(value2) {
  return value2 === "wide" ? "wide" : void 0;
}
function parseFilter(filter) {
  if (!filter) return [];
  const vals = Array.isArray(filter) ? filter : [filter];
  return vals.filter((v) => typeof v === "string" && v.length > 0).map((v) => v.toLowerCase().startsWith(".") ? v.toLowerCase() : "." + v.toLowerCase());
}
function buildGenericParam(key, cp, def) {
  const rawUiType = cp.ui_type || def.ui_type || "";
  const declared = cp.type || def.type || "float";
  const uiType = rawUiType || (declared === "wav_position" ? "wav_position" : "");
  const type = declared === "wav_position" ? "float" : declared;
  if (type === "filepath") {
    const root = String(cp.root ?? def.root ?? "/data/UserData");
    const browse = fileBrowseDeclOf(cp, def);
    return {
      key,
      label: String(cp.name ?? def.name ?? def.label ?? key),
      shortLabel: declaredShortName(def, cp),
      type: "file",
      min: 0,
      max: 0,
      step: 0,
      options: null,
      renderStyle: "arc",
      automatable: false,
      fileRoot: root,
      fileFilter: parseFilter(cp.filter ?? def.filter),
      fileStartPath: String(cp.start_path ?? def.start_path ?? root),
      ...browse ? { fileBrowse: browse } : {}
    };
  }
  const options2 = optionList(cp.options, def.options);
  const hasRange = cp.min != null || cp.max != null || def.min != null || def.max != null;
  let min = cp.min != null ? cp.min : def.min != null ? def.min : 0;
  let max = cp.max != null ? cp.max : def.max != null ? def.max : 1;
  let step = cp.step != null ? cp.step : def.step != null ? def.step : type === "float" ? 0.02 : 1;
  if (type === "enum") {
    min = 0;
    max = options2 ? options2.length - 1 : 127;
    step = 1;
  }
  const metaGuessed = !hasRange && (type === "float" || type === "int");
  const access = readAccess(cp.access, def.access);
  const behavior = inferBehavior(cp.behavior ?? def.behavior, options2, access);
  return {
    key,
    label: cp.name || def.label || key,
    shortLabel: declaredShortName(def, cp),
    type,
    options: options2,
    min,
    max,
    step,
    ...cellStyleFor(key, type, min, max),
    // Config-less fallback: the `g_` global-naming convention is the
    // only signal available here. Modules with a movy config use
    // bank.global instead (see the config path in hierarchy.ts).
    automatable: behavior === "trigger" || access === "read" ? false : cp.automatable ?? def.automatable ?? (shapeAutomatable(type, min, max, options2) && !key.startsWith("g_")),
    behavior,
    /* A readout has no value to record: an automation lane would replay
     * writes the module ignores, over a knob that cannot be turned. */
    ...access === "read" ? { readOnly: true } : {},
    knobAcceleration: inferAcceleration(
      cp.knob_acceleration ?? cp.knobAcceleration ?? def.knob_acceleration ?? def.knobAcceleration
    ),
    ...uiType ? { uiType } : {},
    ...cp.view_group || def.view_group ? { viewGroup: String(cp.view_group ?? def.view_group) } : {},
    ...cp.filepath_param || def.filepath_param ? { filepathParam: String(cp.filepath_param ?? def.filepath_param) } : {},
    ...metaGuessed ? { metaGuessed: true } : {}
  };
}
function shapeAutomatable(type, min, max, options2) {
  if (type === "enum") return !!options2 && options2.length >= 2;
  return (type === "float" || type === "int") && max > min;
}
function applyAutoStyle(p, explicitRender = false) {
  if (!p.behavior && isActionParam(p)) {
    p.behavior = "trigger";
    p.automatable = false;
    return p;
  }
  if (p.readOnly) return p;
  if (explicitRender) return p;
  if (isToggleParam(p)) p.renderStyle = "switch";
  return p;
}

// src/model/store.ts
function paramIoKey(s, p) {
  return concreteKey(s.moduleConfig?.drum?.padScoping, s.drumCurrentPad, p.key);
}
function enumFmtFor(s, gi, p, ioKey) {
  if (s.moduleConfig?.enumSetIndex) return true;
  if (s.enumFmt[gi] === void 0) {
    s.enumFmt[gi] = enumUsesIndex(p.options, s.port.getParam(s.componentKey + ":" + ioKey));
  }
  return s.enumFmt[gi];
}
function enumLaneInfo(s, gi) {
  const p = s.knobParams[gi];
  if (!p || p.type !== "enum" || !p.options || p.options.length === 0) return null;
  return { options: p.options, wiresNames: !enumFmtFor(s, gi, p, paramIoKey(s, p)) };
}
function pollModuleName(s) {
  const name = s.port.getParam(s.componentKey + ":name") || s.port.getParam(moduleReadKey(s.componentKey)) || "\u2014";
  if (name !== s.activeModuleName) {
    s.activeModuleName = name;
    s.hierarchyKey = "";
    s.dirty = true;
  }
}
function refreshModulatedKeys(s) {
  const prev = s.modulatedKeys.size;
  s.modulatedKeys.clear();
  const bare = masterSuffix(s.componentKey);
  const master = bare !== null;
  const lfoPfx = master ? s.componentKey.slice(0, s.componentKey.length - bare.length) : "";
  const want = master ? bare : s.componentKey;
  for (let i = 1; i <= 2; i++) {
    if (s.port.getParam(lfoPfx + "lfo" + i + ":target") === want) {
      const tp = s.port.getParam(lfoPfx + "lfo" + i + ":target_param");
      if (tp) s.modulatedKeys.add(tp);
    }
  }
  if (s.modulatedKeys.size !== prev) s.dirty = true;
}

// src/model/viewmodel.ts
function buildViewModel(s, auto) {
  return {
    moduleName: s.activeModuleName,
    isEmpty: s.moduleId === "" && s.activeModuleName === "\u2014",
    drumPadCount: s.drumPadCount,
    drumCurrentPad: s.drumCurrentPad,
    drumCurrentPhysPad: s.drumCurrentPhysPad,
    drumPadName: (s.drumPadNames || [])[s.drumCurrentPad - 1] || "",
    automationHeld: !!auto?.held,
    automationPoolFull: !!auto?.poolFull,
    stepPagePresent: false,
    stepPageSelected: false
  };
}

// src/model/preset-param.ts
function buildPresetParam(s, listParam, countParam, nameParam) {
  if (!listParam || !countParam) return null;
  const countRaw = s.port.getParam(s.componentKey + ":" + countParam);
  const presetCount = countRaw ? parseInt(countRaw) : 0;
  if (!(presetCount > 0)) return null;
  let allNames = null;
  const namesRaw = s.port.getParam(s.componentKey + ":preset_names");
  if (namesRaw) {
    try {
      allNames = JSON.parse(namesRaw);
    } catch {
    }
  }
  if (!allNames && s.port.getParam(s.componentKey + ":preset_name_0") !== null) {
    allNames = [];
    for (let i = 0; i < presetCount; i++) {
      allNames.push(s.port.getParam(s.componentKey + ":preset_name_" + i) ?? String(i));
    }
  }
  return {
    key: listParam,
    label: "Preset",
    shortLabel: null,
    type: "enum",
    min: 0,
    max: presetCount - 1,
    step: 1,
    options: allNames,
    nameKey: allNames ? void 0 : nameParam ?? void 0,
    renderStyle: "preset",
    /* A preset rewrites the module's other params, so undoing it needs the
     * whole module back — see KnobSlot.capturesModuleState. */
    capturesModuleState: true,
    automatable: false
  };
}

// src/model/items-param.ts
var ITEMS_RENDER = "items";
function parseItems2(raw2) {
  if (!raw2) return null;
  let arr;
  try {
    arr = JSON.parse(raw2);
  } catch {
    return null;
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const labels = [];
  const indices = [];
  for (let i = 0; i < arr.length; i++) {
    const it = arr[i];
    if (!it || typeof it !== "object") return null;
    labels.push(String(it.label ?? it.name ?? "Item " + i));
    indices.push(typeof it.index === "number" ? it.index : i);
  }
  return { labels, indices };
}
function buildItemSelectParam(s, levelKey, level, navLabel) {
  const itemsKey = level.items_param;
  const selectKey = level.select_param;
  if (!itemsKey || !selectKey) return null;
  const items = parseItems2(s.port.getParam(s.componentKey + ":" + itemsKey));
  if (!items) return null;
  const raw2 = s.port.getParam(s.componentKey + ":" + selectKey);
  if (raw2 === null) return null;
  const cur = parseInt(raw2, 10);
  if (isNaN(cur) || items.indices.indexOf(cur) < 0) return null;
  mlog("items selector " + selectKey + " n=" + items.labels.length + " cur=" + cur);
  return {
    key: selectKey,
    /* The level says "Soundfont"; the nav entry says "Choose Soundfont".
     * hierarchy-walk prefers the nav label for PAGE names — a single cell
     * wants the noun. */
    label: level.label ?? level.name ?? navLabel ?? levelKey,
    shortLabel: null,
    type: "enum",
    min: 0,
    max: items.labels.length - 1,
    step: 1,
    options: items.labels,
    itemIndices: items.indices,
    itemsKey,
    renderStyle: ITEMS_RENDER,
    /* Choosing an item reloads a whole bank of patches, so its inverse is
     * lossy exactly like a preset's — undo needs the module back. Note this
     * snapshots the module's OWN state blob, which is why movy must never
     * persist the index itself: it is positional over a sorted directory
     * scan and shifts when a file is added (dexed restores by NAME first,
     * dx7_plugin.cpp:977). */
    capturesModuleState: true,
    automatable: false
  };
}
function buildItemSelectors(s, allLevels) {
  const navLabel = {};
  for (const lvl of Object.values(allLevels)) {
    for (const p of lvl?.params ?? []) {
      const e = p;
      if (e && typeof e === "object" && e.level && e.label) navLabel[e.level] = e.label;
    }
  }
  const out2 = [];
  for (const [key, lvl] of Object.entries(allLevels)) {
    if (!lvl?.items_param) continue;
    const p = buildItemSelectParam(s, key, lvl, navLabel[key]);
    if (p) out2.push(p);
  }
  return out2;
}

// src/model/config-pages.ts
function buildConfigPages(s, cpMap, paramDefs, allLevels) {
  const cfgRoot = allLevels["root"] || Object.values(allLevels)[0] || null;
  const cfg = s.moduleConfig;
  for (const bank of cfg.banks) {
    const bankStart = s.knobParams.length;
    for (const row of bank.rows) {
      for (const slot of row) {
        if (!slot?.key) {
          s.knobParams.push(null);
          continue;
        }
        if (slot.render === "preset") {
          const pp2 = buildPresetParam(
            s,
            slot.key,
            slot.presetCountKey ?? cfgRoot?.count_param,
            slot.presetNameKey ?? cfgRoot?.name_param
          );
          if (pp2) {
            if (slot.short) pp2.shortLabel = slot.short;
            if (slot.full) pp2.label = slot.full;
            s.knobParams.push(pp2);
            continue;
          }
        }
        if (slot.render === "items" && slot.itemsLevel) {
          const ip = buildItemSelectParam(
            s,
            slot.itemsLevel,
            allLevels[slot.itemsLevel] ?? {}
          );
          if (ip) {
            if (slot.short) ip.shortLabel = slot.short;
            if (slot.full) ip.label = slot.full;
            s.knobParams.push(ip);
            continue;
          }
        }
        const cp = cpMap[slot.key] ?? {};
        const hier = paramDefs[slot.key] ?? {};
        const rawType = slot.type || hier.type || cp.type || "float";
        const uiType = String(cp.ui_type ?? hier.ui_type ?? "") || (rawType === "wav_position" ? "wav_position" : "");
        const normType = rawType === "wav_position" ? "float" : rawType;
        let type = normType === "filepath" ? "file" : normType;
        const options2 = optionList(slot.options, hier.options, cp.options);
        let min = cp.min != null ? cp.min : hier.min != null ? hier.min : slot.min != null ? slot.min : 0;
        let max = cp.max != null ? cp.max : hier.max != null ? hier.max : slot.max != null ? slot.max : 1;
        let step = cp.step != null ? cp.step : hier.step != null ? hier.step : slot.step != null ? slot.step : type === "float" ? 0.01 : 1;
        if (type === "enum") {
          min = 0;
          max = options2 ? options2.length - 1 : 127;
          step = 1;
        }
        const style = slot.render ? { renderStyle: slot.render } : cellStyleFor(slot.key, type, min, max);
        const access = readAccess(cp.access, hier.access);
        const behavior = inferBehavior(
          slot.behavior ?? hier.behavior ?? cp.behavior,
          options2,
          access
        );
        const param = {
          key: slot.key,
          label: slot.full || cp.name || hier.label || slot.key,
          /* movy's own config first: a hand-written `short` is a
           * deliberate choice about THIS layout, which is more than
           * the module can know. Its declaration still beats the
           * abbreviator, which is the guess this replaces. */
          shortLabel: slot.short ?? declaredShortName(hier, cp),
          type,
          options: options2,
          min,
          max,
          step,
          ...style,
          /* The module's `viz: false` is the same veto as the
           * config's `env: false`, and it is the one the module can
           * state without movy's config existing. 9W9 declared it on
           * every `*_attack` and movy read it nowhere, so it drew an
           * AD envelope over a click level and hoisted Attack to knob
           * 1. The config still wins where it says anything. */
          env: slot.env ?? (cp.viz === false || hier.viz === false ? false : void 0),
          lfo: slot.lfo,
          filter: slot.filter,
          // Global-bank params aren't reachable as chain target:params
          // (device spike), so they can't be automated. Only OUR config
          // may override per slot (it knows which per-voice keys the host
          // resolves); module-supplied metadata must stay subordinate to
          // the guard or a module re-enables a dot the host can't honour.
          automatable: behavior === "trigger" || access === "read" ? false : slot.automatable ?? (bank.global ? false : cp.automatable ?? hier.automatable ?? shapeAutomatable(type, min, max, options2)),
          behavior,
          ...access === "read" ? { readOnly: true } : {},
          knobAcceleration: inferAcceleration(
            slot.knobAcceleration ?? cp.knob_acceleration ?? cp.knobAcceleration ?? hier.knob_acceleration ?? hier.knobAcceleration
          ),
          /* A preset always rewrites the module's other params, so it
           * implies the flag; anything else has to say so. */
          capturesModuleState: slot.capturesModuleState ?? style.renderStyle === "preset",
          /* Module-declared, never config-declared: the template names
           * layout, the module names which file a marker indexes. */
          ...cp.filepath_param ? { filepathParam: String(cp.filepath_param) } : {},
          ...cp.view_group ? { viewGroup: String(cp.view_group) } : {},
          ...uiType ? { uiType } : {}
        };
        if (type === "file") {
          param.fileRoot = slot.fileRoot ?? cp.root ?? "/data/UserData";
          param.fileFilter = slot.fileFilter ?? parseFilter(cp.filter);
          param.fileStartPath = slot.fileStartPath ?? cp.start_path ?? param.fileRoot;
          if (slot.fileRequireContains) param.fileRequireContains = slot.fileRequireContains;
        }
        s.knobParams.push(applyAutoStyle(param, !!slot.render));
      }
    }
    const rem = (s.knobParams.length - bankStart) % KNOBS_PER_PAGE;
    if (rem !== 0) for (let i = rem; i < KNOBS_PER_PAGE; i++) s.knobParams.push(null);
  }
  mlog("loadHierarchy: config for " + s.moduleId + ", " + cfg.banks.length + " banks");
  s.enumFmt = new Array(s.knobParams.length).fill(void 0);
  s.dirty = true;
  return;
}

// src/model/hierarchy-walk.ts
function toKey(k) {
  return typeof k === "string" ? k : k.key ?? null;
}
function knobKeys(lvl) {
  return (lvl?.knobs ?? []).map(toKey).filter((k) => k !== null);
}
function paramKeys(lvl) {
  return (lvl?.params ?? []).map((p) => typeof p === "string" ? p : p.key ?? null).filter((k) => k !== null);
}
function levelOwnDefs(lvl) {
  const defs = {};
  for (const k of lvl?.knobs ?? []) {
    if (typeof k === "object" && k.key) defs[k.key] = k;
  }
  for (const p of lvl?.params ?? []) {
    if (typeof p === "object" && p.key) defs[p.key] = p;
  }
  return defs;
}
function levelNameToPrefix(name) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 6);
  return (words[0].slice(0, 4) + words.slice(1).map((w) => w[0].toUpperCase()).join("")).slice(0, 6);
}
function childOf(lvl) {
  const c = lvl.children;
  return c && c !== "None" ? c : null;
}
function buildLevelPages(allLevels, rootKey, opts = {}) {
  const out2 = [];
  const rootLevel = allLevels[rootKey];
  if (!rootLevel) return out2;
  const navLabel = {};
  for (const lvl of Object.values(allLevels)) {
    for (const p of lvl.params ?? []) {
      if (typeof p === "object" && p.level && p.label) navLabel[p.level] = p.label;
    }
  }
  const nameOf = (key, lvl) => lvl.name || navLabel[key] || lvl.label || key;
  const rendered = /* @__PURE__ */ new Set([knobKeys(rootLevel).join(" ")]);
  const visited = /* @__PURE__ */ new Set([rootKey]);
  function visit(key, prefix, transparent) {
    if (visited.has(key)) return;
    visited.add(key);
    const lvl = allLevels[key];
    if (!lvl) return;
    const name = nameOf(key, lvl);
    const keys = knobKeys(lvl);
    const sig = keys.join(" ");
    const dup = keys.length > 0 && rendered.has(sig);
    const extras = opts.extras ? opts.extras(lvl) : [];
    const pageKeys = dup ? extras : [...keys, ...extras];
    if (pageKeys.length > 0) {
      if (!dup) rendered.add(sig);
      out2.push({ name: prefix ? prefix + "/" + name : name, keys: pageKeys, defs: levelOwnDefs(lvl) });
    }
    const childPrefix = transparent ? prefix : levelNameToPrefix(name);
    for (const p of lvl.params ?? []) {
      if (typeof p === "object" && p.level) visit(p.level, childPrefix, false);
    }
    const child = childOf(lvl);
    if (child) visit(child, prefix, true);
  }
  for (const p of rootLevel.params ?? []) {
    if (typeof p === "object" && p.level) visit(p.level, null, false);
  }
  const rootChild = childOf(rootLevel);
  if (rootChild) visit(rootChild, null, true);
  for (const key of Object.keys(allLevels)) {
    if (!visited.has(key) && knobKeys(allLevels[key]).length > 0) visit(key, null, false);
  }
  return out2;
}

// src/model/level-extras.ts
var KNOB_TYPES = ["int", "float", "enum", "filepath"];
function verdict(cp) {
  if (!cp) return "render";
  if (cp.type != null && KNOB_TYPES.indexOf(cp.type) < 0) return "skip";
  if (cp.type === "enum" || (cp.options?.length ?? 0) > 0) return "render";
  return cp.min != null && cp.max != null && cp.max <= cp.min ? "wait" : "render";
}
function makeExtrasPicker(cpMap, knobKeysEverywhere, listParam, waiting) {
  const seen = new Set(knobKeysEverywhere);
  return (lvl) => {
    const out2 = [];
    for (const k of paramKeys(lvl)) {
      if (seen.has(k) || k === listParam || k.startsWith("ui_")) continue;
      const v = verdict(cpMap[k]);
      if (v === "skip") continue;
      if (v === "wait") {
        waiting?.push(k);
        continue;
      }
      seen.add(k);
      out2.push(k);
    }
    return out2;
  };
}

// src/model/generic-pages.ts
function buildGenericPages(s, cpMap, cpOrder, paramDefs, knobInline, allLevels) {
  const rootLevel = allLevels["root"] || Object.values(allLevels)[0] || null;
  const bankEntries = [];
  let nextGroup = 0;
  function addPage(name, keys, group, defs) {
    const padded = keys.slice(0, KNOBS_PER_PAGE);
    while (padded.length < KNOBS_PER_PAGE) padded.push(null);
    bankEntries.push({ name, keys: padded, group, defs });
  }
  function addLevel(label2, keys0, defs) {
    const keys = keys0.filter((k) => !s.hiddenKeys.has(k));
    const group = nextGroup++;
    const pages2 = Math.max(1, Math.ceil(keys.length / KNOBS_PER_PAGE));
    for (let i = 0; i < pages2; i++) {
      addPage(
        i === 0 ? label2 : label2 + " - " + (i + 1),
        keys.slice(i * KNOBS_PER_PAGE, (i + 1) * KNOBS_PER_PAGE),
        group,
        defs
      );
    }
  }
  let presetParam = null;
  let listParam;
  const selectors = buildItemSelectors(s, allLevels);
  const selMap = {};
  for (const p of selectors) selMap[p.key] = p;
  if (!rootLevel) {
    const fallbackKeys = cpOrder.filter((k) => !k.startsWith("ui_"));
    if (fallbackKeys.length > 0) addLevel("Main", fallbackKeys, {});
  } else {
    const rootDefs = levelOwnDefs(rootLevel);
    listParam = rootLevel.list_param;
    s.presetDeclared = !!(rootLevel.list_param && rootLevel.count_param);
    presetParam = buildPresetParam(s, listParam, rootLevel.count_param, rootLevel.name_param);
    const presetSeparate = presetParam != null && (rootLevel.knobs ?? []).length >= KNOBS_PER_PAGE;
    if (presetParam && presetSeparate) {
      addPage("Preset", [...selectors.map((p) => p.key), listParam], nextGroup++, rootDefs);
    }
    let rootKeys = knobKeys(rootLevel);
    if (presetParam) rootKeys = rootKeys.filter((k) => k !== listParam);
    if (presetParam && !presetSeparate) rootKeys = [listParam, ...rootKeys];
    const allKnobKeys = /* @__PURE__ */ new Set();
    for (const lvl of Object.values(allLevels)) {
      for (const k of lvl.knobs ?? []) {
        const key = typeof k === "string" ? k : k.key;
        if (key) allKnobKeys.add(key);
      }
    }
    const orphanFilePaths = Object.entries(cpMap).filter(([key, cp]) => cp.type === "filepath" && !allKnobKeys.has(key)).map(([key]) => key);
    if (orphanFilePaths.length > 0) rootKeys = [...orphanFilePaths, ...rootKeys];
    if (!presetSeparate && selectors.length > 0) {
      const at = listParam ? rootKeys.indexOf(listParam) : -1;
      rootKeys.splice(at < 0 ? 0 : at, 0, ...selectors.map((p) => p.key));
    }
    const extras = makeExtrasPicker(cpMap, allKnobKeys, listParam, s.degenerateKeys);
    const rootExtras = extras(rootLevel);
    if (rootKeys.length > 0 || rootExtras.length > 0) {
      addLevel("Main", [...rootKeys, ...rootExtras], rootDefs);
    }
    const rootLevelKey = allLevels["root"] ? "root" : Object.keys(allLevels)[0];
    for (const page of buildLevelPages(allLevels, rootLevelKey, { extras })) {
      addLevel(page.name, page.keys, page.defs);
    }
  }
  s.bankNames = bankEntries.map((e) => e.name);
  for (const entry of bankEntries) {
    for (const key of entry.keys) {
      if (!key) {
        s.knobParams.push(null);
        continue;
      }
      if (key === listParam && presetParam) {
        s.knobParams.push(presetParam);
        continue;
      }
      if (selMap[key]) {
        s.knobParams.push(selMap[key]);
        continue;
      }
      s.knobParams.push(applyAutoStyle(buildGenericParam(
        key,
        cpMap[key] ?? {},
        entry.defs[key] ?? paramDefs[key] ?? knobInline[key] ?? {}
      )));
    }
  }
  s.enumFmt = new Array(s.knobParams.length).fill(void 0);
  mlog("loadHierarchy: " + s.knobParams.filter(Boolean).length + " params, " + bankEntries.length + " banks");
  s.dirty = true;
}

// src/model/visible-if.ts
function visibleIfOf(def) {
  const v = def?.visible_if;
  if (!v || typeof v !== "object") return null;
  const cond = v;
  if (typeof cond.param !== "string" || cond.param.length === 0) return null;
  return { param: cond.param, equals: String(cond.equals ?? "") };
}
function conditionHolds(cond, rawValue, controllerOptions) {
  if (rawValue === null) return true;
  const want = cond.equals.trim().toLowerCase();
  const got = rawValue.trim().toLowerCase();
  if (got === want) return true;
  if (controllerOptions) {
    const idx2 = Number(got);
    if (Number.isFinite(idx2) && idx2 >= 0 && idx2 < controllerOptions.length) {
      if (String(controllerOptions[idx2]).trim().toLowerCase() === want) return true;
    }
    const wantIdx = Number(want);
    if (Number.isFinite(wantIdx) && wantIdx >= 0 && wantIdx < controllerOptions.length) {
      if (String(controllerOptions[wantIdx]).trim().toLowerCase() === got) return true;
    }
  }
  return false;
}
function collectRules(defs) {
  const out2 = [];
  for (const [key, def] of Object.entries(defs)) {
    const c = visibleIfOf(def);
    if (c) out2.push({ key, param: c.param, equals: c.equals });
  }
  return out2;
}

// src/model/meta-retry.ts
function armHierarchyRetry(s) {
  if (s.moduleId === "" || s.hierarchyRetries >= HIERARCHY_RETRY_LIMIT) return;
  s.hierarchyRetries++;
  s.hierarchyRetryCountdown = HIERARCHY_RETRY_TICKS;
  mlog("hierarchy-retry: no params yet for " + s.activeModuleName + " \u2014 re-reading (" + s.hierarchyRetries + "/" + HIERARCHY_RETRY_LIMIT + ")");
}
function isPlaceholderOptions(options2) {
  return !!options2 && options2.length === 1 && /^\(.*\)$/.test(String(options2[0]).trim());
}
function presetPending(s) {
  return s.presetDeclared && !s.knobParams.some((p) => p?.renderStyle === "preset");
}
function placeholderEnum(s) {
  return s.knobParams.some((p) => p?.type === "enum" && isPlaceholderOptions(p.options));
}
function retryUnsettledMeta(s) {
  if (s.metaRetries >= META_RETRY_LIMIT) return false;
  const wantPreset = presetPending(s);
  if (!wantPreset && !placeholderEnum(s) && s.degenerateKeys.length === 0) {
    s.metaRetries = META_RETRY_LIMIT;
    return false;
  }
  s.metaRetries++;
  if (wantPreset) {
    const raw3 = s.port.getParam(s.componentKey + ":preset_count");
    if (raw3 && parseInt(raw3) > 0) {
      mlog("meta-retry: preset list settled (" + raw3 + ")");
      s.hierarchyKey = "";
    }
    return true;
  }
  const raw2 = s.port.getParam(s.componentKey + ":chain_params");
  if (raw2) {
    try {
      const arr = JSON.parse(raw2);
      const enumSettled = arr.some((cp) => cp.key && s.knobParams.some((p) => !!p && p.key === cp.key && isPlaceholderOptions(p.options)) && !isPlaceholderOptions(cp.options));
      const rangeSettled = arr.some((cp) => cp.key != null && s.degenerateKeys.indexOf(cp.key) >= 0 && cp.min != null && cp.max != null && cp.max > cp.min);
      if (enumSettled || rangeSettled) {
        mlog("meta-retry: " + (enumSettled ? "enum options" : "param range") + " settled");
        s.hierarchyKey = "";
      }
    } catch {
    }
  }
  return true;
}

// src/model/hierarchy.ts
function loadHierarchy(s) {
  s.knobParams = [];
  s.declared = null;
  s.moduleConfig = null;
  s.bankNames = [];
  s.presetDeclared = false;
  s.degenerateKeys = [];
  s.hierarchyKey = s.activeModuleName;
  s.hierarchyRetryCountdown = -1;
  mlog("loadHierarchy: slot=" + s.port.track.index + " module=" + s.activeModuleName);
  const prevModuleId = s.moduleId;
  s.moduleId = s.port.getParam(moduleReadKey(s.componentKey)) || "";
  s.moduleConfig = loadModuleConfig(s.moduleId, s.componentKey);
  if (s.moduleId !== prevModuleId) {
    s.metaRetries = 0;
    s.hierarchyRetries = 0;
  }
  if (s.moduleConfig?.setOnLoad) {
    for (const [k, v] of Object.entries(s.moduleConfig.setOnLoad)) {
      s.port.setParam(s.componentKey + ":" + k, v);
    }
  }
  let declaredHierarchy = null;
  s.drumPadCount = 0;
  s.drumCurrentPad = 1;
  s.drumCurrentPhysPad = 0;
  if (s.moduleConfig?.drum) {
    s.drumPadCount = s.moduleConfig.drum.padCount;
    s.drumCurrentPhysPad = physPadOfDrumPad(s.drumCurrentPad, PAD_MIN, s.moduleConfig.drum);
  }
  const cpMap = {};
  const cpOrder = [];
  const chainParamsRaw = s.port.getParam(s.componentKey + ":chain_params");
  if (chainParamsRaw) {
    try {
      const arr = JSON.parse(chainParamsRaw);
      for (const cp of arr) {
        if (cp.key) {
          cpMap[cp.key] = cp;
          cpOrder.push(cp.key);
        }
      }
      mlog("loadHierarchy: chain_params " + arr.length + " entries");
    } catch (e) {
      mlog("chain_params parse error: " + e);
    }
  }
  const paramDefs = {};
  const knobInline = {};
  let allLevels = {};
  function absorbHierarchy(hier) {
    allLevels = hier?.levels ?? {};
    for (const lvl of Object.values(allLevels)) {
      if (lvl.params) {
        for (const p of lvl.params) {
          if (typeof p === "object" && p.key) paramDefs[p.key] = p;
        }
      }
      if (lvl.knobs) {
        for (const k of lvl.knobs) {
          if (typeof k === "object" && k.key) knobInline[k.key] = k;
        }
      }
    }
  }
  const declared = declaredContract({
    read: (k) => s.port.getParam(s.componentKey + ":" + k),
    moduleId: () => s.moduleId,
    componentKey: s.componentKey
  });
  if (declared.levels) {
    mlog("loadHierarchy: contract from " + declared.source);
    const parsed = declared.levels;
    declaredHierarchy = parsed;
    absorbHierarchy(parsed);
  }
  const declaredSurface = readSurface(declaredHierarchy);
  mlog("drum-declared layout=" + (declaredSurface ? declaredSurface.layout : "no-reader") + " voices=" + (declaredSurface ? declaredSurface.voices.length : 0) + " press=" + (declaredSurface?.pressParam || "-") + " hier=" + (declaredHierarchy ? "yes" : "none") + " keys=" + (declaredHierarchy ? Object.keys(declaredHierarchy).join("|") : "-"));
  s.pressParam = declaredSurface?.pressParam ?? null;
  s.childLevels = childLevelsOf(declaredHierarchy?.levels);
  s.declared = { cp: cpMap, defs: { ...knobInline, ...paramDefs }, keys: declaredKeysOf(cpOrder, allLevels) };
  s.drumConfig = effectiveDrumConfig(declaredSurface, s.moduleConfig?.drum ?? null);
  const voices = s.drumConfig && declaredSurface && declaredSurface.layout === "drums" ? padVoices(s.drumConfig, declaredSurface.voices) : [];
  s.drumPadNames = voices.map((v) => v && v.name || "");
  s.voiceKeys = voiceKeysOf(declaredHierarchy, voices.map((v) => ({ note: v ? v.note : NaN })));
  if (s.drumConfig) {
    s.drumPadCount = s.drumConfig.padCount;
    s.drumCurrentPhysPad = physPadOfDrumPad(s.drumCurrentPad, PAD_MIN, s.drumConfig);
  }
  if (Object.keys(allLevels).length === 0 && !s.moduleConfig && cpOrder.length === 0) {
    mlog("loadHierarchy: ui_hierarchy null \u2014 no params");
    s.dirty = true;
    armHierarchyRetry(s);
    return;
  }
  s.visibilityRules = collectRules(paramDefs);
  s.hiddenKeys = /* @__PURE__ */ new Set();
  for (const r of s.visibilityRules) {
    const raw2 = s.port.getParam(s.componentKey + ":" + r.param);
    const opts = optionList(cpMap[r.param]?.options, paramDefs[r.param]?.options);
    if (!conditionHolds(r, raw2, opts)) s.hiddenKeys.add(r.key);
  }
  if (s.moduleConfig) {
    buildConfigPages(s, cpMap, paramDefs, allLevels);
    return;
  }
  buildGenericPages(s, cpMap, cpOrder, paramDefs, knobInline, allLevels);
}

// src/model/tick.ts
var _perfTickCount = 0;
var _perfSampleMs = 0;
function syncHierarchy(s) {
  if (s.hierarchyKey === s.activeModuleName) return;
  loadHierarchy(s);
  refreshModulatedKeys(s);
}
function reReadModule(s) {
  s.pollCountdown = NAME_POLL_TICKS;
  pollModuleName(s);
  syncHierarchy(s);
  s.dirty = true;
}
function processTick(s) {
  syncHierarchy(s);
  if (s.hierarchyRetryCountdown >= 0 && --s.hierarchyRetryCountdown < 0) {
    s.hierarchyKey = "";
  }
  if (--s.pollCountdown <= 0) {
    s.pollCountdown = NAME_POLL_TICKS;
    pollModuleName(s);
    refreshModulatedKeys(s);
    retryUnsettledMeta(s);
  }
  _perfTickCount++;
  if (_perfTickCount % NAME_POLL_TICKS === 0) {
    const now2 = Date.now();
    if (_perfSampleMs > 0) {
      mlog("perf_tick_rate=" + Math.round(NAME_POLL_TICKS * 1e3 / (now2 - _perfSampleMs)));
    }
    _perfSampleMs = now2;
  }
  const wasDirty = s.dirty;
  s.dirty = false;
  return wasDirty;
}

// src/model/path.ts
function dirname(path) {
  if (!path) return "/";
  const i = path.lastIndexOf("/");
  if (i <= 0) return "/";
  return path.slice(0, i);
}

// src/model/file-dirs.ts
var FALLBACK_DIR = "/data/UserData";
function prefKey(moduleId, paramKey) {
  return (moduleId || "?") + ":" + paramKey;
}
function defaultDirFor(moduleId, p) {
  return readPrefFileDir(prefKey(moduleId, p.key)) ?? p.fileStartPath ?? FALLBACK_DIR;
}
function rememberFileDir(moduleId, paramKey, path) {
  if (path) writePrefFileDir(prefKey(moduleId, paramKey), dirname(path));
}

// src/model/index.ts
function createModel(port, componentKey2 = "synth") {
  const s = createModelState(port, componentKey2);
  function primarySlot() {
    return s.touchedSlots.length > 0 ? s.touchedSlots[s.touchedSlots.length - 1] : -1;
  }
  function fileTargetByGi(gi) {
    const p = s.knobParams[gi];
    if (!p || p.type !== "file") return null;
    const raw2 = s.port.getParam(s.componentKey + ":" + paramIoKey(s, p));
    return {
      key: p.key,
      gi,
      root: p.fileRoot ?? "/data/UserData",
      filter: p.fileFilter ?? [],
      startPath: defaultDirFor(s.moduleId, p),
      currentPath: raw2 ? raw2 : null,
      requireContains: p.fileRequireContains,
      browse: p.fileBrowse
    };
  }
  function fileTargetByKey(key) {
    return fileTargetByGi(s.knobParams.findIndex((q) => q?.key === key));
  }
  return {
    /* The touch is recorded for the gestures that ask which knob is held —
     * the file-browse jog click and the release. The page under the finger
     * is Schwung's; the model opens nothing of its own. */
    handleKnobTouch(k) {
      const idx2 = s.touchedSlots.indexOf(k);
      if (idx2 >= 0) s.touchedSlots.splice(idx2, 1);
      s.touchedSlots.push(k);
      s.dirty = true;
    },
    handleKnobRelease(k) {
      if (k !== void 0) {
        const idx2 = s.touchedSlots.indexOf(k);
        if (idx2 >= 0) s.touchedSlots.splice(idx2, 1);
      } else {
        s.touchedSlots.length = 0;
      }
      s.dirty = true;
    },
    /* Clear only the knob touch state — lighter than reset() (which reloads
     * the hierarchy). Called when the shown param page changes, and whenever
     * a release provably cannot arrive (app/input-reset.ts). */
    clearTouch() {
      if (s.touchedSlots.length) {
        s.touchedSlots.length = 0;
        s.dirty = true;
      }
    },
    getModuleName() {
      return s.activeModuleName;
    },
    reset() {
      s.touchedSlots.length = 0;
      s.pollCountdown = NAME_POLL_TICKS;
      s.dirty = true;
    },
    tick() {
      return processTick(s);
    },
    getViewModel(auto) {
      return buildViewModel(s, auto);
    },
    reload() {
      s.hierarchyKey = "";
      s.pollCountdown = 1;
      s.dirty = true;
    },
    /* `reload()` schedules the re-read for this model's next tick; this does
     * it now. Used where the next frame must already show the new module —
     * a Set load, where the poll's ~1 s cadence is what put an empty slot,
     * or the previous Set's module, on a surface that had gone live. */
    reloadNow() {
      reReadModule(s);
    },
    /* The held knob's file param, resolved through `keyAt` — the page on
     * screen's own key for that slot. `model/` cannot see who draws the page
     * (it may not import `app/`), so the answer is passed in. */
    getFileBrowseTarget(keyAt) {
      const primary = primarySlot();
      if (primary < 0) return null;
      const drawn = keyAt(primary);
      return drawn ? fileTargetByKey(drawn) : null;
    },
    /*
     * THE SAME ANSWER WITHOUT A SLOT, and it is asked for by the caller that
     * has no business naming one. A DIVE arrives as `{action:"open", key,
     * fullKey}` — the controller's own anchor — and it does NOT arrive with
     * a slot: under a delegated page Schwung holds the touch order, and the
     * anchor is not always the cell that was clicked (a gizmo inside a
     * sample graphic redirects). Routing that through `getFileBrowseTarget`
     * would mean handing it a thunk that returns one constant and hoping
     * `primarySlot()` happens to be >= 0 — movy's own `touchedSlots`, which
     * is precisely the state a page Schwung is drawing does not fill. The
     * fallback would then vanish silently, and the browser would open on
     * Schwung's declaration alone with no sign that movy's config had been
     * consulted at all.
     */
    fileBrowseTargetForKey(key) {
      return fileTargetByKey(key);
    },
    /* The full-screen browser's commit path; records where the file came
     * from. */
    setFileValue(gi, path) {
      const p = s.knobParams[gi];
      if (p) rememberFileDir(s.moduleId, p.key, path);
    },
    getComponentKey() {
      return s.componentKey;
    },
    /* Re-read which of this component's params a slot LFO targets (for the ~
     * mark + read-back suppression). Called after an assign/remove so the
     * change shows immediately without waiting for the poll. */
    refreshModulation() {
      refreshModulatedKeys(s);
    },
    /* The same cached set, answered by KEY rather than by ParamVM.
     *
     * Schwung's page controller asks "is this parameter modulated?" with the
     * module's own key, before any of movy's pages has been laid out — and
     * the delegated page has no ParamVM to ask through. One source for both
     * marks is the point: a tilde drawn by movy and a mod dot drawn by
     * Schwung that disagreed would be two readings of one fact. */
    modulatedKeys() {
      return s.modulatedKeys;
    },
    /* Range of a loaded param by key (for automation-lane validation), or
     * null if this module has no such param. Authoritative for config-driven
     * drum modules, where chain_params may be absent. */
    paramRangeByKey(key) {
      const gi = s.knobParams.findIndex((p2) => p2?.key === key);
      const p = gi >= 0 ? s.knobParams[gi] : null;
      if (p) return { min: p.min, max: p.max, type: p.type, ...enumLaneInfo(s, gi) ?? {} };
      const d = s.declared;
      if (!d || !d.keys.has(key)) return null;
      const g = buildGenericParam(key, d.cp[key] ?? {}, d.defs[key] ?? {});
      if (g.type === "file") return null;
      return {
        min: g.min,
        max: g.max,
        type: g.type,
        ...g.type === "enum" && g.options ? { options: g.options } : {}
      };
    },
    /* The child-level template a concrete key instantiates
     * (`pad16_start` → `start`), or null. See model/child-keys.ts. */
    childTemplateOf(key) {
      return childTemplateOf(s.childLevels, key);
    },
    /* The keys only pad `pad`'s voice owns (1-based), or null when the
     * module declares no voice map. See model/voice-keys.ts. */
    voiceKeysOf(pad) {
      return s.voiceKeys.length ? s.voiceKeys[pad - 1] ?? [] : null;
    },
    /* True once this slot's module hierarchy has loaded (params known). */
    hasLoadedParams() {
      return s.knobParams.some((p) => p != null);
    },
    /* The module's declared live-press param, for the router's vouch.
     * Null for every module that has not declared one, which is all of
     * them in docs/module-dump/. */
    getPressParam() {
      return s.pressParam;
    },
    getDrumConfig() {
      return s.drumConfig ?? s.moduleConfig?.drum ?? null;
    },
    /* The two drum facts the app tick needs every frame. They are plain
     * ModelState fields; reading them through getViewModel() meant building
     * the whole view model — pages, envelopes, filter curves — and throwing
     * all but one number away, on every tick and for a model that may not
     * even be on screen. */
    getDrumPadCount() {
      return s.drumPadCount;
    },
    /* The voice names a DECLARED rack gave, 1-based ('' for a rack that
     * declared none). A gesture has to name the voice it moved, and the
     * view model's `drumPadName` is the FOCUSED pad's — the wrong one. */
    getDrumPadNames() {
      return s.drumPadNames;
    },
    getDrumCurrentPad() {
      return s.drumCurrentPad;
    },
    getDrumCurrentPhysPad() {
      return s.drumCurrentPhysPad;
    },
    /* Read-only snapshot of the param registry, for tests and tooling.
     * Exposes raw KnobParams (incl. step, which no other public accessor has). */
    dumpLayout() {
      const banks = s.moduleConfig ? s.moduleConfig.banks.map((b) => ({ name: b.name, global: !!b.global, padSpecific: !!b.padSpecific })) : s.bankNames.map((n) => ({ name: n, global: false, padSpecific: false }));
      return {
        moduleId: s.moduleId,
        moduleName: s.activeModuleName,
        componentKey: s.componentKey,
        banks,
        hasConfig: s.moduleConfig !== null,
        hiddenKeys: [...s.hiddenKeys],
        drum: s.moduleConfig?.drum ?? null,
        params: s.knobParams.map((p) => p ? { ...p } : null)
      };
    },
    updateDrumPad(pad, physPad) {
      s.drumCurrentPad = pad;
      s.drumCurrentPhysPad = physPad;
      s.dirty = true;
    }
  };
}

// src/app/track-models.ts
function buildTrackModels(track) {
  return CHAIN_SLOTS.map((s, i) => {
    if (isLfoSlot(i)) return createLfoModel(track);
    if (isMixSlot(i)) return createMixModel(track);
    return createModel(portFor(track), s.componentKey);
  });
}

// src/browser/state.ts
var browserState = {
  modules: [],
  browseIndex: 0,
  componentKey: "synth",
  paramSlot: 0,
  // TRACK INDEX (0-15) of the browsed chain, not a schwung slot
  reload: null
  // refresh the model backing the browsed slot
};

// src/app/master-models.ts
function buildMasterModels() {
  appState.masterFxModels = MASTER_FX_SLOTS.map((s, i) => isMasterLfoSlot(i) ? createScopedLfoModel(masterScope()) : createModel(componentPort(0, s.componentKey), s.componentKey));
  appState.masterChainIndex = 0;
  appState.masterDetail = false;
}

// src/seq/drum-sync.ts
var NUM_TRACKS = TRACK_COUNT;
var sent = new Array(TRACK_COUNT).fill(-1);
function drumSyncTick() {
  for (let t = 0; t < NUM_TRACKS; t++) {
    const model = appState.trackModels[t]?.[1];
    if (!model || !model.hasLoadedParams()) continue;
    const drum = trackIsDrum(t) ? 1 : 0;
    if (sent[t] === drum) continue;
    sent[t] = drum;
    seqCmd("tdrum " + t + " " + drum);
  }
}
function resetDrumSync() {
  sent.fill(-1);
}

// src/undo/rec-pass.ts
var ARM_CONFIRM_TICKS = 40;
var wasRolling = false;
var lastStep = -1;
var passOpen = false;
var pendingArm = 0;
var passSeq = 0;
function openPass() {
  passSeq++;
  beginEdit({
    key: "rec:" + watchedTrack() + ":" + passSeq,
    verb: "RECORD",
    target: trackLabel(watchedTrack()),
    close: CLOSE.LOOP_WRAP,
    seq: true
  });
  passOpen = true;
}
function recToggle(track) {
  if (!seqState.recording && !seqState.countingIn) {
    openPass();
    pendingArm = ARM_CONFIRM_TICKS;
  }
  seqCtl("rec " + track);
}
function recPassTick() {
  const armed4 = seqState.recording || seqState.countingIn;
  const rolling = seqState.recording && !seqState.countingIn;
  if (!armed4) {
    if (pendingArm > 0) {
      pendingArm--;
      return;
    }
    if (passOpen) {
      endEdit();
      passOpen = false;
    }
    lastStep = -1;
    wasRolling = false;
    return;
  }
  pendingArm = 0;
  if (!passOpen) openPass();
  if (rolling) {
    if (wasRolling && seqState.curStep < lastStep) {
      onLoopWrap();
      openPass();
    }
    lastStep = seqState.curStep;
    wasRolling = true;
  }
}

// src/seq/quant-overlay.ts
var LIFETIME_MS = 1200;
var JOG_TOUCH2 = 9;
var DISMISSING_CCS = [CC_MUTE];
var DISMISSING_SHIFT_STEPS = [
  STEP_CLIP_PARAMS,
  STEP_METRO,
  STEP_FULL_VEL,
  ...Object.keys(MAIN_PAGE_STEPS).map(Number)
];
var untilMs2 = 0;
function quantOverlayActive() {
  return untilMs2 > 0;
}
function armQuantOverlay(nowMs) {
  untilMs2 = nowMs + LIFETIME_MS;
  appState.dirty = true;
}
function quantOverlayTickAt(nowMs) {
  if (untilMs2 > 0 && nowMs >= untilMs2) {
    dismissQuantOverlay();
    return true;
  }
  return false;
}
function dismissQuantOverlay() {
  if (untilMs2 === 0) return;
  untilMs2 = 0;
  endEdit("quant:" + watchedTrack());
  appState.dirty = true;
}
function quantOverlayJog(delta, nowMs) {
  if (untilMs2 === 0) return;
  const n = delta > 0 ? 1 : delta < 0 ? -1 : 0;
  untilMs2 = nowMs + LIFETIME_MS;
  if (n === 0) return;
  const cands = quantCandidates(seqState.defaultQuant);
  const cur = candidateIndex(seqState.clipQuant, seqState.defaultQuant);
  const next = Math.max(0, Math.min(cands.length - 1, (cur < 0 ? 0 : cur) + n));
  if (cands[next] !== seqState.clipQuant) {
    seqState.clipQuant = cands[next];
    seqCmd("cq " + watchedTrack() + " " + cands[next]);
  }
  appState.dirty = true;
}
function quantOverlayHold(nowMs) {
  if (untilMs2 > 0) untilMs2 = nowMs + LIFETIME_MS;
}
function quantOverlayAction(data, shiftHeld) {
  const type = data[0] & 240;
  if (data[2] === 0) return "through";
  if (type === 176 && data[1] === MoveMainKnob) return "jog";
  if (type === 144 && data[1] === JOG_TOUCH2) return "swallow";
  if (shiftHeld && type === 144 && data[1] === STEP_NOTE_BASE + STEP_QUANTIZE) return "through";
  if (shiftHeld && type === 144 && DISMISSING_SHIFT_STEPS.indexOf(data[1] - STEP_NOTE_BASE) >= 0) return "dismiss";
  if (type === 176 && (data[1] === MoveBack || data[1] === MoveMainButton)) return "dismiss";
  if (type === 176 && DISMISSING_CCS.indexOf(data[1]) >= 0) return "dismiss";
  return "through";
}
function buildQuantOverlayVM() {
  const cands = quantCandidates(seqState.defaultQuant);
  const d = Math.max(0, Math.min(100, Math.round(seqState.defaultQuant)));
  return {
    track: watchedTrack(),
    values: cands.map((v) => v + "%"),
    selIdx: candidateIndex(seqState.clipQuant, seqState.defaultQuant),
    defIdx: d === 0 || d === 100 ? -1 : cands.indexOf(d)
  };
}

// src/seq/step-shortcuts.ts
function shiftStepFunction(step) {
  if (step in MAIN_PAGE_STEPS) {
    openParamPage(VIEW_MAIN_PARAMS);
    appState.dirty = true;
    return;
  }
  if (step === STEP_SETS) {
    openSetsPage(currentSetUuid());
    appState.dirty = true;
    return;
  }
  if (step === STEP_FLAGS) {
    openParamPage(VIEW_FLAGS);
    appState.dirty = true;
    return;
  }
  if (step === STEP_CLIP_PARAMS) {
    if (!seqState.sessionMode) openParamPage(VIEW_CLIP_PARAMS);
    appState.dirty = true;
    return;
  }
  if (step === STEP_CPU) {
    openCpuPage();
    appState.dirty = true;
    return;
  }
  if (step === STEP_FULL_VEL) {
    setFullVelocity(!seqState.fullVelocity);
    seqToast(seqState.fullVelocity ? "Full Velocity On" : "Full Velocity Off");
  } else if (step === STEP_DOUBLE_LOOP) {
    doubleLoop();
  } else if (step === STEP_METRO) {
    seqCmd("metro " + (seqState.metro ? 0 : 1));
    seqToast(seqState.metro ? "Metronome Off" : "Metronome On");
  } else if (step === STEP_QUANTIZE) {
    cycleQuantize();
  }
}
function cycleQuantize() {
  const track = watchedTrack();
  const next = nextQuantCandidate(seqState.clipQuant, seqState.defaultQuant);
  beginGesture("quant:" + track, "CLIP QUANT", trackLabel(track));
  seqState.clipQuant = next;
  seqCmd("cq " + track + " " + next);
  armQuantOverlay(Date.now());
}

// src/seq/router-steps.ts
var muteMapPresses = 0;
function muteMapStep(button, on) {
  const bit = 1 << button;
  if (!on) {
    if (!(muteMapPresses & bit)) return false;
    muteMapPresses &= ~bit;
    return true;
  }
  if (!muteHeld() || button >= TRACK_COUNT) return false;
  muteMapPresses |= bit;
  if (muteShiftHeld() || appState.shiftHeld) toggleSolo(button);
  else toggleMute(button);
  muteMarkGestured();
  if (sessionButtonHeld()) momentaryGesture();
  appState.dirty = true;
  return true;
}
function resetMuteMap() {
  muteMapPresses = 0;
}
function handleStepButton(button, on, shiftHeld) {
  if (!on && sessionStepRelease(button)) return;
  if (muteMapStep(button, on)) return;
  if (stepRecActive()) {
    if (on) stepRecStepTap(button);
    return;
  }
  if (songSceneRowActive() || !on && songSceneReleasePending(button)) {
    songSceneStep(button, on);
    return;
  }
  if (trackSelectActive()) {
    if (on && shiftHeld && seqState.sessionMode) {
      shiftStepFunction(button);
      return;
    }
    if (on) sessionStepPress(button);
    return;
  }
  if (on && dupActive()) {
    const absB = seqState.barOffset * NUM_STEP_BUTTONS + button;
    onUnit(seqState.loopMode ? { kind: "bar", track: watchedTrack(), bar: button } : { kind: "step", track: watchedTrack(), step: absB });
  } else if (on && deleteActive()) {
    deleteStep(button);
  } else if (on && shiftHeld) {
    shiftStepFunction(button);
  } else if (on) {
    const absB = seqState.barOffset * NUM_STEP_BUTTONS + button;
    const anchor = !seqState.loopMode && seqState.watchLane < 0 ? heldStepAbs() : -1;
    if (anchor >= 0 && absB !== anchor && occHasStep(anchor)) {
      setLengthTo(absB);
    } else {
      editStepDown(button);
      if (seqState.loopMode) loopStepOn(button);
      if (!seqState.loopMode && seqState.watchLane < 0 && heldStepAbs() >= 0) {
        seqState.holdStep = heldStepAbs();
        seqState.holdNotes = [];
        seqCmd("hold " + watchedTrack() + " " + seqState.holdStep);
      }
    }
  } else {
    const wasTap = editStepUp(button);
    if (!anyStepHeld()) {
      if (seqState.holdNotes.length > 0) {
        setHeldSet(watchedTrack(), seqState.holdNotes);
        seqState.lastPitch[watchedTrack()] = seqState.holdNotes[0];
      }
      seqState.holdNotes = [];
      seqState.holdStep = -1;
      seqState.holdLen = 0;
      seqCmd("hold " + watchedTrack() + " -1");
      endStepAutomation();
    }
    if (seqState.loopMode) loopStepOff(button);
    else if (wasTap) toggleStep(button);
  }
}
function navigateBar(delta) {
  const next = Math.max(minBarOffset(), Math.min(seqState.barOffset + delta, maxBarOffset()));
  seqState.barOffset = next;
}
function toggleStep(button) {
  const step = seqState.barOffset * NUM_STEP_BUTTONS + button;
  const t = watchedTrack();
  const loopEnd = seqState.loopStart + seqState.lenSteps;
  const barEnd = Math.ceil(loopEnd / NUM_STEP_BUTTONS) * NUM_STEP_BUTTONS;
  if (seqState.lenSteps > 0 && step >= loopEnd && step < barEnd && !occHasStep(step)) return;
  const wasSet = occHasStep(step);
  beginEdit({
    key: "step:" + t + ":" + step,
    verb: wasSet ? "CLEAR STEP" : "ADD STEP",
    target: trackLabel(t) + " STEP " + (step + 1),
    close: CLOSE.IMMEDIATE,
    seq: true
  });
  if (seqState.watchLane >= 0) {
    seqCmd(`ltog ${t} ${step} ${seqState.watchLane} ${seqState.lastVel[t]}`);
    mlog(`seq: step ${step} lane ${seqState.watchLane}`);
  } else {
    const chord2 = heldChordPitches();
    const selected = heldSetList(t);
    const pitches = chord2.length > 0 ? chord2 : selected.length > 0 ? selected : [seqState.lastPitch[t]];
    const v = seqState.lastVel[t];
    seqCmd(`tog ${t} ${step} ${pitches.map((p) => `${p} ${v}`).join(" ")}`);
  }
  endEdit();
  if (!wasSet) {
    if (seqState.lenSteps === 0) seqState.lenSteps = NUM_STEP_BUTTONS;
    if (step >= seqState.lenSteps) {
      seqState.lenSteps = (Math.floor(step / NUM_STEP_BUTTONS) + 1) * NUM_STEP_BUTTONS;
    }
  }
  occToggleStep(step);
}

// src/seq/router.ts
var CC_LEFT2 = 62;
var CC_RIGHT2 = 63;
var CC_WHEEL = 14;
var CC_VOLUME = 79;
var CC_PLUS = 55;
var CC_MINUS = 54;
function seqHandleMidi(data, shiftHeld) {
  const statusType = data[0] & 240;
  const d1 = data[1];
  const d2 = data[2];
  if (!padsPlayNotes() && (statusType === 144 || statusType === 128) && d1 >= PAD_MIN && d1 <= PAD_MAX) {
    if (statusType === 144 && d2 > 0) {
      momentaryGesture();
      sessionPad(d1, PAD_MIN);
    }
    return true;
  }
  if ((statusType === 144 || statusType === 128) && d1 >= STEP_NOTE_BASE && d1 < STEP_NOTE_BASE + NUM_STEP_BUTTONS) {
    handleStepButton(d1 - STEP_NOTE_BASE, statusType === 144 && d2 > 0, shiftHeld);
    return true;
  }
  if (statusType !== 176) return false;
  if (seqHandleButtonCc(d1, d2, shiftHeld)) return true;
  if (d1 === CC_REC) {
    if (d2 > 0) {
      if (!stepRecDown()) recToggle(watchedTrack());
    } else if (stepRecUp()) {
      recToggle(watchedTrack());
    }
    return true;
  }
  if (d1 === CC_VOLUME) {
    return editVelocity(decodeDelta(d2));
  }
  if (d1 === CC_WHEEL) {
    if (loopHeld()) return loopWheel(decodeDelta(d2));
    return false;
  }
  if (d1 === CC_PLAY) {
    if (d2 > 0) {
      stepRecEnd();
      seqCmd(seqState.playing ? "stop" : "play");
      seqState.playing = !seqState.playing;
    }
    return true;
  }
  if ((d1 === CC_PLUS || d1 === CC_MINUS) && d2 > 0 && anyStepHeld()) {
    return editTranspose(d1 === CC_PLUS ? 1 : -1);
  }
  if ((d1 === CC_LEFT2 || d1 === CC_RIGHT2) && d2 > 0) {
    const dir = d1 === CC_RIGHT2 ? 1 : -1;
    if (stepRecArrow(dir)) return true;
    if (anyStepHeld()) return editNudge(dir, shiftHeld);
    if (engineReady()) {
      navigateBar(dir);
      return true;
    }
    return false;
  }
  return false;
}
function seqSetLane(lane2) {
  if (lane2 === seqState.watchLane) return;
  seqState.watchLane = lane2;
  seqState.barOffset = 0;
  requestLoopWindowAdopt();
  seqCmd("wlane " + (lane2 < 0 ? -1 : lane2));
}

// src/mixer/track-volume.ts
var MASTER_CC = 79;
var heldTrack = -1;
var touched3 = false;
var volumeBefore = null;
var diverted = -1;
var value = 1;
var volIdx = ampToIdx(1);
var volumeKey = mixerKeyFor;
var MIX_TAIL_DEFAULT = ",0,0,0,0";
var mixTail = MIX_TAIL_DEFAULT;
function writeValue(_track, amp2) {
  return amp2.toFixed(4) + mixTail;
}
function readVolume(track) {
  const raw2 = portFor(track).getParam(MIX_KEY);
  const parts = raw2 === null ? [] : raw2.split(",");
  const comma = raw2 === null ? -1 : raw2.indexOf(",");
  mixTail = comma >= 0 ? raw2.slice(comma) : MIX_TAIL_DEFAULT;
  const g = parts.length === 0 ? NaN : parseFloat(parts[0]);
  return Number.isFinite(g) ? Math.min(VOL_MAX, Math.max(VOL_MIN, g)) : 1;
}
function beginDivert() {
  if (diverted >= 0 || heldTrack < 0) return;
  diverted = heldTrack;
  value = readVolume(heldTrack);
  volumeBefore = writeValue(heldTrack, value);
  volIdx = ampToIdx(value);
  mlog("trackvol arm t=" + heldTrack + " read=" + value.toFixed(2));
}
function endDivert() {
  if (diverted < 0) return;
  endEdit("vol:" + diverted);
  diverted = -1;
  volumeBefore = null;
}
function volumeTrackDown(track) {
  heldTrack = track;
  beginDivert();
}
function volumeTrackUp(track) {
  if (heldTrack !== track) return;
  heldTrack = -1;
  endDivert();
}
function volumeTouch(on) {
  touched3 = on;
}
function volumeKnobDelta(d2) {
  if (heldTrack < 0) return false;
  beginDivert();
  const delta = d2 >= 1 && d2 <= 63 ? d2 : d2 >= 65 ? d2 - 128 : 0;
  if (delta === 0) return true;
  volIdx = Math.min(VOL_STEPS, Math.max(0, volIdx + delta));
  value = idxToAmp(volIdx);
  beginGesture("vol:" + heldTrack, "VOLUME", "T" + (heldTrack + 1), false);
  setChainParam(
    portFor(heldTrack),
    volumeKey(heldTrack),
    writeValue(heldTrack, value),
    volumeBefore
  );
  markUiStateDirty();
  mlog("trackvol t=" + heldTrack + " d=" + delta + " v=" + value.toFixed(4));
  return true;
}
function volumeOverlay() {
  if (heldTrack < 0 || !touched3) return null;
  return {
    track: heldTrack,
    title: "T" + (heldTrack + 1) + " VOLUME",
    value,
    frac: idxToFrac(volIdx),
    unityFrac: UNITY_FRAC
  };
}
function resetTrackVolume() {
  heldTrack = -1;
  touched3 = false;
  volumeBefore = null;
  diverted = -1;
  value = 1;
  volIdx = ampToIdx(1);
  mixTail = MIX_TAIL_DEFAULT;
}

// src/lfo/assign-mode.ts
var state3 = { held: null, active: false, lfoSel: 0 };
function comp(h) {
  return targetComponent(h.scope, h.info.target);
}
function reachable(scope, info) {
  return scope.components.indexOf(targetComponent(scope, info.target)) >= 0;
}
function holdTouch(scope, physK, info) {
  state3.active = false;
  state3.held = info && info.automatable && reachable(scope, info) ? { scope, physK, info, pressMs: Date.now() } : null;
}
function holdTurnCancel() {
  state3.held = null;
  if (state3.active) resetAssignMode();
}
function holdRelease(physK) {
  if (state3.held && state3.held.physK !== physK) return;
  state3.held = null;
  if (state3.active) resetAssignMode();
}
function holdTick() {
  if (state3.active || !state3.held) return false;
  if (Date.now() - state3.held.pressMs < HOLD_MS) return false;
  state3.active = true;
  const h = state3.held;
  state3.lfoSel = lfoTargetsParam(h.scope, 0, comp(h), h.info.ioKey) ? 0 : lfoTargetsParam(h.scope, 1, comp(h), h.info.ioKey) ? 1 : 0;
  return true;
}
function assignActive() {
  return state3.active;
}
function assignCycle(_dir) {
  if (state3.active) state3.lfoSel ^= 1;
}
function assignCommit() {
  if (!state3.active || !state3.held) return null;
  const h = state3.held;
  const lfoIdx = state3.lfoSel;
  const already = lfoTargetsParam(h.scope, lfoIdx, comp(h), h.info.ioKey);
  if (already) clearLfoTarget(h.scope, lfoIdx);
  else assignLfoTarget(h.scope, lfoIdx, comp(h), h.info.ioKey);
  resetAssignMode();
  return { assigned: !already, lfoIdx };
}
function assignToastText() {
  if (!state3.active || !state3.held) return "";
  const h = state3.held;
  const name = "LFO" + (state3.lfoSel + 1);
  return lfoTargetsParam(h.scope, state3.lfoSel, comp(h), h.info.ioKey) ? "CLICK: REMOVE <" + name + "> MOD" : "CLICK: MODULATE <" + name + ">";
}
function resetAssignMode() {
  state3.held = null;
  state3.active = false;
  state3.lfoSel = 0;
}

// src/midi/knob-page-pin.ts
function createKnobLedger() {
  const pinned3 = /* @__PURE__ */ new Map();
  return {
    set(knob, value2) {
      pinned3.set(knob, value2);
    },
    delete(knob) {
      pinned3.delete(knob);
    },
    take(knob) {
      const v = pinned3.get(knob);
      if (v !== void 0) pinned3.delete(knob);
      return v;
    },
    get size() {
      return pinned3.size;
    },
    clear() {
      pinned3.clear();
    }
  };
}
var pinned = createKnobLedger();
function pinPage(knob, page) {
  if (page) pinned.set(knob, page);
  else pinned.delete(knob);
}
function unpinPage(knob) {
  return pinned.take(knob);
}
function clearPins() {
  pinned.clear();
}

// src/midi/knob-model-pin.ts
var pinned2 = createKnobLedger();
function pinModel(knob, model) {
  if (model) pinned2.set(knob, model);
  else pinned2.delete(knob);
}
function unpinModel(knob) {
  return pinned2.take(knob);
}
function clearModelPins() {
  pinned2.clear();
}

// src/app/input-reset.ts
function resetHeldInput(notifyEngine) {
  resetStepEdit();
  resetStepPage();
  resetMomentary();
  resetFlagsPage();
  resetEditOps();
  resetDuplicate();
  resetLoopMode();
  resetSeqChord(notifyEngine);
  resetStepRec();
  resetTrackSelect();
  resetTrackVolume();
  resetMasterVolume();
  resetAssignMode();
  setMuteHeld(false);
  resetMuteMap();
  jogHintTouch(false);
  seqState.stepAutoMode = false;
  seqState.heldLocks.clear();
  seqState.holdStep = -1;
  seqState.holdNotes = [];
  seqState.holdLen = 0;
  appState.shiftHeld = false;
  resetSong();
  for (const track of appState.trackModels) for (const m of track) m.clearTouch();
  for (const m of appState.masterFxModels) m.clearTouch();
  clearPins();
  clearModelPins();
  if (notifyEngine) seqCmd("hold " + watchedTrack() + " -1");
}

// src/app/leave-modal.ts
var LEAVE = [{ label: "Close Movy", action: "close" }];
var POWER = [{ label: "Power off", action: "poweroff" }, { label: "Cancel", action: "cancel" }];
function options() {
  return leaveModalState.kind === "power" ? POWER : LEAVE;
}
function leaveModalPass(data) {
  const type = data[0] & 240;
  if (type === 144 || type === 128) {
    return data[1] <= MoveKnob8Touch + 2 ? "swallow" : "dismiss";
  }
  if (type !== 176) return "swallow";
  const cc2 = data[1];
  if (cc2 >= MoveKnob1 && cc2 < MoveKnob1 + 8) return "swallow";
  if (cc2 === MoveShift || cc2 === CC_PLAY || cc2 === CC_REC) return "through";
  return "dismiss";
}
var leaveModalState = { active: false, sel: 0, kind: "leave" };
function leaveModalActive() {
  return leaveModalState.active;
}
function leaveModalLabels() {
  return options().map((o) => o.label);
}
function leaveModalSel() {
  return leaveModalState.sel;
}
function leaveModalTitle() {
  return leaveModalState.kind === "power" ? "Power off?" : "Leave Movy?";
}
function openLeaveModal() {
  leaveModalState.active = true;
  leaveModalState.kind = "leave";
  leaveModalState.sel = 0;
}
function openPowerModal() {
  mlog(`power modal: open (already up: ${leaveModalState.active ? leaveModalState.kind : "no"})`);
  if (leaveModalState.active && leaveModalState.kind === "power") return;
  leaveModalState.active = true;
  leaveModalState.kind = "power";
  leaveModalState.sel = 0;
  appState.dirty = true;
}
function closeLeaveModal(why) {
  if (leaveModalState.active && leaveModalState.kind === "power") mlog("power modal: closed by " + why);
  leaveModalState.active = false;
}
function leaveModalMove(delta) {
  const n = options().length;
  if (n <= 1 || delta === 0) return;
  leaveModalState.sel = (leaveModalState.sel + (delta > 0 ? 1 : -1) + n) % n;
}
function leaveModalConfirm() {
  if (!leaveModalState.active) return null;
  const opt = options()[leaveModalState.sel] ?? options()[0];
  if (leaveModalState.kind === "power") mlog("power modal: confirmed " + opt.action);
  leaveModalState.active = false;
  return opt.action;
}

// src/app/param-body.ts
var NOTHING2 = () => {
};
var lastBody = "none";
var lastOwner = null;
var lastAuto;
function paramBodyFor(owner2, schwungBody, auto) {
  lastBody = schwungBody ? "schwung" : "none";
  lastOwner = schwungBody ? owner2 : null;
  lastAuto = auto;
  return schwungBody ?? NOTHING2;
}
function lastParamBody() {
  return lastBody;
}
function lastDrawnCells() {
  const page = lastOwner && lastOwner.page;
  const cells4 = new Array(8).fill(null);
  if (!page) return cells4;
  const marks = page.marks();
  const touched4 = page.ctl?.state?.touched ?? -1;
  const held5 = touched4 >= 0 ? page.chrome(false).header : null;
  const levels2 = page.knobLevels();
  for (let slot = 0; slot < 8; slot++) {
    const key = page.keyAt(slot);
    if (!key) continue;
    const lane2 = lastAuto ? lastAuto.laneForKey(key) : -1;
    const laneValue = lane2 < 0 ? void 0 : (lastAuto.held ? lastAuto.heldValues.get(lane2) : void 0) ?? lastAuto.liveValues.get(lane2);
    const level = levels2[slot];
    cells4[slot] = {
      name: page.labelAt(slot) ?? key,
      value: laneValue !== void 0 ? String(laneValue) : slot === touched4 && held5?.right ? String(held5.right) : level === null ? "" : level.toFixed(3),
      automated: !!(marks & 1 << 8 + slot) || lane2 >= 0 && (lastAuto.activeLanes & 1 << lane2) !== 0,
      touched: slot === touched4 || laneValue !== void 0,
      modulated: !!(marks & 1 << slot)
    };
  }
  return cells4;
}
function lastSchwungPage() {
  const page = lastOwner && lastOwner.page;
  if (!page) return null;
  const keys = [];
  for (let slot = 0; slot < 8; slot++) keys.push(page.keyAt(slot));
  return { pageIndex: page.pageIndex, pageCount: page.pageCount, keys };
}

// src/app/init.ts
function init() {
  installPerfProbe();
  setProbeDeps({
    lanesForTrack: (t) => laneKeysForTrack(t),
    activeTrack: () => appState.activeTrack.index,
    /* Through the door in renderer/schwung-widgets.ts, never by importing
     * widget_registry.mjs here: the registry is module state and a second
     * specifier is a second empty map. See that file's header. */
    widgetAvailable: (k) => isWidgetAvailable2(k),
    widgetClear: () => clearWidgets2(),
    paramBody: () => {
      return {
        body: lastParamBody(),
        schwung: lastSchwungPage(),
        cells: lastDrawnCells(),
        session: seqState.sessionMode,
        masterDetail: appState.masterDetail,
        masterSlot: appState.masterChainIndex
      };
    },
    ready: () => sessionReady(),
    sets: () => ({
      selected: setsPageState.selected,
      confirming: setsPageState.confirming,
      keyboard: textEntryActive(),
      buffer: textEntryActive() ? textEntry()?.getTextEntryBuffer() ?? null : null
    }),
    view: () => viewName(appState.currentView),
    browse: () => {
      const s = appState.fileBrowserState;
      if (!s) return null;
      return {
        dir: s.currentDir,
        sel: s.selectedIndex,
        items: s.items.map((it) => ({
          name: it.name,
          path: it.path,
          isDir: !!it.isDir
        }))
      };
    },
    leaveModal: () => ({
      active: leaveModalActive(),
      label: leaveModalLabels()[leaveModalSel()] ?? "",
      sel: leaveModalSel(),
      labels: leaveModalLabels(),
      title: leaveModalTitle()
    })
  });
  selectTrack(0);
  mlog("init: activeTrack=" + appState.activeTrack.index);
  installEditGuard();
  resetUndoState();
  resetUndoGroups();
  resetUndoToast();
  appState.trackModels = Array.from(
    { length: TRACK_COUNT },
    (_, slot) => buildTrackModels(slot)
  );
  buildMasterModels();
  appState.trackChainIndex = new Array(TRACK_COUNT).fill(1);
  appState.trackView = new Array(TRACK_COUNT).fill(VIEW_CHAIN);
  appState.currentView = VIEW_CHAIN;
  appState.shiftHeld = false;
  resetSong();
  jogHintTouch(false);
  appState.browseOrigin = VIEW_CHAIN;
  appState.dirty = true;
  appState.initLedIndex = 0;
  appState.initLedsDone = false;
  appState.fileBrowserState = null;
  for (const trackSlots of appState.trackModels) {
    for (const m of trackSlots) m.reset();
  }
  for (const m of appState.masterFxModels) m.reset();
  resetDrumSync();
  resetTrackMutes();
  loadFullVelocityPref();
  resetHeldInput(false);
  resetWatchPush();
  keyboardState.rootPc = 0;
  keyboardState.mode = 0;
  keyboardState.layout = 0;
  resetOctaves();
  drainAll();
  browserState.modules = [];
  browserState.browseIndex = 0;
  browserState.componentKey = "synth";
}

// src/seq/flags-page-vm.ts
var MIGRATE_ROW = 2;
var CLICK_ROW = 0;
function buildFlagsPageVM() {
  const sel = Math.max(0, Math.min(ACTION_ROWS.length - 1, flagsPageState.selected));
  if (sel !== MIGRATE_ROW) disarmMigrateRow();
  const rows3 = ACTION_ROWS.map((a, i) => ({
    name: a.name,
    value: i === MIGRATE_ROW ? migrateRowValue() : i === CLICK_ROW ? clickVolumeLabel() : ">",
    selected: i === sel
  }));
  return {
    rows: rows3,
    selected: sel,
    hint: sel === MIGRATE_ROW ? migrateRowHint() : ACTION_ROWS[sel].hint
  };
}

// src/seq/versions-page-vm.ts
var WHY_LABEL = {
  "open": "OPENED",
  "auto": "AUTOSAVE",
  "exit": "ON EXIT",
  "pre-wipe": "PRE-WIPE",
  "pre-restore": "PRE-UNDO",
  "adopted": "FOUND"
};
var MIN = 6e4;
var HOUR = 36e5;
var DAY = 24 * HOUR;
function agoLabel(ms, now2) {
  if (!(ms > 0) || ms > now2) return "OLDEST";
  const d = now2 - ms;
  if (d < MIN) return "JUST NOW";
  if (d < HOUR) return Math.floor(d / MIN) + "M AGO";
  if (d < DAY) return Math.floor(d / HOUR) + "H AGO";
  if (d < 2 * DAY) return "YESTERDAY";
  return Math.floor(d / DAY) + "D AGO";
}
function buildVersionsPageVM(now2) {
  const rows3 = versionRows().map((r) => ({
    age: agoLabel(r.ms, now2),
    why: WHY_LABEL[r.why],
    clips: r.clips === 1 ? "1 CLIP" : r.clips + " CLIPS",
    /* Neither half: the sequence comes back and everything else stays as
     * it is. A version carrying chains alone still restores instruments. */
    seqOnly: !r.ui && !r.ch
  }));
  return { rows: rows3, selected: 0, confirming: false, empty: rows3.length === 0 };
}

// src/seq/versions-page.ts
var versionsPageState = {
  selected: 0,
  confirming: false
};
function versionsPageActive() {
  return appState.currentView === VIEW_VERSIONS;
}
function openVersionsPage() {
  resetVersionsPage();
  refreshVersionRows();
  openParamPage(VIEW_VERSIONS);
}
function resetVersionsPage() {
  versionsPageState.selected = 0;
  versionsPageState.confirming = false;
}
function versionsPageJog(delta, shift) {
  if (versionsPageState.confirming) return;
  const max = Math.max(0, versionRows().length - 1);
  const step = shift ? 8 : 1;
  versionsPageState.selected = Math.max(0, Math.min(max, versionsPageState.selected + delta * step));
}
function versionsPageClick(uuid) {
  const rec = versionRows()[versionsPageState.selected];
  if (!rec) return;
  if (!versionsPageState.confirming) {
    versionsPageState.confirming = true;
    return;
  }
  versionsPageState.confirming = false;
  restoreVersion(uuid, rec.n);
}
function versionsPageBack() {
  if (!versionsPageState.confirming) return false;
  versionsPageState.confirming = false;
  return true;
}

// src/seq/track-menu.ts
var state4 = { track: -1 };
function trackMenuActive() {
  return state4.track >= 0;
}
function openTrackMenu(track) {
  state4.track = track;
}
function closeTrackMenu() {
  state4.track = -1;
}
function trackMenuKnob(dir) {
  if (state4.track < 0 || dir === 0) return;
  stepTrackMidiIn(state4.track, dir);
  markUiStateDirty();
}
function buildTrackMenuVM() {
  return {
    rows: [{
      name: "MIDI IN T" + (state4.track + 1),
      value: midiInLabel(trackMidiIn(state4.track)),
      selected: true
    }],
    selected: 0,
    hint: "Knob 1: USB channel. SEL: selected track."
  };
}

// src/renderer/header.ts
function drawHeader(left, right, inverted = false) {
  if (inverted) fill_rect(0, 0, W, HEADER_H, 1);
  const color = inverted ? 0 : 1;
  fontPrint(2, 1, left, color);
  if (right) fontPrint(W - fontWidth(right) - 2, 1, right, color);
}
var PAD_ICON_W = 7;
function padIconShown(vm2, chrome) {
  return !!chrome?.padScoped && vm2.drumPadCount > 0;
}
function drawHeaderWithPadIcon(left, right, padCount, currentPad) {
  drawHeader(left, null, false);
  const rightW = fontWidth(right);
  drawPadGridIcon(W - 2 - rightW - PAD_ICON_W, 0, padCount, currentPad);
  fontPrint(W - 2 - rightW, 1, right, 1);
}
function drawBankBar(bankIndex, bankCount, dottedFirst = false, groups) {
  if (bankCount <= 1) return;
  if (bankCount > W) {
    fill_rect(0, BAR_Y, W, 1, 1);
    const x2 = Math.min(W - 1, Math.floor(bankIndex * W / bankCount));
    fill_rect(x2, BAR_Y, 1, 2, 1);
    return;
  }
  const gap = new Array(bankCount).fill(0);
  const useGroups = !!groups && groups.length === bankCount;
  const bounds = [];
  for (let b = 1; b < bankCount; b++) {
    if (!useGroups || groups[b] !== groups[b - 1]) bounds.push(b);
  }
  const keep = Math.min(bounds.length, Math.max(0, W - bankCount));
  for (let i = 0; i < keep; i++) gap[bounds[Math.floor(i * bounds.length / keep)]] = 1;
  const area = W - keep;
  const edge = (b) => Math.floor(b * area / bankCount);
  let x = 0;
  for (let b = 0; b < bankCount; b++) {
    x += gap[b];
    const segW = edge(b + 1) - edge(b);
    const h = b === bankIndex ? 2 : 1;
    if (dottedFirst && b === 0) {
      for (let px = x; px < x + segW; px += 2) fill_rect(px, BAR_Y, 1, h, 1);
    } else {
      fill_rect(x, BAR_Y, segW, h, 1);
    }
    x += segW;
  }
}
function drawPadGridIcon(x, y, padCount, currentPad) {
  const rows3 = padCount <= 8 ? 2 : 4;
  const w = 6;
  const h = rows3 + 2;
  fill_rect(x, y, w, 1, 1);
  fill_rect(x, y + h - 1, w, 1, 1);
  fill_rect(x, y, 1, h, 1);
  fill_rect(x + w - 1, y, 1, h, 1);
  if (currentPad >= 1 && currentPad <= padCount) {
    const row = Math.floor((currentPad - 1) / 4);
    const col = (currentPad - 1) % 4;
    fill_rect(x + 1 + col, y + rows3 - row, 1, 1, 1);
  }
}

// src/renderer/wrap.ts
function wrapWords(text2, maxPx) {
  const out2 = [];
  let line = "";
  for (const word of text2.split(" ")) {
    if (!word) continue;
    const next = line ? line + " " + word : word;
    if (line && fontWidth(next) > maxPx) {
      out2.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) out2.push(line);
  return out2;
}

// src/renderer/flags-view.ts
var ROW_H = FONT_HEIGHT + 2;
var HINT_LINES = 2;
var HINT_W = W - 4;
var HINT_TOP = TOAST_Y - HINT_LINES * ROW_H;
var LIST_TOP = HEADER_H + 2;
var LIST_BOT = HINT_TOP - 2;
var VISIBLE_ROWS = Math.floor((LIST_BOT - LIST_TOP) / ROW_H);
function firstVisibleRow(selected, count2) {
  const half = Math.floor(VISIBLE_ROWS / 2);
  return Math.max(0, Math.min(selected - half, count2 - VISIBLE_ROWS));
}
function renderFlagsView(vm2) {
  clear_screen();
  drawHeader("SETTINGS", null, true);
  if (vm2.rows.length === 0) {
    fontPrint(2, LIST_TOP, "No settings", 1);
    return;
  }
  drawHint(vm2.hint);
  const start2 = firstVisibleRow(vm2.selected, vm2.rows.length);
  for (let i = 0; i < VISIBLE_ROWS; i++) {
    const idx2 = start2 + i;
    if (idx2 >= vm2.rows.length) break;
    const row = vm2.rows[idx2];
    const y = LIST_TOP + i * ROW_H;
    const fg = row.selected ? 0 : 1;
    if (row.selected) fill_rect(0, y - 1, W, ROW_H, 1);
    fontPrint(2, y, row.name, fg);
    fontPrint(W - fontWidth(row.value) - 2, y, row.value, fg);
  }
}
function drawHint(hint) {
  fill_rect(0, HINT_TOP - 2, W, 1, 1);
  const lines = wrapWords(hint, HINT_W);
  for (let i = 0; i < HINT_LINES && i < lines.length; i++) {
    fontPrint(2, HINT_TOP + i * ROW_H, lines[i], 1);
  }
}

// src/renderer/button-icons.ts
var ICONS = {
  /* Shapes from the Move manual's button figures (Capture p.87, Copy p.45).
   * Capture: four corner brackets, a viewfinder. */
  capture: ["##.##", "#...#", ".....", "#...#", "##.##"],
  /* Copy: a small square, with the open corner of the one behind it. */
  copy: ["..###", "....#", "###.#", "#.#..", "###.."],
  /* Delete: the cross. */
  delete: ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"]
};
var ICON_W = 5;
var FOOTER_Y = 57;
var FOOTER_H = 7;
var PAD = 2;
var GAP = 2;
var SPACING = 5;
function drawButtonIcon(x, y, icon, color) {
  const rows3 = ICONS[icon];
  for (let r = 0; r < rows3.length; r++) {
    for (let c = 0; c < rows3[r].length; c++) {
      if (rows3[r][c] === "#") fill_rect(x + c, y + r, 1, 1, color);
    }
  }
}
function iconHintWidth(action) {
  return ICON_W + PAD * 2 + GAP + fontWidth(action);
}
function drawIconFooter(hints, x = 1) {
  fill_rect(0, FOOTER_Y, 128, FOOTER_H, 0);
  for (const [icon, action] of hints) {
    const pw = ICON_W + PAD * 2;
    fill_rect(x, FOOTER_Y, pw, FOOTER_H, 1);
    for (const [cx, cy] of [
      [x, FOOTER_Y],
      [x + pw - 1, FOOTER_Y],
      [x, FOOTER_Y + FOOTER_H - 1],
      [x + pw - 1, FOOTER_Y + FOOTER_H - 1]
    ]) {
      fill_rect(cx, cy, 1, 1, 0);
    }
    drawButtonIcon(x + PAD, FOOTER_Y + 1, icon, 0);
    fontPrint(x + pw + GAP, FOOTER_Y + 1, action, 1);
    x += iconHintWidth(action) + SPACING;
  }
  return x;
}

// src/renderer/sets-view.ts
var ROW_H2 = FONT_HEIGHT + 2;
var LIST_TOP2 = HEADER_H + 2;
var SETS_ROWS = Math.floor((FOOTER_Y - 1 - LIST_TOP2) / ROW_H2);
var CONFIRM_TOP = FOOTER_Y - 2 * ROW_H2 - 1;
var DOT = 3;
function fit(text2, w) {
  let out2 = text2;
  while (out2.length > 0 && fontWidth(out2) > w) out2 = out2.slice(0, -1);
  return out2;
}
function centre(y, text2, color) {
  fontPrint(Math.max(0, Math.floor((W - fontWidth(text2)) / 2)), y, text2, color);
}
function firstSetsRow(selected, count2) {
  const half = Math.floor(SETS_ROWS / 2);
  return Math.max(0, Math.min(selected - half, count2 - SETS_ROWS));
}
function renderSetsView(vm2) {
  clear_screen();
  drawHeader("SETS", null, true);
  if (vm2.mode === "loading") {
    centre(26, "READING SETS...", 1);
    return;
  }
  const first = firstSetsRow(vm2.selected, vm2.rows.length);
  for (let i = 0; i < SETS_ROWS && first + i < vm2.rows.length; i++) {
    const r = vm2.rows[first + i];
    const y = LIST_TOP2 + i * ROW_H2;
    const sel = first + i === vm2.selected;
    if (sel) fill_rect(0, y - 1, W, ROW_H2, 1);
    const c = sel ? 0 : 1;
    let right = W - 2;
    if (r.current) {
      fill_rect(right - DOT, y + 1, DOT, DOT, c);
      right -= DOT + 3;
    }
    const withCount = right - fontWidth(r.clips) - 4 - 2;
    if (r.clips && fontWidth(r.name) <= withCount) {
      fontPrint(right - fontWidth(r.clips), y, r.clips, c);
      fontPrint(2, y, r.name, c);
    } else {
      fontPrint(2, y, fit(r.name, right - 4), c);
    }
  }
  if (vm2.confirm) {
    fill_rect(0, CONFIRM_TOP - 1, W, 2 * ROW_H2 + 1, 0);
    centre(CONFIRM_TOP, fit(vm2.confirm, W - 4), 1);
    centre(CONFIRM_TOP + ROW_H2, "JOG=DELETE BACK=CANCEL", 1);
  }
  drawIconFooter([["capture", "RENAME"], ["copy", "DUP"], ["delete", "DEL"]]);
}

// src/seq/sets-page-vm.ts
var NEW_ROW = "[NEW]";
function buildSetsPageVM(rows3, openId, selected, confirming) {
  if (!rows3) return { mode: "loading", rows: [], selected: 0, confirm: null };
  const out2 = [{ name: NEW_ROW, clips: "", current: false, isNew: true }];
  for (const r of rows3) out2.push({ name: r.name, clips: String(r.clips), current: r.id === openId, isNew: false });
  const sel = Math.max(0, Math.min(selected, out2.length - 1));
  const target2 = out2[sel];
  return {
    mode: "list",
    rows: out2,
    selected: sel,
    confirm: confirming && !target2.isNew ? "DELETE " + target2.name.toUpperCase() + "?" : null
  };
}

// src/renderer/versions-view.ts
var ROW_H3 = FONT_HEIGHT + 2;
var LIST_TOP3 = HEADER_H + 2;
var FOOT_TOP = TOAST_Y - 2 * ROW_H3;
var VERSION_ROWS = Math.floor((TOAST_Y - 2 - LIST_TOP3) / ROW_H3);
var WHY_X = 49;
function fit2(text2, w) {
  let out2 = text2;
  while (out2.length > 0 && fontWidth(out2) > w) out2 = out2.slice(0, -1);
  return out2;
}
function centre2(y, text2, color) {
  fontPrint(Math.floor((W - fontWidth(text2)) / 2), y, text2, color);
}
function renderVersionsView(vm2) {
  clear_screen();
  drawHeader("BACKUPS", null, true);
  if (vm2.empty) {
    centre2(Math.floor(TOAST_Y / 2) - 3, "NO BACKUPS YET", 1);
    return;
  }
  const first = firstVisibleRow(vm2.selected, vm2.rows.length);
  for (let i = 0; i < VERSION_ROWS && first + i < vm2.rows.length; i++) {
    const r = vm2.rows[first + i];
    const y = LIST_TOP3 + i * ROW_H3;
    const sel = first + i === vm2.selected;
    if (sel) fill_rect(0, y - 1, W, ROW_H3, 1);
    const c = sel ? 0 : 1;
    fontPrint(2, y, r.age, c);
    const tail = r.seqOnly ? r.clips + "*" : r.clips;
    const tailX = W - 2 - fontWidth(tail);
    fontPrint(tailX, y, tail, c);
    fontPrint(WHY_X, y, fit2(r.why, tailX - 3 - WHY_X), c);
  }
  if (vm2.confirming) {
    fill_rect(0, FOOT_TOP - 2, W, 2 * ROW_H3 + 3, 0);
    centre2(FOOT_TOP, "JOG=RESTORE BACK=CANCEL", 1);
    centre2(FOOT_TOP + ROW_H3, "SCHWUNG SLOTS NOT INCLUDED", 1);
  }
}

// src/seq/cpu-scale.ts
var FULL_SCALE_US = 1e3;
var SCALE_LADDER = [FULL_SCALE_US, 1500, 2e3, 3e3, 4e3, 5e3, 6e3, 8e3, 9e3];
function scaleFor(columns, sends = []) {
  let worst = 0;
  for (const c of columns) {
    if (c.totalUs > worst) worst = c.totalUs;
  }
  for (const c of sends) {
    if (c.totalUs > worst) worst = c.totalUs;
  }
  for (const step of SCALE_LADDER) {
    if (worst <= step) return step;
  }
  return SCALE_LADDER[SCALE_LADDER.length - 1];
}
function scaleLabel(scaleUs) {
  const ms = scaleUs / 1e3;
  return (Number.isInteger(ms) ? String(ms) : ms.toFixed(1)) + "MS";
}

// src/renderer/primitives.ts
function drawDottedV(x, y0, y1) {
  const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
  for (let y = lo; y <= hi; y += 2) fill_rect(x, y, 1, 1, 1);
}
function drawDottedH(x0, x1, y) {
  const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  for (let x = lo; x <= hi; x += 2) fill_rect(x, y, 1, 1, 1);
}
function hatchRect(x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if ((xx + yy & 1) === 0) fill_rect(xx, yy, 1, 1, color);
    }
  }
}

// src/renderer/cpu-view.ts
var BAR_Y2 = 8;
var BAR_H = 6;
var TOP2 = 17;
var BOT = 56;
var HGT = BOT - TOP2;
var LABEL_Y = 58;
var WIDE = { pitch: 8, colW: 7 };
var NARROW = { pitch: 6, colW: 5 };
var TRACKS_END = 16 * NARROW.pitch;
var SEND_X = 104;
var SEND = { pitch: 8, colW: 7 };
var SEND_M = { pitch: 6, colW: 5 };
function barPixels(us, scaleUs) {
  return Math.min(HGT, Math.max(0, Math.round(us / scaleUs * HGT)));
}
function renderCpuView(vm2) {
  clear_screen();
  drawHeader("CPU", Math.round(vm2.load * 100) + "%");
  drawCapacity(vm2.load, vm2.peakLoad);
  const sends = vm2.sends.length > 0;
  const g = sends ? NARROW : WIDE;
  drawFloorDatum(vm2.scaleUs, g, sends);
  for (let i = 0; i < vm2.columns.length && i < 16; i++) {
    drawColumn(i * g.pitch, g.colW, vm2.columns[i], vm2.scaleUs);
  }
  const master = vm2.sends.length > SEND_BUSES;
  const sg = master ? SEND_M : SEND;
  for (let n = 0; n < vm2.sends.length; n++) {
    drawColumn(SEND_X + n * sg.pitch, sg.colW, vm2.sends[n], vm2.scaleUs);
  }
  for (const n of sends ? [1, 5, 9] : [1, 5, 9, 13]) {
    fontPrint5x3((n - 1) * g.pitch, LABEL_Y, String(n), 1);
  }
  if (sends) fontPrint5x3(SEND_X, LABEL_Y, "SND", 1);
  if (master) fontPrint5x3(SEND_X + SEND_BUSES * sg.pitch, LABEL_Y, "M", 1);
  const scale = scaleLabel(vm2.scaleUs);
  fontPrint5x3((sends ? TRACKS_END : W) - fontWidth5x3(scale), LABEL_Y, scale, 1);
}
function drawFloorDatum(scaleUs, g, sends) {
  const y = BOT - barPixels(FULL_SCALE_US, scaleUs);
  for (let i = 0; i < 16; i++) fill_rect(i * g.pitch + g.colW, y, 1, 1, 1);
  if (!sends) return;
  for (let n = 0; n < SEND_BUSES; n++) fill_rect(SEND_X + n * SEND.pitch + SEND.colW, y, 1, 1, 1);
}
function drawCapacity(load, peak) {
  fill_rect(0, BAR_Y2, W, 1, 1);
  fill_rect(0, BAR_Y2 + BAR_H - 1, W, 1, 1);
  fill_rect(0, BAR_Y2, 1, BAR_H, 1);
  fill_rect(W - 1, BAR_Y2, 1, BAR_H, 1);
  const inner = W - 2;
  const fw = Math.round(Math.min(1, Math.max(0, load)) * inner);
  if (fw > 0) fill_rect(1, BAR_Y2 + 1, fw, BAR_H - 2, 1);
  const px = Math.min(1 + Math.round(Math.min(1, Math.max(0, peak)) * inner), W - 2);
  fill_rect(px, BAR_Y2 + 1, 1, BAR_H - 2, px < 1 + fw ? 0 : 1);
  fill_rect(px - 1, BAR_Y2 - 1, 3, 1, 1);
}
function drawColumn(x, colW, col, scaleUs) {
  if (col.kind === "na") {
    drawDottedV(x + (colW >> 1), TOP2 + 2, BOT);
    fill_rect(x, BOT, colW, 1, 1);
    return;
  }
  fill_rect(x, BOT, colW, 1, 1);
  if (col.kind === "empty") return;
  if (col.kind === "asleep") {
    fill_rect(x + (colW - 3 >> 1), BOT - 3, 3, 1, 1);
  }
  const sH = col.kind === "asleep" ? 0 : barPixels(col.synthUs, scaleUs);
  const fH = col.kind === "asleep" ? 0 : Math.min(HGT - sH, barPixels(col.totalUs - col.synthUs, scaleUs));
  if (sH > 0) fill_rect(x, BOT - sH, colW, sH, 1);
  if (fH > 0) hatchRect(x, BOT - sH - fH, colW, fH, 1);
  if (col.totalUs > scaleUs || col.peakUs > scaleUs) {
    fill_rect(x, TOP2 + 1, colW, 1, 0);
    fill_rect(x, TOP2, colW, 1, 1);
  }
  if (col.peakUs > 0) {
    drawDottedH(x, x + colW - 1, BOT - barPixels(col.peakUs, scaleUs));
  }
}

// src/seq/cpu-page-vm.ts
var DEFAULT_BLOCK_US = 2902;
var USABLE_BLOCK = 0.7;
function num(s) {
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function buildCpuPageVM() {
  const triples = seqState.cpuCost ? seqState.cpuCost.split(",") : [];
  const [loadedHex, asleepHex] = (seqState.cpuMask || "0/0").split("/");
  const loaded = parseInt(loadedHex, 16) || 0;
  const asleep = parseInt(asleepHex, 16) || 0;
  const [wallStr, peakStr, blockStr] = (seqState.cpuWall || "").split("/");
  const blockUs = num(blockStr) || DEFAULT_BLOCK_US;
  const wallUs = num(wallStr);
  const wallPeakUs = num(peakStr);
  const columns = [];
  for (let t = 0; t < TRACK_COUNT; t++) {
    const bit = 1 << t;
    if (!(loaded & bit)) {
      columns.push({ kind: "empty", totalUs: 0, synthUs: 0, peakUs: 0 });
      continue;
    }
    const [total, synth, peak] = (triples[t] || "").split("/");
    columns.push({
      kind: asleep & bit ? "asleep" : "live",
      totalUs: num(total),
      // Clamped to the total: the FX segment is drawn as the difference,
      // and a synth reading larger than its own block would draw it
      // negative.
      synthUs: Math.min(num(synth), num(total)),
      peakUs: num(peak)
    });
  }
  const sends = buildSendColumns(seqState.cpuSend, seqState.cpuMaster);
  const budgetUs = Math.max(1, Math.round(blockUs * USABLE_BLOCK));
  return {
    columns,
    sends,
    scaleUs: scaleFor(columns, sends),
    wallUs,
    wallPeakUs,
    blockUs,
    budgetUs,
    load: wallUs / budgetUs,
    peakLoad: wallPeakUs / budgetUs
  };
}
function buildSendColumns(raw2, master = "") {
  const fields = raw2 ? raw2.split(",") : [];
  const cols = [];
  for (let n = 0; n < SEND_BUSES; n++) cols.push(fxColumn(fields[n]));
  const m = fxColumn(master || void 0);
  if (m.kind !== "empty") cols.push(m);
  return cols.some((c) => c.kind !== "empty") ? cols : [];
}
function fxColumn(f) {
  if (f === void 0 || f === "-") return { kind: "empty", totalUs: 0, synthUs: 0, peakUs: 0 };
  const [total, peak] = f.split("/");
  const totalUs = num(total);
  return { kind: totalUs > 0 ? "live" : "asleep", totalUs, synthUs: 0, peakUs: num(peak) };
}

// src/keyboard/leds.ts
function drumPadLedColor(padNote, padMin, drumConfig, currentPhysPad, track, isPlaying, isSilent) {
  if (drumPadOfPhys(padNote, padMin, drumConfig) < 0) return Black;
  if (isPlaying) return NeonGreen;
  if (padNote === currentPhysPad) return White;
  if (isSilent) return C_DARKGREY;
  return trackColor(track);
}

// src/mixer/pad-mutes.ts
function mirror(track) {
  return seqState.padMuteTrack === track ? { solo: seqState.padSolo, mutes: seqState.padMutes } : null;
}
function padVoiceSilent(note) {
  const m = mirror(watchedTrack());
  if (!m) return false;
  return m.solo >= 0 ? m.solo !== note : m.mutes.has(note);
}
function padLabel(track, note) {
  const model = appState.trackModels[track]?.[1];
  const cfg = model ? model.getDrumConfig() : null;
  if (!cfg || !model) return "NOTE " + note;
  const pad = drumPadOfNote(note, cfg);
  if (pad < 0) return "NOTE " + note;
  return model.getDrumPadNames()[pad - 1] || "PAD " + pad;
}
function padMuteGesture(track, note, solo2) {
  if (track < 0 || track >= TRACK_COUNT || note < 0 || note > 127) return;
  const before = mirror(track);
  const wasSolo = before ? before.solo === note : false;
  const wasMuted = before ? before.mutes.has(note) : false;
  const label2 = padLabel(track, note);
  beginEdit({
    key: "pvoice:" + track + ":" + note,
    verb: solo2 ? wasSolo ? "SOLO OFF" : "SOLO" : wasMuted ? "UNMUTE" : "MUTE",
    target: label2,
    close: CLOSE.IMMEDIATE,
    seq: true
  });
  if (solo2) seqCmd("psolo " + track + " " + (wasSolo ? -1 : note));
  else seqCmd("pmute " + track + " " + note + " " + (wasMuted ? 0 : 1));
  endEdit();
  mlog(solo2 ? "psolo t=" + track + " n=" + (wasSolo ? -1 : note) : "pmute t=" + track + " n=" + note + " -> " + (wasMuted ? 0 : 1));
  if (seqState.padMuteTrack !== track) {
    seqState.padMutes.clear();
    seqState.padSolo = -1;
    seqState.padMuteTrack = track;
  }
  if (solo2) seqState.padSolo = wasSolo ? -1 : note;
  else if (wasMuted) seqState.padMutes.delete(note);
  else seqState.padMutes.add(note);
  seqToast(solo2 ? wasSolo ? "SOLO OFF" : label2 + " SOLO" : label2 + (wasMuted ? " UNMUTED" : " MUTED"));
}

// src/renderer/schwung-footer.ts
function drawPageFooter(hints) {
  if (!hints || !hints.length) return;
  schwungLib().drawFooter(movyCtx(), hints);
}

// src/renderer/knob-view.ts
function headerRightText(vm2, chrome) {
  return chrome?.pageLabel || vm2.drumPadName;
}
function renderKnobsView(vm2, jogTouched = false, activeSlot = 0, body = () => {
}, bank, chrome) {
  clear_screen();
  if (chrome?.header) {
    drawHeader(chrome.header.left, chrome.header.right, chrome.header.inverted);
  } else {
    const showIcon = padIconShown(vm2, chrome);
    const iconW = showIcon ? PAD_ICON_W : 0;
    const rightText = headerRightText(vm2, chrome);
    const rightW = rightText ? fontWidth(rightText) + iconW + 4 : 0;
    const maxLeftW = W - rightW - 4;
    const trackLabel2 = "T" + (activeSlot + 1);
    let dispName = vm2.headerOverride ?? trackLabel2 + " > " + vm2.moduleName;
    while (dispName.length > 1 && fontWidth(dispName) > maxLeftW) {
      dispName = dispName.slice(0, -1);
    }
    if (showIcon && rightText) {
      drawHeaderWithPadIcon(dispName, rightText, vm2.drumPadCount, vm2.drumCurrentPad);
    } else {
      drawHeader(dispName, rightText || null, false);
    }
  }
  const bankIndex = bank ? bank.index : 0;
  const bankCount = bank ? bank.count : 1;
  if (vm2.stepPagePresent) {
    const sel = vm2.stepPageSelected ? 0 : bankIndex + 1;
    drawBankBar(sel, bankCount + 1, true);
  } else {
    drawBankBar(bankIndex, bankCount, false);
  }
  body();
  if (vm2.automationHeld && vm2.automationPoolFull) drawJogToast(AUTO_LANES + " AUTOMATION LANES \u2014 FULL");
  else if (jogTouched) drawJogToast("CLICK JOG: SWAP MODULE");
  else if (chrome?.footer?.length) drawPageFooter(chrome.footer);
}

// src/app/page-owner-virtual.ts
function pageOwnerForComponent(componentKey2) {
  const ref = { track: MASTER_PAGE_TRACK, componentKey: componentKey2 };
  return ownerOf(ref, schwungPageFor(ref.track, componentKey2, null, null));
}

// src/renderer/schwung-editor.ts
var state5 = null;
function schwungEditorActive() {
  return state5 !== null;
}
function openSchwungEditor(intent, page) {
  if (!intent || intent.action !== "open") return false;
  const door = Array.isArray(intent.options) ? null : intent.key ? page.picker(intent.key) : null;
  const options2 = door ? door.options : intent.options;
  if (!Array.isArray(options2) || options2.length < 2) return false;
  const at = door ? door.index : typeof intent.index === "number" ? intent.index : 0;
  const i = Math.max(0, Math.min(options2.length - 1, at));
  state5 = { intent, page, options: options2, index: i, mark: i, door };
  return true;
}
function schwungEditorJog(dir) {
  if (!state5) return;
  const n = state5.options.length;
  state5.index = Math.max(0, Math.min(n - 1, state5.index + (dir > 0 ? 1 : -1)));
}
function schwungEditorCommit() {
  if (!state5) return;
  const { page, intent, index, door } = state5;
  state5 = null;
  if (door) door.commit(index);
  else page.ctl.commitEnum(intent.key, index);
}
function schwungEditorCancel() {
  state5 = null;
}
function renderSchwungEditor() {
  if (!state5) return;
  const ctx = movyCtx();
  schwungLib().drawEnumList(ctx, {
    title: state5.door?.title || state5.intent.meta?.label || state5.intent.meta?.name || state5.intent.key || "",
    /* "SELECT", not "TURNING": here a choice is pending and a click takes
     * it. The peek says TURNING because its value is already set. */
    headerRight: "SELECT",
    options: state5.options,
    index: state5.index,
    markIndex: state5.mark,
    footer: [["BACK", "CANCEL"], ["CLICK", "SET"]]
  });
}

// src/app/repaint-cap.ts
var REPAINT_CAP_MS = 200;
var CANVAS_FRAME_MS = 33;
function createRepaintCap(capMs = REPAINT_CAP_MS, canvasMs = CANVAS_FRAME_MS) {
  let lastFrame = -Infinity;
  let lastCanvas = -Infinity;
  return function repaintCap(a, now2) {
    if (a.moving) return true;
    if (a.canvas && now2 - lastCanvas >= canvasMs) {
      lastCanvas = lastFrame = now2;
      return true;
    }
    if (!a.streaming) return false;
    if (now2 - lastFrame < capMs) return false;
    lastFrame = now2;
    return true;
  };
}

// src/app/page-poll.ts
function moduleGridOnScreen() {
  if (!sessionReady() || schwungEditorActive() || noteViewActive()) return false;
  if (appState.currentView === VIEW_CLIP_PARAMS || appState.currentView === VIEW_MAIN_PARAMS || appState.currentView === VIEW_MIXER) return true;
  if (seqState.sessionMode) return !SCREEN_OWNING_VIEWS.has(appState.currentView);
  return appState.currentView === VIEW_KNOBS || appState.currentView === VIEW_CHAIN;
}
var SCREEN_OWNING_VIEWS = /* @__PURE__ */ new Set([VIEW_BROWSE, VIEW_FILE_BROWSE, VIEW_FLAGS, VIEW_VERSIONS, VIEW_CPU, VIEW_SETS]);
var levels = new Array(8).fill(null);
var lastKey = "";
var lastPeek = false;
var lastMarks = 0;
var animCap = createRepaintCap();
function drawnKnobLevels() {
  return levels;
}
function pollDrawnPage(owner2, nowFn = Date.now) {
  perfPhase("ctlpoll");
  owner2.poll();
  perfPhaseEnd();
  const page = owner2.page;
  if (!page) {
    if (lastKey === "") return false;
    lastKey = "";
    levels.fill(null);
    lastPeek = false;
    lastMarks = 0;
    return true;
  }
  const key = (owner2.ref ? owner2.ref.track + ":" + owner2.ref.componentKey : "?") + ":" + page.pageIndex;
  let moved = key !== lastKey;
  lastKey = key;
  perfPhase("knoblevels");
  const next = page.knobLevels();
  perfPhaseEnd();
  for (let k = 0; k < 8; k++) {
    if (levels[k] !== next[k]) {
      levels[k] = next[k];
      moved = true;
    }
  }
  const peek = typeof page.peekOpen === "function" ? page.peekOpen() : false;
  if (peek !== lastPeek) {
    lastPeek = peek;
    moved = true;
  }
  const marks = page.marks();
  if (marks !== lastMarks) {
    lastMarks = marks;
    moved = true;
  }
  if (!moved) {
    const now2 = nowFn();
    moved = animCap(page.animating(now2), now2);
  }
  return moved;
}

// src/midi/canvas-dive-input.ts
var KNOB_TOUCH_LAST = 9;
var padsOwed = [];
function canvasDiveTakes(data) {
  if (!canvasDiveActive()) {
    padsOwed = [];
    return false;
  }
  const status = data[0] & 240, k = data[1], v = data[2];
  if (status === 176) {
    if (k === MoveBack) {
      if (v > 0) canvasDiveBack();
      return v > 0;
    }
    if (k === MoveMainButton) {
      if (v > 0) canvasDiveClick();
      return v > 0;
    }
    if (k === MoveMainKnob) {
      const d = decodeDelta(v);
      if (d) canvasDiveJog(d);
      return true;
    }
    if (k >= MoveKnob1 && k < MoveKnob1 + 8) {
      canvasDiveMidi(data);
      return true;
    }
    return false;
  }
  if ((status === 144 || status === 128) && k <= KNOB_TOUCH_LAST) {
    canvasDiveMidi(data);
    return status === 144 && v > 0;
  }
  if (status === 144 && v > 0 && k >= MovePads[0] && k <= MovePads[MovePads.length - 1]) {
    padsOwed.push([k, v]);
  }
  return false;
}
function canvasDiveDeliverPads() {
  const owed = padsOwed;
  padsOwed = [];
  for (const [n, v] of owed) canvasDivePad(n, v);
}

// src/model/file-validate.ts
function fileContentAllows(path, requireContains) {
  if (!requireContains) return true;
  const content = platform.readFile(path);
  if (content === null) return true;
  return content.indexOf(requireContains) >= 0;
}

// src/browser/file-preview.ts
var PREVIEW_REST_MS = 150;
var portOf = (st) => componentPort(st.paramSlot, st.componentKey);
var qualify = (st, k) => k.indexOf(":") >= 0 ? k : st.componentKey + ":" + k;
function run(st, list, path) {
  const pv = st.preview;
  if (!pv) return;
  const port = portOf(st);
  for (const a of list) {
    const key = qualify(st, a.key);
    if (a.restore && !(key in pv.restore)) {
      const prev = port.getParam(key);
      if (prev !== null && prev !== void 0) pv.restore[key] = String(prev);
    }
    port.setParam(key, hookValue(a.value, path));
  }
}
function apply3(st, path) {
  const pv = st.preview;
  if (!pv || !pv.decl.live || !path || path === pv.current) return;
  portOf(st).setParam(pv.fullKey, path);
  pv.current = path;
  run(st, pv.decl.hooks.onPreview, path);
}
var selectedFile = (st) => {
  const it = st.items[st.selectedIndex];
  return it && !it.isDir ? it.path : "";
};
function previewBegin(st, decl) {
  if (!decl) return;
  const fullKey = st.componentKey + ":" + st.paramKey;
  const original = String(portOf(st).getParam(fullKey) ?? "");
  st.preview = { decl, fullKey, original, current: original, restore: {}, pendingPath: "", pendingAt: 0 };
  run(st, decl.hooks.onOpen, original);
  apply3(st, selectedFile(st));
}
function previewCursorMoved(st, now2) {
  const pv = st.preview;
  if (!pv || !pv.decl.live) return;
  pv.pendingPath = selectedFile(st);
  pv.pendingAt = pv.pendingPath ? now2 : 0;
}
function previewDirEntered(st) {
  const pv = st.preview;
  if (!pv) return;
  pv.pendingPath = "";
  pv.pendingAt = 0;
  apply3(st, selectedFile(st));
}
function previewTick(st, now2) {
  const pv = st && st.preview;
  if (!st || !pv || !pv.pendingPath || now2 - pv.pendingAt < PREVIEW_REST_MS) return;
  const path = pv.pendingPath;
  pv.pendingPath = "";
  pv.pendingAt = 0;
  apply3(st, path);
}
function previewOriginal(st) {
  return st.preview ? st.preview.original : null;
}
function previewEnd(st, path) {
  const pv = st.preview;
  if (!pv) return;
  if (path !== null) {
    run(st, pv.decl.hooks.onCommit, path);
  } else {
    if (pv.decl.live && pv.current !== pv.original) portOf(st).setParam(pv.fullKey, pv.original);
    run(st, pv.decl.hooks.onCancel, pv.original);
  }
  const port = portOf(st);
  for (const [k, v] of Object.entries(pv.restore)) port.setParam(k, v);
  st.preview = void 0;
}

// src/browser/file-handler.ts
function isDir(path) {
  try {
    const [st] = os.stat(path);
    return (st.mode & 61440) === 16384;
  } catch {
    return false;
  }
}
function scanDir(dir, root, filter) {
  const items = [];
  if (dir !== root) {
    items.push({ name: "..", path: dirname(dir), isDir: true });
  }
  try {
    const [entries] = os.readdir(dir);
    if (!Array.isArray(entries)) return items;
    const fileItems = [];
    const dirItems = [];
    for (const name of entries) {
      if (name === "." || name === "..") continue;
      const path = dir + "/" + name;
      const d = isDir(path);
      if (!d && filter.length > 0) {
        const lower = name.toLowerCase();
        if (!filter.some((ext) => lower.endsWith(ext))) continue;
      }
      (d ? dirItems : fileItems).push({ name, path, isDir: d });
    }
    dirItems.sort((a, b) => a.name.localeCompare(b.name));
    fileItems.sort((a, b) => a.name.localeCompare(b.name));
    items.push(...dirItems, ...fileItems);
  } catch {
  }
  return items;
}
function openFileBrowser(paramSlot, componentKey2, paramKey, gi, root, filter, startPath, currentPath, requireContains, browse) {
  const startDir = currentPath ? dirname(currentPath) : startPath || root;
  const items = scanDir(startDir, root, filter);
  let selectedIndex = 0;
  if (currentPath) {
    const idx2 = items.findIndex((it) => it.path === currentPath);
    if (idx2 >= 0) selectedIndex = idx2;
  }
  appState.fileBrowserState = {
    paramSlot,
    componentKey: componentKey2,
    paramKey,
    gi,
    root,
    filter,
    currentDir: startDir,
    items,
    selectedIndex,
    requireContains
  };
  previewBegin(appState.fileBrowserState, browse);
  appState.currentView = VIEW_FILE_BROWSE;
  appState.dirty = true;
}
function navigateFileBrowser(delta) {
  const state7 = appState.fileBrowserState;
  if (!state7) return;
  state7.selectedIndex = Math.max(0, Math.min(state7.items.length - 1, state7.selectedIndex + delta));
  previewCursorMoved(state7, Date.now());
  appState.dirty = true;
}
function activateFileBrowserItem() {
  const state7 = appState.fileBrowserState;
  if (!state7) return;
  const item = state7.items[state7.selectedIndex];
  if (!item) return;
  if (item.isDir) {
    const newDir = item.path;
    state7.items = scanDir(newDir, state7.root, state7.filter);
    state7.currentDir = newDir;
    state7.selectedIndex = 0;
    previewDirEntered(state7);
    appState.dirty = true;
  } else {
    if (!fileContentAllows(item.path, state7.requireContains)) {
      seqToast("Wrong preset type");
      return;
    }
    const key = state7.componentKey + ":" + state7.paramKey;
    const port = componentPort(state7.paramSlot, state7.componentKey);
    const old = previewOriginal(state7) ?? port.getParam(key);
    const chainIdx = appState.trackChainIndex[state7.paramSlot];
    const label2 = appState.trackModels[state7.paramSlot]?.[chainIdx]?.dumpLayout().params.find((q) => q?.key === state7.paramKey)?.label;
    undoableEdit(
      "LOAD " + (label2 ? label2.toUpperCase() : "FILE"),
      "T" + (state7.paramSlot + 1) + " " + state7.componentKey.toUpperCase(),
      () => setChainParam(port, key, item.path, old)
    );
    appState.trackModels[state7.paramSlot]?.[chainIdx]?.setFileValue(state7.gi, item.path);
    previewEnd(state7, item.path);
    appState.fileBrowserState = null;
    appState.currentView = appState.browseOrigin;
    appState.dirty = true;
  }
}
function cancelFileBrowser() {
  const state7 = appState.fileBrowserState;
  if (state7) previewEnd(state7, null);
  appState.fileBrowserState = null;
}

// src/renderer/keys-view.ts
function renderKeysView(moduleName2, baseNote, midiNoteName2) {
  clear_screen();
  let abbrev = moduleName2;
  const prefixW = fontWidth("Movy ");
  while (abbrev.length > 1 && prefixW + fontWidth("[" + abbrev + "]") > W - 4) {
    abbrev = abbrev.slice(0, -1);
  }
  if (abbrev !== moduleName2) abbrev += "~";
  drawHeader("Movy", "[" + abbrev + "]", true);
  const rootName = midiNoteName2(baseNote);
  const topName = midiNoteName2(baseNote + 24);
  fontPrint(2, HEADER_H + 5, rootName, 1);
  fontPrint(W - fontWidth(topName) - 2, HEADER_H + 5, topName, 1);
  const FOOTER_Y2 = 57;
  fill_rect(0, FOOTER_Y2, W, FONT_HEIGHT + 2, 1);
  fontPrint(2, FOOTER_Y2 + 1, "L/R:oct  U/D:semi  S+L:mod", 0);
}

// src/renderer/browse-view.ts
function renderBrowseView(modules, browseIndex, title = "Module") {
  clear_screen();
  drawHeader(title, null, true);
  const FOOTER_Y2 = 57;
  const LIST_TOP4 = HEADER_H + 2;
  const LIST_BOT2 = FOOTER_Y2 - 2;
  const rowH = FONT_HEIGHT + 2;
  if (modules.length === 0) {
    fontPrint(2, LIST_TOP4, "No modules found", 1);
  } else {
    const visible = Math.floor((LIST_BOT2 - LIST_TOP4) / rowH);
    const halfVis = Math.floor(visible / 2);
    const startIdx = Math.max(0, Math.min(browseIndex - halfVis, modules.length - visible));
    for (let i = 0; i < visible; i++) {
      const idx2 = startIdx + i;
      if (idx2 >= modules.length) break;
      const y = LIST_TOP4 + i * rowH;
      if (idx2 === browseIndex) {
        fill_rect(0, y - 1, W, rowH, 1);
        fontPrint(2, y, modules[idx2].name, 0);
      } else {
        fontPrint(2, y, modules[idx2].name, 1);
      }
    }
  }
  fill_rect(0, FOOTER_Y2, W, FONT_HEIGHT + 2, 1);
  fontPrint(2, FOOTER_Y2 + 1, "Back:cancel  Click:load", 0);
}

// src/renderer/chain-view.ts
function renderChainView(vm2, chainIndex2, jogTouched, trackLabel2, slotLabel, slots = CHAIN_SLOTS, body = () => {
}, chrome) {
  clear_screen();
  const slot = slots[chainIndex2] ?? slots[1];
  const effectiveSlotLabel = slotLabel ?? slot.label;
  const virtual = isVirtualSlot(slots[chainIndex2]);
  if (vm2.isEmpty) {
    drawHeader(trackLabel2, effectiveSlotLabel, false);
    if (vm2.stepPagePresent) {
      const sel = vm2.stepPageSelected ? 0 : chainIndex2 + 1;
      drawBankBar(sel, slots.length + 1, true);
    } else {
      drawBankBar(chainIndex2, slots.length);
    }
    const msg = "CLICK JOG: ADD MODULE";
    fontPrint(Math.max(0, Math.floor((W - fontWidth(msg)) / 2)), 28, msg, 1);
    if (jogTouched) drawJogToast("CLICK: ADD MODULE");
    return;
  }
  if (chrome?.header) {
    drawHeader(chrome.header.left, chrome.header.right, chrome.header.inverted);
  } else {
    const showIcon = padIconShown(vm2, chrome);
    const leftW = fontWidth(trackLabel2) + 4 + (showIcon ? PAD_ICON_W : 0);
    const maxRight = W - leftW - 4;
    let right = virtual && chrome?.pageLabel || vm2.drumPadName || vm2.moduleName;
    while (right.length > 1 && fontWidth(right) > maxRight) right = right.slice(0, -1);
    if (showIcon) drawHeaderWithPadIcon(trackLabel2, right, vm2.drumPadCount, vm2.drumCurrentPad);
    else drawHeader(trackLabel2, right, false);
  }
  if (vm2.stepPagePresent) {
    const sel = vm2.stepPageSelected ? 0 : chainIndex2 + 1;
    drawBankBar(sel, slots.length + 1, true);
  } else {
    drawBankBar(chainIndex2, slots.length);
  }
  body();
  if (jogTouched) drawJogToast(virtual ? "CLICK JOG: EDIT LFOS" : "SHIFT+CLICK SWAP  CLICK OPEN");
  else if (chrome?.footer?.length) drawPageFooter(chrome.footer);
}

// src/renderer/file-browse-view.ts
function renderFileBrowseView(state7) {
  clear_screen();
  const dir = state7.currentDir;
  const dirLabel = dir.length > 18 ? "..." + dir.slice(-15) : dir;
  drawHeader(dirLabel, null, true);
  const LIST_TOP4 = HEADER_H + 2;
  const LIST_BOT2 = 64;
  const rowH = FONT_HEIGHT + 2;
  const { items, selectedIndex } = state7;
  if (items.length === 0) {
    fontPrint(2, LIST_TOP4, "No files", 1);
    return;
  }
  const visible = Math.floor((LIST_BOT2 - LIST_TOP4) / rowH);
  const halfVis = Math.floor(visible / 2);
  const startIdx = Math.max(0, Math.min(selectedIndex - halfVis, items.length - visible));
  for (let i = 0; i < visible; i++) {
    const idx2 = startIdx + i;
    if (idx2 >= items.length) break;
    const item = items[idx2];
    const label2 = item.isDir ? ">" + item.name : item.name;
    const y = LIST_TOP4 + i * rowH;
    if (idx2 === selectedIndex) {
      fill_rect(0, y - 1, W, rowH, 1);
      fontPrint(2, y, label2, 0);
    } else {
      fontPrint(2, y, label2, 1);
    }
  }
}

// src/midi/ext-knob-map.ts
var EXT_REL_BASE = 71;
var EXT_ABS_BASE = 102;
var EXT_KNOBS = 8;
var TW_KNOB_BASE = 8;
var TW_JOG = 0;
var TW_PRESET = 2;
var TW_BACK = 3;
var TW_JOG_STEPS = 10;
var TW_ASSIGNED = [
  TW_JOG,
  TW_PRESET,
  TW_BACK,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15
];
function createExtKnobState() {
  return { abs: /* @__PURE__ */ new Map(), jog: 0 };
}
function absDelta(st, id2, v) {
  const last = st.abs.get(id2);
  st.abs.set(id2, v);
  if (last === void 0) return 0;
  return Math.max(-63, Math.min(63, v - last));
}
var toRel = (d) => d >= 0 ? d : 128 + d;
var cc = (n, value2) => ({ kind: "cc", cc: n, value: value2 });
function extKnobActions(st, ch, d1, d2) {
  if (d1 >= EXT_REL_BASE && d1 < EXT_REL_BASE + EXT_KNOBS) {
    return d2 === 0 || d2 === 64 ? [] : [cc(MoveKnob1 + d1 - EXT_REL_BASE, d2)];
  }
  if (d1 >= EXT_ABS_BASE && d1 < EXT_ABS_BASE + EXT_KNOBS) {
    const d = absDelta(st, "abs" + d1, d2);
    return d ? [cc(MoveKnob1 + d1 - EXT_ABS_BASE, toRel(d))] : [];
  }
  if (ch === 2) {
    const v = d2 > 0 ? 127 : 0;
    if (d1 === TW_JOG) return [cc(MoveMainButton, v)];
    if (d1 === TW_BACK) return [cc(MoveBack, v)];
    return [];
  }
  if (ch !== 1) return [];
  if (d1 === TW_JOG) {
    st.jog += absDelta(st, "tw" + d1, d2);
    const out2 = [];
    while (st.jog >= TW_JOG_STEPS) {
      st.jog -= TW_JOG_STEPS;
      out2.push(cc(MoveMainKnob, 1));
    }
    while (st.jog <= -TW_JOG_STEPS) {
      st.jog += TW_JOG_STEPS;
      out2.push(cc(MoveMainKnob, 127));
    }
    return out2;
  }
  if (d1 === TW_PRESET) {
    const d = absDelta(st, "tw" + d1, d2);
    return d ? [{ kind: "preset", delta: d }] : [];
  }
  if (d1 >= TW_KNOB_BASE && d1 < TW_KNOB_BASE + EXT_KNOBS) {
    const d = absDelta(st, "tw" + d1, d2);
    return d ? [cc(MoveKnob1 + d1 - TW_KNOB_BASE, toRel(d))] : [];
  }
  return [];
}

// src/midi/ext-follow.ts
var armed3 = false;
var onSync = null;
var sent2 = new Array(EXT_KNOBS).fill(-1);
function armTwisterFollow(sync) {
  armed3 = true;
  onSync = sync;
  sent2.fill(-1);
}
function twisterFollow(levels2) {
  if (!armed3) return;
  for (let k = 0; k < EXT_KNOBS; k++) {
    const lv = levels2[k];
    if (lv === null || lv === void 0 || !isFinite(lv)) continue;
    const v = Math.max(0, Math.min(127, Math.round(lv * 127)));
    if (sent2[k] === v) continue;
    sent2[k] = v;
    onSync?.(TW_KNOB_BASE + k, v);
    platform.externalSend([11, 176, TW_KNOB_BASE + k, v]);
  }
}

// src/renderer/knob-leds.ts
function whiteLevel(nv) {
  if (nv < 0.33) return 124;
  if (nv < 0.67) return 118;
  return 120;
}
function amberLevel(nv) {
  if (nv < 0.25) return 75;
  if (nv < 0.5) return 29;
  if (nv < 0.75) return 6;
  return 3;
}
var logTickCount = 0;
var lastKnobColor = new Array(8).fill(-1);
var scratchColor = new Array(8).fill(0);
var scratchNv = new Array(8).fill(null);
function knobColor(physK, nv) {
  if (nv === null || nv === void 0 || !isFinite(nv)) return 0;
  return physK < 4 ? whiteLevel(nv) : amberLevel(nv);
}
function writeKnobRow(colors, nvs) {
  logTickCount++;
  const doLog = logTickCount % 344 === 1;
  for (let physK = 0; physK < 8; physK++) {
    const color = colors[physK];
    if (lastKnobColor[physK] !== color) {
      if (!ledBudgetTake(2)) continue;
      lastKnobColor[physK] = color;
      setLED(physK, color, true);
      setButtonLED(MoveKnob1 + physK, color, true);
      if (!doLog) mlog("knobLED k=" + physK + " nv=" + (nvs[physK] ?? -1).toFixed(2) + " color=" + color);
    }
    if (doLog) {
      mlog("knobLED k=" + physK + " nv=" + (nvs[physK] ?? -1).toFixed(2) + " color=" + color);
    }
  }
}
function updateKnobLEDsFrom(levels2) {
  for (let physK = 0; physK < 8; physK++) {
    scratchNv[physK] = levels2[physK] ?? null;
    scratchColor[physK] = knobColor(physK, scratchNv[physK]);
  }
  writeKnobRow(scratchColor, scratchNv);
  twisterFollow(levels2);
}
function updateSingleKnobLED(knob, nv) {
  for (let k = 0; k < 8; k++) {
    const color = k === knob ? whiteLevel(nv) : 0;
    if (lastKnobColor[k] === color) continue;
    if (!ledBudgetTake(2)) continue;
    lastKnobColor[k] = color;
    setLED(k, color, true);
    setButtonLED(MoveKnob1 + k, color, true);
  }
}

// src/seq/lane-mapping.ts
var MIX_TARGET = "mix";
function isMixTarget(targetParam) {
  return targetParam.startsWith(MIX_TARGET + ":");
}
function laneBindSpec(lane2, e) {
  const sep = e.targetParam.indexOf(":");
  if (sep <= 0 || sep === e.targetParam.length - 1) return null;
  if (isMixTarget(e.targetParam)) return lane2 + "|m|" + e.targetParam.slice(sep + 1);
  if (e.type === "enum" && e.options && e.options.length > 0) {
    if (!e.wiresNames) return lane2 + "|e|" + e.options.length + "|" + e.targetParam;
    if (e.options.some((o) => o.indexOf("|") >= 0)) return null;
    return lane2 + "|n|" + e.targetParam + "|" + e.options.join("|");
  }
  if (!isFinite(e.min) || !isFinite(e.max)) return null;
  const kind = e.type === "int" || e.type === "enum" || e.type === "bool" ? "i" : "f";
  return lane2 + "|" + kind + "|" + e.min + "|" + e.max + "|" + e.targetParam;
}
function bindLane(write2, lane2, e) {
  const spec = laneBindSpec(lane2, e);
  return spec !== null && write2("lane", spec);
}
function bindLanes(write2, lanes) {
  const specs = [];
  for (const { lane: lane2, e } of lanes) {
    const spec = laneBindSpec(lane2, e);
    if (spec !== null) specs.push(spec);
  }
  if (specs.length > 0) write2("lanes", specs.join("\n"));
  return lanes.length - specs.length;
}
function bindInfoOf(info) {
  return {
    targetParam: info.target + ":" + info.ioKey,
    min: info.min,
    max: info.max,
    type: info.type,
    options: info.options,
    wiresNames: info.wiresNames
  };
}
function mappingFor(info, write2) {
  return (lane2) => bindLane(write2, lane2, bindInfoOf(info));
}

// src/renderer/loading-view.ts
var H2 = 64;
function centre3(y, text2, color) {
  fontPrint(Math.floor((W - fontWidth(text2)) / 2), y, text2, color);
}
function loadingStage(phase2, chainPending, migrating = "") {
  if (phase2 === "booting") return "STARTING ENGINE";
  if (migrating) return "MIGRATING SETS " + migrating;
  if (phase2 !== "settling") return "LOADING SET";
  return chainPending > 0 ? "LOADING MODULES" : "PREPARING SET";
}
function failureLines(reason, scope) {
  if (scope === "engine") {
    return [reason, "REINSTALL MOVY", ""];
  }
  return ["CANNOT LOAD THIS SET", reason, "JOG CLICK = START EMPTY"];
}
var SPLASH_DELAY_MS = 250;
var waitingSince = 0;
var splashShown = false;
function loadingWaitMs(ready, now2) {
  if (ready) {
    waitingSince = 0;
    splashShown = false;
    return 0;
  }
  if (waitingSince === 0) waitingSince = now2;
  return now2 - waitingSince;
}
function splashDue(waited) {
  if (splashShown || waited < SPLASH_DELAY_MS) return false;
  splashShown = true;
  return true;
}
function renderLoadingView(phase2, error, chainPending = 0, failScope2 = "set", waitedMs = Infinity, migrating = "") {
  clear_screen();
  if (phase2 !== "failed" && waitedMs < SPLASH_DELAY_MS) return false;
  if (phase2 === "failed") {
    const lines = failureLines(error, failScope2);
    const ys = lines[2] === "" ? [22, 36, 0] : [18, 30, 46];
    for (let i = 0; i < 3; i++) if (lines[i] !== "") centre3(ys[i], lines[i], 1);
    return true;
  }
  centre3(Math.floor(H2 / 2) - 3, loadingStage(phase2, chainPending, migrating), 1);
  return true;
}

// src/seq/step-rec-view.ts
var HEADER_TTL = 2;
function stepRecHeaderText() {
  const len = seqState.lenSteps > 0 ? String(seqState.lenSteps) : "--";
  const base2 = `STEP REC ${stepRecHead() + 1}/${len}`;
  const names = seqState.holdNotes.map(
    (p) => midiNoteName(Math.max(0, Math.min(127, p + seqState.clipTranspose)))
  );
  const line = () => names.length > 0 ? `${base2} ${names.join(" ")}` : base2;
  let text2 = line();
  while (names.length > 0 && fontWidth(text2) > W - 4) {
    names.pop();
    text2 = line();
  }
  return text2;
}
function stepRecTickAt(nowMs) {
  previewTickAt(nowMs);
  if (!stepRecActive()) return;
  seqHeaderAnnounce(stepRecHeaderText(), HEADER_TTL);
}
function stepRecTick() {
  stepRecTickAt(Date.now());
}

// src/renderer/volume-overlay.ts
var BOX_X = 4;
var BOX_Y = 14;
var BOX_W = 120;
var BOX_H = 36;
var BAR_X = BOX_X + 6;
var BAR_W = BOX_W - 12;
var BAR_Y3 = BOX_Y + 14;
var BAR_H2 = 8;
function dbLabel(value2) {
  if (value2 <= 0) return "-inf";
  const db2 = 20 * Math.log10(value2);
  return (db2 > 0 ? "+" : "") + db2.toFixed(1);
}
function drawVolumeOverlay(vm2) {
  const { title, value: value2 } = vm2;
  fill_rect(BOX_X, BOX_Y, BOX_W, BOX_H, 0);
  fill_rect(BOX_X, BOX_Y, BOX_W, 1, 1);
  fill_rect(BOX_X, BOX_Y + BOX_H - 1, BOX_W, 1, 1);
  fill_rect(BOX_X, BOX_Y, 1, BOX_H, 1);
  fill_rect(BOX_X + BOX_W - 1, BOX_Y, 1, BOX_H, 1);
  fontPrint(BOX_X + Math.floor((BOX_W - fontWidth(title)) / 2), BOX_Y + 4, title, 1);
  fill_rect(BAR_X, BAR_Y3, BAR_W, BAR_H2, 1);
  fill_rect(BAR_X + 1, BAR_Y3 + 1, BAR_W - 2, BAR_H2 - 2, 0);
  const fillW = Math.round((BAR_W - 2) * Math.min(1, Math.max(0, vm2.frac)));
  if (fillW > 0) fill_rect(BAR_X + 1, BAR_Y3 + 1, fillW, BAR_H2 - 2, 1);
  fill_rect(BAR_X + 1 + Math.round((BAR_W - 2) * vm2.unityFrac), BAR_Y3 + BAR_H2, 1, 2, 1);
  const pct = Math.round(value2 * 100) + "%";
  fontPrint(BAR_X, BOX_Y + BOX_H - 8, pct, 1);
  const db2 = dbLabel(value2) + " dB";
  fontPrint(BOX_X + BOX_W - 5 - fontWidth(db2), BOX_Y + BOX_H - 8, db2, 1);
}

// src/renderer/leave-modal-view.ts
function drawLeaveModal(labels, sel, title = "Leave Movy?") {
  const boxW = 96, boxH = 46;
  const x = Math.floor((W - boxW) / 2);
  const y = 9;
  fill_rect(x - 1, y - 1, boxW + 2, boxH + 2, 1);
  fill_rect(x, y, boxW, boxH, 0);
  fontPrint(x + Math.floor((boxW - fontWidth(title)) / 2), y + 3, title, 1);
  const ROW_H4 = 11;
  const listTop = y + 14;
  for (let i = 0; i < labels.length; i++) {
    const ry = listTop + i * ROW_H4;
    const tw = fontWidth(labels[i]);
    const tx = x + Math.floor((boxW - tw) / 2);
    if (i === sel) {
      fill_rect(x + 6, ry - 1, boxW - 12, ROW_H4 - 1, 1);
      fontPrint(tx, ry + 2, labels[i], 0);
    } else {
      fontPrint(tx, ry + 2, labels[i], 1);
    }
  }
  const foot = "Back: cancel";
  fontPrint(x + Math.floor((boxW - fontWidth(foot)) / 2), y + boxH - 7, foot, 1);
}

// src/seq/capture-vm.ts
function buildCaptureVM() {
  const s = captureState;
  if (s.overlay === "select") {
    return {
      header: s.bars > 0 ? s.bars + (s.bars === 1 ? " BAR" : " BARS") : "",
      values: s.cands.map(String),
      selIdx: Math.max(0, Math.min(s.cands.length - 1, s.idx)),
      pair: false,
      caption: "JOG PICKS TEMPO"
    };
  }
  const pct = Math.round(Math.abs(s.stretchPermille) / 10);
  return {
    header: s.why === "ext" ? "EXT SYNC" : "CLIP HAS NOTES",
    values: [String(s.detected), String(s.bpm)],
    selIdx: 1,
    pair: true,
    caption: pct > 0 ? "STRETCHED " + pct + "% TO FIT" : "FITTED TO THE SET TEMPO"
  };
}

// src/font/glyphs-big.ts
var G = [
  [4, 0, 0, 0],
  // ' '
  [4, 0, 4, 11, 3, 3, 3, 3, 3, 3, 3, 3, 0, 3, 3],
  // '!'
  [7, 0, 7, 3, 27, 27, 9],
  // '"'
  [9, 1, 9, 10, 54, 54, 127, 127, 54, 54, 127, 127, 54, 54],
  // '#'
  [9, 0, 9, 12, 8, 62, 127, 11, 11, 63, 126, 104, 104, 127, 62, 8],
  // '$'
  [10, 0, 10, 11, 102, 101, 117, 51, 56, 24, 28, 204, 174, 166, 102],
  // '%'
  [10, 0, 10, 11, 30, 63, 3, 99, 254, 255, 99, 99, 99, 127, 62],
  // '&'
  [4, 0, 4, 3, 3, 3, 1],
  // "'"
  [6, 0, 6, 13, 12, 6, 6, 3, 3, 3, 3, 3, 3, 3, 6, 6, 12],
  // '('
  [6, 0, 6, 13, 3, 6, 6, 12, 12, 12, 12, 12, 12, 12, 6, 6, 3],
  // ')'
  [10, 2, 10, 9, 24, 24, 219, 255, 60, 255, 219, 24, 24],
  // '*'
  [8, 3, 8, 6, 12, 12, 63, 63, 12, 12],
  // '+'
  [5, 9, 5, 3, 6, 6, 3],
  // ','
  [7, 5, 7, 2, 31, 31],
  // '-'
  [4, 9, 4, 2, 3, 3],
  // '.'
  [6, 0, 6, 11, 12, 12, 12, 14, 6, 6, 6, 7, 3, 3, 3],
  // '/'
  [9, 0, 9, 11, 62, 127, 99, 99, 99, 99, 99, 99, 99, 127, 62],
  // '0'
  [8, 0, 8, 11, 48, 56, 60, 60, 48, 48, 48, 48, 48, 48, 48],
  // '1'
  [9, 0, 9, 11, 62, 127, 99, 96, 112, 56, 28, 14, 7, 127, 127],
  // '2'
  [9, 0, 9, 11, 62, 127, 99, 96, 60, 124, 96, 96, 99, 127, 62],
  // '3'
  [9, 0, 9, 11, 48, 56, 60, 54, 55, 51, 127, 127, 48, 48, 48],
  // '4'
  [9, 0, 9, 11, 63, 63, 3, 3, 63, 127, 96, 96, 99, 127, 62],
  // '5'
  [9, 0, 9, 11, 62, 127, 3, 63, 127, 99, 99, 99, 99, 127, 62],
  // '6'
  [9, 0, 9, 11, 127, 127, 48, 48, 24, 24, 12, 12, 12, 12, 12],
  // '7'
  [9, 0, 9, 11, 62, 127, 99, 99, 62, 127, 99, 99, 99, 127, 62],
  // '8'
  [9, 0, 9, 11, 62, 127, 99, 99, 99, 127, 126, 96, 99, 127, 62],
  // '9'
  [4, 5, 4, 6, 3, 3, 0, 0, 3, 3],
  // ':'
  [5, 5, 5, 7, 6, 6, 0, 0, 6, 6, 3],
  // ';'
  [8, 1, 8, 10, 48, 56, 28, 14, 7, 7, 14, 28, 56, 48],
  // '<'
  [7, 4, 7, 5, 31, 31, 0, 31, 31],
  // '='
  [8, 1, 8, 10, 3, 7, 14, 28, 56, 56, 28, 14, 7, 3],
  // '>'
  [9, 0, 9, 11, 62, 127, 99, 99, 120, 60, 12, 12, 0, 12, 12],
  // '?'
  [13, 0, 13, 11, 508, 1022, 1799, 1779, 1755, 1755, 2011, 1011, 7, 1022, 508],
  // '@'
  [9, 0, 9, 11, 62, 127, 99, 99, 99, 99, 99, 127, 127, 99, 99],
  // 'A'
  [9, 0, 9, 11, 63, 127, 99, 99, 63, 127, 99, 99, 99, 127, 63],
  // 'B'
  [9, 0, 9, 11, 62, 127, 3, 3, 3, 3, 3, 3, 3, 127, 62],
  // 'C'
  [9, 0, 9, 11, 63, 127, 99, 99, 99, 99, 99, 99, 99, 127, 63],
  // 'D'
  [9, 0, 9, 11, 127, 127, 3, 3, 31, 31, 3, 3, 3, 127, 127],
  // 'E'
  [9, 0, 9, 11, 127, 127, 3, 3, 31, 31, 3, 3, 3, 3, 3],
  // 'F'
  [9, 0, 9, 11, 62, 127, 3, 3, 115, 115, 99, 99, 99, 127, 126],
  // 'G'
  [9, 0, 9, 11, 99, 99, 99, 99, 127, 127, 99, 99, 99, 99, 99],
  // 'H'
  [4, 0, 4, 11, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  // 'I'
  [7, 0, 7, 11, 24, 24, 24, 24, 24, 24, 24, 24, 24, 31, 15],
  // 'J'
  [9, 0, 9, 11, 99, 115, 59, 31, 15, 7, 15, 31, 59, 115, 99],
  // 'K'
  [8, 0, 8, 11, 3, 3, 3, 3, 3, 3, 3, 3, 3, 63, 63],
  // 'L'
  [11, 0, 11, 11, 257, 387, 455, 495, 511, 443, 403, 387, 387, 387, 387],
  // 'M'
  [9, 0, 9, 11, 99, 99, 103, 103, 111, 111, 123, 123, 115, 115, 99],
  // 'N'
  [9, 0, 9, 11, 62, 127, 99, 99, 99, 99, 99, 99, 99, 127, 62],
  // 'O'
  [9, 0, 9, 11, 63, 127, 99, 99, 99, 127, 63, 3, 3, 3, 3],
  // 'P'
  [9, 0, 9, 12, 62, 127, 99, 99, 99, 99, 99, 99, 123, 127, 62, 96],
  // 'Q'
  [9, 0, 9, 11, 63, 127, 99, 99, 99, 63, 127, 99, 99, 99, 99],
  // 'R'
  [9, 0, 9, 11, 62, 127, 3, 3, 63, 126, 96, 96, 96, 127, 62],
  // 'S'
  [8, 0, 8, 11, 63, 63, 12, 12, 12, 12, 12, 12, 12, 12, 12],
  // 'T'
  [9, 0, 9, 11, 99, 99, 99, 99, 99, 99, 99, 99, 99, 127, 62],
  // 'U'
  [9, 0, 9, 11, 99, 99, 99, 99, 99, 99, 119, 54, 62, 28, 8],
  // 'V'
  [12, 0, 12, 11, 771, 771, 771, 771, 951, 438, 510, 510, 204, 204, 204],
  // 'W'
  [9, 0, 9, 11, 99, 99, 99, 54, 62, 28, 62, 54, 99, 99, 99],
  // 'X'
  [10, 0, 10, 11, 195, 195, 231, 102, 126, 60, 60, 24, 24, 24, 24],
  // 'Y'
  [9, 0, 9, 11, 127, 127, 96, 112, 56, 28, 14, 7, 3, 127, 127],
  // 'Z'
  [5, 0, 5, 13, 7, 7, 3, 3, 3, 3, 3, 3, 3, 3, 3, 7, 7],
  // '['
  [6, 0, 6, 11, 3, 3, 3, 7, 6, 6, 6, 14, 12, 12, 12],
  // '\\'
  [5, 0, 5, 13, 7, 7, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7],
  // ']'
  [5, 0, 5, 2, 2, 5],
  // '^'
  [9, 11, 9, 1, 127],
  // '_'
  [4, 0, 4, 2, 1, 2],
  // '`'
  [9, 3, 9, 8, 126, 127, 99, 99, 99, 99, 127, 126],
  // 'a'
  [9, 0, 9, 11, 3, 3, 3, 63, 127, 99, 99, 99, 99, 127, 63],
  // 'b'
  [8, 3, 8, 8, 30, 63, 3, 3, 3, 3, 63, 30],
  // 'c'
  [9, 0, 9, 11, 96, 96, 96, 126, 127, 99, 99, 99, 99, 127, 126],
  // 'd'
  [9, 3, 9, 8, 62, 127, 99, 127, 63, 3, 127, 62],
  // 'e'
  [7, 0, 7, 11, 28, 30, 6, 15, 15, 6, 6, 6, 6, 6, 6],
  // 'f'
  [9, 3, 9, 10, 126, 127, 99, 99, 99, 127, 126, 96, 126, 60],
  // 'g'
  [9, 0, 9, 11, 3, 3, 3, 63, 127, 99, 99, 99, 99, 99, 99],
  // 'h'
  [4, 0, 4, 11, 3, 3, 0, 3, 3, 3, 3, 3, 3, 3, 3],
  // 'i'
  [6, 0, 6, 13, 12, 12, 0, 12, 12, 12, 12, 12, 12, 12, 12, 15, 7],
  // 'j'
  [9, 0, 9, 11, 3, 3, 3, 99, 115, 63, 31, 51, 51, 99, 99],
  // 'k'
  [4, 0, 4, 11, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  // 'l'
  [12, 3, 12, 8, 511, 1023, 819, 819, 819, 819, 819, 819],
  // 'm'
  [9, 3, 9, 8, 63, 127, 99, 99, 99, 99, 99, 99],
  // 'n'
  [9, 3, 9, 8, 62, 127, 99, 99, 99, 99, 127, 62],
  // 'o'
  [9, 3, 9, 10, 63, 127, 99, 99, 99, 99, 127, 63, 3, 3],
  // 'p'
  [9, 3, 9, 10, 126, 127, 99, 99, 99, 99, 127, 126, 96, 96],
  // 'q'
  [7, 3, 7, 8, 27, 31, 7, 3, 3, 3, 3, 3],
  // 'r'
  [8, 3, 8, 8, 62, 63, 3, 15, 60, 48, 63, 31],
  // 's'
  [6, 0, 6, 11, 6, 6, 6, 15, 15, 6, 6, 6, 6, 14, 12],
  // 't'
  [9, 3, 9, 8, 99, 99, 99, 99, 99, 99, 127, 126],
  // 'u'
  [9, 3, 9, 8, 99, 99, 99, 99, 119, 62, 28, 8],
  // 'v'
  [10, 3, 10, 8, 195, 195, 195, 219, 219, 255, 126, 102],
  // 'w'
  [9, 3, 9, 8, 99, 119, 62, 28, 28, 62, 119, 99],
  // 'x'
  [9, 3, 9, 10, 99, 99, 99, 99, 99, 127, 126, 96, 126, 60],
  // 'y'
  [9, 3, 9, 8, 127, 127, 56, 28, 14, 7, 127, 127],
  // 'z'
  [6, 0, 6, 13, 12, 6, 6, 6, 6, 6, 3, 6, 6, 6, 6, 6, 12],
  // '{'
  [4, 0, 4, 13, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  // '|'
  [6, 0, 6, 13, 3, 6, 6, 6, 6, 6, 12, 6, 6, 6, 6, 6, 3],
  // '}'
  [8, 6, 8, 3, 38, 63, 25]
  // '~'
];

// src/font/big.ts
var BIG_FONT_HEIGHT = 11;
var BIG_GAP = 1;
var glyphFor3 = (cp) => cp < 32 || cp > 126 ? null : G[cp - 32];
function fontWidthBig(str2) {
  return glyphRunWidth(str2, glyphFor3, 7, BIG_GAP);
}
function fontPrintBig(x, y, str2, color, emit) {
  drawGlyphRun(x, y, str2, color, glyphFor3, 7, BIG_GAP, emit);
}

// src/renderer/value-row.ts
var GUTTER = 10;
var SEL_BOX_PAD = 2;
function drawValueRow(values, selIdx, y, sep, regionX = 0, regionW = W) {
  const widths = values.map(fontWidthBig);
  const sepW = sep ? sep.width + GUTTER : 0;
  const total = widths.reduce((a, b) => a + b, 0) + GUTTER * (widths.length - 1) + sepW;
  let x = regionX + Math.max(0, Math.floor((regionW - total) / 2));
  const slotX = [];
  for (let i = 0; i < values.length; i++) {
    if (i > 0 && sep) {
      sep.draw(x, y + Math.floor((BIG_FONT_HEIGHT - 5) / 2));
      x += sep.width + GUTTER;
    }
    slotX.push(x);
    if (i === selIdx) {
      fill_rect(
        x - SEL_BOX_PAD,
        y - SEL_BOX_PAD,
        widths[i] + SEL_BOX_PAD * 2,
        BIG_FONT_HEIGHT + SEL_BOX_PAD * 2,
        1
      );
      fontPrintBig(x, y, values[i], 0);
    } else {
      fontPrintBig(x, y, values[i], 1);
    }
    x += widths[i] + GUTTER;
  }
  return { slotX, widths };
}

// src/renderer/capture-overlay.ts
var VALUE_Y = 22;
var ARROW_W = 7;
function drawArrow(x, y) {
  fill_rect(x, y + 2, ARROW_W, 1, 1);
  fill_rect(x + ARROW_W - 3, y + 1, 1, 3, 1);
  fill_rect(x + ARROW_W - 2, y, 1, 5, 1);
}
function drawCaptureOverlay(vm2) {
  clear_screen();
  drawHeader("CAPTURE", vm2.header, true);
  drawValueRow(
    vm2.values,
    vm2.selIdx,
    VALUE_Y,
    vm2.pair ? { width: ARROW_W, draw: drawArrow } : void 0
  );
  fontPrint(Math.max(0, Math.floor((W - fontWidth(vm2.caption)) / 2)), 50, vm2.caption, 1);
}

// src/renderer/quant-overlay.ts
var BOX_X2 = 4;
var BOX_Y2 = 12;
var BOX_W2 = 120;
var BOX_H2 = 40;
var PAD2 = 4;
var TITLE_Y = BOX_Y2 + PAD2;
var MARK = "DEF";
var BAND_TOP = TITLE_Y + FONT_HEIGHT + 2;
var BAND_BOTTOM = BOX_Y2 + BOX_H2 - PAD2;
var SEL_H = BIG_FONT_HEIGHT + SEL_BOX_PAD * 2;
var MARK_H = FONT_HEIGHT + 1;
function selBoxTop(marked) {
  const used = SEL_H + (marked ? MARK_H : 0);
  return BAND_TOP + Math.floor((BAND_BOTTOM - BAND_TOP - used) / 2);
}
function drawQuantOverlay(vm2) {
  fill_rect(BOX_X2, BOX_Y2, BOX_W2, BOX_H2, 0);
  fill_rect(BOX_X2, BOX_Y2, BOX_W2, 1, 1);
  fill_rect(BOX_X2, BOX_Y2 + BOX_H2 - 1, BOX_W2, 1, 1);
  fill_rect(BOX_X2, BOX_Y2, 1, BOX_H2, 1);
  fill_rect(BOX_X2 + BOX_W2 - 1, BOX_Y2, 1, BOX_H2, 1);
  const title = "T" + (vm2.track + 1) + " QUANTIZE";
  fontPrint(BOX_X2 + Math.floor((BOX_W2 - fontWidth(title)) / 2), TITLE_Y, title, 1);
  const marked = vm2.defIdx >= 0 && vm2.defIdx < vm2.values.length;
  const boxTop = selBoxTop(marked);
  const { slotX, widths } = drawValueRow(
    vm2.values,
    vm2.selIdx,
    boxTop + SEL_BOX_PAD,
    void 0,
    BOX_X2 + 1,
    BOX_W2 - 2
  );
  if (marked) {
    const markX = slotX[vm2.defIdx] + Math.floor((widths[vm2.defIdx] - fontWidth(MARK)) / 2);
    fontPrint(markX, boxTop + SEL_H + 1, MARK, 1);
  }
}

// src/renderer/undo-overlay.ts
var BOX_X3 = 4;
var BOX_Y3 = 14;
var BOX_W3 = 120;
var BOX_H3 = 38;
var PAD3 = 5;
var LINE_H = 10;
var HEAD_H = LINE_H + 3;
function fit3(s, maxW) {
  if (fontWidth(s) <= maxW) return s;
  let out2 = s;
  while (out2.length > 1 && fontWidth(out2) > maxW) out2 = out2.slice(0, -1);
  return out2;
}
function drawUndoOverlay(vm2) {
  const body = [vm2.verb, vm2.detail].filter((s) => s.length > 0);
  fill_rect(BOX_X3, BOX_Y3, BOX_W3, BOX_H3, 0);
  fill_rect(BOX_X3, BOX_Y3, BOX_W3, 1, 1);
  fill_rect(BOX_X3, BOX_Y3 + BOX_H3 - 1, BOX_W3, 1, 1);
  fill_rect(BOX_X3, BOX_Y3, 1, BOX_H3, 1);
  fill_rect(BOX_X3 + BOX_W3 - 1, BOX_Y3, 1, BOX_H3, 1);
  const innerW = BOX_W3 - PAD3 * 2;
  const headY = BOX_Y3 + 3;
  fill_rect(BOX_X3 + 1, headY - 1, BOX_W3 - 2, FONT_HEIGHT + 3, 1);
  fontPrint(BOX_X3 + PAD3, headY + 1, fit3(vm2.head, innerW), 0);
  const bodyTop = BOX_Y3 + HEAD_H;
  const bodyH = BOX_H3 - HEAD_H - 2;
  const top = bodyTop + Math.floor((bodyH - body.length * LINE_H) / 2) + 1;
  for (let i = 0; i < body.length; i++) {
    fontPrint(BOX_X3 + PAD3, top + i * LINE_H, fit3(body[i], innerW), 1);
  }
}

// src/renderer/step-piano.ts
var PIANO_Y = 57;
var BLACK_LINE = PIANO_Y + 2;
var WHITE_Y = PIANO_Y + 3;
var WHITE_H = 3;
var BOTTOM = PIANO_Y + 6;
function drawStepPiano(vm2) {
  const { win, x0 } = vm2;
  const on = (m) => vm2.sel.indexOf(m) >= 0;
  const line = (x, y, w, h, a, b) => {
    if (!(on(a) && on(b))) fill_rect(x, y, w, h, 1);
  };
  const xEnd = x0 + win.n * win.k;
  const c = Math.floor(win.k / 2);
  fill_rect(0, PIANO_Y - 1, 128, 64 - PIANO_Y + 1, 0);
  fill_rect(x0, BOTTOM, xEnd - x0 + 1, 1, 1);
  fill_rect(x0, PIANO_Y, 1, BOTTOM - PIANO_Y, 1);
  fill_rect(xEnd, PIANO_Y, 1, BOTTOM - PIANO_Y, 1);
  for (let s = 0; s < win.n; s++) {
    const m = win.lo + s, x = x0 + s * win.k, ix = x + 1, iw = win.k - 1;
    const black = isBlackKey(m);
    if (s > 0) {
      line(x, PIANO_Y, 1, 3, m - 1, m);
      if (!black && !isBlackKey(m - 1)) line(x, WHITE_Y, 1, WHITE_H, m - 1, m);
      else if (on(black ? m - 1 : m)) fill_rect(x, WHITE_Y, 1, WHITE_H, 1);
    }
    if (!black) {
      if (on(m)) fill_rect(ix, PIANO_Y, iw, BOTTOM - PIANO_Y, 1);
      continue;
    }
    if (on(m)) fill_rect(ix, PIANO_Y, iw, 2, 1);
    if (c > 1) line(ix, BLACK_LINE, c - 1, 1, m, m - 1);
    line(x + c, BLACK_LINE, win.k - c, 1, m, m + 1);
    if (c > 1 && on(m - 1)) fill_rect(ix, WHITE_Y, c - 1, WHITE_H, 1);
    line(x + c, WHITE_Y, 1, WHITE_H, m - 1, m + 1);
    if (win.k - c > 1 && on(m + 1)) fill_rect(x + c + 1, WHITE_Y, win.k - c - 1, WHITE_H, 1);
  }
}

// src/app/tick.ts
var PAD_MIN2 = MovePads[0];
var PAD_MAX2 = MovePads[MovePads.length - 1];
var LED_INIT_BATCH = 8;
var lastPhase = "";
var lastToastShowing = false;
var lastHeaderShowing = false;
var lastSessionMode = false;
var jogToastShown = false;
var pianoShown = "";
var lastModuleName = /* @__PURE__ */ new Map();
var chromaticCache = new Uint8Array(32);
function buildAutomationView(track, model) {
  const reg = automationRegistry()[track];
  const heldValues = /* @__PURE__ */ new Map();
  for (const [lane2, v] of seqState.heldLocks) {
    const e = reg[lane2];
    if (e) heldValues.set(lane2, fromLane7(v, e));
  }
  const liveValues = /* @__PURE__ */ new Map();
  for (const [lane2, v] of liveTurnValues(track)) {
    const e = reg[lane2];
    if (e) liveValues.set(lane2, fromLane7(v, e));
  }
  const ps = model.getDrumConfig()?.padScoping;
  const pad = model.getDrumCurrentPad();
  const ck2 = model.getComponentKey();
  const laneForKey = (key) => {
    const tp = ck2 + ":" + concreteKey(ps, pad, key);
    for (let l = 0; l < reg.length; l++) if (reg[l] && reg[l].targetParam === tp) return l;
    return -1;
  };
  return {
    assignedLanes: seqState.autoAssigned,
    activeLanes: seqState.autoActive,
    held: seqState.stepAutoMode,
    poolFull: poolIsFull(track),
    heldValues,
    liveValues,
    laneForKey
  };
}
var lastAutoView = void 0;
function schwungBodyFor(owner2) {
  const why = (r) => {
    if (r !== _schwungWhy) {
      _schwungWhy = r;
      mlog("schwung-body " + r);
    }
    return void 0;
  };
  const sp = owner2.page;
  if (!sp) return why(owner2.reason);
  why(owner2.reason);
  return () => {
    sp.render("", lastAutoView, -1);
  };
}
function schwungBankFor(owner2, body) {
  return body && owner2.page ? { index: owner2.pageIndex, count: owner2.pageCount } : void 0;
}
function schwungChromeFor(owner2, body, paging) {
  if (!body || !owner2.page) return void 0;
  const chrome = owner2.page.chrome(paging);
  return chrome.footer && anyStepHeld() ? { ...chrome, footer: null } : chrome;
}
var NO_LEVELS = new Array(8).fill(null);
function lightKnobRow(body) {
  updateKnobLEDsFrom(body ? drawnKnobLevels() : NO_LEVELS);
}
var _schwungView = "";
var _schwungWhy = "";
var _autoLanesLog = "";
function noteRendered(vm2) {
  noteRender(vm2);
}
var lastStepTrigSig = "";
function stepTrigSig() {
  return [
    seqState.holdVel,
    seqState.holdGate,
    seqState.holdGateMixed,
    seqState.holdProb,
    seqState.holdCondA,
    seqState.holdCondB,
    seqState.holdInvert,
    seqState.holdMaxGate,
    stepPageState.selected
  ].join(",");
}
var lastMainSig = "";
function mainSig() {
  return [
    mainPageActive(),
    seqState.bpmX100,
    seqState.swingPct,
    keyboardState.rootPc,
    keyboardState.scale,
    keyboardState.mode,
    keyboardState.layout,
    keyboardState.octave[appState.activeTrack.index]
  ].join(",");
}
var lastCpuRaw = "";
var lastCpuSig = "";
function cpuRepaintTick() {
  if (!cpuPageActive()) return;
  const raw2 = seqState.cpuCost + "|" + seqState.cpuWall + "|" + seqState.cpuMask + "|" + seqState.cpuSend + "|" + seqState.cpuMaster;
  if (raw2 === lastCpuRaw) return;
  lastCpuRaw = raw2;
  const vm2 = buildCpuPageVM();
  const draw = (c) => c.kind[0] + barPixels(c.synthUs, vm2.scaleUs) + "." + barPixels(c.totalUs, vm2.scaleUs) + "." + barPixels(c.peakUs, vm2.scaleUs);
  const cols = vm2.columns.map(draw);
  const snd = vm2.sends.map(draw);
  const sig = Math.round(vm2.load * 100) + "|" + Math.round(vm2.peakLoad * 100) + "|" + vm2.scaleUs + "|" + cols.join(",") + "|" + snd.join(",");
  if (sig === lastCpuSig) return;
  lastCpuSig = sig;
  appState.dirty = true;
}
var lastClipSig = "";
function clipSig() {
  return [
    clipPageActive(),
    seqState.clipScaleIdx,
    seqState.lenSteps,
    seqState.clipTranspose
  ].join(",");
}
var drumCache = new Uint8Array(32);
var drumCacheStale = false;
var lastActiveSlot = -1;
var lastShownKey = "";
var LABEL_RETRY_MIN = 64;
var LABEL_RETRY_MAX = 2048;
var labelRetryIn = 0;
var labelRetryGap = LABEL_RETRY_MIN;
function tick() {
  perfProbeEnter();
  tickBody();
  perfProbeTick();
}
function tickBody() {
  ledFrameReset();
  perfPhase("seqengine");
  seqEngineTick();
  perfPhase("drumsync");
  drumSyncTick();
  perfPhase("tempocap");
  captureTick();
  perfPhase("rest");
  stepAutoTick();
  stepRecTick();
  if (holdTick()) appState.dirty = true;
  if (jogHintTick()) appState.dirty = true;
  if (appState.currentView === VIEW_SETS && setsPageTick()) appState.dirty = true;
  if (textEntryActive()) {
    textEntry()?.tickTextEntry();
    appState.dirty = true;
  }
  if (canvasDiveActive()) {
    canvasDiveDeliverPads();
    tickCanvasDive();
    appState.dirty = true;
  }
  if (appState.fileBrowserState) {
    if (appState.currentView !== VIEW_FILE_BROWSE) cancelFileBrowser();
    else previewTick(appState.fileBrowserState, Date.now());
  }
  if (automationDisplayDirty()) appState.dirty = true;
  if (stepTrigSig() !== lastStepTrigSig) {
    lastStepTrigSig = stepTrigSig();
    appState.dirty = true;
  }
  if (mainSig() !== lastMainSig) {
    lastMainSig = mainSig();
    appState.dirty = true;
  }
  if (clipSig() !== lastClipSig) {
    lastClipSig = clipSig();
    appState.dirty = true;
  }
  cpuRepaintTick();
  const laneKeys = laneKeysForTrack(appState.activeTrack.index).join(",");
  if (laneKeys !== _autoLanesLog) {
    _autoLanesLog = laneKeys;
    mlog("auto lanes t=" + appState.activeTrack.index + " [" + laneKeys + "]");
  }
  if (labelRetryIn > 0 && --labelRetryIn === 0) requestLabelSync();
  if (engineReady() && takeLabelSync()) {
    resetDrumSync();
    const labels = paramGet("alabels");
    if (labels) {
      const binds = /* @__PURE__ */ new Map();
      const pending4 = syncLabelsFromEngine(
        labels,
        (slot, lane2, e) => {
          const l = binds.get(slot);
          if (l) l.push({ lane: lane2, e });
          else binds.set(slot, [{ lane: lane2, e }]);
        },
        validateTrackLane
      );
      if (anyLaneNeedsBase()) {
        const bases2 = paramGet("abases");
        if (bases2) seedFromEngine(bases2, laneRangeOf);
      }
      for (const [slot, lanes] of binds) {
        const refused = bindLanes((k, v) => portFor(slot).setParam(k, v), lanes);
        if (refused > 0) mlog("auto bind refused t=" + slot + " n=" + refused);
      }
      if (pending4) {
        labelRetryIn = labelRetryGap;
        labelRetryGap = Math.min(LABEL_RETRY_MAX, labelRetryGap * 2);
      } else {
        labelRetryIn = 0;
        labelRetryGap = LABEL_RETRY_MIN;
      }
    }
  }
  sessionTick();
  if (sessionPhase() !== lastPhase) {
    lastPhase = sessionPhase();
    appState.dirty = true;
  }
  recPassTick();
  undoTick();
  moduleRestoreTick();
  undoWatchContext();
  flushOrphanedSnaps();
  const noop = takeNoopSnapId();
  if (noop >= 0) onEngineNoop(noop);
  if (undoToastTick()) appState.dirty = true;
  if (seqState.sessionMode !== lastSessionMode) {
    lastSessionMode = seqState.sessionMode;
    seqLedsInvalidate();
    if (!seqState.sessionMode) {
      appState.initLedsDone = false;
      appState.initLedIndex = 0;
      chromaticCache.fill(0);
    }
    appState.dirty = true;
  }
  seqLedsTick(appState.shiftHeld, appState.currentView, seqState.barOffset, maxBarOffset());
  const synthModel2 = appState.trackModels[appState.activeTrack.index]?.[1];
  const isDrum2 = (synthModel2?.getDrumPadCount() ?? 0) > 0;
  if (appState.activeTrack.index !== lastActiveSlot) {
    lastActiveSlot = appState.activeTrack.index;
    drumCacheStale = true;
  }
  if (isDrum2) {
    const cfg = synthModel2.getDrumConfig();
    seqSetLane(cfg ? cfg.padNoteStart + (synthModel2.getDrumCurrentPad() - 1) : -1);
  } else {
    seqSetLane(-1);
  }
  if (!appState.initLedsDone && !seqState.sessionMode && !isDrum2) {
    const total = PAD_MAX2 - PAD_MIN2 + 1;
    const end = Math.min(appState.initLedIndex + LED_INIT_BATCH, total);
    let i = appState.initLedIndex;
    for (; i < end; i++) {
      if (!ledBudgetTake()) break;
      const p = PAD_MIN2 + i;
      const color = padColor(p, PAD_MIN2, appState.activeTrack.index, false);
      chromaticCache[i] = color;
      setLED(p, color, true);
    }
    appState.initLedIndex = i;
    if (appState.initLedIndex >= total && ledBudgetTake(2)) {
      setButtonLED(MoveUp, WHITE_DIM, true);
      setButtonLED(MoveDown, WHITE_DIM, true);
      appState.initLedsDone = true;
      appState.dirty = true;
    }
    return;
  }
  const chainIdx = appState.trackChainIndex[appState.activeTrack.index];
  const activeModel2 = appState.trackModels[appState.activeTrack.index]?.[chainIdx];
  const pageOwner = pageOwnerOf(activeModel2);
  perfPhase("modeltick");
  const modelDirty = activeModel2?.tick() ?? false;
  perfPhaseEnd();
  const mnKey = appState.activeTrack.index + ":" + chainIdx;
  const mn = activeModel2?.getModuleName() ?? "";
  if (mn && lastModuleName.get(mnKey) !== mn) {
    if (lastModuleName.has(mnKey)) {
      requestLabelSync();
    }
    lastModuleName.set(mnKey, mn);
  }
  const mIdx = appState.masterChainIndex;
  const masterModel2 = seqState.sessionMode ? appState.masterFxModels[mIdx] : null;
  const masterPageOwner = seqState.sessionMode ? pageOwnerOf(masterModel2) : null;
  const masterDirty = masterModel2?.tick() ?? false;
  const clipParamsOwner2 = appState.currentView === VIEW_CLIP_PARAMS ? pageOwnerForComponent(CLIP_PARAMS_COMPONENT) : null;
  const mainParamsOwner2 = appState.currentView === VIEW_MAIN_PARAMS ? pageOwnerForComponent(SET_PARAMS_COMPONENT) : null;
  mixerHoldTick(Date.now());
  if (mixerMeterDue(Date.now(), seqState.mixMeter)) appState.dirty = true;
  const mixerOwner = mixerPageActive() ? pageOwnerForComponent(MIXER_COMPONENT) : null;
  const shownKey = seqState.sessionMode ? "M" + mIdx + (appState.masterDetail ? "d" : "") : appState.activeTrack.index + ":" + chainIdx;
  if (shownKey !== lastShownKey) {
    lastShownKey = shownKey;
    (seqState.sessionMode ? masterModel2 : activeModel2)?.clearTouch();
  }
  seqToastTick();
  quantOverlayTickAt(Date.now());
  seqHeaderTick();
  const toastShowing = seqToastActive();
  const headerShowing = seqHeaderActive();
  const stepSelected = stepPageAvailable() && stepPageState.selected;
  const stepParamsOwner2 = stepSelected ? pageOwnerForComponent(STEP_PARAMS_COMPONENT) : null;
  const gridOnScreen = moduleGridOnScreen();
  const drawnPageOwner = seqState.sessionMode ? mixerOwner ?? clipParamsOwner2 ?? mainParamsOwner2 ?? masterPageOwner : stepParamsOwner2 ?? clipParamsOwner2 ?? mainParamsOwner2 ?? pageOwner;
  perfPhase("pagepoll");
  if (gridOnScreen && pollDrawnPage(drawnPageOwner)) appState.dirty = true;
  const schwungBody = gridOnScreen ? schwungBodyFor(drawnPageOwner) : void 0;
  perfPhaseEnd();
  const loadingWaited = loadingWaitMs(sessionReady(), Date.now());
  if (splashDue(loadingWaited)) appState.dirty = true;
  let viewRepainted = false;
  if (modelDirty || masterDirty || appState.dirty || toastShowing !== lastToastShowing || headerShowing !== lastHeaderShowing) {
    viewRepainted = true;
    jogToastShown = false;
    {
      const vst = `view=${appState.currentView} session=${seqState.sessionMode} masterDetail=${appState.masterDetail} ready=${sessionReady()}`;
      if (vst !== _schwungView) {
        _schwungView = vst;
        mlog("schwung-view " + vst);
      }
    }
    if (appState.currentView === VIEW_BROWSE) {
      const browseTitle = seqState.sessionMode ? MASTER_FX_SLOTS[mIdx]?.label ?? "Module" : activeModel2?.getModuleName() ?? "Module";
      renderBrowseView(browserState.modules, browserState.browseIndex, browseTitle);
    } else if (appState.currentView === VIEW_FILE_BROWSE) {
      if (appState.fileBrowserState) renderFileBrowseView(appState.fileBrowserState);
    } else if (!sessionReady()) {
      renderLoadingView(
        sessionPhase(),
        sessionError(),
        chainLoadsPending(),
        sessionFailScope(),
        loadingWaited,
        migrationProgress()
      );
    } else if (appState.currentView === VIEW_FLAGS) {
      renderFlagsView(buildFlagsPageVM());
      updateSingleKnobLED(-1, 0);
    } else if (textEntryActive()) {
      textEntry()?.drawTextEntry();
    } else if (appState.currentView === VIEW_SETS) {
      renderSetsView(buildSetsPageVM(
        libState()?.rows ?? null,
        currentSetUuid(),
        setsPageState.selected,
        setsPageState.confirming
      ));
    } else if (appState.currentView === VIEW_VERSIONS) {
      const vm2 = buildVersionsPageVM(Date.now());
      vm2.selected = versionsPageState.selected;
      vm2.confirming = versionsPageState.confirming;
      renderVersionsView(vm2);
    } else if (canvasDiveActive()) {
      renderCanvasDive();
      updateSingleKnobLED(-1, 0);
    } else if (schwungEditorActive()) {
      clear_screen();
      renderSchwungEditor();
      updateSingleKnobLED(-1, 0);
    } else if (appState.currentView === VIEW_MIXER) {
      const vm2 = headerOnlyVM("MIXER");
      const chrome = schwungChromeFor(drawnPageOwner, schwungBody, false);
      renderKnobsView(
        vm2,
        false,
        appState.activeTrack.index,
        paramBodyFor(drawnPageOwner, schwungBody, lastAutoView),
        schwungBankFor(drawnPageOwner, schwungBody),
        chrome
      );
      jogToastShown = !!(chrome && chrome.footer);
      lightKnobRow(schwungBody);
    } else if (appState.currentView === VIEW_MAIN_PARAMS) {
      const vm2 = headerOnlyVM("SET PARAMETERS");
      const chrome = schwungChromeFor(drawnPageOwner, schwungBody, false);
      renderKnobsView(
        vm2,
        false,
        appState.activeTrack.index,
        paramBodyFor(drawnPageOwner, schwungBody, lastAutoView),
        schwungBankFor(drawnPageOwner, schwungBody),
        chrome
      );
      jogToastShown = !!(chrome && chrome.footer);
      lightKnobRow(schwungBody);
    } else if (appState.currentView === VIEW_CLIP_PARAMS) {
      const vm2 = headerOnlyVM("CLIP PARAMETERS");
      const chrome = schwungChromeFor(drawnPageOwner, schwungBody, false);
      renderKnobsView(
        vm2,
        false,
        appState.activeTrack.index,
        paramBodyFor(drawnPageOwner, schwungBody, lastAutoView),
        schwungBankFor(drawnPageOwner, schwungBody),
        chrome
      );
      jogToastShown = !!(chrome && chrome.footer);
      lightKnobRow(schwungBody);
    } else if (appState.currentView === VIEW_CPU) {
      renderCpuView(buildCpuPageVM());
      updateSingleKnobLED(-1, 0);
    } else if (seqState.sessionMode) {
      const vm2 = masterModel2.getViewModel();
      if (appState.masterDetail) {
        noteRendered(vm2);
        const chrome = schwungChromeFor(drawnPageOwner, schwungBody, true);
        renderKnobsView(
          vm2,
          jogHintVisible(),
          appState.activeTrack.index,
          paramBodyFor(drawnPageOwner, schwungBody, lastAutoView),
          schwungBankFor(drawnPageOwner, schwungBody),
          chrome
        );
        jogToastShown = jogHintVisible() || !!(chrome && chrome.footer);
      } else {
        noteRendered(vm2);
        const chrome = schwungChromeFor(drawnPageOwner, schwungBody, false);
        renderChainView(
          vm2,
          mIdx,
          jogHintVisible(),
          "MASTER",
          MASTER_FX_SLOTS[mIdx]?.label,
          MASTER_FX_SLOTS,
          paramBodyFor(drawnPageOwner, schwungBody, lastAutoView),
          chrome
        );
        jogToastShown = jogHintVisible() || !!(chrome && chrome.footer);
      }
      lightKnobRow(schwungBody);
    } else if (noteViewActive()) {
      clear_screen();
      updateSingleKnobLED(-1, 0);
    } else if (appState.currentView === VIEW_KEYS) {
      renderKeysView(activeModel2?.getModuleName() ?? "\u2014", baseNoteFor(appState.activeTrack.index), midiNoteName);
    } else if (appState.currentView === VIEW_KNOBS) {
      const stepAvail = stepPageAvailable();
      let vm2;
      if (stepAvail && stepPageState.selected) {
        vm2 = buildStepPageVM();
      } else {
        perfPhase("autoview");
        const av = buildAutomationView(appState.activeTrack.index, activeModel2);
        lastAutoView = av;
        perfPhase("buildvm");
        vm2 = activeModel2.getViewModel(av);
        perfPhaseEnd();
        if (stepAvail) {
          vm2.stepPagePresent = true;
          vm2.stepPageSelected = false;
        }
      }
      noteRendered(vm2);
      perfPhase("render");
      const chrome = schwungChromeFor(drawnPageOwner, schwungBody, !stepSelected);
      const chromeFooter = !!(chrome && chrome.footer);
      renderKnobsView(
        vm2,
        jogHintVisible(),
        appState.activeTrack.index,
        paramBodyFor(drawnPageOwner, schwungBody, lastAutoView),
        schwungBankFor(pageOwner, schwungBody),
        chrome
      );
      perfPhaseEnd();
      jogToastShown = vm2.automationHeld && vm2.automationPoolFull || jogHintVisible() || chromeFooter;
      perfPhase("leds");
      lightKnobRow(schwungBody);
      perfPhaseEnd();
    } else if (appState.currentView === VIEW_CHAIN) {
      const stepAvail = stepPageAvailable();
      let vm2;
      if (stepAvail && stepPageState.selected) {
        vm2 = buildStepPageVM();
      } else {
        perfPhase("autoview");
        const av = buildAutomationView(appState.activeTrack.index, activeModel2);
        lastAutoView = av;
        perfPhase("buildvm");
        vm2 = activeModel2.getViewModel(av);
        perfPhaseEnd();
        if (stepAvail) {
          vm2.stepPagePresent = true;
          vm2.stepPageSelected = false;
        }
      }
      noteRendered(vm2);
      perfPhase("render");
      const chrome = schwungChromeFor(drawnPageOwner, schwungBody, false);
      renderChainView(
        vm2,
        chainIdx,
        jogHintVisible(),
        "T" + (appState.activeTrack.index + 1),
        void 0,
        void 0,
        paramBodyFor(drawnPageOwner, schwungBody, lastAutoView),
        chrome
      );
      perfPhaseEnd();
      jogToastShown = jogHintVisible() || !!(chrome && chrome.footer);
      perfPhase("leds");
      lightKnobRow(schwungBody);
      perfPhaseEnd();
    }
    const vol = volumeOverlay() ?? masterVolumeOverlay();
    if (vol) drawVolumeOverlay(vol);
    if (assignActive()) {
      drawJogToast(assignToastText());
      jogToastShown = true;
    }
    if (toastShowing) drawSeqToast();
    if (headerShowing) drawSeqHeader();
    if (quantOverlayActive()) drawQuantOverlay(buildQuantOverlayVM());
    if (captureOverlayActive()) drawCaptureOverlay(buildCaptureVM());
    if (undoToastActive()) drawUndoOverlay(undoToast());
    if (trackMenuActive()) renderFlagsView(buildTrackMenuVM());
    if (leaveModalActive()) drawLeaveModal(leaveModalLabels(), leaveModalSel(), leaveModalTitle());
    lastToastShowing = toastShowing;
    lastHeaderShowing = headerShowing;
    appState.dirty = false;
  }
  const drumNow = !seqState.sessionMode && isDrum2;
  if (drumNow) {
    const drumCfg = synthModel2.getDrumConfig();
    if (drumCfg) {
      if (!appState.drumActive) {
        drumCacheStale = true;
        setButtonLED(MoveUp, Black, true);
        setButtonLED(MoveDown, Black, true);
      }
      if (drumCacheStale) {
        drumCache.fill(255);
        drumCacheStale = false;
      }
      const track = appState.activeTrack.index;
      const sel = synthModel2.getDrumCurrentPhysPad();
      for (let i = 0; i <= PAD_MAX2 - PAD_MIN2; i++) {
        const p = PAD_MIN2 + i;
        const note = drumNoteOfPhys(p, PAD_MIN2, drumCfg);
        const playing = note >= 0 && (activeHasNote(track, note) || isSounding(p));
        const color = drumPadLedColor(
          p,
          PAD_MIN2,
          drumCfg,
          sel,
          track,
          playing,
          note >= 0 && padVoiceSilent(note)
        );
        if (drumCache[i] !== color) {
          if (!ledBudgetTake()) continue;
          drumCache[i] = color;
          setLED(p, color, true);
        }
      }
      appState.drumActive = true;
    }
  } else if (appState.drumActive) {
    appState.drumActive = false;
    appState.initLedsDone = false;
    appState.initLedIndex = 0;
    chromaticCache.fill(0);
    drumCache.fill(0);
    if (!seqState.sessionMode) {
      setButtonLED(MoveUp, WHITE_DIM, true);
      setButtonLED(MoveDown, WHITE_DIM, true);
    }
  }
  if (!seqState.sessionMode && !isDrum2 && appState.initLedsDone) {
    const track = appState.activeTrack.index;
    const map = padMapFor(track);
    const holdNotes = seqState.holdStep >= 0 && seqState.holdNotes.length > 0 ? displayHoldNotes() : null;
    for (let i = 0; i <= PAD_MAX2 - PAD_MIN2; i++) {
      const p = PAD_MIN2 + i;
      const pitch = map[i];
      const isPlaying = isSounding(p) || pitch >= 0 && activeHasNote(track, pitch);
      const color = padColor(p, PAD_MIN2, track, isPlaying, holdNotes);
      if (chromaticCache[i] !== color) {
        if (!ledBudgetTake()) continue;
        chromaticCache[i] = color;
        setLED(p, color, true);
      }
    }
  }
  const isBrowseView = appState.currentView === VIEW_BROWSE || appState.currentView === VIEW_FILE_BROWSE;
  const isFullScreenView = isBrowseView || appState.currentView === VIEW_CPU || appState.currentView === VIEW_SETS || textEntryActive();
  const schwungBottom = schwungEditorActive() || canvasDiveActive() || !!schwungBody && !!drawnPageOwner.page && drawnPageOwner.page.claimsBottomBand();
  if (engineReady() && !seqToastActive() && !jogToastShown && !schwungBottom && !seqState.sessionMode && !isFullScreenView && !captureOverlayActive()) {
    const piano = stepPianoVM();
    if (piano) {
      const key = stepPianoKey(piano);
      if (viewRepainted || key !== pianoShown) drawStepPiano(piano);
      pianoShown = key;
    } else {
      leavePiano(viewRepainted);
      if (noteViewActive()) noteViewTick(viewRepainted);
      drawLoopStrip();
    }
  } else {
    leavePiano(viewRepainted);
  }
  if (engineReady() && !seqToastActive() && !jogToastShown && !schwungBottom && !isBrowseView && !captureOverlayActive()) {
    songBandTick(viewRepainted);
  }
}
function leavePiano(viewRepainted) {
  if (pianoShown && !viewRepainted) appState.dirty = true;
  pianoShown = "";
}

// src/browser/schwung-dive.ts
var DEFAULT_ROOT = "/data/UserData";
function str(v) {
  return typeof v === "string" ? v : "";
}
function openSchwungDive(intent, page, model) {
  if (!intent || intent.action !== "open") return false;
  const meta = intent.meta;
  if (!isFileParam(meta)) return false;
  const fullKey = str(intent.fullKey) || str(intent.key);
  const colon = fullKey.indexOf(":");
  const componentKey2 = colon > 0 ? fullKey.slice(0, colon) : "synth";
  const paramKey = colon >= 0 ? fullKey.slice(colon + 1) : fullKey;
  if (!paramKey) return false;
  const own = model && typeof model.fileBrowseTargetForKey === "function" ? model.fileBrowseTargetForKey(paramKey) : null;
  const values = page.ctl && page.ctl.state ? page.ctl.state.values : null;
  const raw2 = values ? values[paramKey] : void 0;
  const currentPath = typeof raw2 === "string" && raw2.length > 0 ? raw2 : null;
  appState.browseOrigin = appState.currentView;
  openFileBrowser(
    appState.activeTrack.index,
    componentKey2,
    paramKey,
    own ? own.gi : -1,
    str(meta.root) || (own ? own.root : DEFAULT_ROOT),
    Array.isArray(meta.filter) ? meta.filter.filter((x) => typeof x === "string") : own ? own.filter : [],
    str(meta.start_path) || (own ? own.startPath : DEFAULT_ROOT),
    currentPath,
    own ? own.requireContains : void 0,
    /* The page's declaration first, as for root and filter above. */
    fileBrowseDeclOf(meta) ?? (own ? own.browse : null)
  );
  if (page.ctl && typeof page.ctl.clearTouch === "function") page.ctl.clearTouch();
  return true;
}

// src/seq/set-fail.ts
function sessionStartFromScratch() {
  mlog("seq: starting " + (currentSetUuid() || "this set") + " from scratch on request");
  const id2 = currentSetUuid() || "_default";
  paramSet("set", "blank " + id2);
  clearFailure();
}

// src/seq/mixer-input.ts
var owner = () => pageOwnerForComponent(MIXER_COMPONENT);
function mixerKnobTouch(k, down) {
  if (k >= MIXER_KNOBS) return;
  const page = owner().page;
  if (!page) return;
  const track = trackOfMixerKey(page.keyAt(k) ?? void 0);
  page.knobTouch(k, down);
  if (!down && track >= 0) endEdit(mixGestureKey(track, "gain"));
  appState.dirty = true;
}
function mixerKnobTurn(k, delta) {
  if (k >= MIXER_KNOBS) return;
  owner().page?.knobTurn(k, delta);
  appState.dirty = true;
}
function mixerJog(delta) {
  const o = owner();
  o.changePage(delta > 0 ? 1 : -1);
  appState.dirty = true;
}

// src/keyboard/drum-handler.ts
function drumPadOn(physPad, padMin, shiftHeld, drumConfig, componentKey2, slot, vel) {
  const drumPad = drumPadOfPhys(physPad, padMin, drumConfig);
  if (drumPad < 0) return null;
  const midiNote = drumNoteOfPad(drumPad, drumConfig);
  const suppressMidi = shiftHeld && !drumConfig.shiftSelectMidi;
  if (!suppressMidi) {
    keyboardState.lastPlayedNote = midiNote;
    noteSounded(physPad, slot, midiNote);
    if (!engineOwnsPads(slot)) {
      portFor(slot).sendMidi(MidiNoteOn, midiNote, shiftHeld ? 1 : vel);
    }
  }
  const fw = padFocusWrite(drumConfig, drumPad);
  if (fw) portFor(slot).setParam(componentKey2 + ":" + fw.key, fw.value);
  return drumPad;
}
function padFocusWrite(drumConfig, drumPad) {
  if (!drumConfig.currentPadParam) return null;
  return {
    key: drumConfig.currentPadParam,
    value: drumConfig.padFocusValues?.[drumPad - 1] ?? String(drumPad)
  };
}
function drumPadOff(physPad) {
  const n = noteReleased(physPad);
  if (n === void 0) return;
  emitNoteOff(n.track, n.pitch);
}

// src/browser/handler.ts
var MODULES_BASE = "/data/UserData/schwung/modules";
function scanModules(slot) {
  const dir = `${MODULES_BASE}/${slot.scanDir}`;
  const result2 = [];
  try {
    const [entries] = os.readdir(dir);
    if (!Array.isArray(entries)) return result2;
    for (const entry of entries) {
      if (entry === "." || entry === "..") continue;
      try {
        const raw2 = platform.readFile(`${dir}/${entry}/module.json`);
        if (!raw2) continue;
        const json = JSON.parse(raw2);
        const ct = json.component_type || json.capabilities?.component_type;
        if (ct === slot.expectedType) {
          result2.push({ id: json.id || entry, name: json.name || entry });
        }
      } catch {
      }
    }
  } catch {
  }
  result2.sort((a, b) => a.name.localeCompare(b.name));
  return result2;
}
function openBrowser(slot, paramSlot, reload) {
  browserState.componentKey = slot.componentKey;
  browserState.paramSlot = paramSlot;
  browserState.reload = reload;
  browserState.modules = [{ id: "", name: "NONE" }, ...scanModules(slot)];
  browserState.browseIndex = 0;
  const activeId = componentPort(paramSlot, slot.componentKey).getParam(moduleReadKey(slot.componentKey)) || "";
  const idx2 = browserState.modules.findIndex((m) => m.id === activeId);
  if (idx2 >= 0) browserState.browseIndex = idx2;
  mlog("browse: open t=" + paramSlot + " " + slot.componentKey + " n=" + browserState.modules.length);
  appState.currentView = VIEW_BROWSE;
  appState.dirty = true;
}
function loadSelectedModule() {
  if (browserState.modules.length === 0) return;
  const mod = browserState.modules[browserState.browseIndex];
  const value2 = mod.id;
  releaseAllLive();
  const prevId = componentPort(browserState.paramSlot, browserState.componentKey).getParam(moduleReadKey(browserState.componentKey)) || "";
  const changed = prevId !== mod.id;
  if (changed) {
    const state7 = captureModuleState(browserState.paramSlot, browserState.componentKey);
    const dump = state7 === null ? dumpModuleParams(browserState.paramSlot, browserState.componentKey) : { params: [], leadCount: 0 };
    if (state7 !== null) mlog("undo: captured module state (" + state7.length + " bytes)");
    beginEdit({
      key: "module:" + browserState.paramSlot + ":" + browserState.componentKey,
      verb: value2 ? "LOAD MODULE" : "CLEAR SLOT",
      target: "T" + (browserState.paramSlot + 1),
      detail: (mod.name || value2 || "NONE").toUpperCase(),
      close: CLOSE.IMMEDIATE,
      seq: true
    });
    const ids = (id2) => id2 === "" ? [] : [id2];
    addModuleOp({
      slot: browserState.paramSlot,
      componentKey: browserState.componentKey,
      oldWrite: prevId,
      newWrite: value2,
      oldIds: ids(prevId),
      newIds: ids(mod.id),
      oldLfo: captureLfoAssignments(browserState.paramSlot, browserState.componentKey),
      oldState: state7 ?? void 0,
      oldParams: dump.params,
      leadCount: dump.leadCount
    });
  }
  componentPort(browserState.paramSlot, browserState.componentKey).setParam(browserState.componentKey + ":module", value2);
  if (changed) endEdit();
  if (value2 === "") {
    appState.currentView = VIEW_CHAIN;
    if (MASTER_FX_SLOTS.some((s) => s.componentKey === browserState.componentKey)) {
      appState.masterDetail = false;
    }
  } else {
    appState.currentView = appState.browseOrigin;
  }
  appState.dirty = true;
  browserState.reload?.();
}

// src/seq/track-menu-input.ts
function trackMenuMidi(data) {
  if (!trackMenuActive()) return false;
  const type = data[0] & 240, d1 = data[1], d2 = data[2];
  const press = (type === 144 || type === 176) && d2 > 0;
  if (type === 176 && (d1 === MoveBack || d1 === MoveMainButton) && d2 > 0) {
    closeTrackMenu();
    return true;
  }
  if (type === 176 && (d1 === MoveKnob1 || d1 === MoveMainKnob)) {
    trackMenuKnob(decodeDelta(d2));
    return true;
  }
  return press || type === 160 || type === 224;
}

// src/midi/router.ts
function knobOwner() {
  return pageOwnerOf(knobModel());
}
function mainParamsOwner() {
  return pageOwnerForComponent(SET_PARAMS_COMPONENT);
}
function clipParamsOwner() {
  return pageOwnerForComponent(CLIP_PARAMS_COMPONENT);
}
function stepParamsOwner() {
  return pageOwnerForComponent(STEP_PARAMS_COMPONENT);
}
var PAD_MIN3 = MovePads[0];
var PAD_MAX3 = MovePads[MovePads.length - 1];
var KNOB_CC_BASE = MoveKnob1;
var NUM_KNOBS = 8;
var MASTER_TOUCH = MoveKnob8Touch + 1;
var JOG_TOUCH3 = MoveKnob8Touch + 2;
var TRACK_CC_START = 40;
var TRACK_CC_END = 43;
function isRelease(data) {
  const type = data[0] & 240;
  if (type === 128) return true;
  if (type === 144) return data[2] === 0;
  if (type === 176) {
    const k = data[1];
    if (k === MoveMainKnob || k === MASTER_CC) return false;
    if (k >= KNOB_CC_BASE && k < KNOB_CC_BASE + NUM_KNOBS) return false;
    return data[2] === 0;
  }
  return false;
}
function trackButtonPress(data) {
  if ((data[0] & 240) !== 176) return;
  const k = data[1];
  if (k === MoveMainKnob || k === MASTER_CC) return;
  if (k >= KNOB_CC_BASE && k < KNOB_CC_BASE + NUM_KNOBS) return;
  setButtonHeld(k, data[2] > 0);
}
function activeModel() {
  return appState.trackModels[appState.activeTrack.index]?.[appState.trackChainIndex[appState.activeTrack.index]];
}
function chainIndex() {
  return appState.trackChainIndex[appState.activeTrack.index];
}
function setChainIndex(i) {
  appState.trackChainIndex[appState.activeTrack.index] = i;
}
function synthModel() {
  return appState.trackModels[appState.activeTrack.index]?.[1];
}
function masterModel() {
  return appState.masterFxModels[appState.masterChainIndex];
}
function knobModel() {
  return masterChainActive() ? masterModel() : activeModel();
}
function knobLfoScope() {
  return masterChainActive() ? masterScope() : trackScope(appState.activeTrack.index);
}
function masterChainActive() {
  return seqState.sessionMode && appState.currentView !== VIEW_BROWSE && appState.currentView !== VIEW_FILE_BROWSE;
}
function masterGridActive() {
  return masterChainActive() && !appState.masterDetail;
}
function masterDetailActive() {
  return masterChainActive() && appState.masterDetail;
}
var refusedThisBoot = false;
function onMidiMessageInternal(data) {
  if (!data || data.length < 3) return;
  trackButtonPress(data);
  if (!sessionReady()) {
    const isCc = (data[0] & 240) === 176 && data[2] > 0;
    if (isCc && data[1] === MoveBack) {
    } else if (isCc && data[1] === MoveMainButton && sessionPhase() === "failed" && sessionFailScope() === "set") {
      sessionStartFromScratch();
      appState.dirty = true;
      return;
    } else {
      if (!refusedThisBoot) {
        refusedThisBoot = true;
        mlog("seq: input refused during " + sessionPhase());
      }
      return;
    }
  } else refusedThisBoot = false;
  if (textEntryActive()) {
    textEntry()?.handleTextEntryMidi(data);
    appState.dirty = true;
    return;
  }
  if (canvasDiveTakes(data)) {
    appState.dirty = true;
    return;
  }
  if (captureOverlayActive()) {
    const action = captureOverlayAction(data);
    if (action === "jog") {
      captureJog(decodeDelta(data[2]));
      return;
    }
    if (action === "swallow") return;
    if (action === "dismiss") {
      captureDismiss(data);
      return;
    }
  }
  if (quantOverlayActive()) {
    const action = quantOverlayAction(data, appState.shiftHeld);
    if (action === "jog") {
      quantOverlayJog(decodeDelta(data[2]), Date.now());
      return;
    }
    if (action === "swallow") {
      quantOverlayHold(Date.now());
      return;
    }
    if (action === "dismiss") {
      dismissQuantOverlay();
      return;
    }
  }
  if (leaveModalActive()) {
    if ((data[0] & 240) === 176) {
      const k = data[1], v = data[2];
      if (k === MoveBack && v > 0) {
        closeLeaveModal("Back");
        appState.dirty = true;
        return;
      }
      if (k === MoveMainKnob) {
        const delta = decodeDelta(v);
        if (delta !== 0) {
          leaveModalMove(delta);
          appState.dirty = true;
        }
        return;
      }
      if (k === MoveMainButton && v > 0) {
        const action = leaveModalConfirm();
        appState.dirty = true;
        resetHeldInput(true);
        if (action === "close") platform.exit();
        else if (action === "poweroff") platform.powerOff();
        return;
      }
    }
    const pass = leaveModalPass(data);
    if (pass === "swallow" && !isRelease(data)) return;
    if (pass === "dismiss" && !isRelease(data)) {
      closeLeaveModal("input " + data.map((b) => b.toString(16).padStart(2, "0")).join(" "));
      appState.dirty = true;
    }
  }
  if (trackMenuMidi(data)) {
    appState.dirty = true;
    return;
  }
  if (seqHandleMidi(data, appState.shiftHeld)) return;
  const status = data[0];
  const d1 = data[1];
  const d2 = data[2];
  if ((status & 240) === 144 && d1 < 8) {
    const owed = d2 > 0 ? void 0 : unpinPage(d1);
    const owedModel = d2 > 0 ? void 0 : unpinModel(d1);
    owed?.knobTouch(d1, false);
    owedModel?.handleKnobRelease(d1);
    if (mixerPageActive()) {
      mixerKnobTouch(d1, d2 > 0);
      return;
    }
    if (noteViewActive()) return;
    if (mainPageActive()) {
      if (d1 < 8) {
        const owner3 = mainParamsOwner();
        if (d2 > 0) owner3.page?.knobTouch(d1, true);
        else {
          owner3.page?.knobTouch(d1, false);
          mainPageRelease(d1);
        }
      }
      appState.dirty = true;
      return;
    }
    if (clipPageActive()) {
      if (d1 < 4) {
        const owner3 = clipParamsOwner();
        if (d2 > 0) owner3.page?.knobTouch(d1, true);
        else {
          owner3.page?.knobTouch(d1, false);
          clipPageRelease(d1, appState.activeTrack.index);
        }
      }
      appState.dirty = true;
      return;
    }
    if (flagsPageActive()) return;
    if (stepPageAvailable() && stepPageState.selected) {
      if (d1 < 5) stepParamsOwner().page?.knobTouch(d1, d2 > 0);
      appState.dirty = true;
      return;
    }
    const owner2 = knobOwner();
    if (d2 > 0) {
      const info = owner2.knobParamInfo(d1);
      if (deleteActive()) {
        if (info) clearLaneForKnob(appState.activeTrack.index, info);
        markDeleteActed();
        appState.dirty = true;
        return;
      }
      const model = knobModel();
      model?.handleKnobTouch(d1);
      pinModel(d1, model ?? null);
      pinPage(d1, owner2.page);
      owner2.page?.knobTouch(d1, true);
      automationKnobTouched(d1);
      const armable = !!owner2.page?.regularKnobAt(d1);
      holdTouch(knobLfoScope(), d1, armable ? info : null);
    } else {
      const info = owner2.knobParamInfo(d1);
      if (deleteActive()) markDeleteActed();
      if (!owed) owner2.page?.knobTouch(d1, false);
      if (info) automationKnobReleased(appState.activeTrack.index, d1, info);
      holdRelease(d1);
    }
    return;
  }
  if ((status & 240) === 144 && d1 === MASTER_TOUCH) {
    volumeTouch(d2 > 0);
    masterVolumeTouch(d2 > 0);
    appState.dirty = true;
    return;
  }
  if ((status & 240) === 144 && d1 === JOG_TOUCH3) {
    if (appState.currentView === VIEW_CHAIN || appState.currentView === VIEW_KNOBS) {
      if (jogHintTouch(d2 > 0)) appState.dirty = true;
    }
    return;
  }
  if ((status & 240) === 144 && d1 < 10) return;
  if (d1 >= PAD_MIN3 && d1 <= PAD_MAX3) {
    const model = synthModel();
    const drumCfg = model?.getDrumConfig() ?? null;
    const track = appState.activeTrack.index;
    if ((status & 240) === 144 && d2 > 0 && muteHeld() && drumCfg && padsPlayNotes()) {
      const voice = drumNoteOfPhys(d1, PAD_MIN3, drumCfg);
      if (voice >= 0) {
        muteMarkGestured();
        padMuteGesture(track, voice, muteShiftHeld() || appState.shiftHeld);
        appState.dirty = true;
        return;
      }
    }
    if ((status & 240) === 144 && d2 > 0) {
      const vel = seqState.fullVelocity ? 127 : d2;
      const pressParam = model?.getPressParam();
      if (pressParam) {
        portFor(track).setParam(model.getComponentKey() + ":" + pressParam, "1");
      }
      if (drumCfg) {
        const pad = drumPadOn(d1, PAD_MIN3, appState.shiftHeld, drumCfg, model.getComponentKey(), track, vel);
        mlog("drumPad note=" + d1 + " pad=" + pad);
        if (pad !== null) {
          model.updateDrumPad(pad, d1);
          perfPhase("padpage");
          try {
            const page = pageOwnerOf(model).page;
            const fw = padFocusWrite(drumCfg, pad);
            if (fw) page?.focusWritten(model.getComponentKey() + ":" + fw.key, fw.value);
            page?.focusVoice(pad, drumNoteOfPad(pad, drumCfg));
          } finally {
            perfPhaseEnd();
          }
        }
      } else {
        noteOn(d1, PAD_MIN3, track, vel);
      }
      const played = soundingPitch(d1);
      if (played !== void 0) seqNotePadPlayed(track, d1, played, vel);
      return;
    }
    if ((status & 240) === 128 || (status & 240) === 144 && d2 === 0) {
      const owner2 = soundingTrack(d1) ?? track;
      if (drumCfg) {
        drumPadOff(d1);
      } else {
        noteOff(d1, PAD_MIN3);
      }
      seqNotePadReleased(d1, owner2);
      return;
    }
  }
  if ((status & 240) === 176 && d1 === MASTER_CC) {
    if (volumeKnobDelta(d2)) {
      momentaryGesture();
      appState.dirty = true;
    } else if (masterVolumeKnob(d2)) {
      appState.dirty = true;
    }
    return;
  }
  if ((status & 240) === 176 && d1 >= KNOB_CC_BASE && d1 < KNOB_CC_BASE + NUM_KNOBS) {
    const k = d1 - KNOB_CC_BASE;
    const delta = decodeDelta(d2);
    holdTurnCancel();
    if (mixerPageActive()) {
      mixerKnobTurn(k, delta);
      return;
    }
    if (noteViewActive()) return;
    if (mainPageActive()) {
      if (k < 8) {
        mainParamsOwner().page?.knobTurn(k, delta);
        appState.dirty = true;
      }
      return;
    }
    if (clipPageActive()) {
      if (k < 4) {
        clipParamsOwner().page?.knobTurn(k, delta);
        appState.dirty = true;
      }
      return;
    }
    if (flagsPageActive()) {
      if (k === 0 && clickRowSelected() && clickVolumeTurn(delta)) appState.dirty = true;
      return;
    }
    if (cpuPageActive()) {
      return;
    }
    if (stepPageAvailable() && stepPageState.selected) {
      if (k < 5) stepParamsOwner().page?.knobTurn(k, delta);
      return;
    }
    mlog("knobCC k=" + k + " d2=" + d2 + " delta=" + delta);
    const model = knobModel();
    const track = appState.activeTrack.index;
    const owner2 = pageOwnerOf(model);
    const info = owner2.knobParamInfo(k);
    if (info && handleAutomationKnob(
      track,
      k,
      info,
      delta,
      mappingFor(info, (key, val) => portFor(track).setParam(key, val))
    )) {
      return;
    }
    if (owner2.page) {
      owner2.page.knobTurn(k, delta, appState.shiftHeld);
      appState.dirty = true;
    }
    return;
  }
  if ((status & 240) !== 176) return;
  if (d1 >= TRACK_CC_START && d1 <= TRACK_CC_END) {
    const track = focusedTrack(TRACK_CC_END - d1);
    if (d2 > 0) {
      volumeTrackDown(track);
      if (muteHeld()) {
        if (muteShiftHeld() || appState.shiftHeld) toggleSolo(track);
        else muteTrack(track);
        muteMarkGestured();
        appState.dirty = true;
        return;
      }
      if (appState.shiftHeld) {
        openTrackMenu(track);
        appState.dirty = true;
        return;
      }
      const prev = beginTrackSwitch();
      momentaryDown(d1, () => restoreTrackState(prev));
      switchToTrack(track, prev);
    } else {
      volumeTrackUp(track);
      momentaryUp(d1);
      appState.dirty = true;
    }
    return;
  }
  if (d1 === MoveShift) {
    appState.shiftHeld = d2 > 0;
    return;
  }
  if (d1 === MoveBack && d2 > 0) {
    jogHintTouch(false);
    holdTurnCancel();
    if (versionsPageActive() && versionsPageBack()) {
      appState.dirty = true;
      return;
    }
    if (setsPageActive() && setsPageBack()) {
      appState.dirty = true;
      return;
    }
    if (schwungEditorActive()) {
      schwungEditorCancel();
      appState.dirty = true;
      return;
    }
    {
      const onSchwungView = appState.currentView === VIEW_KNOBS || appState.currentView === VIEW_CHAIN || appState.currentView === VIEW_CLIP_PARAMS || appState.currentView === VIEW_MAIN_PARAMS;
      const spb = appState.currentView === VIEW_CLIP_PARAMS ? clipParamsOwner().page : appState.currentView === VIEW_MAIN_PARAMS ? mainParamsOwner().page : onSchwungView ? knobOwner().page : null;
      if (spb) {
        const intent = spb.back();
        appState.dirty = true;
        if (!intent) return;
      }
    }
    if (masterDetailActive()) {
      appState.masterDetail = false;
      appState.dirty = true;
      return;
    }
    if (paramPageActive()) {
      appState.currentView = closeParamPage();
      appState.dirty = true;
      return;
    }
    if (appState.currentView === VIEW_BROWSE) {
      appState.currentView = appState.browseOrigin;
      appState.dirty = true;
    } else if (appState.currentView === VIEW_FILE_BROWSE) {
      cancelFileBrowser();
      appState.currentView = appState.browseOrigin;
      appState.dirty = true;
    } else if (appState.currentView === VIEW_KEYS || appState.currentView === VIEW_KNOBS) {
      appState.currentView = VIEW_CHAIN;
      appState.dirty = true;
    } else {
      releaseAllLive();
      resetHeldInput(true);
      openLeaveModal();
      appState.dirty = true;
    }
    return;
  }
  if (d1 === MoveMainButton && d2 > 0) {
    if (setsPageActive()) {
      setsPageClick(currentSetUuid());
      appState.dirty = true;
      return;
    }
    if (versionsPageActive()) {
      versionsPageClick(currentSetUuid());
      appState.dirty = true;
      return;
    }
    if (flagsPageActive() && backupsRowSelected()) {
      openVersionsPage();
      appState.dirty = true;
      return;
    }
    if (flagsPageActive() && migrateRowSelected()) {
      migrateRowClick(currentSetUuid());
      appState.dirty = true;
      return;
    }
    if (assignActive()) {
      const r = assignCommit();
      if (r) {
        knobModel()?.refreshModulation();
        if (r.assigned) {
          const onMaster = masterChainActive();
          let lm;
          if (onMaster) {
            appState.masterChainIndex = MASTER_LFO_INDEX;
            appState.masterDetail = false;
            lm = appState.masterFxModels[MASTER_LFO_INDEX];
          } else {
            appState.trackChainIndex[appState.activeTrack.index] = LFO_CHAIN_INDEX;
            appState.currentView = VIEW_CHAIN;
            lm = appState.trackModels[appState.activeTrack.index]?.[LFO_CHAIN_INDEX];
          }
          if (lm) {
            lm.reload();
            const ref = pageRefOf(lm);
            if (ref) schwungGridDrop(ref.track, ref.componentKey);
            pageOwnerOf(lm).goToPage(r.lfoIdx);
          }
        } else {
          seqToast("LFO" + (r.lfoIdx + 1) + " mod removed");
        }
        appState.dirty = true;
      }
      return;
    }
    if (anyStepHeld()) {
      if (appState.currentView === VIEW_CHAIN) {
        appState.currentView = VIEW_KNOBS;
        appState.dirty = true;
      }
      return;
    }
    {
      const spc = appState.currentView === VIEW_CLIP_PARAMS ? clipParamsOwner().page : appState.currentView === VIEW_MAIN_PARAMS ? mainParamsOwner().page : knobOwner().page;
      const wantPicker = appState.shiftHeld && appState.currentView === VIEW_KNOBS;
      const onSchwungView = appState.currentView === VIEW_KNOBS || appState.currentView === VIEW_CHAIN || appState.currentView === VIEW_CLIP_PARAMS || appState.currentView === VIEW_MAIN_PARAMS;
      if (onSchwungView && spc && (wantPicker || spc.ctl.pickerOpen || spc.ctl.isDoor() || spc.ctl.state.touched >= 0)) {
        const intent = spc.click(wantPicker);
        appState.dirty = true;
        if (intent && intent.action === "open" && !openSchwungEditor(intent, spc) && !(spc.canvasDive && spc.canvasDive(intent)) && !openSchwungDive(intent, spc, activeModel())) {
          mlog("schwung-open unhandled " + (intent.key || "?") + " kind=" + (intent.meta ? intent.meta.kind : "?") + " type=" + (intent.meta ? intent.meta.type : "?"));
        }
        return;
      }
    }
    if (appState.currentView === VIEW_BROWSE) {
      loadSelectedModule();
    } else if (appState.currentView === VIEW_FILE_BROWSE) {
      const committed = appState.fileBrowserState;
      activateFileBrowserItem();
      if (committed && !appState.fileBrowserState) {
        const owner2 = pageOwnerOf(activeModel());
        if (owner2.page && owner2.ref && owner2.ref.componentKey === committed.componentKey) {
          owner2.page?.ctl.selectionChanged();
        }
      }
    } else if (masterChainActive()) {
      const mi = appState.masterChainIndex;
      const isEmpty = masterModel()?.getViewModel().isEmpty ?? false;
      if (isMasterLfoSlot(mi)) {
        appState.masterDetail = true;
        appState.dirty = true;
      } else if (appState.masterDetail || appState.shiftHeld || isEmpty) {
        openBrowser(MASTER_FX_SLOTS[mi], 0, () => masterModel()?.reload());
        appState.browseOrigin = VIEW_CHAIN;
      } else {
        appState.masterDetail = true;
        appState.dirty = true;
      }
    } else if (appState.currentView === VIEW_KEYS) {
      appState.currentView = VIEW_CHAIN;
      appState.dirty = true;
    } else if (appState.currentView === VIEW_CHAIN || appState.currentView === VIEW_KNOBS) {
      if (schwungEditorActive()) {
        schwungEditorCommit();
        appState.dirty = true;
        return;
      }
      const fileOwner = pageOwnerOf(activeModel());
      const fileTarget = activeModel()?.getFileBrowseTarget(
        (slot) => fileOwner.knobParamInfo(slot)?.key ?? null
      ) ?? null;
      if (fileTarget) {
        appState.browseOrigin = appState.currentView;
        openFileBrowser(
          appState.activeTrack.index,
          activeModel().getComponentKey(),
          fileTarget.key,
          fileTarget.gi,
          fileTarget.root,
          fileTarget.filter,
          fileTarget.startPath,
          fileTarget.currentPath,
          fileTarget.requireContains,
          fileTarget.browse
        );
      } else if (appState.currentView === VIEW_CHAIN) {
        const isEmpty = activeModel()?.getViewModel().isEmpty ?? false;
        if (!isLfoSlot(chainIndex()) && (appState.shiftHeld || isEmpty)) {
          openBrowser(CHAIN_SLOTS[chainIndex()], appState.activeTrack.index, () => activeModel()?.reload());
          appState.browseOrigin = VIEW_CHAIN;
        } else {
          appState.currentView = VIEW_KNOBS;
          appState.dirty = true;
        }
      } else if (!isLfoSlot(chainIndex())) {
        openBrowser(CHAIN_SLOTS[chainIndex()], appState.activeTrack.index, () => activeModel()?.reload());
        appState.browseOrigin = VIEW_KNOBS;
      }
    }
    return;
  }
  if (d1 === MoveMainKnob) {
    const delta = decodeDelta(d2);
    if (delta !== 0) {
      jogHintTouch(false);
      if (schwungEditorActive()) {
        schwungEditorJog(delta);
        appState.dirty = true;
        return;
      }
      if (assignActive()) {
        assignCycle(delta);
        appState.dirty = true;
        return;
      }
      if (mixerPageActive()) {
        mixerJog(delta);
        return;
      }
      if (setsPageActive()) {
        setsPageJog(delta, appState.shiftHeld);
        appState.dirty = true;
        return;
      }
      if (versionsPageActive()) {
        versionsPageJog(delta, appState.shiftHeld);
        appState.dirty = true;
        return;
      }
      if (flagsPageActive()) {
        flagsPageJog(delta);
        appState.dirty = true;
        return;
      }
      if (cpuPageActive()) return;
      if (masterDetailActive()) {
        pageOwnerOf(masterModel()).changePage(delta > 0 ? 1 : -1);
      } else if (masterGridActive()) {
        appState.masterChainIndex = Math.max(0, Math.min(LAST_MASTER_INDEX, appState.masterChainIndex + (delta > 0 ? 1 : -1)));
      } else if (appState.currentView === VIEW_CHAIN) {
        const dir = delta > 0 ? 1 : -1;
        if (stepPageAvailable()) {
          if (stepPageState.selected) {
            if (dir > 0) setStepPageSelected(false);
          } else if (dir < 0 && chainIndex() === 0) {
            setStepPageSelected(true);
          } else {
            setChainIndex(Math.max(0, Math.min(LAST_CHAIN_INDEX, chainIndex() + dir)));
          }
        } else {
          setChainIndex(Math.max(0, Math.min(LAST_CHAIN_INDEX, chainIndex() + dir)));
        }
        mlog("chain chainIndex=" + chainIndex());
      } else if (appState.currentView === VIEW_KNOBS) {
        const dir = delta > 0 ? 1 : -1;
        const m = activeModel();
        if (stepPageAvailable()) {
          const onBank0 = pageOwnerOf(m).pageIndex === 0;
          if (stepPageState.selected) {
            if (dir > 0) setStepPageSelected(false);
          } else if (dir < 0 && onBank0) {
            setStepPageSelected(true);
          } else {
            pageOwnerOf(m).changePage(dir);
          }
        } else {
          pageOwnerOf(m).changePage(dir);
        }
      } else if (appState.currentView === VIEW_BROWSE) {
        browserState.browseIndex = Math.max(0, Math.min(browserState.modules.length - 1, browserState.browseIndex + delta));
      } else if (appState.currentView === VIEW_FILE_BROWSE) {
        navigateFileBrowser(delta);
      }
      appState.dirty = true;
    }
    return;
  }
  if (d1 === MoveLeft && d2 > 0) {
    if (masterDetailActive()) {
      pageOwnerOf(masterModel()).changePage(-1);
    } else if (masterGridActive()) {
      appState.masterChainIndex = Math.max(0, appState.masterChainIndex - 1);
    } else if (appState.currentView === VIEW_CHAIN) {
      if (stepPageAvailable() && !stepPageState.selected && chainIndex() === 0) setStepPageSelected(true);
      else if (!(stepPageAvailable() && stepPageState.selected)) setChainIndex(Math.max(0, chainIndex() - 1));
    } else if (appState.currentView === VIEW_KNOBS) {
      const o = pageOwnerOf(activeModel());
      if (stepPageAvailable() && !stepPageState.selected && o.pageIndex === 0) setStepPageSelected(true);
      else if (!(stepPageAvailable() && stepPageState.selected)) o.changePage(-1);
    }
    appState.dirty = true;
    return;
  }
  if (d1 === MoveRight && d2 > 0) {
    if (masterDetailActive()) {
      pageOwnerOf(masterModel()).changePage(1);
    } else if (masterGridActive()) {
      appState.masterChainIndex = Math.min(LAST_MASTER_INDEX, appState.masterChainIndex + 1);
    } else if (appState.currentView === VIEW_CHAIN) {
      if (stepPageAvailable() && stepPageState.selected) setStepPageSelected(false);
      else setChainIndex(Math.min(LAST_CHAIN_INDEX, chainIndex() + 1));
    } else if (appState.currentView === VIEW_KNOBS) {
      if (stepPageAvailable() && stepPageState.selected) setStepPageSelected(false);
      else pageOwnerOf(activeModel()).changePage(1);
    }
    appState.dirty = true;
    return;
  }
  if (d1 === MoveUp || d1 === MoveDown) {
    const dir = d1 === MoveUp ? 1 : -1;
    if (seqState.sessionMode) {
      const gdir = d1 === MoveUp ? GROUP_DIR_UP : GROUP_DIR_DOWN;
      if (d2 > 0 && focusGroupStep(gdir)) {
        appState.initLedsDone = false;
        appState.initLedIndex = 0;
      }
      setButtonLED(d1, d2 > 0 ? WHITE_BRIGHT : WHITE_DIM, true);
      appState.dirty = true;
      return;
    }
    if (trackIsDrum(appState.activeTrack.index)) return;
    if (d2 > 0) {
      changeOctave(appState.activeTrack.index, dir);
      setButtonLED(d1, WHITE_BRIGHT, true);
    } else {
      setButtonLED(d1, WHITE_DIM, true);
    }
    appState.dirty = true;
    return;
  }
}

// src/midi/ext-knobs.ts
var state6 = createExtKnobState();
var WAKE_GAP_MS = 1e4;
var lastCcMs = 0;
var TW_GREEN = 50;
function paintTwister() {
  const assigned = new Set(TW_ASSIGNED);
  for (let enc = 0; enc < 16; enc++) {
    if (assigned.has(enc)) {
      platform.externalSend([11, 177, enc, TW_GREEN]);
      platform.externalSend([11, 178, enc, 47]);
      platform.externalSend([11, 178, enc, 95]);
    } else {
      platform.externalSend([11, 178, enc, 17]);
      platform.externalSend([11, 178, enc, 65]);
    }
  }
}
function presetTurn(delta) {
  const page = pageOwnerOf(knobModel()).page;
  if (page && page.presetStep(delta)) appState.dirty = true;
}
function onExternalControlChange(data) {
  const now2 = Date.now();
  if (now2 - lastCcMs > WAKE_GAP_MS) {
    paintTwister();
    armTwisterFollow((cc2, v) => state6.abs.set("tw" + cc2, v));
  }
  lastCcMs = now2;
  const ch = (data[0] & 15) + 1;
  for (const a of extKnobActions(state6, ch, data[1] & 127, data[2] & 127)) {
    if (a.kind === "cc") onMidiMessageInternal([176, a.cc, a.value]);
    else presetTurn(a.delta);
  }
}

// src/midi/external.ts
function onMidiMessageExternal(data) {
  if (!data || data.length < 3) return;
  const type = data[0] & 240, note = data[1] & 127, vel = data[2];
  if (type === 176) {
    onExternalControlChange(data);
    return;
  }
  const ch = (data[0] & 15) + 1;
  const key = EXT_KEY_BASE + (ch - 1) * 128 + note;
  if (type === 144 && vel > 0) {
    const claimed = trackForChannel(ch);
    const track = claimed >= 0 ? claimed : appState.activeTrack.index;
    const drum = drumConfigFor(track);
    const pitch = drum ? extDrumPitch(note, drum) : note;
    if (pitch < 0) return;
    const prev = extRelease(key);
    if (prev !== void 0) seqNotePadReleased(key, prev);
    extHold(key, track);
    seqNotePadPlayed(track, key, pitch, vel);
  } else if (type === 128 || type === 144) {
    const track = extRelease(key);
    if (track !== void 0) seqNotePadReleased(key, track);
  }
}

// src/app/unload.ts
function onUnload() {
  resetSeqChord(true);
  releaseAllLive();
  const gates = releaseSequencerGates(0, TRACK_COUNT);
  mlog("unload: released " + gates + " sequencer note(s)");
  seqCmdFlush();
  sessionFlush(true);
}

// src/app/globals.ts
setSurfaceReader(surfaceOf);
setVoiceMapReader(rackVoiceMap);
setChildKeyResolver(schwungLib().resolveChildKey, schwungLib().childCount);
var onPowerButton = () => {
  openPowerModal();
};
Object.assign(globalThis, { init, tick, onMidiMessageInternal, onMidiMessageExternal, onUnload, onPowerButton });
