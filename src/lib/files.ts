import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Save a text file. On Android the file is written to the app's documents
 * folder and the system share sheet opens (save to Files, Drive, etc.).
 * In a browser it downloads directly. Nothing goes over the network unless
 * the user picks a network destination in the share sheet.
 */
export async function saveTextFile(name: string, text: string, mime: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const res = await Filesystem.writeFile({
      path: name,
      data: text,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    try {
      await Share.share({ title: name, url: res.uri });
    } catch {
      /* user closed the share sheet — the file is still saved */
    }
    return res.uri;
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return name;
}

export function pickTextFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? await f.text() : null);
    };
    input.click();
  });
}

export function stamp(d = new Date()) {
  return d.toISOString().slice(0, 16).replace(/[:T]/g, '-');
}
