/** Text measurement abstraction: real canvas in the app, deterministic stub in tests. */

export interface FontSpec {
  family?: string | undefined;
  weight?: string | undefined;
}

export interface TextMeasurer {
  /** Width of `text` in world units when rendered at `fontSize`. */
  measureWidth(text: string, fontSize: number, font?: FontSpec): number;
  /** CSS `font` shorthand for the canvas `2d` context. */
  fontString(fontSize: number, font?: FontSpec): string;
}

const CJK =
  /[\u1100-\u11ff\u2e80-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uff60\uffe0-\uffe6]/;

/** Approximate measurer: full-width for CJK, half-width for Latin. */
export function createApproximateTextMeasurer(): TextMeasurer {
  return {
    measureWidth: (text, fontSize) => {
      let width = 0;
      for (const character of text) {
        width += CJK.test(character) ? fontSize : fontSize * 0.5;
      }
      return width;
    },
    fontString: (fontSize, font) =>
      `${font?.weight || "normal"} ${fontSize}px ${font?.family || "sans-serif"}`,
  };
}

interface MeasureContext {
  font: string;
  measureText(text: string): TextMeasureResult;
}

interface TextMeasureResult {
  width: number;
}

/** Measurer backed by a real 2D context (canvas or OffscreenCanvas). */
export function createCanvasTextMeasurer(context: MeasureContext): TextMeasurer {
  const apply = (fontSize: number, font?: FontSpec): void => {
    context.font = `${font?.weight || "normal"} ${fontSize}px ${font?.family || "sans-serif"}`;
  };
  return {
    measureWidth: (text, fontSize, font) => {
      apply(fontSize, font);
      return context.measureText(text).width;
    },
    fontString: (fontSize, font) =>
      `${font?.weight || "normal"} ${fontSize}px ${font?.family || "sans-serif"}`,
  };
}
