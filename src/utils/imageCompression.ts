/**
 * 瀏覽器端自動等比縮放與壓縮圖片，確保 Data URL 可安全儲存於 Firestore 文件中
 * （免去 Firebase Storage 設定與帳單門檻）。
 * 支援前鏡頭拍攝時的水平鏡像翻轉修正（mirrorHorizontal）。
 */
function renderSourceToCanvas(
  source: CanvasImageSource,
  targetWidth: number,
  targetHeight: number,
  mirrorHorizontal: boolean
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('瀏覽器不支援 Canvas 影像處理');
  }

  ctx.save();
  if (mirrorHorizontal) {
    // 前鏡頭水平鏡像修正：將畫布座標原點移至右上角並將 X 軸反轉
    ctx.translate(targetWidth, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
  ctx.restore();

  return canvas;
}

export function compressCanvasToJpegDataUrl(
  sourceCanvas: HTMLCanvasElement,
  options: { maxDim?: number; maxDataUrlLength?: number; mirrorHorizontal?: boolean } = {}
): string {
  const maxDim = options.maxDim ?? 960;
  const maxDataUrlLength = options.maxDataUrlLength ?? 360_000;
  const mirrorHorizontal = options.mirrorHorizontal ?? false;

  let width = sourceCanvas.width;
  let height = sourceCanvas.height;
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  let workingCanvas =
    width === sourceCanvas.width && height === sourceCanvas.height && !mirrorHorizontal
      ? sourceCanvas
      : renderSourceToCanvas(sourceCanvas, width, height, mirrorHorizontal);

  let quality = 0.85;
  let output = workingCanvas.toDataURL('image/jpeg', quality);
  while (output.length > maxDataUrlLength && quality > 0.32) {
    quality -= 0.1;
    output = workingCanvas.toDataURL('image/jpeg', quality);
  }

  if (output.length > maxDataUrlLength) {
    const scale = 0.72;
    const nextW = Math.max(240, Math.round(width * scale));
    const nextH = Math.max(240, Math.round(height * scale));
    workingCanvas = renderSourceToCanvas(sourceCanvas, nextW, nextH, mirrorHorizontal);
    output = workingCanvas.toDataURL('image/jpeg', 0.65);
  }

  return output;
}

export async function flipDataUrlHorizontal(
  dataUrl: string,
  maxDataUrlLength = 360_000
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('圖片翻轉失敗'));
    image.src = dataUrl;
  });

  const canvas = renderSourceToCanvas(img, img.naturalWidth || img.width, img.naturalHeight || img.height, true);
  return compressCanvasToJpegDataUrl(canvas, {
    maxDim: 960,
    maxDataUrlLength,
    mirrorHorizontal: false,
  });
}

export async function compressImageFile(
  file: File,
  options: { maxDim?: number; maxDataUrlLength?: number; mirrorHorizontal?: boolean } = {}
): Promise<string> {
  const maxDim = options.maxDim ?? 920;
  const maxDataUrlLength = options.maxDataUrlLength ?? 360_000;
  const mirrorHorizontal = options.mirrorHorizontal ?? false;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('讀取圖片失敗'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('圖片格式無法解析'));
    image.src = dataUrl;
  });

  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  let canvas = renderSourceToCanvas(img, width, height, mirrorHorizontal);

  let quality = 0.82;
  let output = canvas.toDataURL('image/jpeg', quality);
  while (output.length > maxDataUrlLength && quality > 0.32) {
    quality -= 0.1;
    output = canvas.toDataURL('image/jpeg', quality);
  }

  if (output.length > maxDataUrlLength) {
    // 若仍過大則再縮小尺寸，同時保留水平翻轉設定
    const scale = 0.72;
    const nextW = Math.max(240, Math.round(width * scale));
    const nextH = Math.max(240, Math.round(height * scale));
    canvas = renderSourceToCanvas(img, nextW, nextH, mirrorHorizontal);
    output = canvas.toDataURL('image/jpeg', 0.65);
  }

  return output;
}

export function compressCanvasElement(
  sourceCanvas: HTMLCanvasElement,
  maxDataUrlLength = 260_000
): string {
  let output = sourceCanvas.toDataURL('image/webp', 0.85);
  if (!output.startsWith('data:image/webp')) {
    output = sourceCanvas.toDataURL('image/png');
  }
  if (output.length <= maxDataUrlLength) {
    return output;
  }
  const scaled = document.createElement('canvas');
  scaled.width = Math.round(sourceCanvas.width * 0.75);
  scaled.height = Math.round(sourceCanvas.height * 0.75);
  const ctx = scaled.getContext('2d');
  if (ctx) {
    ctx.drawImage(sourceCanvas, 0, 0, scaled.width, scaled.height);
    return scaled.toDataURL('image/jpeg', 0.72);
  }
  return output.slice(0, maxDataUrlLength);
}
