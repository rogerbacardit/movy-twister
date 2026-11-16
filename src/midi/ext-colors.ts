/* ext-colors.ts — a Twister's assigned rings wear the active track's colour,
 * so the controller and the Move say the same thing about which track the
 * knobs edit.
 *
 * Channel 2 CC n sets encoder n's colour as a Twister hue (1-126), which is
 * not the Move's palette — TW_HUE translates the four track colours. Any
 * other colour falls back to green. Repainted only when the hue changes (and
 * after a reconnect), so a steady track costs no MIDI.
 */

import { appState } from '../app/state.js';
import { twisterSend } from './ext-out.js';
import { trackColor, GREEN_T, BLUE_T, ORANGE_T, PURPLE_T } from '../seq/colors.js';
import { TW_ASSIGNED } from './ext-knob-map.js';
import { mlog } from '../log.js';

export const TW_HUE_DEFAULT = 50;   /* green */
export const TW_HUE: Readonly<Record<number, number>> = {
    [GREEN_T]: 50, [BLUE_T]: 1, [ORANGE_T]: 72, [PURPLE_T]: 104,
};

let painted = -1;

/** The Twister hue for a Move palette colour. */
export function twisterHue(color: number): number {
    return TW_HUE[color] ?? TW_HUE_DEFAULT;
}

/** Forget what was painted: the next sync repaints (a reconnect). */
export function twisterColorsReset(): void {
    painted = -1;
}

/* Channel 3 CC n is encoder n's animation byte: 17..47 is RGB brightness
 * (off..full), 65..95 the indicator's. The whole controller is repainted with
 * the colour — 43 messages, which is why they go through midi/ext-out.ts's
 * paced queue: sent at once, all but one USB packet's worth were lost. */
const ASSIGNED = new Set(TW_ASSIGNED);

/** Paint the controller for the active track's colour, if it changed:
 *  assigned encoders lit in that colour, the rest dark. */
export function twisterColorSync(): void {
    const hue = twisterHue(trackColor(appState.activeTrack.index));
    if (hue === painted) return;
    painted = hue;
    mlog('twister colour track=' + (appState.activeTrack.index + 1) + ' hue=' + hue);
    for (let enc = 0; enc < 16; enc++) {
        if (ASSIGNED.has(enc)) {
            twisterSend([0x0B, 0xB1, enc, hue]);
            twisterSend([0x0B, 0xB2, enc, 47]);
            twisterSend([0x0B, 0xB2, enc, 95]);
        } else {
            twisterSend([0x0B, 0xB2, enc, 17]);
            twisterSend([0x0B, 0xB2, enc, 65]);
        }
    }
}
