/* browser-test/logic/ext-knobs.mjs — an external knob controller on USB-A
 * (midi/ext-knob-map.ts): which Move control each CC stands for.
 *
 * Run by browser-test/logic.mjs.
 */

import { eq, _log } from './harness.mjs';

export async function run() {
    _log('\nexternal knob controller:');
    const m = await import('../../dist/esm/midi/ext-knob-map.js');
    const { createExtKnobState, extKnobActions, TW_JOG_STEPS } = m;
    const K1 = globalThis.MoveKnob1, JOG = globalThis.MoveMainKnob;
    const show = (as) => as.map((a) => a.kind === 'cc' ? `cc${a.cc}:${a.value}`
        : a.kind === 'knob' ? `knob${a.knob}:${a.delta}@${a.pos}`
        : a.kind === 'reset' ? `reset${a.knob}` : `preset:${a.delta}`).join(' ');

    let st = createExtKnobState();
    const act = (ch, cc, v) => show(extKnobActions(st, ch, cc, v));

    /* Schwung's convention, any channel. */
    eq('CC 71 relative up turns knob 1', act(5, 71, 1), `cc${K1}:1`);
    eq('CC 78 relative down turns knob 8', act(1, 78, 127), `cc${K1 + 7}:127`);
    eq('a relative zero moves nothing', act(1, 72, 0), '');
    eq('CC 102 absolute: the first value only sets the origin', act(1, 102, 40), '');
    eq('CC 102 absolute: +3 from there', act(1, 102, 43), `cc${K1}:3`);
    eq('CC 102 absolute: -2 is two\'s complement', act(1, 102, 41), `cc${K1}:126`);

    /* A factory-default Twister: rows 3-4 are knobs 1-8. */
    st = createExtKnobState();
    act(1, 8, 64);
    eq('Twister CC 8 is knob 1, with its ring position', act(1, 8, 65), 'knob0:1@65');
    act(1, 15, 10);
    eq('Twister CC 15 is knob 8, signed', act(1, 15, 9), 'knob7:-1@9');

    /* Encoder 2 sends CC 1 — the engine's mod wheel. Never a knob. */
    act(1, 1, 10);
    eq('Twister CC 1 (mod wheel) maps to nothing', act(1, 1, 20), '');

    /* The jog is geared down. */
    act(1, 0, 0);
    eq('the jog holds a sub-step turn', act(1, 0, TW_JOG_STEPS - 1), '');
    eq('the jog steps once a full gear is reached', act(1, 0, TW_JOG_STEPS), `cc${JOG}:1`);
    eq('and back down', act(1, 0, 0), `cc${JOG}:127`);

    /* Pushes on channel 2. */
    eq('encoder 1 push is the jog click', act(2, 0, 127), `cc${globalThis.MoveMainButton}:127`);
    eq('encoder 1 release releases it', act(2, 0, 0), `cc${globalThis.MoveMainButton}:0`);
    eq('encoder 4 push is Back', act(2, 3, 127), `cc${globalThis.MoveBack}:127`);
    eq('an unassigned push does nothing', act(2, 6, 127), '');
    eq('encoder 9 push resets knob 1', act(2, 8, 127), 'reset0');
    eq('encoder 16 push resets knob 8', act(2, 15, 127), 'reset7');
    eq('a knob encoder release does nothing', act(2, 8, 0), '');

    /* Encoder 3 steps presets. */
    act(1, 2, 50);
    eq('encoder 3 steps the preset list', act(1, 2, 49), 'preset:-1');

    /* Only the Twister's own CCs wake it (midi/ext-knobs.ts). */
    eq('a Twister turn is the Twister', m.isTwisterCc(1, 12), true);
    eq('a Twister push is the Twister', m.isTwisterCc(2, 8), true);
    eq('a KeyStep CC on channel 4 is not', m.isTwisterCc(4, 12), false);
    eq('CC 74 on channel 1 is not', m.isTwisterCc(1, 74), false);

    /* Stepped parameters follow the ring's position (midi/ext-param-steps.ts). */
    const sp = await import('../../dist/esm/midi/ext-param-steps.js');
    const en3 = { type: 'enum', value: 0, min: 0, max: 2, options: ['A', 'B', 'C'] };
    eq('an enum of 3 is stepped', sp.stepCount(en3), 3);
    eq('a float is continuous', sp.stepCount({ type: 'float', value: 0, min: 0, max: 1 }), 0);
    eq('a wide int is continuous', sp.stepCount({ type: 'int', value: 0, min: 0, max: 127 }), 0);
    eq('an int 1..4 is stepped', sp.stepCount({ type: 'int', value: 1, min: 1, max: 4 }), 4);
    eq('an on/off is stepped', sp.stepCount({ type: 'int', value: 0, min: 0, max: 1 }), 2);
    eq('ring 0 is the first option', sp.valueAt(en3, 3, 0), 0);
    eq('ring 64 is the middle option', sp.valueAt(en3, 3, 64), 1);
    eq('ring 127 is the last option', sp.valueAt(en3, 3, 127), 2);
    eq('an int zone is offset by min', sp.valueAt({ type: 'int', value: 1, min: 1, max: 4 }, 4, 127), 4);
    eq('an on/off flips at half travel', `${sp.valueAt({ type: 'int', min: 0, max: 1 }, 2, 63)}${sp.valueAt({ type: 'int', min: 0, max: 1 }, 2, 64)}`, '01');
    eq('an enum wires its index', sp.wireOf(en3, 2), '2');
    eq('an enum that wires names sends the name', sp.wireOf({ ...en3, wiresNames: true }, 1), 'B');
    eq('an int wires a whole number', sp.wireOf({ type: 'int', min: 0, max: 4 }, 3.0), '3');

    /* The rings leave a knob alone while it is being turned (midi/ext-follow.ts). */
    const fo = await import('../../dist/esm/midi/ext-follow.js');
    const out = await import('../../dist/esm/midi/ext-out.js');
    const drain = () => { while (out.twisterOutPending()) out.twisterOutFlush(); };
    drain();   /* the set-ready arm (seq/set-session.ts) queued rings earlier in the suite */
    const sent = [], colours = [];
    const was = globalThis.move_midi_external_send;
    globalThis.move_midi_external_send = (d) => { if (d[1] === 0xB0) sent.push(d[2] + '=' + d[3]); else colours.push(d[1].toString(16) + '/' + d[2] + ':' + d[3]); };
    try {
        fo.armTwisterFollow(() => {});
        fo.twisterTouched(0, 1000);
        fo.twisterFollow([0.5, null, null, null, null, null, null, null], 1100);
        drain();
        eq('a ring being turned is not resynced', sent.join(' '), '');
        fo.twisterFollow([0.5, null, null, null, null, null, null, null], 1500);
        drain();
        eq('it is resynced once it rests', sent.join(' '), '8=64');

        /* The assigned rings wear the active track's colour (midi/ext-colors.ts). */
        const co = await import('../../dist/esm/midi/ext-colors.js');
        const cs = await import('../../dist/esm/seq/colors.js');
        eq('track 1 is green on the Move', cs.trackColor(0), cs.GREEN_T);
        eq('track 2 is blue', cs.trackColor(1), cs.BLUE_T);
        eq('track 3 is orange', cs.trackColor(2), cs.ORANGE_T);
        eq('track 4 is purple', cs.trackColor(3), cs.PURPLE_T);
        eq('green is green on the Twister', co.twisterHue(cs.GREEN_T), 50);
        eq('an unknown colour falls back to green', co.twisterHue(999), co.TW_HUE_DEFAULT);
        eq('assigned encoders get the colour', colours.filter((c) => c.startsWith('b1/')).length, 11);
        eq('the 5 unassigned are put dark', colours.filter((c) => c.endsWith(':17')).length, 5);
        colours.length = 0;
        fo.twisterFollow([0.5, null, null, null, null, null, null, null], 2000);
        drain();
        eq('a steady track repaints nothing', colours.length, 0);

        /* Paced: a repaint is 43 messages, more than one USB packet holds
         * (midi/ext-out.ts). At most PER_TICK leave per tick, none is lost. */
        colours.length = 0;
        sent.length = 0;
        co.twisterColorsReset();
        fo.twisterFollow([0.5, null, null, null, null, null, null, null], 3000);
        const queued = out.twisterOutPending();
        eq('a repaint is queued, not sent at once', colours.length, 0);
        out.twisterOutFlush();
        eq('one tick sends at most PER_TICK', colours.length, out.PER_TICK);
        drain();
        eq('every queued message arrives', colours.length, queued);
        eq('both channel-3 settings of an encoder arrive',
            colours.filter((c) => c === 'b2/8:47' || c === 'b2/8:95').length, 2);

        /* Coalesced: a newer value for the same control replaces the queued one. */
        sent.length = 0;
        out.twisterSend([0x0B, 0xB0, 9, 10]);
        out.twisterSend([0x0B, 0xB0, 10, 20]);
        out.twisterSend([0x0B, 0xB0, 9, 30]);
        drain();
        eq('the last value wins, in its first place', sent.join(' '), '9=30 10=20');
    } finally {
        globalThis.move_midi_external_send = was;
    }
}
