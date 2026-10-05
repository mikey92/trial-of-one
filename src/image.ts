// Getting a photo ready for analysis: decode, keep it within YouCam's size limits
// (long side <= 2560 px; HD concerns need a short side >= 1080 px), and make a small
// thumbnail that stays on the device.

export interface Prepared { blob: Blob; width: number; height: number; bitmap: ImageBitmap; thumb: string }

const MAX_LONG = 2560;
export const HD_MIN_SHORT = 1080;

export async function prepare(source: Blob): Promise<Prepared> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_LONG / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
  return { blob, width, height, bitmap, thumb: await thumbnail(bitmap) };
}

async function thumbnail(bitmap: ImageBitmap): Promise<string> {
  const scale = 320 / Math.max(bitmap.width, bitmap.height);
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function hdCapable(width: number, height: number): boolean {
  return Math.min(width, height) >= HD_MIN_SHORT;
}
