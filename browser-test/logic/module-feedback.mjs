/* browser-test/logic/module-feedback.mjs — a module's pad colours and status
 * text (keyboard/module-feedback.ts).
 *
 * Run by browser-test/logic.mjs.
 */

import { eq, _log } from './harness.mjs';

export async function run() {
    _log('\nmodule feedback (pad_leds / status_text):');
    const m = await import('../../dist/esm/keyboard/module-feedback.js');
    const { feedbackKeysOf, parsePadLeds, padLedColor, parseStatus, feedbackPoll,
            feedbackLeds, feedbackReset, POLL_EVERY, BLINK_TICKS } = m;

    eq('no declaration -> null', feedbackKeysOf({ pad_layout: 'drums' }), null);
    eq('both keys read', JSON.stringify(feedbackKeysOf({ pad_leds_param: 'pad_leds', status_text_param: 'status_text' })),
       '{"ledsKey":"pad_leds","textKey":"status_text","displayKey":null,"deleteKey":null}');
    eq('one key is enough', JSON.stringify(feedbackKeysOf({ status_text_param: 't' })),
       '{"ledsKey":null,"textKey":"t","displayKey":null,"deleteKey":null}');
    eq('display and delete keys read', JSON.stringify(feedbackKeysOf({ display_param: 'd', delete_pad_param: 'x' })),
       '{"ledsKey":null,"textKey":null,"displayKey":"d","deleteKey":"x"}');

    eq('short string is rejected', parsePadLeds('0102'), null);
    eq('non-hex is rejected', parsePadLeds('zz'.repeat(32)), null);
    const hex = Array.from({ length: 32 }, (_, i) => (i === 3 ? 'FF' : i.toString(16).padStart(2, '0'))).join('');
    const arr = parsePadLeds(hex);
    eq('32 entries parsed', arr.length, 32);
    eq('entry 2 is 2', arr[2], 2);
    eq('entry 3 is 0xFF', arr[3], 255);

    eq('steady colour', padLedColor(0x0B, 0), 11);
    eq('blink on-phase shows the colour', padLedColor(0x80 | 127, 0), 127);
    eq('blink off-phase is black', padLedColor(0x80 | 127, BLINK_TICKS), 0);
    eq('blink returns', padLedColor(0x80 | 127, 2 * BLINK_TICKS), 127);

    eq('status parses', JSON.stringify(parseStatus('12:MUTE 2')), '{"seq":12,"text":"MUTE 2"}');
    eq('status text may hold a colon', parseStatus('3:A:B').text, 'A:B');
    eq('status without seq is rejected', parseStatus('MUTE'), null);

    /* Poller: throttled, first value silent, a new seq toasts once. */
    feedbackReset();
    const keys = { ledsKey: 'pad_leds', textKey: 'status_text' };
    let reads = 0, text = '0:', leds = hex;
    const read = (k) => { reads++; return k === 'pad_leds' ? leds : text; };
    const run = (n) => { let out = []; for (let i = 0; i < n; i++) { const r = feedbackPoll(1, keys, read); if (r) out.push(r); } return out; };
    eq('reads happen once per POLL_EVERY ticks only', (run(POLL_EVERY - 1), reads), 0);
    run(1);
    eq('one poll = two reads', reads, 2);
    eq('first value is remembered, not shown', run(POLL_EVERY * 2).length, 0);
    text = '1:REC 1';
    eq('a new seq toasts once', JSON.stringify(run(POLL_EVERY * 3)), '["REC 1"]');
    text = '2:REC 1';
    eq('the same text with a new seq toasts again', JSON.stringify(run(POLL_EVERY)), '["REC 1"]');
    eq('colours are kept per track', feedbackLeds(1)[3], 255);
    eq('another track has none', feedbackLeds(2), null);
    /* A track first seen with seq > 0 stays silent too. */
    feedbackReset();
    text = '9:STOP 3';
    eq('first sight of a non-zero seq is silent', run(POLL_EVERY).length, 0);

    /* ── display_param: "<seq>|<pos>|<peaks>|<header>" ── */
    const { parseDisplay, feedbackDisplay, displayTakeDirty, displayActivity, displayShowing,
            deletePadWrite, DISPLAY_IDLE_MS } = m;
    const peaks = Array.from({ length: 128 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
    const d1 = parseDisplay('7|42|' + peaks + '|PLAY 1 - 4 BARS');
    eq('display seq', d1.seq, 7);
    eq('display pos', d1.pos, 42);
    eq('display header', d1.header, 'PLAY 1 - 4 BARS');
    eq('display peaks 128', d1.peaks.length, 128);
    eq('display peak 5', d1.peaks[5], 5);
    eq('a header may hold a bar', parseDisplay('1|0||A|B').header, 'A|B');
    eq('empty peaks -> null (nothing to draw)', parseDisplay('1|0||EMPTY 1').peaks, null);
    eq('garbage is rejected', parseDisplay('x|y'), null);
    eq('short peaks are rejected', parseDisplay('1|0|0102|H').peaks, null);
    eq('pos is clamped to the 128 columns', parseDisplay('1|999|' + peaks + '|H').pos, 127);
    const again = parseDisplay('7|50|' + 'zz'.repeat(128) + '|PLAY', d1);
    eq('same seq keeps the parsed peaks (no re-parse)', again.peaks === d1.peaks, true);
    eq('same seq, new pos', again.pos, 50);

    feedbackReset();
    const dkeys = { ledsKey: null, textKey: null, displayKey: 'display', deleteKey: null };
    let dval = '1|10|' + peaks + '|REC 1';
    let dreads = 0;
    const dread = () => { dreads++; return dval; };
    for (let i = 0; i < POLL_EVERY; i++) feedbackPoll(3, dkeys, dread);
    eq('display read once per poll', dreads, 1);
    eq('track 3 has a display', feedbackDisplay(3).header, 'REC 1');
    eq('first read marks it dirty', displayTakeDirty(), true);
    eq('and only once', displayTakeDirty(), false);
    for (let i = 0; i < POLL_EVERY; i++) feedbackPoll(3, dkeys, dread);
    eq('an unchanged display does not repaint', displayTakeDirty(), false);
    dval = '1|11|' + peaks + '|REC 1';
    for (let i = 0; i < POLL_EVERY; i++) feedbackPoll(3, dkeys, dread);
    eq('a moving playhead repaints', displayTakeDirty(), true);

    /* Toggle: shows by default, knob page while a knob/jog is in use, back after the idle time. */
    eq('shows with nothing touched', displayShowing(1e9, dkeys, 3), true);
    eq('not for a track with no display', displayShowing(1e9, dkeys, 4), false);
    eq('not for a module that declares none', displayShowing(1e9, { ...dkeys, displayKey: null }, 3), false);
    displayActivity(1e9);
    eq('a touched knob brings the knob page', displayShowing(1e9 + 10, dkeys, 3), false);
    eq('still the knob page just before the idle time', displayShowing(1e9 + DISPLAY_IDLE_MS - 1, dkeys, 3), false);
    eq('and the display returns after it', displayShowing(1e9 + DISPLAY_IDLE_MS, dkeys, 3), true);
    eq('a throttled poll: 25 Hz at ~196 ticks/s', POLL_EVERY, 8);

    /* Delete + pad forwarding */
    eq('delete write: rack pad 1 -> index 0', JSON.stringify(deletePadWrite({ ...dkeys, deleteKey: 'delete_pad' }, 1)), '["delete_pad","0"]');
    eq('delete write: rack pad 32 -> index 31', deletePadWrite({ ...dkeys, deleteKey: 'delete_pad' }, 32)[1], '31');
    eq('no key, no write', deletePadWrite(dkeys, 3), null);
    eq('pad outside the rack, no write', deletePadWrite({ ...dkeys, deleteKey: 'x' }, -1), null);
}
