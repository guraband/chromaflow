const imageInput = document.querySelector('#imageInput');
const dropZone = document.querySelector('#dropZone');
const imagePreview = document.querySelector('#imagePreview');
const workCanvas = document.querySelector('#workCanvas');
const paletteGrid = document.querySelector('#paletteGrid');
const colorCountInput = document.querySelector('#colorCount');
const colorCountValue = document.querySelector('#colorCountValue');
const downloadBtn = document.querySelector('#downloadBtn');
const swatchTemplate = document.querySelector('#swatchTemplate');
const statusMessage = document.querySelector('#statusMessage');

const ROLE_NAMES = ['Base', 'Surface', 'Primary', 'Secondary', 'Accent', 'Muted', 'Highlight', 'Success', 'Warning', 'Info'];
let palette = [];

colorCountInput.addEventListener('input', () => {
  colorCountValue.textContent = colorCountInput.value;
  if (imageInput.files[0]) {
    handleFile(imageInput.files[0]);
  }
});

imageInput.addEventListener('change', () => {
  const [file] = imageInput.files;
  if (file) handleFile(file);
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragover');
  });
});

dropZone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file && file.type.startsWith('image/')) {
    imageInput.files = event.dataTransfer.files;
    handleFile(file);
    return;
  }
  setStatus('이미지 파일만 업로드할 수 있습니다.', 'warning');
});

downloadBtn.addEventListener('click', () => {
  const data = {
    generatedAt: new Date().toISOString(),
    colorCount: palette.length,
    colors: palette,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chromaflow-palette.json';
  a.click();
  URL.revokeObjectURL(url);
});

async function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    setStatus('이미지 파일만 업로드할 수 있습니다.', 'warning');
    return;
  }

  try {
    setStatus('이미지를 분석하는 중...', '');
    const dataUrl = await fileToDataURL(file);
    renderPreview(dataUrl);
    const image = await loadImage(dataUrl);
    palette = extractPalette(image, Number(colorCountInput.value));
    renderPalette(palette);
    downloadBtn.disabled = palette.length === 0;

    if (palette.length) {
      setStatus(`${palette.length}개 색상을 추출했습니다.`, 'success');
    } else {
      setStatus('색상을 찾지 못했습니다. 다른 이미지를 시도해보세요.', 'warning');
    }
  } catch {
    palette = [];
    renderPalette(palette);
    downloadBtn.disabled = true;
    setStatus('이미지를 처리하지 못했습니다. 다른 파일을 시도해주세요.', 'error');
  }
}

function setStatus(message, kind) {
  statusMessage.textContent = message;
  statusMessage.className = 'status-message';
  if (kind) {
    statusMessage.classList.add(kind);
  }
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function renderPreview(src) {
  imagePreview.innerHTML = '';
  const img = document.createElement('img');
  img.src = src;
  img.alt = '업로드 이미지 미리보기';
  imagePreview.append(img);
}

function extractPalette(img, count) {
  const maxSize = 240;
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const width = Math.max(1, Math.floor(img.width * scale));
  const height = Math.max(1, Math.floor(img.height * scale));

  workCanvas.width = width;
  workCanvas.height = height;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);

  const { data } = ctx.getImageData(0, 0, width, height);
  const buckets = new Map();
  const bucketSize = 20;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 180) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const key = `${Math.floor(r / bucketSize)}-${Math.floor(g / bucketSize)}-${Math.floor(b / bucketSize)}`;
    const prev = buckets.get(key) || { r: 0, g: 0, b: 0, total: 0 };

    buckets.set(key, {
      r: prev.r + r,
      g: prev.g + g,
      b: prev.b + b,
      total: prev.total + 1,
    });
  }

  const sortedByFrequency = [...buckets.values()]
    .map((bucket) => ({
      r: Math.round(bucket.r / bucket.total),
      g: Math.round(bucket.g / bucket.total),
      b: Math.round(bucket.b / bucket.total),
      total: bucket.total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, Math.max(count * 2, count));

  const deduped = [];
  for (const color of sortedByFrequency) {
    if (!deduped.some((item) => colorDistance(item, color) < 26)) {
      deduped.push(color);
    }
    if (deduped.length >= count) break;
  }

  // 유사색 제거 이후 색상 수가 부족하면 빈도순 후보로 보충
  if (deduped.length < count) {
    for (const color of sortedByFrequency) {
      if (!deduped.includes(color)) {
        deduped.push(color);
      }
      if (deduped.length >= count) break;
    }
  }

  const contrastOrdered = deduped
    .sort((a, b) => relativeLuminanceRgb(a) - relativeLuminanceRgb(b))
    .map((color, idx) => ({
      role: ROLE_NAMES[idx] || `Tone ${idx + 1}`,
      hex: rgbToHex(color.r, color.g, color.b),
      rgb: `rgb(${color.r}, ${color.g}, ${color.b})`,
      hsl: rgbToHslString(color.r, color.g, color.b),
      contrastOnWhite: contrastRatio(color, { r: 255, g: 255, b: 255 }),
      contrastOnBlack: contrastRatio(color, { r: 0, g: 0, b: 0 }),
    }));

  return contrastOrdered;
}

function renderPalette(colors) {
  paletteGrid.innerHTML = '';

  if (!colors.length) {
    paletteGrid.textContent = '색상을 찾을 수 없습니다. 다른 이미지를 시도해보세요.';
    return;
  }

  colors.forEach((color) => {
    const node = swatchTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.swatch-color').style.background = color.hex;
    node.querySelector('.swatch-role').textContent = color.role;
    node.querySelector('.swatch-hex').textContent = `${color.hex} · ${color.hsl}`;
    node.querySelector('.swatch-contrast').textContent = `Contrast W:${color.contrastOnWhite} / B:${color.contrastOnBlack}`;

    const copyBtn = node.querySelector('.copy-btn');
    copyBtn.addEventListener('click', () => copyHex(color.hex, copyBtn));
    paletteGrid.append(node);
  });
}

async function copyHex(hex, button) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(hex);
    } else {
      legacyCopyText(hex);
    }

    button.textContent = '복사됨';
    setTimeout(() => {
      button.textContent = '복사';
    }, 1200);
  } catch {
    setStatus('클립보드 접근이 제한되었습니다. HTTPS 환경에서 시도해주세요.', 'warning');
  }
}

function legacyCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('legacy copy failed');
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function rgbToHslString(r, g, b) {
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;

  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === r1) h = ((g1 - b1) / delta) % 6;
    else if (max === g1) h = (b1 - r1) / delta + 2;
    else h = (r1 - g1) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return `hsl(${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function relativeLuminanceRgb({ r, g, b }) {
  const [rr, gg, bb] = [r, g, b].map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
}

function contrastRatio(a, b) {
  const l1 = relativeLuminanceRgb(a);
  const l2 = relativeLuminanceRgb(b);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return ratio.toFixed(2);
}
