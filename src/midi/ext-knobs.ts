/* ext-knobs.ts — dispatch for an external knob controller on USB-A. What each
 * CC means is midi/ext-knob-map.ts; this replays it and keeps a Twister's
 * rings honest.
 */

import { appState } from '../app/state.js';
import { pageOwnerOf } from '../app/page-owner.js';
import { onMidiMessageInternal, knobModel } from './router.js';
import { createExtKnobState, extKnobActions, isTwisterCc } from './ext-knob-map.js';
import { armTwisterFollow, setTwisterSync } from './ext-follow.js';
import { extBaseForget, extKnobReset, extKnobTurn } from './ext-param.js';

const state = createExtKnobState();
setTwisterSync((cc, v) => state.abs.set('tw' + cc, v));

/* A Twister forgets its ring colours on reconnect, and nothing tells us it
 * reconnected — so the rings are repainted whenever CCs resume after a quiet
 * spell. */
const WAKE_GAP_MS = 10000;
let lastCcMs = 0;

/* Step the preset list of the module the knobs edit, from whatever page is on
 * screen — the page layer lands on the preset door, steps, and comes back. */
function presetTurn(delta: number): void {
    const owner = pageOwnerOf(knobModel());
    if (owner.page && owner.page.presetStep(delta)) {
        extBaseForget(owner.ref);    /* the new preset is what a push returns to */
        appState.dirty = true;
    }
}

export function onExternalControlChange(data: number[]): void {
    const ch = (data[0] & 0x0F) + 1;
    /* Only the Twister's own CCs wake it: a KeyStep on the same hub sends CCs
     * all the time, and counting them kept the gap from ever opening (or
     * armed a follow with no Twister there). */
    if (isTwisterCc(ch, data[1] & 0x7F)) {
        const now = Date.now();
        if (now - lastCcMs > WAKE_GAP_MS) {
            /* A reconnect: the follow repaints the controller (midi/ext-colors.ts),
             * then the rings follow the parameters, and the absolute decoder
             * counts from where each ring was put (midi/ext-follow.ts). */
            armTwisterFollow((cc, v) => state.abs.set('tw' + cc, v));
        }
        lastCcMs = now;
    }
    for (const a of extKnobActions(state, ch, data[1] & 0x7F, data[2] & 0x7F)) {
        if (a.kind === 'cc') onMidiMessageInternal([0xB0, a.cc, a.value]);
        else if (a.kind === 'knob') extKnobTurn(a.knob, a.delta, a.pos);
        else if (a.kind === 'reset') extKnobReset(a.knob);
        else presetTurn(a.delta);
    }
}
