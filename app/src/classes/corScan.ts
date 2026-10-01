// COR photo → editable class drafts. The photo goes to our own backend (/cor/parse), never to Gemini
// directly, so the API key stays server-side. Nothing here is saved; the confirmation screen decides.

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { authorizedFetch } from '../sync/authorizedFetch';
import { parseDays } from './parseDays';
import type { ClassDraft } from './time';

export type ScanSource = 'camera' | 'gallery';

/** A failure with a message that is safe and friendly to show the student. */
export class CorScanError extends Error {}

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.7;
const MAX_BASE64_CHARS = 4_000_000; // matches the backend limit (Vercel caps bodies near 4.5 MB)
const REQUEST_TIMEOUT_MS = 60_000;

/** Opens the camera or gallery. Returns null if the student backs out. */
export async function pickCorImage(source: ScanSource): Promise<ImagePicker.ImagePickerAsset | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new CorScanError('Cling needs camera access to read your COR. You can allow it in Settings, or pick a photo from your gallery.');
    }
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : (result.assets[0] ?? null);
}

async function toBase64Jpeg(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  let context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_SIDE) {
    context = context.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY, base64: true });
  if (!saved.base64) throw new CorScanError("Couldn't prepare that photo. Try another one.");
  return saved.base64;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Sends the photo to the backend and returns drafts for the confirmation screen. */
export async function scanCor(asset: ImagePicker.ImagePickerAsset): Promise<ClassDraft[]> {
  const imageBase64 = await toBase64Jpeg(asset);
  if (imageBase64.length > MAX_BASE64_CHARS) {
    throw new CorScanError('That photo is too large. Try a smaller one.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await authorizedFetch('/cor/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg' }),
      signal: controller.signal,
    });
  } catch {
    throw new CorScanError("Couldn't reach Cling. Scanning needs a connection, but you can still add classes by hand.");
  } finally {
    clearTimeout(timer);
  }

  const body = (await response.json().catch(() => null)) as
    | { classes?: { subject: string; days: string; start: string; end: string; room: string | null }[]; error?: string }
    | null;
  if (!response.ok || !body?.classes) {
    throw new CorScanError(body?.error ?? "Couldn't read that photo. Try again, or add your classes by hand.");
  }

  return body.classes.map((c, i) => ({
    key: `scan-${i}`,
    subject: c.subject,
    days: parseDays(c.days),
    start: toMinutes(c.start),
    end: toMinutes(c.end),
    room: c.room ?? '',
  }));
}
