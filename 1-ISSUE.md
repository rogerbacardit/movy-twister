Title: External knob controller on USB-A (e.g. Midi Fighter Twister): knobs, jog and presets

### What's the problem or missing capability?

A class-compliant USB MIDI controller on the Move's USB-A port can play the
selected track (notes, mod wheel, pitch bend), but every other CC is ignored, so
an encoder controller can't edit anything in Movy. I'd like to use a Midi Fighter
Twister (16 encoders with push switches) next to the Move's own 8 knobs, through
a hub, together with a KeyStep Pro.

### Proposed solution

Treat each incoming CC as the Move control it stands for and replay it through
the internal router (`onMidiMessageInternal`). Every page, lock, peek and modal
then handles it exactly like the hardware, and there is no second write path.

- **Schwung's convention, any channel:** CC 71–78 relative (the Move encoders'
  two's complement) and CC 102–109 absolute → knobs 1–8. One controller setup
  then works in Movy and in Schwung's slot editor.
- **A factory-default Twister, no setup needed:**
  - encoders 9–16 → knobs 1–8
  - encoder 1: turn = jog (geared down), push = jog click
  - encoder 4: push = Back
  - encoder 3: turn = previous/next preset of the knobs' module, from any page
  - encoder 2 is left alone. It sends CC 1, which the engine plays as the mod
    wheel (`ext_route.rs`), so mapping it here would turn a knob *and* modulate
    the synth.
- The Twister's rings light green on assigned encoders and stay dark on the
  rest. They are repainted when CCs resume after a quiet spell, because a
  Twister forgets its colours on reconnect.

### Alternatives considered

Reconfiguring the Twister in Midi Fighter Utility to CC 71–78. That still needs
Movy to read CCs, and the zero-setup default is friendlier.

### Would you be willing to contribute this?

Yes. I have a working branch on top of `main`, and I've been using it on my Move
(backported to v0.37.0) with a Twister and a KeyStep Pro on a powered hub.
Happy to open a PR if this direction suits you, or to reshape it. For example,
the Twister profile could live behind a setting, or the preset step could take a
different route into the page controller.
