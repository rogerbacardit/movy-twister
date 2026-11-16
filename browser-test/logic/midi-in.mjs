/* browser-test/logic/midi-in.mjs — a track's MIDI IN (track/midi-in.ts): a
 * claimed USB-A channel plays its track whatever is selected; the engine's
 * route, the recording, the Set and the track menu all agree on it.
 *
 * Run by browser-test/logic.mjs.
 */

import { eq, lastMusicalOp, _log } from './harness.mjs';

export async function run() {
    _log('\ntrack MIDI IN (channel per track):');
    const { installMockEngine, uninstallMockEngine } = await import('../mock-engine.mjs');
    const { seqEngineTick, resetSeqEngine } = await import('../../dist/esm/seq/engine.js');
    const { resetSeqState } = await import('../../dist/esm/seq/state.js');
    const { resetStepRec } = await import('../../dist/esm/seq/step-rec.js');
    const { resetSeqChord } = await import('../../dist/esm/seq/router-pads.js');
    const { selectTrack } = await import('../../dist/esm/track/focus.js');
    const { onMidiMessageExternal } = await import('../../dist/esm/midi/external.js');
    const mi = await import('../../dist/esm/track/midi-in.js');
    const { serializeUiState, applyUiState } = await import('../../dist/esm/seq/ui-state.js');
    const menu = await import('../../dist/esm/seq/track-menu.js');
    const { takeUiDirty } = await import('../../dist/esm/seq/ui-dirty.js');

    const engine = installMockEngine();
    const reset = () => { resetSeqEngine(); resetSeqState(); resetStepRec(); resetSeqChord(); engine.reset(); mi.resetMidiIn(); };
    const ext = (...b) => { onMidiMessageExternal(b); seqEngineTick(); };
    const lastOp = () => lastMusicalOp(engine.ops);

    /* Nothing claimed: the route is exactly what it always was. */
    reset(); selectTrack(0); seqEngineTick(); seqEngineTick();
    eq('no claim: the route is the active track alone', engine.params.extmap, '0');

    /* KeyStep Pro: ch 2 -> track 2, ch 4 -> track 4. */
    mi.setTrackMidiIn(1, 2);
    mi.setTrackMidiIn(3, 4);
    seqEngineTick();
    eq('claims ride after the active track', engine.params.extmap, '0;2:1;4:3');
    eq('channel 2 is track 2', mi.trackForChannel(2), 1);
    eq('an unclaimed channel follows the selection', mi.trackForChannel(5), -1);

    mi.setTrackMidiIn(5, 2);
    eq('two claims on one channel: the lower track wins', mi.trackForChannel(2), 1);
    mi.setTrackMidiIn(5, 0);

    /* Recording lands on the claimed track, whatever is selected. */
    ext(0x91, 60, 90);
    eq('ch 2 records on track 2', lastOp(), 'non 1 60 90');
    ext(0x93, 60, 80);
    eq('the same key on ch 4 is a second note, on track 4', lastOp(), 'non 3 60 80');
    ext(0x81, 60, 0);
    eq('its off closes the ch 2 note', lastOp(), 'nof 1 60');
    ext(0x83, 60, 0);
    eq('and the ch 4 one', lastOp(), 'nof 3 60');
    ext(0x90, 62, 70);
    eq('an unclaimed channel records on the active track', lastOp(), 'non 0 62 70');
    ext(0x80, 62, 0);

    /* The Set carries it; an old Set is all SEL. */
    const blob = serializeUiState();
    mi.resetMidiIn();
    applyUiState(blob);
    eq('MIDI IN round-trips through the UI blob', mi.trackMidiIn(3), 4);
    applyUiState(JSON.stringify({ oct: [4, 4] }));
    eq('a Set from before MIDI IN is all SEL', mi.trackMidiIn(3), 0);

    /* Steps clamp at SEL and 16. */
    mi.stepTrackMidiIn(6, -1);
    eq('below SEL stays SEL', mi.trackMidiIn(6), 0);
    for (let i = 0; i < 20; i++) mi.stepTrackMidiIn(6, 1);
    eq('above 16 stays 16', mi.trackMidiIn(6), 16);
    eq('labels', mi.midiInLabel(0) + '|' + mi.midiInLabel(16), 'SEL|CH 16');

    /* The track menu (v0.37: MIDI IN is its one row): knob 1 turns it. */
    mi.resetMidiIn();
    menu.openTrackMenu(2);
    takeUiDirty();
    eq('the menu opens for T3', menu.buildTrackMenuVM().rows[0].name, 'MIDI IN T3');
    menu.trackMenuKnob(1); menu.trackMenuKnob(1); menu.trackMenuKnob(1);
    eq('knob 1 turns the channel', menu.buildTrackMenuVM().rows[0].value, 'CH 3');
    eq('and it is the track\'s setting', mi.trackMidiIn(2), 3);
    eq('a turn marks the Set to be saved', takeUiDirty(), true);
    menu.closeTrackMenu();
    eq('Back closes the menu', menu.trackMenuActive(), false);

    uninstallMockEngine();
    reset();
}
