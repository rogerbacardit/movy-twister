/* ext-param.ts — a Twister knob turn or push, applied to the parameter under
 * that knob. The pure half (which parameters are stepped, zones, wire form) is
 * midi/ext-param-steps.ts.
 *
 * PUSH = BACK TO THE PRESET. The first time a parameter is turned — by the
 * Twister or the Move's own knob (midi/router.ts calls extBaseNote) — its value
 * is kept as the base; a push writes it back. The bases of a module are
 * forgotten when its preset changes (encoder 3, or knob 1 on the preset page),
 * so the newly loaded preset becomes the base. Kept after a reset, so it can
 * be pushed again.
 */

import { appState } from '../app/state.js';
import { pageOwnerOf, type PageOwner, type PageRef } from '../app/page-owner.js';
import { pageSourceFor } from '../renderer/schwung-grid.js';
import { onMidiMessageInternal, knobModel } from './router.js';
import { stepCount, valueAt, wireOf, type StepInfo } from './ext-param-steps.js';
import { twisterTouched } from './ext-follow.js';
import { mlog } from '../log.js';

const bases = new Map<string, number>();
const idOf = (ref: PageRef, ioKey: string): string => ref.track + ':' + ref.componentKey + ':' + ioKey;

/** Forget the bases of one module (its preset changed). */
export function extBaseForget(ref: PageRef | null): void {
    if (!ref) return;
    const pre = ref.track + ':' + ref.componentKey + ':';
    for (const id of Array.from(bases.keys())) if (id.startsWith(pre)) bases.delete(id);
}

/** A knob is about to turn: keep the parameter's base if it has none. Knob 1
 *  with no parameter but a lit level is the preset list turning. */
export function extBaseNote(owner: PageOwner, knob: number, info: any | null): void {
    const ref = owner.ref;
    if (!ref) return;
    if (!info) {
        if (knob === 0 && owner.page) {
            const lv = owner.page.knobLevels();
            if (lv && lv[0] !== null && lv[0] !== undefined) extBaseForget(ref);
        }
        return;
    }
    const id = idOf(ref, info.ioKey);
    if (!bases.has(id)) bases.set(id, info.value);
}

function write(ref: PageRef, info: StepInfo & { ioKey: string }, value: number): void {
    const src = pageSourceFor(ref.track, ref.componentKey);
    if (!src) return;
    src.setParam(ref.componentKey + ':' + info.ioKey, wireOf(info, value));
    appState.dirty = true;
}

/** A Twister knob turned: steps for a continuous parameter, the ring's
 *  position for a stepped one. */
export function extKnobTurn(knob: number, delta: number, pos: number): void {
    twisterTouched(knob);
    const owner = pageOwnerOf(knobModel());
    const info = owner.ref && owner.page ? owner.knobParamInfo(knob) : null;
    const n = stepCount(info);
    if (!n || !owner.ref) {
        onMidiMessageInternal([0xB0, MoveKnob1 + knob, delta >= 0 ? delta : 128 + delta]);
        return;
    }
    extBaseNote(owner, knob, info);
    const v = valueAt(info, n, pos);
    /* The page re-reads the value a few ticks later, so until then info.value
     * is the old one: without `zoneSent` every CC in between rewrote it. */
    const zone = idOf(owner.ref, info.ioKey) + '=' + v;
    if (v === Math.round(info.value)) { zoneSent[knob] = ''; return; }
    if (zoneSent[knob] === zone) return;
    zoneSent[knob] = zone;
    write(owner.ref, info, v);
}
const zoneSent: string[] = [];

/** A Twister knob pushed: back to the base, if it has moved since. */
export function extKnobReset(knob: number): void {
    const owner = pageOwnerOf(knobModel());
    const ref = owner.ref;
    if (!ref || !owner.page) return;
    const info = owner.knobParamInfo(knob);
    if (!info) return;
    const base = bases.get(idOf(ref, info.ioKey));
    mlog('extReset k=' + knob + ' ' + info.ioKey + ' now=' + info.value + ' base=' + base);
    if (base === undefined || base === info.value) return;
    zoneSent[knob] = '';
    write(ref, info, base);
}
