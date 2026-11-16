Repo: charlesvestal/schwung-jv880 (Mini-JV) — and possibly DimaDake/schwung-movy
Title: Mini-JV inside Movy: periodic 38 ms render stalls (about 4 per second), audio glitches across tracks

**Setup:** Ableton Move, Schwung 1.9.3, Movy v0.37.0 (with local patches) and Mini-JV
(latest from the catalog), with ROMs and 11 SR-JV80 expansions. The Set has two tracks:
a drum module and Mini-JV ("A.Piano 1").

**Symptom:** Movy's log shows `audio: slow frame … 37.8 ms (render 37.7 ms; 0 notes;
0 params)` about every 250 ms (roughly every 75 frames), steadily. CPU goes up and the
audio glitches. Unloading Mini-JV stops it at once; loading it again brings it back.

**Ruled out (each measured on device):**
- **Emu thread priority.** The log says `emu thread refused SCHED_FIFO 20; falling back to
  SCHED_OTHER`. Forcing it with chrt to FIFO 45, then FIFO 69 (above Movy's render threads
  at 68, below audio at 70), left the stall count unchanged: 79–80 per 20 s.
- **Disk I/O.** No files are written during the stalls. The audio thread is only ever seen
  waiting in `ablspi_*`.
- **Movy polling the Mini-JV page.** The stalls continue with another track on screen.
- **The expansions.** Moving all 11 expansions and the patch cache away and reloading
  Mini-JV gives the same stalls.
- **Another module.** With Mini-JV removed, the same Set renders without slow frames.
  JE-8086 was also loaded earlier and was removed before these measurements.

**Not yet tested:** the stock Movy build (without local patches) together with Mini-JV.

The pattern is fixed: 38 ms, about 4 times per second, in render, with no notes or params.
To me that looks like a wait with a timeout, or a periodic task, on the render path while
Mini-JV is loaded in Movy's chain host. I'm happy to run a debug build (e.g. with
JV880_PERF_STATS=1) or collect more data.
