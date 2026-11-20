/* What a sound_generator can say back to movy: pad colours and a line of text.
 *
 * A module opts in by naming the params in its ui_hierarchy root (the same
 * place `focus_press_param` lives):
 *
 *   "pad_leds_param":    "pad_leds"      read-only string, 64 hex digits
 *   "status_text_param": "status_text"   read-only string, "<seq>:<text>"
 *   "display_param":     "display"       read-only string, "<seq>|<pos>|<peaks>|<header>"
 *   "delete_pad_param":  "delete_pad"    write-only: Delete + pad -> the rack pad index
 *
 * pad_leds: one byte (two hex digits) per RACK pad, pad 1 first — the same
 * numbering as the module's declared voices, so the module never needs to know
 * how movy lays a rack onto the 8x4 grid. Bits 0-6 are a Move LED palette
 * index; bit 7 (0x80) makes the pad blink between that colour and off.
 *
 * status_text: a sequence number and the text. movy shows the text as a toast
 * when the sequence number differs from the last one it saw. The first value
 * seen for a track is only remembered, never shown, so loading a Set or
 * switching to a track does not replay an old message.
 *
 * display: a waveform overview for the main screen. seq bumps when the peaks
 * change (movy parses them only then); pos is the playhead 0..127; peaks are
 * 128 values of two hex digits (0..255), empty when there is nothing to draw;
 * header is free text and comes last so it may hold anything, even '|'.
 * movy draws it in place of the knob page while no knob or the jog is being
 * used (see renderer/module-display.ts and DISPLAY_IDLE_MS).
 *
 * delete_pad: while Delete is held, a pad press on this track is NOT movy's
 * "erase this voice's steps"; movy writes the 0-based rack pad index (0..31,
 * same numbering as pad_leds) to this param and swallows the press.
 *
 * Cost: up to three get_param reads, only for the ACTIVE track, only every
 * POLL_EVERY ticks (~25 Hz at the device's ~196 ticks/s). A module that
 * declares nothing costs nothing.
 *
 * Pure: no platform globals, so the logic suite drives it directly. */

export const PAD_LED_COUNT = 32;
export const POLL_EVERY    = 8;
export const DISPLAY_BINS  = 128;
/* Blink half-period in ticks: ~0.5 s at ~196 ticks/s. */
export const BLINK_TICKS   = 98;

export interface FeedbackKeys {
    ledsKey: string | null;
    textKey: string | null;
    displayKey: string | null;
    deleteKey: string | null;
}

/** What the module said about the selected clip, as last read. */
export interface DisplayState {
    seq: number;
    pos: number;                 // 0..127
    peaks: Uint8Array | null;    // 128 entries, or null when empty
    header: string;
}

/** Idle time after the last knob/jog touch before the display view returns. */
export const DISPLAY_IDLE_MS = 1500;

function keyOf(v: unknown): string | null { return typeof v === 'string' && v ? v : null; }

/** The declared keys out of a ui_hierarchy root, or null when it declares none. */
export function feedbackKeysOf(hierarchy: any): FeedbackKeys | null {
    if (!hierarchy || typeof hierarchy !== 'object') return null;
    const k: FeedbackKeys = {
        ledsKey: keyOf(hierarchy.pad_leds_param),
        textKey: keyOf(hierarchy.status_text_param),
        displayKey: keyOf(hierarchy.display_param),
        deleteKey: keyOf(hierarchy.delete_pad_param),
    };
    return k.ledsKey || k.textKey || k.displayKey || k.deleteKey ? k : null;
}

/** "<seq>|<pos>|<peaks>|<header>" -> state. `prev` lets an unchanged seq keep
 *  its already-parsed peaks (the hex is not parsed again). Null on garbage. */
export function parseDisplay(raw: string | null | undefined, prev?: DisplayState | null): DisplayState | null {
    if (!raw) return null;
    const i1 = raw.indexOf('|');
    const i2 = i1 < 0 ? -1 : raw.indexOf('|', i1 + 1);
    const i3 = i2 < 0 ? -1 : raw.indexOf('|', i2 + 1);
    if (i3 < 0) return null;
    const seq = parseInt(raw.slice(0, i1), 10);
    const pos = parseInt(raw.slice(i1 + 1, i2), 10);
    if (!(seq >= 0) || !(pos >= 0)) return null;
    const header = raw.slice(i3 + 1);
    let peaks: Uint8Array | null;
    if (prev && prev.seq === seq) peaks = prev.peaks;
    else {
        const hex = raw.slice(i2 + 1, i3);
        peaks = null;
        if (hex.length >= DISPLAY_BINS * 2) {
            const a = new Uint8Array(DISPLAY_BINS);
            let ok = true;
            for (let i = 0; i < DISPLAY_BINS; i++) {
                const v = parseInt(hex.substr(i * 2, 2), 16);
                if (!(v >= 0)) { ok = false; break; }
                a[i] = v;
            }
            if (ok) peaks = a;
        }
    }
    return { seq, pos: Math.min(DISPLAY_BINS - 1, pos), peaks, header };
}

/** 64 hex digits -> 32 bytes. Null for anything else (a half-written or
 *  unrelated string must never paint the grid). */
export function parsePadLeds(raw: string | null | undefined): Uint8Array | null {
    if (!raw || raw.length < PAD_LED_COUNT * 2) return null;
    const out = new Uint8Array(PAD_LED_COUNT);
    for (let i = 0; i < PAD_LED_COUNT; i++) {
        const v = parseInt(raw.substr(i * 2, 2), 16);
        if (!(v >= 0)) return null;
        out[i] = v;
    }
    return out;
}

/** The palette colour a pad shows this tick (blink resolved). */
export function padLedColor(entry: number, tickNo: number): number {
    const color = entry & 0x7F;
    if (!(entry & 0x80)) return color;
    return Math.floor(tickNo / BLINK_TICKS) % 2 === 0 ? color : 0;
}

/** "<seq>:<text>" -> parts. Null when it does not parse. */
export function parseStatus(raw: string | null | undefined): { seq: number; text: string } | null {
    if (!raw) return null;
    const i = raw.indexOf(':');
    if (i < 1) return null;
    const seq = parseInt(raw.slice(0, i), 10);
    if (!(seq >= 0)) return null;
    return { seq, text: raw.slice(i + 1) };
}

interface TrackFeedback {
    leds: Uint8Array | null;
    seq: number;            // -1 = nothing seen yet
    display: DisplayState | null;
}

const tracks = new Map<number, TrackFeedback>();
let pollTick = 0;
let displayDirty = false;
let lastActivity = -1e12;

function stateOf(track: number): TrackFeedback {
    let st = tracks.get(track);
    if (!st) { st = { leds: null, seq: -1, display: null }; tracks.set(track, st); }
    return st;
}

/** Call once per UI tick for the active track. `read` fetches a param of the
 *  track's synth by key. Returns text to toast, or null. */
export function feedbackPoll(
    track: number, keys: FeedbackKeys, read: (key: string) => string | null,
): string | null {
    pollTick++;
    if (pollTick % POLL_EVERY !== 0) return null;
    const st = stateOf(track);
    if (keys.ledsKey) st.leds = parsePadLeds(read(keys.ledsKey));
    if (keys.displayKey) {
        const d = parseDisplay(read(keys.displayKey), st.display);
        if (d && (!st.display || d.seq !== st.display.seq || d.pos !== st.display.pos
                  || d.header !== st.display.header)) displayDirty = true;
        st.display = d;
    }
    if (!keys.textKey) return null;
    const s = parseStatus(read(keys.textKey));
    if (!s) return null;
    const first = st.seq < 0;
    const changed = s.seq !== st.seq;
    st.seq = s.seq;
    return !first && changed && s.text ? s.text : null;
}

/** Latest pad colours for a track, or null (not declared / not read yet). */
export function feedbackLeds(track: number): Uint8Array | null {
    return tracks.get(track)?.leds ?? null;
}

/** Forget a track (its module changed) so stale colours/seq never leak. */
export function feedbackForget(track: number): void { tracks.delete(track); }

export function feedbackReset(): void { tracks.clear(); pollTick = 0; displayDirty = false; lastActivity = -1e12; }
export function feedbackTickNo(): number { return pollTick; }

/** Latest display state for a track, or null. */
export function feedbackDisplay(track: number): DisplayState | null {
    return tracks.get(track)?.display ?? null;
}

/** True once after the display changed (playhead, peaks or header): the
 *  caller repaints the frame. */
export function displayTakeDirty(): boolean {
    const d = displayDirty;
    displayDirty = false;
    return d;
}

/** A knob or the jog was touched/turned: the knob page owns the screen for
 *  DISPLAY_IDLE_MS. */
export function displayActivity(nowMs: number): void { lastActivity = nowMs; }

/** Whether the display view (rather than the knob page) should be on screen. */
export function displayShowing(nowMs: number, keys: FeedbackKeys | null, track: number): boolean {
    if (!keys || !keys.displayKey) return false;
    if (nowMs - lastActivity < DISPLAY_IDLE_MS) return false;
    return !!tracks.get(track)?.display;
}

/** The write that Delete + pad turns into: [key, value], or null when the
 *  module does not declare delete_pad_param or the pad is not in the rack. */
export function deletePadWrite(keys: FeedbackKeys | null, rackPad1: number): [string, string] | null {
    if (!keys || !keys.deleteKey || !(rackPad1 >= 1)) return null;
    return [keys.deleteKey, String(rackPad1 - 1)];
}
