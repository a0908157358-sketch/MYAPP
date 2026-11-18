export interface CustomPalette {
  lightBg: string;
  darkBg: string;
  accent: string;
}

export const DEFAULT_CUSTOM_PALETTE: CustomPalette = {
  lightBg: '#F5EBE0',
  darkBg: '#121316',
  accent: '#C89B6E',
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}

export function mixHex(hexA: string, hexB: string, weightB: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const w = Math.max(0, Math.min(1, weightB));
  return rgbToHex(
    a.r * (1 - w) + b.r * w,
    a.g * (1 - w) + b.g * w,
    a.b * (1 - w) + b.b * w
  );
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function applyCustomPaletteToDocument(
  palette: CustomPalette,
  colorMode: 'light' | 'dark'
): void {
  const root = document.documentElement;
  const isDark = colorMode === 'dark';

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  const canvasBg = isDark ? palette.darkBg : palette.lightBg;
  const surfaceBase = isDark
    ? mixHex(palette.darkBg, '#FFFFFF', 0.05)
    : mixHex(palette.lightBg, '#FFFFFF', 0.65);

  const accent400 = mixHex(palette.accent, '#FFFFFF', 0.22);
  const accent500 = palette.accent;
  const accent600 = mixHex(palette.accent, '#000000', 0.14);
  const accent700 = mixHex(palette.accent, '#000000', 0.28);

  root.style.setProperty('--bg-canvas', canvasBg);
  root.style.setProperty('--bg-surface', hexToRgba(surfaceBase, isDark ? 0.78 : 0.76));
  root.style.setProperty('--bg-surface-strong', hexToRgba(surfaceBase, isDark ? 0.92 : 0.92));

  root.style.setProperty('--accent-400', accent400);
  root.style.setProperty('--accent-500', accent500);
  root.style.setProperty('--accent-600', accent600);
  root.style.setProperty('--accent-700', accent700);
  root.style.setProperty('--accent-glow-1', hexToRgba(palette.accent, isDark ? 0.20 : 0.16));
  root.style.setProperty('--accent-glow-2', hexToRgba(accent400, isDark ? 0.13 : 0.12));

  // 同步更新手機瀏覽器狀態列 theme-color meta
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', canvasBg);
  }
}
