/* A USB-A keyboard (cable 2). The ENGINE sounds it (ext_route.rs), at pad
 * latency; this side only RECORDS, through the pad path, so a key behaves like a
 * pad under Rec, step record and a held step. Wheels are played by the engine
 * and deliberately not recorded. Other CCs are an external knob controller's —
 * midi/ext-knobs.ts. */

import { appState } from '../app/state.js';
import { drumConfigFor } from '../track/pad-route.js';
import { extDrumPitch } from '../track/ext-route.js';
import { seqNotePadPlayed, seqNotePadReleased } from '../seq/router-pads.js';
import { EXT_KEY_BASE, extHold, extRelease } from './external-ledger.js';
import { onExternalControlChange } from './ext-knobs.js';
import { trackForChannel } from '../track/midi-in.js';

export function onMidiMessageExternal(data: number[]): void {
    if (!data || data.length < 3) return;
    const type = data[0] & 0xF0, note = data[1] & 0x7F, vel = data[2];
    if (type === 0xB0) { onExternalControlChange(data); return; }
    /* Keyed by channel too: the same key on two channels is two notes, on
     * two tracks once channels are claimed (track/midi-in.ts). */
    const ch = (data[0] & 0x0F) + 1;
    const key = EXT_KEY_BASE + (ch - 1) * 128 + note;
    if (type === 0x90 && vel > 0) {
        const claimed = trackForChannel(ch);
        const track = claimed >= 0 ? claimed : appState.activeTrack.index;
        const drum = drumConfigFor(track);
        const pitch = drum ? extDrumPitch(note, drum) : note;
        if (pitch < 0) return;
        /* A retrigger before the off: close the first capture so it is not orphaned. */
        const prev = extRelease(key);
        if (prev !== undefined) seqNotePadReleased(key, prev);
        extHold(key, track);
        seqNotePadPlayed(track, key, pitch, vel);
    } else if (type === 0x80 || type === 0x90) {
        const track = extRelease(key);
        if (track !== undefined) seqNotePadReleased(key, track);
    }
}
