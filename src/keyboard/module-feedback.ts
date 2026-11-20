/* What a sound_generator can say back to movy: pad colours and a line of text.
 *
 * A module opts in by naming the params in its ui_hierarchy root (the same
 * place `focus_press_param` lives):
 *
 *   "pad_leds_param":    "pad_leds"      read-only string, 64 hex digits
 *   "status_text_param": "status_text"   read-only string, "<seq>:<text>"
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
 * Cost: two get_param reads, only for the ACTIVE track, only every
 * POLL_EVERY ticks (~25 Hz at the device's ~196 ticks/s). A module that
 * declares nothing costs nothing.
 *
 * Pure: no platform globals, so the logic suite drives it directly. */

export const PAD_LED_COUNT = 32;
export const POLL_EVERY    = 8;
/* Blink half-period in ticks: ~0.5 s at ~196 ticks/s. */
export const BLINK_TICKS   = 98;

export interface FeedbackKeys {
    ledsKey: string | null;
    textKey: string | null;
}

/** The two keys out of a ui_hierarchy root, or null when it declares neither. */
export function feedbackKeysOf(hierarchy: any): FeedbackKeys | null {
    if (!hierarchy || typeof hierarchy !== 'object') return null;
    const l = typeof hierarchy.pad_leds_param === 'string' && hierarchy.pad_leds_param
        ? hierarchy.pad_leds_param : null;
    const t = typeof hierarchy.status_text_param === 'string' && hierarchy.status_text_param
        ? hierarchy.status_text_param : null;
    return l || t ? { ledsKey: l, textKey: t } : null;
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
}

const tracks = new Map<number, TrackFeedback>();
let pollTick = 0;

function stateOf(track: number): TrackFeedback {
    let st = tracks.get(track);
    if (!st) { st = { leds: null, seq: -1 }; tracks.set(track, st); }
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

export function feedbackReset(): void { tracks.clear(); pollTick = 0; }
export function feedbackTickNo(): number { return pollTick; }
