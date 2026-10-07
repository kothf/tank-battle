# Changelog

All notable changes to Retro Tank Battle are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.2.0] - 2026-10-07

### Changed
- The game view fills the space it gets: the canvas keeps 360 pixel rows and its width follows the window's shape (from 4:3 up to 3.2:1), so wide windows and fullscreen show more battlefield instead of black bars.
- The camera frames both tanks at the start of every turn on every map size, zooming out as far as needed; zoomed out, a coloured marker floats above each tank. Zooming with the mouse wheel takes manual control until the next turn (or `C`).
- Licensed under the MIT license.

## [2.1.0] - 2026-10-07

### Added
- Three map sizes: Small (1200 px, about 2 screens), Medium (1800 px) and Large (2800 px, about 4.5 screens), chosen on the mode bar and remembered. Shell speed scales with the map, so the same power crosses the same share of any field.
- `F` toggles fullscreen.

### Fixed
- Sound: audio now starts on the first click, tap or key press. The game used to create its audio before any interaction, which browsers start blocked, and on iPhones the ringer switch silenced it. The sound button shows the real state (click for sound / on / muted), and mute is remembered.
- Fullscreen (and laptop-sized windows) no longer need scrolling: the cabinet fits the screen height and the game view shrinks to fit at 16:9. Weapons sit in one row in fullscreen; phones without the Fullscreen API (iPhone) get a fill-the-window mode.
- At the farthest spawn points into the strongest headwind a shot could fall short even at 100 % power. Shells are 7 % faster, so every spawn can be reached on every map size.

## [2.0.1] - 2026-10-07

### Fixed
- Release archives are byte-identical on any machine: file permissions inside the archive are normalised.
- GitHub Pages now serves the packaged release build.

## [2.0.0] - 2026-10-07

### Added
- Scrolling 1800×540 battlefield seen through the 640×360 pixel view: camera follows the aim, the shell and the explosion; mouse-wheel zoom, whole-map view (`V`), re-centre (`C`), clickable minimap, edge markers for off-screen shells and the enemy.
- Six weapons: Triple Shot, Funky Bomb, Napalm, Homing Missile, Air Strike, Roller (13 in total). The weapon tray and help list are generated from the weapon definitions; keys `1`–`9`, `0`, and `[` / `]` to cycle.
- Bot brackets like a gunner: if nothing moved and nobody was hit, it keeps its weapon and angle and only corrects the power.
- Bot picks weapons by situation (ridge in the way, target in a hollow, target low on health).
- Synthesized sounds for napalm, homing lock and the bomber.
- Phone layout: HUD and controls stack below 560 px.
- Automated smoke test, CI, and release packaging with versioned asset URLs.

### Changed
- **Breaking:** weapon hotkeys follow the new weapon order (e.g. the Heavy Nuke is now `3`).
- Fixed 60 Hz simulation step; the game previously ran 2–2.4× too fast on 120/144 Hz displays.
- Terrain settling and repainting run once per frame over a dirty rectangle instead of whole columns per crater.
- Particle system compacts in place, culls to the view and caps its size; sky and parallax layers are pre-rendered; the HUD only writes changed values; audio noise buffers are cached.
- Bot aiming: sub-stepped trajectory simulation (no more "seeing" through thin ridges), refined search, and difficulty expressed as aiming error at the target so it feels the same at any range.
- Cannon range and tank fuel scaled for the larger battlefield; random spawn points.

## [1.0.0] - 2026-09-07

### Added
- Two-player hotseat and VS-bot modes with Recruit / Veteran / Elite skill levels.
- Seven weapons: Standard Shell, Heavy Nuke, MIRV Cluster, Dirt Bomb, Bouncy Shot, Sniper Piercer, Tunnel Drill.
- Destructible procedural terrain with crater carving, gravity collapse and sand-slide; slope-following tanks with fall damage.
- Web Audio synthesized sound effects, CRT scanline overlay.

### Fixed
- MIRV strike could lock the game in the falling state.
- Shell trajectory now starts at the slope-aware turret pivot; barrel angle stays stable across turns.
- Weapon and fall damage rebalanced for the 100 HP tank.

[Unreleased]: https://github.com/kothf/tank-battle/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/kothf/tank-battle/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/kothf/tank-battle/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/kothf/tank-battle/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/kothf/tank-battle/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/kothf/tank-battle/releases/tag/v1.0.0
