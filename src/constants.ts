/** Shared constants for the plugin and the renderer. */

export const VIEW_TYPE_PRG = "prg-view";
export const PRG_EXTENSION = "prg";
export const PLUGIN_ID = "project-graph-viewer";

/** Project Graph renders text at `FONT_SIZE * 2^(fontScaleLevel / 2)`. */
export const FONT_SIZE = 32;
/** Node padding at font scale 1. */
export const NODE_PADDING = 14;
/** Corner radius of text nodes, in world units. */
export const NODE_RADIUS = 16;
/** Line height used for node text and size measurement. */
export const LINE_HEIGHT = 1.5;
/** Default stroke width of edges at font scale 1. */
export const EDGE_WIDTH = 2;
/** Text is not drawn when `fontSize * scale` is below this value. */
export const MIN_RENDERED_FONT_SIZE = 6;

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;
export const DEFAULT_IMAGE_CACHE_MB = 64;

/** Space kept between content and viewport edge when fitting. */
export const FIT_PADDING = 48;

export const DOT_GRID_STEP = 48;
export const GRID_STEP = 96;
