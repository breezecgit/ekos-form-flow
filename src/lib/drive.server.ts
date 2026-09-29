const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

function keys() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const driveKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableKey || !driveKey) return null;
  return { lovableKey, driveKey };
}

export function driveFolderLink(id: string) {
  return id ? `https://drive.google.com/drive/folders/${id}` : "";
}
export function driveFileLink(id: string) {
  return id ? `https://drive.google.com/file/d/${id}/view` : "";
}

/** Creates a sub-folder inside `parentId`. Returns the folder id or null. */
export async function createDriveFolder(name: string, parentId: string): Promise<string | null> {
  const k = keys();
  if (!k || !parentId) return null;
  try {
    const res = await fetch(`${GATEWAY}/drive/v3/files?supportsAllDrives=true&fields=id`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${k.lovableKey}`,
        "X-Connection-Api-Key": k.driveKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    });
    if (!res.ok) {
      console.error(`Google Drive folder create failed [${res.status}]: ${await res.text()}`);
      return null;
    }
    return ((await res.json()) as { id?: string }).id ?? null;
  } catch (e) {
    console.error("Google Drive folder error:", e);
    return null;
  }
}

/**
 * Uploads a PDF into a Drive folder. Returns the file id, or null when Drive is
 * not connected / upload failed (the PDF always stays in app storage too).
 */
export async function uploadPdfToDrive(
  fileName: string,
  folderId: string,
  bytes: Uint8Array,
): Promise<string | null> {
  const k = keys();
  if (!k) {
    console.warn("Google Drive is not connected – skipping upload.");
    return null;
  }

  const boundary = `ekos${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({
    name: fileName,
    mimeType: "application/pdf",
    ...(folderId ? { parents: [folderId] } : {}),
  });

  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  try {
    const res = await fetch(
      `${GATEWAY}/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${k.lovableKey}`,
          "X-Connection-Api-Key": k.driveKey,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
    if (!res.ok) {
      console.error(`Google Drive upload failed [${res.status}]: ${await res.text()}`);
      return null;
    }
    const json = (await res.json()) as { id?: string };
    return json.id ?? null;
  } catch (e) {
    console.error("Google Drive upload error:", e);
    return null;
  }
}
