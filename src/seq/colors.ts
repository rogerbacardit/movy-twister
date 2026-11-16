/* Move pad/step LED palette indices. These are fixed hardware-table values
 * (schwung/src/shared/constants.mjs), hardcoded here so seq modules don't
 * depend on injected globals and run unchanged in browser tests.
 *
 * The 4 track colors and their dim variants are a best-effort match to
 * native Move pending an LED sniff; the bright/dim pairing is what matters
 * for the step-LED semantics (manual §9.5). */

export const C_BLACK = 0;
export const C_WHITE = 120;
export const C_DARKGREY = 124; // "dim gray" — empty clip / bar outside loop
export const C_LIGHTGREY = 118; // schwung LightGrey ("dim white"): note-length tail — brighter than C_DARKGREY, distinct from colored track-dim
export const C_GREEN = 11;     // NeonGreen — playhead
export const C_REC_RED = 127;  // Red — recording indicator (index 1 renders pink)

/* Track colours: 4 groups of 4. Every row (one group's 4 tracks) and every
 * column (the same track index across groups) is pairwise distinct.
 *
 * ONLY 8 distinct colours, deliberately. The rule has never required 16 — it
 * requires distinctness within a row and within a column, and duplicates placed
 * off each other's row and column satisfy it. Spending the extra cells on
 * repeats rather than on scraping up a 16th colour is what buys the separation:
 * every row/column pair is now >= 58 degrees apart in HUE, where the previous
 * 16-distinct table managed 16 degrees and produced look-alikes (Neon Pink vs
 * Electric Violet at 41 deg, Light Yellow vs Burnt Orange at 50 deg) that
 * CIELAB rated as perfectly safe.
 *
 * Hue is asserted alongside CIELAB for exactly that reason: CIELAB scored both
 * of those pairs above 33 while they read as the same colour on the hardware.
 *
 * A track colour ALSO paints the chromatic root pad, whose neighbours are the
 * grey in-scale pads (C_LIGHTGREY) and white held pads. Two classes of colour
 * are barred outright because on this hardware they read as white there no
 * matter what CIELAB says — measured on device, not derived:
 *   - cool hues (LAB 145-310) above L 45. Azure Blue sits 80 from white by the
 *     numbers and was still indistinguishable from a lit in-scale pad.
 *   - pastels (L > 65 with chroma under 0.7*L), whatever their hue.
 * Those bans cost most of the palette's hue wheel (they leave a 145 degree hole
 * from 139 to 284), which is the real reason 16 distinct well-separated colours
 * are not available. Duplicating is the cheaper price.
 *
 * `browser-test/track-colors.mjs` holds all of that, and also checks these
 * indices still mean what they mean in schwung's own palette — the table here
 * is a copy, and a copy can drift. */
export const GREEN_T = 126;   // Green (#00FF00)
export const BLUE_T = 125;    // Blue (#0000FF)
export const ORANGE_T = 3;    // Bright Orange
export const PURPLE_T = 23;   // #972BFF (palette 22 "Purple" is a blue)
const DIM_OF: Record<number, number> = { [GREEN_T]: 85, [BLUE_T]: 99, [ORANGE_T]: 69, [PURPLE_T]: 109 };

/* Track colours: the user's four, rotated. Tracks 1-4 are green, strong blue,
 * orange and purple, and each later group starts one colour on, so every row
 * (a group's 4 tracks) and every column (one track index across groups) holds
 * all four — the distinctness rule, met with the four hues furthest apart.
 * A Twister's rings take the same colour as the active track
 * (midi/ext-colors.ts).
 *
 * The bans below still hold, and `browser-test/track-colors.mjs` checks them:
 *   - cool hues (LAB 145-310) above L 45 read as white on the root pad.
 *   - pastels (L > 65 with chroma under 0.7*L), whatever their hue.
 * It also checks these indices still mean what they mean in schwung's own
 * palette — the table here is a copy, and a copy can drift. */
export const TRACK_COLOR = [
    GREEN_T, BLUE_T, ORANGE_T, PURPLE_T,
    BLUE_T, ORANGE_T, PURPLE_T, GREEN_T,
    ORANGE_T, PURPLE_T, GREEN_T, BLUE_T,
    PURPLE_T, GREEN_T, BLUE_T, ORANGE_T,
];

/* Dim variants, still used by two things the Session selector no longer is:
 * muted track buttons and the watched track's empty in-loop steps, where the
 * dim colour marks the LOOP WINDOW. Each shares its bright partner's hue and is
 * clearly darker. */
export const TRACK_COLOR_DIM = TRACK_COLOR.map((c) => DIM_OF[c]);

export function trackColor(track: number): number {
    return TRACK_COLOR[track & 15];
}

export function trackColorDim(track: number): number {
    return TRACK_COLOR_DIM[track & 15];
}



/* Native Move LED animation channels (Push-2 model: the note-on's MIDI channel
 * selects the hardware animation — schwung/src/shared/constants.mjs:633). The
 * channel is OR-ed into the 0x90 status byte; the firmware does the smooth
 * gradient, so we no longer toggle colors in JS. */
export const ANIM_NONE = 0x00;       // solid, no animation
export const ANIM_PULSE_FAST = 0x08; // Pulse8th — queued-to-launch (urgent)
export const ANIM_PULSE = 0x09;      // Pulse4th — playing clip
export const ANIM_PULSE_SLOW = 0x0A; // Pulse2th — selected clip (focus marker)

/* White-LED brightness levels (Back/arrows/etc. are not RGB). */
export const WHITE_OFF = 0;
export const WHITE_DIM = 16;
export const WHITE_BRIGHT = 124;
