# Improvement ideas (awaiting Erik's approval)

Look-and-feel ideas from bot matches and my play sessions. One line
each: the idea, why, and what I saw. Erik marks ✅ (build it) or strikes
it through (~~like this~~). Bugs never land here: rule bugs and plain
graphical faults are fixed at once.

| Date       | Idea                                                                                                                                                     | Why / what I saw                                                                                                                                                  | Status   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 2026-10-31 | Cut draw calls: share materials and instance the repeated props (trees, fence planks, bushes, rocks) — built as per-material merging (StaticBatchSystem) | 200 draw calls and 217 materials for 313 meshes in the emulator; Quest 2 is happiest well under ~100 draw calls, and every repeated prop has its own material now | ✅ built |
| 2026-10-31 | TV scoreboard: show what each player still has to knock down (the opponent's kubbs) instead of kubbs standing on their own side                          | "Spelare A 8 kvar" during the bot match counted the field kubbs tossed into A's half, which reads as if A were losing                                             | ✅ built |
| 2026-10-31 | Bot match: a seeded aim spread so bot matches look like real ones (misses, near hits)                                                                    | the bot fells a kubb with almost every stick, so a whole match takes about a minute and the TV director never sees a near miss                                    | ✅ built |
