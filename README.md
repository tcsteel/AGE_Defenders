# Castlehold

Local browser wave-defense strategy game using the repository's TypeScript/Node HTTP server. Inspired by Age of Empires II.

## Run in Cursor

```powershell
npm.cmd install
npm.cmd run dev
```

Open http://localhost:3000. On other shells, `npm` works in place of `npm.cmd`.

## Import local artwork

```powershell
node scripts/import-aoe-assets.cjs 'E:\SteamLibrary\steamapps\common\AoE2DE'
```

The current imported PNGs and WAV audio are committed to Git and bundled in the Windows release. Re-importing is optional when changing source artwork. The game uses Britons/Western European buildings, crop and terrain textures, resource deposits, trees, resource icons, and unit artwork. The importer decodes SLD main layers and DDS DXT1 terrain. Combat sprites use 24-frame loops sampled across the full animation cycle in sixteen directions. Terrain textures are 1024px. Projected sprite shadows are rendered by the engine; player-color overlays are omitted. Format reference: https://github.com/SFTtech/openage/blob/master/doc/media/sld-files.md

## Play

Start with 440 food, 260 wood, 180 gold, and 180 stone. Assign villagers to food, wood, gold, and stone. Each victory pays resources per assigned worker and adds one idle villager. Economic research increases yield.

Train defenders, select one in the garrison or click a deployed unit on the map, then click an empty cell in the exterior grid outside the walls to reposition it between waves. The selected unit is outlined. Its new cell becomes its return post. One defender fits per assigned cell. During battle, defenders walk through adjacent free grid cells to approach enemies, avoiding occupied and reserved cells. While walls stand, defenders can move across the exterior grid to the visible map edges. After the walls are breached, their navigation expands into the base so they can chase enemies attacking the castle. Manual deployment remains limited to the outside ring. Archers stop within bow range; infantry must close to melee range.

After every cleared wave, all trained defenders, including those defeated during battle, recover full HP and return to their original assigned posts. Their cumulative damage remains recorded. Undeployed units remain at the castle.

The castle automatically shoots nearby enemies. Walls absorb attacks until breached; a fallen castle ends the game. Survive twelve waves to win. Castle and wall repairs are separate, fully restore their target, and charge only for missing HP. Costs are rounded up: 30 wood + 20 stone per 250 castle HP or 300 wall HP.

Advance ages between waves: Feudal costs 300 food, Castle 500 food + 200 gold, and Imperial 800 food + 400 gold. Dark Age unlocks Militia. Feudal unlocks Archer, Spearman, and Scout Cavalry, with Men-at-Arms available through research. Castle unlocks Knight and permits Crossbowman, Pikeman and Long Swordsman research. Imperial permits Arbalester, Halberdier, and Cavalier research. Costs and combat effects are adapted for this prototype.

## Interface

The resource strip is inside the battlefield, with wood, food, gold, and stone icons, assigned-worker badges, resource totals, population, and age. The assault forecast shows direction, estimated force, and remaining enemies during battle.

The damage meter groups actual cumulative damage by unit type, with a separate castle entry. Overkill is excluded. Minimise/maximise buttons, a corner resize handle, and a text-size slider control the panel.

The Arabia-inspired map uses a fixed layout and a zoomed-out camera. Labels use high-DPI rendering and light translucent backing. Expand map moves management panels below the map. Refreshing resets the active run. Settings and leaderboard scores are saved in this browser.

## Checks and production

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd start
```

Keep `public/` alongside `dist/` when distributing locally. Tests do not require imported assets. `PORT` overrides port 3000; `/health` returns JSON health status.

## Troop research and bulk redeployment

The Research tab includes economic research and troop upgrades. Upgrade chains are Militia -> Men-at-Arms -> Long Swordsman, Spearman -> Pikeman -> Halberdier, Archer -> Crossbowman -> Arbalester, and Knight -> Cavalier. Each upgrade requires its age and preceding research and charges once for the army-wide change. It upgrades every matching defender, including undeployed units, and replaces that type in the recruitment menu. IDs, positions, return posts, damage totals, and health percentages are preserved. Historical damage follows the upgraded unit type in the grouped meter.

The Troops tab has Redeploy all buttons for East, South, West, and North. Between waves, these place every trained defender on unique outside tiles on that side, including previously undeployed troops, and update all return posts. Melee troops fill the ranks nearest the chosen attack direction first; ranged troops fill ranks closest to the settlement first. Within each rank, tiles nearest the attack lane center fill first. Recruitment order does not affect the formation. Each side can use the expanded visible field, with available capacity determined from its tiles. Normal-sized formations remain compact near the walls. If the army exceeds a side capacity, a chronicle message explains the limit and no troops move.

## Ranged support behavior

Ranged defenders use nearby living melee troops as a screening line relative to their current enemy. They hold position when safely behind the line and within bow range, approach firing positions without overtaking it, and seek a reachable rear tile if manually exposed. A fallen melee unit stops acting as an anchor. Without a nearby screen, ranged units approach firing range and hold once they can attack. Arrows pass over friendly troops. Pathfinding still respects occupied/reserved cells and intact walls; cramped formations or blocked rear tiles may limit retreat.

## Skirmishers and expanded pursuit

Feudal Age now unlocks Skirmisher (25 food + 35 wood), a ranged javelin unit that deals triple damage against enemy archers. Castle Age research unlocks Elite Skirmisher (200 wood + 100 gold research), upgrading all existing Skirmishers and future recruits. Both use imported sixteen-direction walk/attack artwork, ranged formation logic, and the damage meter.

The exterior deployment and navigation lattice now extends to all four camera edges, replacing the earlier three-tile limit. The protected settlement is still unavailable for manual deployment; defenders can enter after a wall breach. Melee troops can now pursue archers beyond the former boundary. Redeploy all keeps ordinary formations near the walls so melee and ranged troops stay together; larger armies can use additional field tiles.

## Speed and wall defense

The simulation runs at 1.2x speed, including movement, combat cooldowns, enemy spawning, projectiles, and sprite animation. Planning remains paused.

The castle label is Castle, and its arrows target the living enemy with the lowest absolute HP inside its range. Equal-health targets are ordered by distance.

Defenders can navigate the exterior margin next to intact walls, which lets melee units counterattack enemies along all four sides and corners. Manual deployment still excludes the settlement. Crossing into the base still requires a wall breach.

## Blacksmith research

The Research tab includes permanent, age-gated blacksmith chains. Fletching and Bodkin Arrow each add +1 ranged attack and +1 tile range; Bracer adds the same at Imperial Age. Forging and Iron Casting each add +1 melee attack; Blast Furnace adds +2. One range tile equals 40 world units. Ranged attack research also improves castle arrow attack and range.

Separate armor chains apply to ranged troops (Padded/Leather/Ring Archer Armor), infantry (Scale/Chain/Plate Mail Armor), and cavalry (Scale/Chain/Plate Barding Armor). Each tier adds +1 melee armor; the first two add +1 ranged armor and the final tier adds +2. Incoming attacks deal at least one damage. Prices and effects are adapted for the prototype.

Research requires the appropriate age, previous tier, and resources, and is limited to preparation time. Bonuses apply immediately to existing and future eligible troops, persist through troop-type upgrades, and reset on a new game. Training and garrison entries display current attack, range in tiles, and melee/ranged armor.

## Stable defender movement

Defenders retain a living target while it remains attackable and switch when it dies or an attackable enemy is available instead of a distant chase. Ranged troops retain their melee anchor rather than switching whenever nearby troops move. Units stop immediately when they have a valid attack position, including midway through a grid step. Pending steps resume only when needed, and ordinary route changes happen at tile boundaries instead of reversing movement every frame. A short grace period smooths tiny range-boundary changes without permanently ignoring out-of-range enemies. Target and anchor locks reset after each cleared wave.

## XP, levels, and civilisation legacies

Enemy kills award shared army XP exactly once, including castle kills. XP is `ceil(sum of the enemy type base resource costs / 10 * (1 + ageIndex * 0.5))`, using Dark=0, Feudal=1, Castle=2. Current rewards are Militia 8, Scout Cavalry 12, Archer 10, Men-at-Arms 13, and Long Swordsman 20 XP. Player recruitment discounts do not change enemy XP.

Start at level 1. The next-level requirement is `ceil(60 * 1.45^(level - 1))`: 60, 87, 127, and so on. Overflow XP carries forward. Each earned level immediately pauses the battle, movement, attacks, spawning, and animation and opens three distinct random unchosen unique technologies. Choose by clicking or pressing 1, 2, or 3. Tab remains inside the choice dialog. A choice is required to resume; multiple earned levels queue further choices. Final-kill wave completion and victory wait for the choice.

The top-left panel shows level, XP progress, and selected technologies. Hover a chosen name to see its civilisation and effect. Selections persist for this game and reset on New game/refresh.

The pool contains 32 real civilisation unique technologies whose effects can be represented by this prototype. Technologies requiring unsupported ships, siege units, monks, markets, population caps, or other absent systems are not offered. Cards explicitly describe adaptations: for example, Yeomen grants +1 grid-tile ranged-unit range and its tower attack bonus applies to castle arrows. This is a curated supported pool, not a complete implementation of every AoE2 civilisation technology. Tower bonuses use the castle where stated; per-second and per-wave economic effects are adapted as described on each card.

Names and original effects were checked against the local CivTechTrees JSON and English technology strings. The official guide also describes unique technologies and Yeomen: https://www.ageofempires.com/learn-to-play/civilizations-game-modes-aoe2/

## WebGPU renderer and visual settings

The game starts at a main menu with Begin game, Settings, and Leaderboard. The default renderer is native WebGPU: sprites and geometry are transformed into textured GPU quads and batched by texture; only small text textures use Canvas text rasterization. It does not upload a complete Canvas frame to WebGPU. If no adapter is available or a device is lost, Canvas 2D compatibility mode is used. The active backend is shown in the menu and settings, and can be switched live. WebGPU requires a supported browser/driver and a secure origin (localhost qualifies).

Graphical options include renderer, render scale (50/75/100/150%), frame cap (30/60/120), grid contrast/visibility, projected shadows, terrain/vegetation detail, combat particles, and lighting/vignette. The visual pass adds higher-resolution terrain, full-cycle animation sampling, wind sway, ground detail, projected shadows, hit/death particles, and a redesigned medieval interface.

Press Escape or Pause / Esc during a run to open Resume, Settings, and Exit run. Battle and animations freeze, including during settings. If an XP choice was pending, Resume returns to it. Losing browser visibility also pauses the run. Menu dialogs support keyboard navigation.

## Music and effects

Local AoE2 Wwise audio has been extracted into ignored `public/assets/audio/` WAV files. UI, research, and victory events are matched through the soundbank event graph. A base-game score segment loops as music; short imported effects provide combat accents. The importer records package/media IDs in its manifest. Audio begins after an interaction to comply with browser playback rules. Settings expose master, music, effects, and mute controls.

To regenerate the audio, obtain the official vgmstream Windows CLI release and run:

```powershell
node scripts/import-aoe-audio.cjs 'E:\SteamLibrary\steamapps\common\AoE2DE' '.tools/audio/vgmstream/vgmstream-cli.exe'
```

The current workspace already has this converter in the ignored `.tools/` directory. Imported audio is converted to mono PCM16 at 24 kHz; the music excerpt is limited to 100 seconds with loop fades. Sources: https://github.com/vgmstream/vgmstream and https://github.com/bnnm/wwiser-utils/blob/master/scripts/wwise_pck_extractor.bms

## Local leaderboard

Completed, defeated, and exited runs record kills, highest wave reached, level, result, and date. Sort by kills or wave. The best 25 runs by each criterion plus the latest run are retained, deduplicated (at most 51 records), so later poor runs do not erase your records. Scores and settings use localStorage, not an online account or shared leaderboard. If storage is disabled, session scores still work.

## Browser validation

```powershell
npm.cmd run build
npm.cmd run test:browser
```

The browser check uses installed Chrome at its standard Windows path with an isolated profile and writes screenshots under ignored `.tmp/`. It verifies native WebGPU when available, compatibility mode switching, menu/settings/run flow, real audio decoding, pause/resume/exit, persisted scores/settings, and Escape during XP selection. The Node test suite also tests GPU command generation and shell state separately. WebGPU references: https://www.w3.org/TR/webgpu/ and https://webgpufundamentals.org/webgpu/lessons/webgpu-transparency.html

## Repository and in-game updates

Source repository: https://github.com/tcsteel/AGE_Defenders

Clone it, run `npm ci`, import your local AoE2 graphics/audio as described above, then run `npm run dev`. For production use `npm run build` followed by `npm start`. Both launchers supervise the server so a completed in-game update can restart it. Game graphics and audio are committed. Local scores/settings, build outputs, converter binaries, and update workspaces are not committed.

Web updates is available on the main menu and in Settings. It checks the configured `origin/main` revision at startup, every five minutes while the menu is open, or when Check for updates is pressed. Install update requires the running branch to be `main`, the configured origin to match `update-config.json`, and the working tree to be clean. Installing during a run records that run as retired.

The local-only updater verifies the expected revision, fetches the configured branch, rejects divergent history, and validates a build plus core tests in a temporary Git worktree before fast-forwarding the running source. Local graphics and audio stay untouched. The server supervisor restarts after a successful build; use Reload updated game to load it in the browser. The API rejects remote callers, cross-origin installation requests, and unexpected hosts. No GitHub token is exposed to browser JavaScript. Private repositories use the server user Git credentials.

Dependency or lockfile changes are deliberately not installed from the web UI. For those, update in Cursor with `git pull --ff-only`, `npm ci`, `npm run build`, then restart the game. Preflight failures leave the installed checkout unchanged. If an update reports that source was installed but the build could not be copied, rebuild manually before restarting.

This updates the local checkout from GitHub; it does not publish a hosted website. GitHub Actions runs source tests, type checks, and builds on pushes and pull requests. To change the trusted repository/branch, update `update-config.json` and the local origin intentionally.

## Windows download

Download **AGE-Defenders-1.2.0-Windows.exe** from [GitHub Releases](https://github.com/tcsteel/AGE_Defenders/releases/latest) and run it. The portable Windows x64 executable includes the game engine, graphics and audio. It needs neither Node.js nor a separate AoE2 installation. Windows may show an unknown publisher prompt because this build is unsigned.

Settings and scores are stored in the desktop app profile. The game listens only on this computer at port 3167; it stops its server when closed. A second launch focuses the existing window. If that port is occupied by another application, close that application before launching.

Web updates in the Windows build checks GitHub Releases and links to the latest executable. Download the replacement and close the old game before launching it. The source checkout retains its Git updater.

To build locally: `npm ci`, then `npm run desktop:build`. The executable appears under `release/`. `npm run desktop` starts the desktop app from source. `npm run test:desktop` verifies a built portable executable. The Windows release workflow builds and attaches the executable when a `v*` tag is pushed. Bump package.json/package-lock.json versions before a new release. See [ASSET-NOTICE.md](ASSET-NOTICE.md) for third-party asset information.

## Building management and intermissions (v1.2)

Click the castle on the map (or its sidebar shortcut) to open Army & deployment, Troop upgrades, Blacksmith, and Walls & towers. Advancing ages remains available in the castle. Click a farm/mill, lumber camp, gold mine, or stone quarry to assign its villagers and purchase only that resource's research. Escape closes the building window before pausing the game.

Starting a wave with idle villagers is blocked by an on-screen message. Assign every idle villager at a resource building, then start the wave again. Each victory still grants one new idle villager. During preparation the upcoming attack lane is red with inward-facing arrows.

Enable **Auto deploy to front** in the assault panel to move all mobile defenders, including undeployed troops, to the next attack side after victory. Melee stand ahead of ranged units, occupied tower tiles are skipped, and the new formation becomes each troop's return post. Towers stay where you built them. The option resets for a new run.

Watch Towers are constructed through Castle > Walls & towers from Feudal Age for 50 wood + 125 stone. Select an exterior or wall grid tile to place the purchased tower. Towers have 450 HP, 10 base attack, 6.5-tile range, and a 1.2-second firing interval. Ranged blacksmith research improves their attack/range; Yeomen adds 2 attack. They can intersect wall tiles without changing wall HP, tier, or collision. Enemies can damage/destroy towers, but must still breach the walls to reach the castle. Repair damaged towers between waves; rebuilding requires a clear tile. Tower damage appears as its own group in the damage meter.
