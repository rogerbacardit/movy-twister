/* The track menu: Shift + a track button. A list drawn like Settings
 * (flags-view.ts). On this branch (v0.37.0, before Freeze existed) its one
 * row is MIDI IN, the USB-A channel that plays the track (track/midi-in.ts):
 * knob 1 or the jog turns it, a jog click or Back closes. It opens for the
 * pressed track WITHOUT switching to it. */

import type { FlagsPageVM } from './flags-page-vm.js';
import { midiInLabel, saveMidiIn, stepTrackMidiIn, trackMidiIn } from '../track/midi-in.js';

const state = { track: -1 };

export function trackMenuActive(): boolean {
    return state.track >= 0;
}

export function trackMenuTrack(): number {
    return state.track;
}

export function openTrackMenu(track: number): void {
    state.track = track;
}

export function closeTrackMenu(): void {
    state.track = -1;
}

/** Knob 1 (or the jog) steps the channel. */
export function trackMenuKnob(dir: number): void {
    if (state.track < 0 || dir === 0) return;
    stepTrackMidiIn(state.track, dir);
    saveMidiIn();   // machine-level: every set, new or old, plays the same channels
}

export function buildTrackMenuVM(): FlagsPageVM {
    return {
        rows: [{ name: 'MIDI IN T' + (state.track + 1),
                 value: midiInLabel(trackMidiIn(state.track)), selected: true }],
        selected: 0,
        hint: 'Knob 1: USB channel. SEL: selected track.',
    };
}

export function resetTrackMenu(): void {
    closeTrackMenu();
}
