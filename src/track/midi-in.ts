/* A track's MIDI IN: the USB-A channel that plays it whatever is selected
 * (1-16), or SEL — follow the selection, the default and movy's behaviour
 * before this existed. Lets a controller that sends several channels at once
 * (a KeyStep Pro's four sequencer tracks) play several tracks.
 *
 * Per Set: carried in the UI blob beside the octaves (seq/ui-state.ts). The
 * engine is told through `extmap` (track/ext-route.ts); the recording side
 * asks `trackForChannel` (midi/external.ts). */

import { TRACK_COUNT } from './ref.js';

export const MIDI_IN_SEL = 0;
export const MIDI_IN_MAX = 16;

const midiIn: number[] = new Array(TRACK_COUNT).fill(MIDI_IN_SEL);

const clamp = (v: unknown): number =>
    typeof v === 'number' && isFinite(v) ? Math.max(MIDI_IN_SEL, Math.min(MIDI_IN_MAX, v | 0)) : MIDI_IN_SEL;

export function trackMidiIn(track: number): number {
    return midiIn[track] ?? MIDI_IN_SEL;
}

export function setTrackMidiIn(track: number, ch: number): void {
    if (track >= 0 && track < TRACK_COUNT) midiIn[track] = clamp(ch);
}

/** One knob detent: SEL, 1, 2 … 16, stopping at the ends. */
export function stepTrackMidiIn(track: number, dir: number): void {
    setTrackMidiIn(track, trackMidiIn(track) + (dir > 0 ? 1 : -1));
}

export function midiInLabel(ch: number): string {
    return ch === MIDI_IN_SEL ? 'SEL' : 'CH ' + ch;
}

/**
 * The track channel `ch` (1-16) plays, or -1 when no track claims it (it then
 * follows the selection). Two tracks on one channel: the lower one wins — one
 * channel, one destination, so the engine and the recording always agree.
 */
export function trackForChannel(ch: number): number {
    if (ch < 1 || ch > MIDI_IN_MAX) return -1;
    return midiIn.indexOf(ch);
}

export function midiInSnapshot(): number[] {
    return midiIn.slice();
}

/** Tolerant: an absent or malformed value (a Set from before this) is all SEL. */
export function restoreMidiIn(v: unknown): void {
    for (let t = 0; t < TRACK_COUNT; t++) midiIn[t] = Array.isArray(v) ? clamp(v[t]) : MIDI_IN_SEL;
}

export function resetMidiIn(): void {
    midiIn.fill(MIDI_IN_SEL);
}
