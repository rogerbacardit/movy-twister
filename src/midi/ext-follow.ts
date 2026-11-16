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

import { platform } from '../platform/index.js';
import { TW_KNOB_BASE, EXT_KNOBS } from './ext-knob-map.js';

let armed = false;
let onSync: ((cc: number, v: number) => void) | null = null;
const sent: number[] = new Array(EXT_KNOBS).fill(-1);

/** Start following, and resend every ring on the next update (a reconnect). */
export function armTwisterFollow(sync: (cc: number, v: number) => void): void {
    armed = true;
    onSync = sync;
    sent.fill(-1);
}

/** Called with the knob LEDs' levels (0..1, null = nothing bound). */
export function twisterFollow(levels: readonly (number | null)[]): void {
    if (!armed) return;
    for (let k = 0; k < EXT_KNOBS; k++) {
        const lv = levels[k];
        if (lv === null || lv === undefined || !isFinite(lv)) continue;
        const v = Math.max(0, Math.min(127, Math.round(lv * 127)));
        if (sent[k] === v) continue;
        sent[k] = v;
        onSync?.(TW_KNOB_BASE + k, v);
        platform.externalSend([0x0B, 0xB0, TW_KNOB_BASE + k, v]);
    }
}
