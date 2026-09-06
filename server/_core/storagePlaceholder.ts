/**
 * Manus Forge ストレージが未設定・取得不能な環境で、画像要素が壊れて見えないように
 * 返すダーク＋ゴールドのプレースホルダー画像（SVG）。
 * 画像キーからアクセントの位相を決めるため、複数画像でも同じ絵にならない。
 */
export function storagePlaceholderSvg(key: string): string {
  const hue = hashToUnit(key);
  const highlightX = 30 + Math.round(hue * 40);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800" role="img">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0d16"/>
      <stop offset="60%" stop-color="#111726"/>
      <stop offset="100%" stop-color="#1a1408"/>
    </linearGradient>
    <radialGradient id="glow" cx="${highlightX}%" cy="38%" r="52%">
      <stop offset="0%" stop-color="#c9a84c" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="#c9a84c" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#c9a84c" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#base)"/>
  <rect width="1200" height="800" fill="url(#glow)"/>
  <path d="M0 620 C 260 540, 520 700, 780 600 S 1080 470, 1200 520 L 1200 800 L 0 800 Z" fill="#00e5ff" fill-opacity="0.07"/>
  <path d="M0 660 C 300 600, 560 740, 820 650 S 1100 540, 1200 580" fill="none" stroke="#c9a84c" stroke-opacity="0.35" stroke-width="3"/>
</svg>`;
}

function hashToUnit(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100000;
  }
  return hash / 100000;
}
