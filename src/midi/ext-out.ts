/* ext-out.ts — everything movy sends to a Twister on USB-A goes through here.
 *
 * PACED, because a burst is lost. Sent all at once, a repaint (16 encoders x
 * up to 3 messages) reached the controller only in part: a USB-MIDI packet is
 * 64 bytes, 16 four-byte events, and whatever did not fit in the tick's packet
 * was dropped — seen on device as rings left the old colour, or lit when they
 * should be dark. So messages are queued and at most PER_TICK of them leave per
 * tick (app/tick.ts calls twisterOutFlush once per tick).
 *
 * COALESCED: a queued message is replaced in place by a newer one for the same
 * control, so a ring that moves faster than the queue drains costs one slot,
 * not a backlog, and the last value always wins. "The same control" is status +
 * CC, except on channel 3, where one CC carries two settings (17..47 RGB
 * brightness, 65..95 indicator brightness) that must both arrive.
 */

import { platform } from '../platform/index.js';

export const PER_TICK = 10;

const queue: number[][] = [];
const slot = new Map<number, number>();   /* control id -> index in queue */
let head = 0;

function controlId(msg: readonly number[]): number {
    const st = msg[1] & 0xFF, cc = msg[2] & 0x7F, v = msg[3] & 0x7F;
    const half = (st & 0x0F) === 2 && v >= 64 ? 1 : 0;
    return (st << 9) | (cc << 1) | half;
}

/** Queue one message for the Twister (USB cable-number byte first). */
export function twisterSend(msg: readonly number[]): void {
    const id = controlId(msg);
    const at = slot.get(id);
    if (at !== undefined && at >= head) { queue[at] = msg.slice(); return; }
    slot.set(id, queue.length);
    queue.push(msg.slice());
}

/** Send up to `max` queued messages; called once per tick. */
export function twisterOutFlush(max = PER_TICK): void {
    let n = 0;
    while (head < queue.length && n < max) {
        const msg = queue[head];
        slot.delete(controlId(msg));
        head++;
        n++;
        platform.externalSend(msg);
    }
    if (head >= queue.length) { queue.length = 0; head = 0; }
}

/** Messages still waiting (tests, logs). */
export function twisterOutPending(): number {
    return queue.length - head;
}
