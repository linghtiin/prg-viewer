# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Outline tree mode now renders two kinds of trees under the same grouped headings as category mode. `分组` holds the
  containment trees: every frame that is not inside another frame is a root, and the entities drawn inside a frame
  are its children. `文本` / `公式` / `图片` / `其他` hold the connection trees: hierarchy comes only from edges,
  grouped by each root's kind. A frame reached by an edge appears in a connection tree without expanding its
  contained entities, so a frame can show up in both groups with different children, and a node wrapped by a frame
  keeps its edge parent.
- In tree mode a group frame is marked by its collapse corner (accent colour inside a small box; a childless frame
  keeps an empty box) instead of a prefix glyph; plain nodes keep the faint, boxless chevron.
- Outline rows are keyed per group, so a node that appears in both trees stays distinguishable for focus and
  arrow-key navigation, and navigation follows the grouped row order.

### Fixed

- Nested group frames are no longer hidden by their parent. A section is serialized both at the top level of the
  stage and inside its parent's `children`, so the inner frame was read first and painted under the outer frame's
  opaque fill; nesting depth now comes from containment, which restores the inner frames and their titles.
- Tree-mode styling no longer leaks into category mode: outline rows are left aligned again (no centred labels),
  and category mode keeps its original glyph-free, evenly weighted rows.

## [0.2.0] - 2026-11-16

### Added

- Outline sidebar can switch between a collapsible node tree and the previous kind-grouped list; the tree nests
  section children, or follows directed edges for mind-map files without sections. New `outlineMode` setting
  with per-branch and expand/collapse-all controls.
- Outline sidebar is resizable by dragging its left edge; the width used when a file opens comes from the new
  "default outline width" setting.
- Arrow keys now move the selection in both the canvas and the outline; `Shift + arrow` keeps the previous
  pan behaviour, and left/right collapse, expand or walk between parent and child in the tree.
- Details panel visually separates a node's own text from its attached rich-text blocks.
- The sidebar now splits into two independent scroll areas: the outline takes the remaining height and the details
  panel stays pinned at the bottom, so long outlines no longer push details out of view.
- The divider between outline and details can be dragged to give the details pane more (or less) height;
  double-clicking the divider restores the configured default height.
- New "default outline width" and "default details height" settings define the initial sidebar layout for every
  file. Dragging the split bars afterwards only affects the current session, so `data.json` is not rewritten and
  the next file opens with the settings values again.
- Wheel behaviour setting: wheel zooms by default (`Ctrl/⌘ + wheel` pans) and the two modes can be swapped.
- Transparent nodes get a translucent fill when zoomed out, keeping their silhouette readable.

### Changed

- Reading state (per-file zoom and position) moved from `data.json` to `reading-state.json` in the plugin
  folder, so `data.json` only changes when settings change; this file can be added to `.gitignore`.
  Cameras stored in older `data.json` files are migrated on first load.

### Fixed

- The outline tree no longer shows a tooltip for the whole list area, and its collapse arrows keep a screen-reader
  label without a hover tooltip.
- Outline rows are no longer drawn with Obsidian's default button chrome (raised background and bullets).
- Section frames were dropped because their geometry is serialized as `_collisionBoxNormal`; collapsed
  sections now render as a centred title-sized frame.
- Section frames are now measured from the serialized boundary `Line` shapes; the title-bar rectangle was previously mistaken for the whole frame.
- Text blocks are vertically centred inside their node instead of sitting slightly below the centre.
- Text nodes grow slightly when the local font measures wider than the stored box, so the last characters no longer cross the border.
- Repeated node uuids (sections inline their children and the stage also lists them) are deduplicated
  silently instead of producing warnings.

## [0.1.0] - 2026-10-28

### Added

- Obsidian view for Project Graph `.prg` files (`registerExtensions` + `FileView`).
- PRG container parser: ZIP limits, MessagePack decoding, serializer `_` / `$` reference resolution,
  sections, attachments, tags, references, README and version warnings.
- Canvas renderer for text nodes, images, sections and curved edges with arrow heads and labels,
  following Project Graph's font scale, padding, radius and edge anchoring rules.
- LaTeX nodes rendered through KaTeX MathML in an HTML overlay.
- Pan / zoom / fit / reset camera with per-file persistence (plugin data only, never the `.prg`).
- Node search, outline sidebar and details panel (text, uuid, geometry, rich-text details, image preview).
- `prg://` deep links: copy file / node / viewport links and open in Project Graph.
- Commands, file-menu entries, ribbon button and settings tab.
- Engineering baseline: strict TypeScript, ESLint, Prettier, `node:test` suite with coverage thresholds,
  synthetic PRG fixture generator, `inspect` CLI, CI and release workflows, ADRs and docs.
