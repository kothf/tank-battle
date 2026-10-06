# Changelog

All notable changes to Retro Tank Battle are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/kothf/tank-battle/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/kothf/tank-battle/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/kothf/tank-battle/releases/tag/v1.0.0
