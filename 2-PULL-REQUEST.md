Title: External knob controller on USB-A: knobs, jog, Back and presets

## What & why

Closes #<issue number>.

A CC from a USB-A controller was dropped, so an encoder controller couldn't edit
anything in Movy. Each CC now stands for a Move control and is replayed through
`onMidiMessageInternal`. Pages, locks, peeks and modals handle it exactly like
the hardware, and there is no second write path.

- **`src/midi/ext-knob-map.ts`** (new, pure): what each CC means.
  - Schwung's convention, any channel: CC 71–78 relative, CC 102–109 absolute → knobs 1–8.
  - A factory-default Midi Fighter Twister: encoders 9–16 → knobs 1–8; encoder 1 = jog
    (one page per 10 values, which matched the hardware's feel on device) and its push =
    jog click; encoder 4's push = Back; encoder 3 = presets.
  - Encoder 2 (CC 1) is deliberately unmapped. The engine plays it as the mod wheel
    in `ext_route.rs` before the UI sees it.
- **`src/midi/ext-knobs.ts`** (new): dispatch, plus the Twister rings (green on assigned
  encoders, dark on the rest), repainted when CCs resume after a 10 s gap because a
  Twister forgets its colours on reconnect.
- **`Platform.externalSend`** (cable 2), so `source-rules` keeps every host global behind
  the platform seam. `move_midi_external_send` is now in the host-globals manifest. Both
  movy-host (`globals_surface.c`) and shadow_ui already register it.
- **Presets from any page:** `PresetKnob.stepAnywhere` lands on the preset door, steps,
  and goes back. Before stepping it seeds the door's count and index through the same
  port. The controller only learns them by ticking on the door (`tickPreset`), and
  `stepPreset` refuses a list whose count is still 0. A visit this short never ticks,
  which on device showed up as an encoder that turned and did nothing. The index is not
  re-read while a previous step is settling, for the reason `tickPreset` gives.
- `router.ts` only gains `export` on `knobModel`.
- `external.ts` sends `0xB0` to `onExternalControlChange`.

`schwung-page-input.ts` and `schwung-page.ts` were already over the 200-line cap. They
each grow by 3 lines of interface and pass-through. The logic lives in
`schwung-preset-knob.ts` (174 lines).

## How it was tested

- [x] `npm run typecheck` is clean
- [x] `npm test` suites run individually: `host/tests/run.sh`, logic, app-loop,
      screenshot, perf, fleet-pages, grid-cost, track-colors, device-scripts,
      source-rules, host-globals. All pass.
      `abi-parity.mjs` fails on unmodified `main` too (the ffi.rs mirror check), so it
      is unrelated to this change.
- [x] New logic test: `browser-test/logic/ext-knobs.mjs` (17 checks on the mapping).
- [ ] `npm run test:device` / `test:device-self`: not run. On device I tested by hand,
      on a v0.37.0 backport of the same change, with a Twister and a KeyStep Pro on a
      powered hub on the Move's USB-A port. Knobs, jog, Back, preset stepping (Model-72,
      Mini-JV) and the ring colours all work, and the KeyStep keeps playing the
      selected track.

## Checklist

- [x] New logic → a logic test
- [x] No code duplication; shared logic factored out
- [x] New files within the 200-line cap (two existing over-cap files grow by 3 lines each)
- [x] Comments explain **why**, not what

Open to reshaping: the Twister profile could sit behind a setting, the gearing could
be configurable, or the preset step could take another route into the controller.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
