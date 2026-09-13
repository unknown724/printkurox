/**
 * Image Enhancer Engine for AutoPrint Kiosk
 * 
 * Provides client-side, hardware-accelerated Canvas image filters:
 * 1. 'magic_bw': Adaptive binarization (CamScanner-style) that eliminates phone camera shadows,
 *    turning muddy gray paper into pure white (#FFFFFF) and text/lines into deep laser black (#000000).
 * 2. 'grayscale': High-contrast grayscale that whitens backgrounds while preserving photo halftones.
 * 3. 'color_boost': Whitens uneven lighting casts while keeping colored official seals, stamps, and signatures.
 * 4. 'none': Raw original image.
 */

export type EnhanceMode = 'none' | 'magic_bw' | 'grayscale' | 'color_boost';

export interface EnhanceOptions {
  mode: EnhanceMode;
  brightness?: number; // -50 to +50 (default 0)
  contrast?: number;   // -50 to +50 (default 0)
}

/**
 * Applies Magic B&W (Adaptive Document Binarization) to an ImageData object.
 * Uses a fast tile-based adaptive background subtraction to remove uneven phone shadows.
 */
function applyMagicBW(imageData: ImageData, brightness = 0, contrast = 0): void {
  const { data, width, height } = imageData;
  const numPixels = width * height;

  // Step 1: Compute luminance for all pixels
  const luma = new Uint8ClampedArray(numPixels);
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    // Standard perceptual luminance: 0.299R + 0.587G + 0.114B
    luma[i] = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
  }

  // Step 2: Tile-based local background estimation (32x32 tiles)
  // This smoothly detects uneven shadow gradients across the camera photo
  const tileSize = 32;
  const tilesX = Math.ceil(width / tileSize);
  const tilesY = Math.ceil(height / tileSize);
  const tileMax = new Uint8Array(tilesX * tilesY);

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      let maxL = 0;
      const startX = tx * tileSize;
      const endX = Math.min(startX + tileSize, width);
      const startY = ty * tileSize;
      const endY = Math.min(startY + tileSize, height);

      // Find ~90th percentile luminance in tile to estimate paper background
      for (let y = startY; y < endY; y += 2) {
        for (let x = startX; x < endX; x += 2) {
          const l = luma[y * width + x];
          if (l > maxL) maxL = l;
        }
      }
      tileMax[ty * tilesX + tx] = maxL || 200;
    }
  }

  // Contrast & sensitivity factor
  const sensitivity = 0.88 + (contrast * 0.002);
  const offset = 18 - (brightness * 0.3);

  // Step 3: Adaptive thresholding per pixel
  for (let y = 0; y < height; y++) {
    const ty = Math.min(Math.floor(y / tileSize), tilesY - 1);
    for (let x = 0; x < width; x++) {
      const tx = Math.min(Math.floor(x / tileSize), tilesX - 1);
      const bgEstimate = tileMax[ty * tilesX + tx];
      const threshold = Math.max(70, Math.min(235, bgEstimate * sensitivity - offset));

      const pIdx = y * width + x;
      const pixelLuma = luma[pIdx];
      const dataIdx = pIdx * 4;

      if (pixelLuma >= threshold) {
        // Pure White Background (#FFFFFF) - Erases all camera shadows & gray toner waste
        data[dataIdx] = 255;
        data[dataIdx + 1] = 255;
        data[dataIdx + 2] = 255;
      } else {
        // Deep Black Text / Stamp Line (#000000)
        const diff = threshold - pixelLuma;
        if (diff > 25) {
          data[dataIdx] = 0;
          data[dataIdx + 1] = 0;
          data[dataIdx + 2] = 0;
        } else {
          const val = Math.round(255 * (1 - (diff / 25)));
          data[dataIdx] = val;
          data[dataIdx + 1] = val;
          data[dataIdx + 2] = val;
        }
      }
    }
  }
}

/**
 * Applies High-Contrast Grayscale (Whitens background, keeps photo/signature halftones)
 */
function applyGrayscale(imageData: ImageData, brightness = 0, contrast = 0): void {
  const { data } = imageData;
  const len = data.length;

  // Contrast factor (-50 to +50 maps to 0.7 to 1.5)
  const factor = (259 * (contrast + 128)) / (128 * (259 - contrast));

  for (let i = 0; i < len; i += 4) {
    let l = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    
    // Apply contrast and brightness
    l = factor * (l - 128) + 128 + brightness;

    // Non-linear tone curve: Whitens shadows over 185
    if (l > 185) {
      l = 185 + (l - 185) * 1.6;
    } else if (l < 90) {
      l = l * 0.85;
    }

    const clamped = Math.max(0, Math.min(255, l));
    data[i] = clamped;
    data[i + 1] = clamped;
    data[i + 2] = clamped;
  }
}

/**
 * Applies Vivid Color Boost (Whitens yellow/gray paper cast while preserving colorful stamps & inks)
 */
function applyColorBoost(imageData: ImageData, brightness = 0, contrast = 0): void {
  void contrast;
  const { data } = imageData;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;

    // If saturation is low (gray paper background / black text), push to pure white if bright
    if (saturation < 0.18) {
      const avg = (r + g + b) / 3;
      if (avg > 155) {
        // Whiten background
        r = Math.min(255, avg + (255 - avg) * 0.85 + brightness);
        g = r;
        b = r;
      } else {
        // Darken text slightly
        r = Math.max(0, avg * 0.9 - 10);
        g = r;
        b = r;
      }
    } else {
      // Color ink/seal: boost vibrance slightly
      r = Math.min(255, r * 1.08 + brightness);
      g = Math.min(255, g * 1.08 + brightness);
      b = Math.min(255, b * 1.08 + brightness);
    }

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }
}

/**
 * Process an HTMLCanvasElement in-place with the specified enhancement mode
 */
export function enhanceCanvas(canvas: HTMLCanvasElement, options: EnhanceOptions): void {
  if (options.mode === 'none') return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  switch (options.mode) {
    case 'magic_bw':
      applyMagicBW(imageData, options.brightness || 0, options.contrast || 0);
      break;
    case 'grayscale':
      applyGrayscale(imageData, options.brightness || 0, options.contrast || 0);
      break;
    case 'color_boost':
      applyColorBoost(imageData, options.brightness || 0, options.contrast || 0);
      break;
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Takes an image URL or Blob, applies enhancement on a hidden canvas, and returns a data URL.
 */
export async function enhanceImageUrl(
  imageUrl: string,
  options: EnhanceOptions
): Promise<string> {
  if (options.mode === 'none') return imageUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imageUrl);
        return;
      }

      ctx.drawImage(img, 0, 0);
      enhanceCanvas(canvas, options);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      canvas.width = 0;
      canvas.height = 0;
      resolve(dataUrl);
    };
    img.onerror = () => resolve(imageUrl);
    img.src = imageUrl;
  });
}

/**
 * Enhances a browser File object (JPG/PNG) into a cleaned File ready for upload.
 */
export async function enhanceFile(
  file: File,
  options: EnhanceOptions
): Promise<File> {
  if (options.mode === 'none') return file;
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!isImage) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0);
      enhanceCanvas(canvas, options);

      canvas.toBlob(
        (blob) => {
          canvas.width = 0;
          canvas.height = 0;
          if (!blob) {
            resolve(file);
            return;
          }
          const cleanName = file.name.replace(/\.[^/.]+$/, '') + '-enhanced.jpg';
          const enhanced = new File([blob], cleanName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(enhanced);
        },
        'image/jpeg',
        0.92
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      resolve(file);
    };
    img.src = objUrl;
  });
}
