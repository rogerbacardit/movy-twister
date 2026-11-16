/* ext-param-steps.ts — how an absolute Twister ring maps onto a parameter.
 * Pure: a KnobParamInfo-shaped value in, numbers and wire strings out.
 *
 * A continuous parameter (a cutoff) is driven by STEPS, like the Move's own
 * encoder, through Schwung's onKnobTurn. A STEPPED one — an enum, a switch, an
 * int with a short range — is not: Schwung gates an enum behind several
 * detents and toggles a two-way box on every flick, so 128 small Twister steps
 * made it jump about. Those are driven by the ring's POSITION instead: the
 * travel is cut into n equal zones, one per value, so the knob lands where the
 * wrist points and the ring (resynced on rest) shows the zone.
 */

/** Above this many values a parameter is treated as continuous. */
export const MAX_STEPPED = 32;

export interface StepInfo {
    value: number;
    min: number;
    max: number;
    type: string;
    options?: string[];
    wiresNames?: boolean;
}

/** How many discrete values a parameter has, or 0 when it is continuous. */
export function stepCount(info: StepInfo | null | undefined): number {
    if (!info) return 0;
    let n = 0;
    if (info.type === 'enum') n = Array.isArray(info.options) ? info.options.length : 0;
    else if (info.type === 'int') n = Math.round(info.max) - Math.round(info.min) + 1;
    return n >= 2 && n <= MAX_STEPPED ? n : 0;
}

/** The value (as the info reads it) a ring position 0-127 selects. */
export function valueAt(info: StepInfo, n: number, pos: number): number {
    const zone = Math.min(n - 1, Math.floor((Math.max(0, Math.min(127, pos)) * n) / 128));
    return info.type === 'enum' ? zone : Math.round(info.min) + zone;
}

/** The string a module's set_param takes for `value`. */
export function wireOf(info: StepInfo, value: number): string {
    if (info.type === 'enum') {
        const idx = Math.round(value);
        const name = info.wiresNames && info.options ? info.options[idx] : undefined;
        return name !== undefined ? String(name) : String(idx);
    }
    if (info.type === 'int') return String(Math.round(value));
    return String(value);
}
