import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type { Update };

/**
 * Looks for a newer published release via the endpoint configured in
 * tauri.conf.json (a `latest.json` manifest attached to GitHub Releases by
 * CI). Never throws — this may run silently in the background on startup,
 * and a offline school computer failing this check is normal, not an error.
 */
export async function checkForUpdate(): Promise<Update | null> {
  try {
    return await check();
  } catch {
    return null;
  }
}

export interface UpdateProgress {
  downloadedBytes: number;
  totalBytes: number | null;
}

/**
 * Downloads and installs the given update, then relaunches the app so it
 * starts up on the new version. Reuses the same `relaunch` command the
 * backup-restore flow already triggers a full-app-restart with.
 */
export async function installUpdate(
  update: Update,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  let downloadedBytes = 0;
  let totalBytes: number | null = null;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        totalBytes = event.data.contentLength ?? null;
        onProgress?.({ downloadedBytes, totalBytes });
        break;
      case "Progress":
        downloadedBytes += event.data.chunkLength;
        onProgress?.({ downloadedBytes, totalBytes });
        break;
      case "Finished":
        onProgress?.({ downloadedBytes: totalBytes ?? downloadedBytes, totalBytes });
        break;
    }
  });

  await invoke("relaunch");
}
