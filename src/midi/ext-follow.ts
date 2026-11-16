/* ext-follow.ts — a Twister's rings 9-16 follow the parameters knobs 1-8 edit.
 *
 * A factory Twister is absolute: its ring is where IT thinks the value is.
 * Without this, a parameter changed elsewhere (a preset, the Move's own knob,
 * another page) leaves the ring behind, and the encoder can hit its 0 or 127
 * end while the parameter is still mid-way — it then sends nothing more and
 * the parameter cannot reach its end. So each knob LED update also sets the
 * ring (channel 1, CC 8-15) to the parameter, and moves the origin the absolute
 * decoder counts from to match.
 *
 * Armed only once a controller has spoken (midi/ext-knobs.ts), so a Move with
 * nothing on USB-A sends nothing. Diffed per encoder: a quiet page costs no
 * MIDI at all.
 */

import { twisterSend } from './ext-out.js';
import { TW_KNOB_BASE, EXT_KNOBS } from './ext-knob-map.js';
import { twisterColorSync, twisterColorsReset } from './ext-colors.js';
import { mlog } from '../log.js';

let armed = false;
let onSync: ((cc: number, v: number) => void) | null = null;
const sent: number[] = new Array(EXT_KNOBS).fill(-1);

/* HANDS OFF A RING WHILE IT IS TURNED. A stepped parameter (an enum, a switch,
 * a short range) moves only every few Twister steps; snapping the ring back to
 * it on every update fought the hand — the encoder could never travel far
 * enough to reach the next value. So an encoder that sent within HOLD_MS is
 * left alone, and resynced once it rests. */
const HOLD_MS = 350;
const touchedMs: number[] = new Array(EXT_KNOBS).fill(0);

/** A Twister knob (0-7) was just turned. */
export function twisterTouched(knob: number, nowMs = Date.now()): void {
    if (knob < 0 || knob >= EXT_KNOBS) return;
    touchedMs[knob] = nowMs;
    sent[knob] = -1;    /* whatever it lands on is resent when it rests */
}

/** Start following, and resend every ring on the next update (a reconnect). */
export function armTwisterFollow(sync: (cc: number, v: number) => void): void {
    armed = true;
    mlog('twister follow armed');
    onSync = sync;
    sent.fill(-1);
    twisterColorsReset();
}

/** Called with the knob LEDs' levels (0..1, null = nothing bound). */
export function twisterFollow(levels: readonly (number | null)[], nowMs = Date.now()): void {
    if (!armed) return;
    twisterColorSync();    /* the rings wear the active track's colour */
    for (let k = 0; k < EXT_KNOBS; k++) {
        if (nowMs - touchedMs[k] < HOLD_MS) continue;
        const lv = levels[k];
        if (lv === null || lv === undefined || !isFinite(lv)) continue;
        const v = Math.max(0, Math.min(127, Math.round(lv * 127)));
        if (sent[k] === v) continue;
        sent[k] = v;
        onSync?.(TW_KNOB_BASE + k, v);
        twisterSend([0x0B, 0xB0, TW_KNOB_BASE + k, v]);
    }
}
