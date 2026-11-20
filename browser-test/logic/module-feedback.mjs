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
       '{"ledsKey":"pad_leds","textKey":"status_text"}');
    eq('one key is enough', JSON.stringify(feedbackKeysOf({ status_text_param: 't' })),
       '{"ledsKey":null,"textKey":"t"}');

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
}
