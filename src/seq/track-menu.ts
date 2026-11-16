/* The track menu: Shift + a track button. A list drawn like Settings
 * (flags-view.ts): FREEZE T3 (UNFREEZE T3 on a frozen track), acted on by a
 * jog click, and MIDI IN, the USB-A channel that plays the track
 * (track/midi-in.ts), turned by knob 1. The jog picks the row, Back closes. It opens for the pressed track
 * WITHOUT switching to it (user, 2026-11-08): freeze T5 while working on T2.
 *
 * Unfreeze with the transport running stops it (the synth reload blocks the
 * audio, lib.rs `unfrz`): the first click arms (`CONFIRM?`, the hint saying
 * play stops), the second unfreezes — Settings' click-twice pattern (migrate-action.ts). */

import { seqState } from './state.js';
import { isFrozen, freezeConfirm } from './freeze.js';
import type { FlagsPageVM } from './flags-page-vm.js';
import { midiInLabel, stepTrackMidiIn, trackMidiIn } from '../track/midi-in.js';
import { markUiStateDirty } from './ui-dirty.js';

export const ROW_FREEZE = 0;
export const ROW_MIDI_IN = 1;
const ROWS = 2;

const state = { track: -1, armed: false, row: ROW_FREEZE };

export function trackMenuActive(): boolean {
    return state.track >= 0;
}

export function trackMenuTrack(): number {
    return state.track;
}

export function openTrackMenu(track: number): void {
    state.track = track;
    state.armed = false;
    state.row = ROW_FREEZE;
}

export function trackMenuRow(): number {
    return state.row;
}

/** Jog: move between the rows. Leaving FREEZE drops an armed confirm. */
export function trackMenuJog(dir: number): void {
    const next = Math.max(0, Math.min(ROWS - 1, state.row + (dir > 0 ? 1 : -1)));
    if (next !== state.row) state.armed = false;
    state.row = next;
}

/** Knob 1 on the MIDI IN row steps the channel. */
export function trackMenuKnob(dir: number): void {
    if (state.track < 0 || state.row !== ROW_MIDI_IN || dir === 0) return;
    stepTrackMidiIn(state.track, dir);
    markUiStateDirty();   // the Set saves it (seq/set-save.ts), or it is gone on close
}

export function closeTrackMenu(): void {
    state.track = -1;
    state.armed = false;
}

function stops(): boolean {
    return isFrozen(state.track) && seqState.playing;
}

/** Jog click on the row. `name` is the track's synth, while it is loaded (the
 *  frozen screen names it afterwards). */
export function trackMenuClick(name: string): void {
    const t = state.track;
    if (t < 0 || state.row !== ROW_FREEZE) return;
    if (stops() && !state.armed) {
        state.armed = true;
        return;
    }
    freezeConfirm(t, isFrozen(t), name);
    closeTrackMenu();
}

/** Changes whenever the menu would draw differently (freeze-screen.ts). */
export function trackMenuSig(): string {
    return state.track < 0 ? '' : state.track + (state.armed ? 'a' : '') + (isFrozen(state.track) ? 'f' : '')
        + (seqState.playing ? 'p' : '') + 'r' + state.row + 'm' + trackMidiIn(state.track);
}

export function buildTrackMenuVM(): FlagsPageVM {
    const label = 'T' + (state.track + 1);
    const frozen = isFrozen(state.track);
    /* An arm the transport no longer needs (Stop pressed meanwhile) is gone. */
    if (!stops()) state.armed = false;
    const onMidi = state.row === ROW_MIDI_IN;
    return {
        rows: [{ name: (frozen ? 'UNFREEZE ' : 'FREEZE ') + label,
                 value: state.armed ? 'CONFIRM?' : '>', selected: !onMidi },
               { name: 'MIDI IN', value: midiInLabel(trackMidiIn(state.track)), selected: onMidi }],
        selected: state.row,
        hint: onMidi ? 'Knob 1: USB channel. SEL: selected track.'
            : state.armed ? 'Click again: play stops, the synth comes back.'
            : frozen ? 'Brings the synth back.' + (stops() ? ' Stops play.' : '')
                     : 'Records every clip. Saves CPU.',
    };
}

export function resetTrackMenu(): void {
    closeTrackMenu();
}
