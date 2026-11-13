import tokensCss from './tokens.css?raw';

/*
 * WCAG contrast of the design tokens, computed from `tokens.css` itself so the palette cannot
 * drift below the thresholds of PLAN §8.2 / HIG "Accessibility › Vision": 4.5:1 for text and 3:1
 * for the non-text parts needed to identify a control (field borders, the focus ring).
 */

type Rgba = [r: number, g: number, b: number, a: number];
type Palette = Record<string, Rgba>;

function parseColor(value: string): Rgba | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex?.[1]) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgba?.[1]) {
    const [r = 0, g = 0, b = 0, a = 1] = rgba[1].split(',').map(Number);
    return [r, g, b, a];
  }
  return null;
}

function parsePalette(block: string): Palette {
  const palette: Palette = {};
  for (const [, name, value] of block.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
    const color = parseColor((value ?? '').trim());
    if (name && color) palette[name] = color;
  }
  return palette;
}

const darkStart = tokensCss.indexOf('@media (prefers-color-scheme: dark)');
const light = parsePalette(tokensCss.slice(0, darkStart));
const dark = { ...light, ...parsePalette(tokensCss.slice(darkStart)) };

/** `fg` at `alpha` (times its own alpha) painted over an opaque `bg`. */
function over(fg: Rgba, bg: Rgba, alpha = 1): Rgba {
  const a = fg[3] * alpha;
  return [0, 1, 2].map((i) => fg[i]! * a + bg[i]! * (1 - a)).concat(1) as Rgba;
}

function luminance([r, g, b]: Rgba): number {
  const [lr = 0, lg = 0, lb = 0] = [r, g, b].map((channel) => {
    const v = channel / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** Contrast of `fg` drawn on the opaque `bg` (translucent foregrounds are composited first). */
function contrast(fg: Rgba, bg: Rgba): number {
  const [hi, lo] = [luminance(over(fg, bg)), luminance(bg)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ['bg', 'bg-grouped', 'bg-elevated', 'bg-secondary'] as const;
const STATUS_TONES = ['red', 'orange', 'yellow', 'green', 'teal', 'gray'] as const;
const TEXT = 4.5;
const NON_TEXT = 3;

interface Pair {
  name: string;
  ratio: number;
  min: number;
}

function pairs(p: Palette): Pair[] {
  const c = (name: string): Rgba => {
    const color = p[name];
    if (!color) throw new Error(`Missing token --color-${name}`);
    return color;
  };
  const out: Pair[] = [];
  const add = (name: string, fg: Rgba, bg: Rgba, min = TEXT) =>
    out.push({ name, ratio: contrast(fg, bg), min });

  for (const surfaceName of SURFACES) {
    const surface = c(surfaceName);
    const fill = over(c('fill'), surface); // hover background of rows, plain buttons, tracks

    for (const text of ['label', 'label-secondary', 'accent', 'danger']) {
      add(`${text} on ${surfaceName}`, c(text), surface);
      add(`${text} on fill over ${surfaceName}`, c(text), fill);
    }
    // Tinted button: rest, hover and pressed (Button.tsx: bg-accent/12, /16, /20).
    for (const alpha of [0.12, 0.16, 0.2]) {
      add(
        `accent on its ${alpha * 100} % tint over ${surfaceName}`,
        c('accent'),
        over(c('accent'), surface, alpha),
      );
    }
    // Badges and notices: label text on a 15 % tint of the status hue.
    for (const tone of STATUS_TONES) {
      add(
        `label on ${tone} 15 % tint over ${surfaceName}`,
        c('label'),
        over(c(tone), surface, 0.15),
      );
    }
    // Non-text: focus ring and the border of a form control (drawn on the elevated field).
    add(`focus ring (accent) against ${surfaceName}`, c('accent'), surface, NON_TEXT);
    add(
      `control border against ${surfaceName}`,
      over(c('control-border'), c('bg-elevated')),
      surface,
      NON_TEXT,
    );
  }

  for (const fill of ['accent-fill', 'accent-fill-hover', 'accent-fill-active']) {
    add(`on-accent on ${fill}`, c('on-accent'), c(fill));
  }
  for (const fill of ['danger-fill', 'danger-fill-hover', 'danger-fill-active']) {
    add(`on-accent on ${fill}`, c('on-accent'), c(fill));
  }
  add('label on the selected segment', c('label'), c('segment-selected'));
  return out;
}

describe.each([
  ['light', light],
  ['dark', dark],
])('token contrast (%s)', (_scheme, palette) => {
  it('parses the palette', () => {
    expect(Object.keys(palette).length).toBeGreaterThan(20);
  });

  it.each(pairs(palette).map((pair) => [pair.name, pair] as const))('%s', (_name, pair) => {
    expect(pair.ratio).toBeGreaterThanOrEqual(pair.min);
  });
});

describe('token contrast helpers', () => {
  it('computes the WCAG extremes', () => {
    expect(contrast([0, 0, 0, 1], [255, 255, 255, 1])).toBeCloseTo(21, 5);
    expect(contrast([255, 255, 255, 1], [255, 255, 255, 1])).toBeCloseTo(1, 5);
  });

  it('gives the dark scheme its own values', () => {
    expect(dark['bg']).not.toEqual(light['bg']);
    expect(dark['accent']).not.toEqual(light['accent']);
  });
});
