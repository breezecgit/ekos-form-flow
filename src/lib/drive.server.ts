const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

/**
 * Uploads the merged PDF to the EKOS Google Drive folder.
 * Returns the Drive file id, or null when Drive is not connected / upload failed.
 */
export async function uploadPdfToDrive(
  fileName: string,
  folderId: string,
  bytes: Uint8Array,
): Promise<string | null> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const driveKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableKey || !driveKey) {
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
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": driveKey,
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
