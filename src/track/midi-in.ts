/* A track's MIDI IN: the USB-A channel that plays it whatever is selected
 * (1-16), or SEL — follow the selection, the default and movy's behaviour
 * before this existed. Lets a controller that sends several channels at once
 * (a KeyStep Pro's four sequencer tracks) play several tracks.
 *
 * Machine-level, in prefs.json (seq/prefs.ts): the same in every set, new or
 * old, because it describes the rig on USB-A, not the song. Loaded on first
 * use and saved on every change. The engine is told through `extmap`
 * (track/ext-route.ts); the recording side asks `trackForChannel`
 * (midi/external.ts). */

import { TRACK_COUNT } from './ref.js';
import { readPrefMidiIn, writePrefMidiIn } from '../seq/prefs.js';

export const MIDI_IN_SEL = 0;
export const MIDI_IN_MAX = 16;

const midiIn: number[] = new Array(TRACK_COUNT).fill(MIDI_IN_SEL);
let loaded = false;

const clamp = (v: unknown): number =>
    typeof v === 'number' && isFinite(v) ? Math.max(MIDI_IN_SEL, Math.min(MIDI_IN_MAX, v | 0)) : MIDI_IN_SEL;

/* Read the prefs once, on first use: after boot, before anything asks. */
function load(): void {
    if (loaded) return;
    loaded = true;
    restoreMidiIn(readPrefMidiIn());
}

export function trackMidiIn(track: number): number {
    load();
    return midiIn[track] ?? MIDI_IN_SEL;
}

export function setTrackMidiIn(track: number, ch: number): void {
    load();
    if (track >= 0 && track < TRACK_COUNT) midiIn[track] = clamp(ch);
}

/** Persist the current channels (a menu turn). */
export function saveMidiIn(): void {
    load();
    writePrefMidiIn(midiIn);
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
    load();
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

/** Back to all SEL in memory (tests; a set load does NOT call this). */
export function resetMidiIn(): void {
    loaded = true;
    midiIn.fill(MIDI_IN_SEL);
}
