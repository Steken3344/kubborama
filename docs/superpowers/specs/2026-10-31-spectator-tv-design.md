# Spectator mode as a TV production — design

Date: 2026-10-31. Erik: "en intro-skärm, om man kommer från en vanlig
dator så ska man få se hela vyn, visa runt lite från olika ställen.
Tänkt en TV-produktion med olika kameravinklar beroende på vem som
kastar och en heads-up med poängställningen."

## Goal

Open the game's address on an ordinary computer, phone or TV browser
(no headset, no VR) and get a live broadcast of the match: an automatic
director cutting between camera angles, and a TV-style scoreboard.
Headsets are unaffected; a spectator never takes a seat.

## Parts

1. **Spectators on the server.** A browser that does not enter VR joins
   as a spectator (`watch` message) instead of waiting for XR. The
   server sends it everything it sends players — snapshots, match,
   rounds, both avatars' presence, colours, room, notices — but accepts
   nothing from it except the join. Up to 8 spectators. New server
   message `players` (each side's profile name and shown colour) so the
   scoreboard can name the players.
2. **Intro / attract mode.** With no match running (fewer than two
   players), the camera slowly tours the garden: a few authored shots
   (high wide, along the court from each end, low past the king,
   circling the trees), each a slow move of ~8 s with cross-cuts. A
   title card "KubbOrama — väntar på spelare" sits on top.
3. **The director (pure core, `core/director.ts`).** A small state
   machine choosing the shot from game events, testable without a
   renderer:
   - a player's turn starting → **over-the-shoulder** behind the thrower,
     looking down the court;
   - a stick released → **follow cam** from the side, tracking the
     stick, easing out when it lands;
   - a kubb or the king felled → a short **close-up** at the spot (~2 s);
   - inkast → **wide side view** of the opponent's half;
   - between turns and on a match win → **establishing wide** shot,
     then the winner's side;
   - a minimum shot length (~2.5 s) so it never cuts frantically.
     Camera poses come from the court layout (both court sizes) and live
     piece positions. Moves are eased; cuts are hard cuts like TV.
4. **Scoreboard (heads-up).** An HTML overlay in TV style, bottom left:
   both names in their avatar colours, kubbs left standing on each
   side, whose turn it is with sticks left, round number, and banners
   for "Övertramp!", "Kungen fälld!" and the winner. Swedish/English
   from the existing i18n. Big enough to read on a TV.
5. **Controls:** none needed. A small corner button toggles "Fri
   kamera" (drag to orbit) for anyone who wants to look around
   themselves; the director resumes after 20 s idle.

## Tests first

Director: shot choice per event sequence, minimum shot length, both
court sizes, camera poses never inside a tree or under the ground.
Server: a spectator gets the broadcasts, cannot throw/reset/switch
court, does not count as a player (practice/match unaffected), the cap.
Scoreboard: pure formatter from match state. Then a headless browser
check: a spectator page against two headless players sees the match
and the camera cuts on a throw.

## Out of scope

Recording or streaming video, replays, commentary audio, spectators in
VR (a later step on the same server support), chat.
