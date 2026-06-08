# PuzzleScript Next 3D

PuzzleScript Next 3D is an experimental fork of
[PuzzleScript Next](https://github.com/david-pfx/PuzzleScriptNext). It adds a
3D board, 3D rendering, and 3D browser entry points to the PuzzleScript Next
editor and player.

This is not an official PuzzleScript Next release. For stable 2D PuzzleScript
Next, use the upstream project:

- Stable release: https://puzzlescriptnext.polyomino.com/
- Development version: https://david-pfx.github.io/PuzzleScriptNext/src/index.html
- Documentation: https://david-pfx.github.io/PuzzleScriptNext/src/Documentation

Repository:

- https://github.com/smyrnensis/PuzzleScriptNext

## Scope

3D support is opt-in through `three_dimensions`. The goal is to extend
PuzzleScript Next with depth, `front` / `back` directions, 3D sprites, and a 3D
browser renderer without turning the language into a separate dialect.

The implementation is still experimental. Some 2D behavior is covered by
preservation and parity tests, but not every PuzzleScript Next feature should be
assumed to work in 3D yet. Undocumented differences from 2D behavior should be
treated as bugs or unfinished work.

For syntax and authoring details, use the local 3D documentation and bundled
examples:

- `src/Documentation/3d.html`
- `src/demo/3d microban.txt`
- `src/demo/ladder.txt`

## Repository Layout

- `src/`: browser editor, player, documentation, demos, and runtime assets
- `src/Documentation/3d.html`: local 3D authoring documentation
- `src/demo/`: bundled demo sources
- `src/js/`: parser, compiler, runtime, rendering, editor, and 3D support code
- `src/js/vendor/`: bundled browser dependencies, including Three.js builds
- `test/`: Node-based test suite, including 2D preservation and 3D coverage
- `bin/`: generated build output

## Upstream Background

This fork builds on the PuzzleScript family:

- [PuzzleScript](https://github.com/increpare/PuzzleScript) by Stephen Lavelle
- [PuzzleScript Plus](https://github.com/Auroriax/PuzzleScriptPlus)
- [Pattern:Script](https://clementsparrow.github.io/Pattern-Script)
- [PuzzleScript Next](https://github.com/david-pfx/PuzzleScriptNext)

## License and Attribution

PuzzleScript Next is distributed under the MIT License. The original license
notice is preserved in [LICENSE](LICENSE).

Unless stated otherwise, local changes in this fork are intended to be
distributed under the same MIT License. Bundled third-party code is documented
in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
