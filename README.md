# PuzzleScript Next 3D

PuzzleScript Next 3D is an experimental 3D-enabled fork of
[PuzzleScript Next](https://github.com/david-pfx/PuzzleScriptNext).

It keeps ordinary PuzzleScript semantics as the base language and extends the
spatial model from 2D to 3D through the `three_dimensions` prelude flag.

Repository:

- https://github.com/smyrnensis/PuzzleScriptNext

## What Is Added

- `three_dimensions` as the source-level 3D mode marker
- Ordinary `LEVELS` syntax for 3D levels, with standalone `;` lines separating
  slices
- `front` and `back` directions in addition to the 2D direction vocabulary
- 3D object sprites using ordinary sprite rows plus `;` slice separators
- 3D gameplay through the editor, player, and standalone export paths
- 2D/3D parity tests for shared PuzzleScript behavior

The design goal is that 3D is PuzzleScript with two extra spatial directions,
not a separate language. Non-spatial behavior such as rules, commands, `late`,
`again`, undo, restart, checkpoints, metadata, and win flow should stay aligned
with the 2D engine.

## Try It

Open the editor and choose the bundled **Microban 3D** demo from the
`Puzzlescript Next 3D` demo group.

When running from a local checkout, the editor entry point is:

- `src/editor.html`

The canonical 3D demo source is:

- `src/demo/3d microban.txt`

## 3D Level Shape

The easiest complete example is the bundled demo:

- `src/demo/3d microban.txt`

A 3D source uses ordinary PuzzleScript sections plus the `three_dimensions`
prelude flag. Playable levels are stacked 2D slices:

```txt
title Tiny 3D Example
three_dimensions

OBJECTS
Background
black

Player
yellow
.....
..0..
..0..
..0..
.....

Wall
gray
00000
00000
00000
00000
00000

LEGEND
. = Background
P = Player
# = Wall

COLLISIONLAYERS
Background
Player, Wall

LEVELS
#####
#P..#
#####
;
#####
#...#
#####
```

In 3D mode, the standalone `;` advances to the next slice.

## Development

Install dependencies:

```bash
npm install
```

Run the full 3D and parity test suite:

```bash
npm run test:3d
```

Run the focused 2D preservation check:

```bash
npm run test:2d-preservation
```

The default test command is currently the 3D suite:

```bash
npm test
```

## Repository Layout

- `src/`: browser editor, player, documentation, demos, and runtime assets
- `src/demo/3d microban.txt`: bundled 3D demo
- `src/js/`: parser, compiler, runtime, rendering, editor, and 3D support code
- `src/js/vendor/`: bundled browser dependencies, including Three.js builds
- `test/`: Node-based test suite, including 2D/3D parity coverage
- `bin/`: generated build output

## Status

The 3D implementation is experimental. It is suitable for active development,
experimentation, and parity testing, but should not be treated as a stable
PuzzleScript Next release.

Some work was built with AI-assisted coding tools. The test suite is therefore
part of the project contract: changes that affect 3D behavior should preserve
2D semantics unless the difference is purely spatial and intentional.

## Upstream Background

This fork builds on the PuzzleScript family:

- [PuzzleScript](https://github.com/increpare/PuzzleScript) by Stephen Lavelle
- [PuzzleScript Plus](https://github.com/Auroriax/PuzzleScriptPlus)
- [Pattern:Script](https://clementsparrow.github.io/Pattern-Script)
- [PuzzleScript Next](https://github.com/david-pfx/PuzzleScriptNext)

For official PuzzleScript Next releases and documentation, use the upstream
project:

- Upstream repository: https://github.com/david-pfx/PuzzleScriptNext
- Stable release: https://puzzlescriptnext.polyomino.com/
- Development version: https://david-pfx.github.io/PuzzleScriptNext/src/index.html
- Documentation: https://david-pfx.github.io/PuzzleScriptNext/src/Documentation

## License And Attribution

PuzzleScript Next is distributed under the MIT License. The original license
notice is preserved in [LICENSE](LICENSE).

Unless stated otherwise, local changes in this fork are intended to be
distributed under the same MIT License. Bundled third-party code is documented
in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
