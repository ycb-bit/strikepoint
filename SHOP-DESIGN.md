# Strikepoint — Shop Design (PROPOSAL, not yet built)

This is the plan for a cosmetics shop. **Nothing here is implemented yet** — it's
written so we can agree on the design before any code lands.

## 1. Economy overview

**Currency: Credits (⚡)**
- Earned ONLY by playing: ~25 ⚡ per match played + 5 ⚡ per kill + 50 ⚡ win bonus.
- Level-ups pay 100 ⚡ each, so early progression feels generous.
- Stored in the same localStorage profile as XP (`sp_profile_v1` → add `credits`).

**Anti-inflation rule:** no credits from idle/AFK (server tracks rounds actually played),
and daily earnings cap (~500 ⚡) to keep rarity meaningful.

## 2. What's for sale (cosmetics ONLY — zero gameplay power)

| Category | Examples | Pricing |
|---|---|---|
| Operator skins | Arctic, Desert Fox, Woodland… plus new premium sets | 400–1,200 ⚡ |
| Weapon finishes | per-weapon colorways (gold AK, tiger M4, carbon AWP) | 250–800 ⚡ each |
| Trails | colored bullet trails (replaces yellow default) | 300 ⚡ |
| Kill effects | custom kill-confirm banner text/color | 200 ⚡ |
| Emote packs | extra gestures (dance, flex, facepalm) | 150 ⚡ per pack |
| Name colors | colored name in killfeed/lobby | 500 ⚡ |

**Battle-pass-style bundle** ("Season 1"): 1,500 ⚡ → 1 skin set + 2 weapon finishes + exclusive trail, unlocked progressively by level during the season.

## 3. Trust model — the important bit

Right now profiles are **local-only** (localStorage). That's fine for cosmetics
*if* we accept that a determined player can edit their localStorage and unlock
everything. Three options, in order of effort:

1. **Local-first (recommended for now)** — free to build, zero server load,
   honest players get the full experience; cheaters only cheat themselves.
   Shop UI + owned-items in profile; server ignores cosmetic claims entirely
   (cosmetics are client-rendered anyway).
2. **Server-stamped** — profile uploads to the server on match end, server
   validates credits math server-side and signs the profile. Small backend work,
   stops casual editing. Costs server RAM/CPU (small).
3. **Accounts** — real auth. Full protection but big scope; only worth it with
   real players.

My recommendation: **option 1 now, design the code so it can graduate to
option 2 later** (all purchases go through one `purchase(itemId)` function that
later becomes a server call).

## 4. UI

- New **STORE** tab-style panel in the hub (icon button in the left rail next to ⚙ ? ⚠ 🌐).
- Grid of item cards: preview swatch, name, price, OWNED / price button states.
- "You have X ⚡" header + how-to-earn hint.
- Insufficient credits: button shakes + shows what you're short.

## 5. What the shop does NOT do

- No pay-to-win: nothing touches damage, speed, hitboxes, or info (no wallhack-adjacent stuff).
- No real money — Credits are earned in-game only (at least for now).
- No loot boxes/gambling mechanics.

---

**Open questions for you:**
1. OK with cosmetics-only + local trust model to start?
2. Should level-unlock skins (current system) stay free, or move into the shop?
3. Any item categories you specifically want first (weapon finishes? emotes?)
