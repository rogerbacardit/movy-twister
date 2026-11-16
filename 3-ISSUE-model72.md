Repo: sd88me/schwung-model72
Title: Model-72 drops to near-silence (faint clicks) for a few seconds, then recovers by itself

**Version:** Model-72 1.0.0 (latest release), Schwung 1.9.3 on Ableton Move, running inside Movy v0.37.0.

**What happens**
While a sequence plays, the Model-72 track intermittently drops to near-silence: only a
faint click is heard instead of the voice. It recovers by itself after a few seconds. The
pattern repeats at no regular interval. It happens with Movy's own sequencer and with an
external sequencer (KeyStep Pro over USB).

**What it is not**
- **Other tracks keep playing normally** during the dropout.
- **Swapping Model-72 for OB-Xd** on the same track, with the same sequence, gives no
  dropouts at all.
- **CPU:** Movy's per-track CPU meter shows no spike at the dropout (about 4–5 % total).
- **The host keeps up:** Movy's audio thread logs no slow frames at that moment.
- **Parameters don't move:** they stay unchanged on screen.

**Settings in use:** `voices=4`, `quality=0`, mode 0. Only osc 1 on, range 2, waveform 1.

**Guess:** something in the voice or filter state goes bad for a while (a NaN or denormal
in the ladder filter, or a voice stuck in allocation), and then clears.
I can test a build or try settings (e.g. voices=1) if that helps.
