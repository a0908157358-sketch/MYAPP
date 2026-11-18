/**
 * 瀏覽器端自動等比縮放與壓縮圖片，確保 Data URL 可安全儲存於 Firestore 文件中
 * （免去 Firebase Storage 設定與帳單門檻）。
 */
export async function compressImageFile(
  file: File,
  options: { maxDim?: number; maxDataUrlLength?: number } = {}
): Promise<string> {
  const maxDim = options.maxDim ?? 920;
  const maxDataUrlLength = options.maxDataUrlLength ?? 360_000;

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

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('瀏覽器不支援 Canvas 壓縮');
  }
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.82;
  let output = canvas.toDataURL('image/jpeg', quality);
  while (output.length > maxDataUrlLength && quality > 0.32) {
    quality -= 0.1;
    output = canvas.toDataURL('image/jpeg', quality);
  }

  if (output.length > maxDataUrlLength) {
    // 若仍過大則再縮小尺寸
    const scale = 0.72;
    canvas.width = Math.max(240, Math.round(width * scale));
    canvas.height = Math.max(240, Math.round(height * scale));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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
