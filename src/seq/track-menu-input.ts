/* The track menu's input (seq/track-menu.ts), first look in the router while
 * it is open: Back or a jog click closes, knob 1 and the jog turn MIDI IN,
 * every other press is swallowed (releases pass, so nothing held at the open
 * sticks). */

import { closeTrackMenu, trackMenuActive, trackMenuKnob } from './track-menu.js';

/** `true` = consumed. */
export function trackMenuMidi(data: number[]): boolean {
    if (!trackMenuActive()) return false;
    const type = data[0] & 0xF0, d1 = data[1], d2 = data[2];
    const press = (type === 0x90 || type === 0xB0) && d2 > 0;
    if (type === 0xB0 && (d1 === MoveBack || d1 === MoveMainButton) && d2 > 0) { closeTrackMenu(); return true; }
    if (type === 0xB0 && (d1 === MoveKnob1 || d1 === MoveMainKnob)) { trackMenuKnob(decodeDelta(d2)); return true; }
    /* Knob touches (notes 0-9) and turns are presses too. */
    return press || type === 0xA0 || type === 0xE0;
}
