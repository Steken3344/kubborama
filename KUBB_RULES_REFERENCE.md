# Kubb Rules Reference — synthesized from six sources
<!-- The normative spec for the future rules engine (post-POC). The
     glossary in §9 governs RULES-ENGINE i18n DISPLAY STRINGS; POC code
     identifiers keep "stick"/"kastpinne" per the plan (§2b) — do NOT
     rename existing identifiers to "baton". Sources: Official World Championship
     rulebook (Rone GoIK, english.pdf/swedish.pdf — AUTHORITATIVE),
     mastersofgames.com (KubbRoules.txt), kubb.world, ukkubb.org,
     spelregler.org. Compiled 2026-08-27. -->

## Source precedence
Where sources disagree, the **WC rulebook (english.pdf) is normative**;
differences become RULE OPTIONS (see table at the end), never silent
choices.

## 1. Pitch & equipment (consensus, all sources)
- Pitch 8 m long × 5 m wide; baselines are the SHORT sides. King at the
  exact center. 4 corner stakes; optionally 2 centre stakes marking the
  middle line (ukkubb/kubb.world).
- 10 kubbs 7×7×15 cm (5 per baseline, evenly spaced), 1 king 9×9×30 cm,
  6 batons Ø 4.4 cm × 30 cm.

## 2. Throwing (consensus + WC details)
- Batons: underarm only, baton END pointing in the direction of flight.
  Vertical (end-over-end) rotation allowed; HORIZONTAL rotation
  ("helicopter" / sv. helikopterkast) prohibited.
- Baton throws: from behind own baseline — or from the ADVANTAGE LINE
  when one exists (see 5). Both feet within the sidelines (WC sample).
- Kubb throws (returning felled kubbs) and KING throws: ALWAYS from the
  baseline, never from the advantage line. Kubb throws may be crosswise
  (diagonal) but still underarm (WC explicit).

## 3. Turn structure
Each turn the attacking team throws its 6 batons, in mandatory target
order: (1) all standing FIELD KUBBS in the opponent's half, then
(2) BASE KUBBS on the opponent's baseline, then (3) the KING (only if
everything else is down; from the baseline).
Chain topples: a base kubb counted as felled by a thrown kubb/baton is
valid ONLY if no field kubb was standing at the moment it fell (WC ⑩).
A base kubb felled while field kubbs still stand is RAISED AGAIN and
remains a base kubb (all sources).

## 4. Field kubbs — throwing back & raising (WC detail-rich)
- Before its baton throws, the team collects the kubbs felled during the
  opponent's turn and throws them (from its baseline) into the
  OPPONENT'S half.
- Landing rule: the kubb must land AND REMAIN within the opponent's
  half. Outside → ONE re-throw. Second miss → PUNISHMENT KUBB
  (sv. straffkubb): the DEFENDING team places it anywhere in its own
  half, but at least one baton's length from the king AND from corner
  stakes.
- Raising: the DEFENDING team raises each field kubb on the exact spot
  where it lies, in the direction of the defender's choice (any of the
  kubb's resting edges — a leaning kubb is raised on the corners already
  touching the ground per Masters). On-the-line rule (WC): if a kubb
  landed on the boundary line it must be raised with at least HALF of
  its base inside the pitch, else it is out (counts as a missed throw).
- Kubb-on-kubb landing (Masters pragmatic rule): stand it upright as
  near as possible to where its middle lay.
- Once validly overturned in play, a kubb REMAINS overturned even if
  accidentally re-raised during the attacker's turn (WC edge case).
- Invalidly thrown field kubbs may be re-thrown only AFTER all other
  field kubbs are thrown — and it is legal to knock an invalid kubb back
  into play with subsequent field-kubb throws (WC).

## 5. Advantage line (sv. framflyttningslinje) — WC formulation
If the attacking team fails to fell ALL field kubbs in the opponent's
half, the OPPONENT gains territorial advantage on their next turn: an
imaginary line through the remaining field kubb closest to the middle
line, parallel to the baselines. Their BATON throws may then be made
from any point on that line. Kubb and king throws remain from the
baseline. The advantage disappears as soon as no field kubb stands in
that half (WC samples ⑨-⑫: advantage recalculates each turn).

## 6. The king & winning (consensus, zero ambiguity)
- The king may only be attacked when ALL of the opponent's kubbs (field
  + base) are down; king throws from the baseline.
- Felling the king prematurely — by baton OR by a thrown kubb, at any
  point including the opening — means the responsible team LOSES
  immediately.
- Win = fell all kubbs in the opponent's half, then the king.

## 7. Opening (SOURCES DISAGREE — must be a rule option)
- WC rulebook (2003): turn 1 uses all 6 batons (sample game ⑦).
- Masters of Games: turn 1 uses only 4 batons.
- kubb.world (modern tournament practice): 2-4-6 ramp — 2 batons in
  turn 1, 4 in turn 2, 6 thereafter (softens first-strike advantage).
- Opening toss (Masters): one player per team throws a baton as close
  to the king as possible without hitting it; closest starts.

## 8. Rule options table (for the future rules engine + settings)
  Option              Values (default first)
  ------------------- -----------------------------------------------
  ruleset preset      WC-official | Masters-friendly | Modern-2-4-6
  opening batons      6 | 4 | 2-4-6 ramp
  pitch               8x5 (WC) | 6x3 backyard | 5x2 kids
  tower stacking      off (WC) | on (thrown kubb hitting a raised one
                      is stacked; tower felled = all in tower re-raised
                      as tower; optional max height 3) [WC variation 2]
  kubb removal        off | on (kubb felled twice leaves the game —
                      much shorter games) [Masters/spelregler variant]
  punishment kubb     defender places (WC) | re-throw only
  king one-attempt    off | on (only one king attempt per turn)
  king needs 2 batons off | on (may attack king only with ≥2 batons
                      left) [Masters variants]
  advantage line      on (WC) | off (always baseline — harder)

## 9. Glossary (sv ↔ en — use EXACTLY these in i18n and code)
  kubb              kubb            baskubb        base kubb
  kung              king            fältkubb       field kubb
  kastpinne         baton           straffkubb     punishment kubb
  hompinne          corner stake    framflyttningslinje  advantage line
  baslinje          baseline        mittlinje      middle line
  helikopterkast    helicopter throw (illegal)
  VM i Kubb         Kubb World Championship (Rone, Gotland)

## 10. Impact on the POC (nothing changes now)
The POC's free-throw mode uses none of the turn logic. Already-correct
in the POC: dimensions, court orientation, underarm/helicopter
classifier (matches WC's legality definition exactly — end-over-end
allowed, horizontal prohibited), king-instant-loss display. The rules
engine (post-POC) implements sections 3-8 with the options table as its
config, and its reducers are pure-core + TDD like everything else.
