//! Routing an external USB-A keyboard (cable 2) to a track's chain on the
//! audio thread.
//!
//! Same reason as `pad_route`: a UI round trip would add a tick (5-16 ms) to
//! every note. The UI owns which chain each message plays and, on a drum track,
//! which note each pad plays; it pushes that as `extmap` and the DSP only looks
//! up.
//!
//! By default every channel is accepted and collapsed onto the ACTIVE track,
//! because the user picks the destination by selecting a track on Move, not on
//! the controller. A track may instead claim a MIDI channel (its MIDI IN in
//! the track menu): that channel then plays that track whatever is selected, so
//! a sequencer sending several channels (a KeyStep Pro's four tracks) plays
//! several tracks at once. Unclaimed channels still follow the selection.
//!
//! `extmap` is `<dest>[;<ch>:<dest>]*`: the active track's destination, then
//! one per claimed channel (1-16). A `<dest>` is `"<chain>"`, played as it
//! comes, or `"<chain>,<p0>,<p1>,…"`, a drum rack with note `36 + i` playing
//! `p_i`. Note-offs come from the ledger (see `pad_route.rs` for why), kept per
//! channel so the same key on two channels is two notes.

const DRUM_BASE: usize = 36;
const CHANNELS: usize = 16;

#[derive(Debug, Clone, Copy)]
struct Dest {
    chain: i32,
    /// Incoming note -> pitch the chain plays, -1 for a dead key.
    map: [i16; 128],
}

impl Dest {
    const NONE: Dest = Dest { chain: -1, map: [-1; 128] };

    fn parse(val: &str) -> Result<Dest, ()> {
        let mut it = val.split(',');
        let chain: i32 = it.next().and_then(|s| s.trim().parse().ok()).ok_or(())?;
        let mut map = [-1i16; 128];
        let mut drum = false;
        for (i, s) in it.enumerate() {
            drum = true;
            let p: i16 = s.trim().parse().map_err(|_| ())?;
            if DRUM_BASE + i < 128 && (0..128).contains(&p) {
                map[DRUM_BASE + i] = p;
            }
        }
        if !drum {
            for (i, m) in map.iter_mut().enumerate() {
                *m = i as i16;
            }
        }
        Ok(Dest { chain, map })
    }

    fn chain(&self) -> Option<usize> {
        usize::try_from(self.chain).ok()
    }
}

#[derive(Debug)]
pub struct ExtRoute {
    active: Dest,
    claimed: [Option<Dest>; CHANNELS],
    held: [[Option<(usize, u8)>; 128]; CHANNELS],
    /// Chains a wheel left off rest (bit per chain), so a route change only
    /// resets what was actually moved, and only where it can no longer be
    /// released.
    bent: u128,
    modded: u128,
}

impl Default for ExtRoute {
    fn default() -> Self {
        Self::new()
    }
}

fn bit(chain: usize) -> u128 {
    if chain < 128 { 1u128 << chain } else { 0 }
}

impl ExtRoute {
    pub fn new() -> Self {
        Self {
            active: Dest::NONE,
            claimed: [None; CHANNELS],
            held: [[None; 128]; CHANNELS],
            bent: 0,
            modded: 0,
        }
    }

    fn dest(&self, ch: usize) -> &Dest {
        self.claimed[ch].as_ref().unwrap_or(&self.active)
    }

    /// Install a new `extmap`. Returns the chains left with a wheel off rest —
    /// no channel reaches them any more, so the caller resets them there.
    /// Malformed input changes nothing.
    pub fn set_map(&mut self, val: &str) -> Result<Vec<usize>, ()> {
        let mut segs = val.split(';');
        let active = Dest::parse(segs.next().ok_or(())?)?;
        let mut claimed = [None; CHANNELS];
        for seg in segs {
            let (ch, dest) = seg.split_once(':').ok_or(())?;
            let ch: usize = ch.trim().parse().map_err(|_| ())?;
            if !(1..=CHANNELS).contains(&ch) {
                return Err(());
            }
            claimed[ch - 1] = Some(Dest::parse(dest)?);
        }
        self.active = active;
        self.claimed = claimed;
        let mut reach = self.active.chain().map_or(0, bit);
        for d in self.claimed.iter().flatten() {
            reach |= d.chain().map_or(0, bit);
        }
        let stray = (self.bent | self.modded) & !reach;
        self.bent &= reach;
        self.modded &= reach;
        Ok((0..128).filter(|c| stray & bit(*c) != 0).collect())
    }

    /// One cable-2 message: `emit(chain, msg)` for each message to play.
    pub fn route(&mut self, status: u8, d1: u8, d2: u8, mut emit: impl FnMut(usize, [u8; 3])) {
        let ch = (status & 0x0F) as usize;
        let note = (d1 & 0x7F) as usize;
        let dest = *self.dest(ch);
        let chain = dest.chain();
        match status & 0xF0 {
            0x90 if d2 > 0 => {
                let (Some(chain), Ok(pitch)) = (chain, u8::try_from(dest.map[note])) else { return };
                /* A retrigger before the off: close the first note, or it would
                 * be orphaned when its ledger slot is overwritten. */
                if let Some((c, p)) = self.held[ch][note].replace((chain, pitch)) {
                    emit(c, [0x80, p, 0]);
                }
                emit(chain, [0x90, pitch, d2]);
            }
            0x80 | 0x90 => {
                if let Some((c, p)) = self.held[ch][note].take() {
                    emit(c, [0x80, p, 0]);
                }
            }
            0xB0 if d1 == 1 => {
                let Some(chain) = chain else { return };
                if d2 != 0 { self.modded |= bit(chain) } else { self.modded &= !bit(chain) }
                emit(chain, [0xB0, 1, d2]);
            }
            0xE0 => {
                let Some(chain) = chain else { return };
                if d1 == 0 && d2 == 0x40 { self.bent &= !bit(chain) } else { self.bent |= bit(chain) }
                emit(chain, [0xE0, d1, d2]);
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn play(r: &mut ExtRoute, status: u8, d1: u8, d2: u8) -> Vec<(usize, [u8; 3])> {
        let mut out = Vec::new();
        r.route(status, d1, d2, |c, m| out.push((c, m)));
        out
    }

    #[test]
    fn melodic_passes_any_channel_to_channel_one() {
        let mut r = ExtRoute::new();
        assert!(play(&mut r, 0x90, 60, 100).is_empty(), "no map yet: silent");
        r.set_map("3").unwrap();
        assert_eq!(play(&mut r, 0x95, 60, 100), [(3, [0x90, 60, 100])]);
        assert_eq!(play(&mut r, 0x85, 60, 0), [(3, [0x80, 60, 0])]);
        assert!(play(&mut r, 0x85, 60, 0).is_empty(), "off for nothing held");
        r.set_map("-1").unwrap();
        assert!(play(&mut r, 0x90, 60, 100).is_empty(), "no chain: silent");
    }

    #[test]
    fn drum_maps_one_key_per_pad_from_36() {
        let mut r = ExtRoute::new();
        r.set_map("2,36,38,42").unwrap();
        assert_eq!(play(&mut r, 0x90, 37, 90), [(2, [0x90, 38, 90])]);
        assert_eq!(play(&mut r, 0x90, 38, 90), [(2, [0x90, 42, 90])]);
        assert!(play(&mut r, 0x90, 39, 90).is_empty(), "past the last pad");
        assert!(play(&mut r, 0x90, 35, 90).is_empty(), "below the first pad");
    }

    #[test]
    fn off_follows_the_ledger_across_a_track_switch() {
        let mut r = ExtRoute::new();
        r.set_map("1").unwrap();
        play(&mut r, 0x90, 60, 100);
        r.set_map("4,36").unwrap();
        assert_eq!(play(&mut r, 0x90, 60, 0), [(1, [0x80, 60, 0])], "vel-0 on is an off");
    }

    #[test]
    fn retrigger_closes_then_plays() {
        let mut r = ExtRoute::new();
        r.set_map("1").unwrap();
        play(&mut r, 0x90, 60, 100);
        r.set_map("2").unwrap();
        assert_eq!(play(&mut r, 0x90, 60, 90), [(1, [0x80, 60, 0]), (2, [0x90, 60, 90])]);
        assert_eq!(play(&mut r, 0x80, 60, 0), [(2, [0x80, 60, 0])]);
    }

    #[test]
    fn wheels_reset_on_the_chain_being_left() {
        let mut r = ExtRoute::new();
        r.set_map("1").unwrap();
        assert!(r.set_map("2").unwrap().is_empty(), "nothing moved");
        assert_eq!(play(&mut r, 0xE0, 0, 0x60), [(2, [0xE0, 0, 0x60])]);
        assert!(r.set_map("2").unwrap().is_empty(), "same chain");
        assert_eq!(r.set_map("5").unwrap(), vec![2]);
        assert!(r.set_map("1").unwrap().is_empty(), "reset is per chain");
        play(&mut r, 0xB0, 1, 64);
        play(&mut r, 0xB0, 1, 0);
        assert!(r.set_map("2").unwrap().is_empty(), "wheel back at rest");
        assert!(play(&mut r, 0xB0, 7, 64).is_empty(), "other CCs ignored");
    }

    #[test]
    fn malformed_map_changes_nothing() {
        let mut r = ExtRoute::new();
        r.set_map("1").unwrap();
        assert!(r.set_map("x").is_err());
        assert!(r.set_map("2,a").is_err());
        assert_eq!(play(&mut r, 0x90, 60, 1), [(1, [0x90, 60, 1])]);
    }

    #[test]
    fn a_claimed_channel_plays_its_track_whatever_is_selected() {
        let mut r = ExtRoute::new();
        r.set_map("1;2:5;4:7").unwrap();
        assert_eq!(play(&mut r, 0x91, 60, 100), [(5, [0x90, 60, 100])], "ch 2 -> chain 5");
        assert_eq!(play(&mut r, 0x93, 64, 90), [(7, [0x90, 64, 90])], "ch 4 -> chain 7");
        assert_eq!(play(&mut r, 0x90, 67, 80), [(1, [0x90, 67, 80])], "unclaimed ch 1 -> active");
        assert_eq!(play(&mut r, 0x9F, 67, 80), [(1, [0x90, 67, 80])], "unclaimed ch 16 -> active");
    }

    #[test]
    fn the_same_key_on_two_channels_is_two_notes() {
        let mut r = ExtRoute::new();
        r.set_map("1;2:5;4:7").unwrap();
        play(&mut r, 0x91, 60, 100);
        play(&mut r, 0x93, 60, 100);
        assert_eq!(play(&mut r, 0x81, 60, 0), [(5, [0x80, 60, 0])]);
        assert_eq!(play(&mut r, 0x83, 60, 0), [(7, [0x80, 60, 0])]);
    }

    #[test]
    fn a_claimed_drum_track_maps_its_pads() {
        let mut r = ExtRoute::new();
        r.set_map("3;10:2,36,38,42").unwrap();
        assert_eq!(play(&mut r, 0x99, 37, 90), [(2, [0x90, 38, 90])]);
        assert_eq!(play(&mut r, 0x90, 37, 90), [(3, [0x90, 37, 90])], "the active track stays melodic");
    }

    #[test]
    fn a_released_claim_falls_back_to_the_active_track() {
        let mut r = ExtRoute::new();
        r.set_map("1;2:5").unwrap();
        play(&mut r, 0x91, 60, 100);
        r.set_map("1").unwrap();
        assert_eq!(play(&mut r, 0x81, 60, 0), [(5, [0x80, 60, 0])], "the held note closes where it started");
        assert_eq!(play(&mut r, 0x91, 62, 100), [(1, [0x90, 62, 100])]);
    }

    #[test]
    fn wheels_reset_only_where_no_channel_reaches() {
        let mut r = ExtRoute::new();
        r.set_map("1;2:5").unwrap();
        play(&mut r, 0xE1, 0, 0x60);
        assert!(r.set_map("2;2:5").unwrap().is_empty(), "chain 5 still claimed");
        assert_eq!(r.set_map("2").unwrap(), vec![5]);
    }

    #[test]
    fn malformed_channel_segments_change_nothing() {
        let mut r = ExtRoute::new();
        r.set_map("1;2:5").unwrap();
        assert!(r.set_map("1;0:5").is_err(), "channel 0");
        assert!(r.set_map("1;17:5").is_err(), "channel 17");
        assert!(r.set_map("1;2").is_err(), "no destination");
        assert!(r.set_map("1;2:x").is_err());
        assert_eq!(play(&mut r, 0x91, 60, 1), [(5, [0x90, 60, 1])]);
    }
}
