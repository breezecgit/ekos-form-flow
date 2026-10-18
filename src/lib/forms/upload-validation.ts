import { findField, type FormDef } from "./types";

/** Bound the decoded payload as well as its transport representation. */
export function validateUpload(def: FormDef, fieldKey: string, mime: string, base64: string): Uint8Array {
  if (findField(def, fieldKey)?.type !== "file") throw new Error("This form does not accept a file in that box.");
  if (!["image/png", "image/jpeg", "application/pdf"].includes(mime)) throw new Error("Please upload a JPG, PNG or PDF file.");
  if (!base64 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error("The uploaded file could not be read.");
  let decoded: string;
  try { decoded = atob(base64); } catch { throw new Error("The uploaded file could not be read."); }
  if (!decoded.length || decoded.length > 16_500_000) throw new Error("The uploaded file is too large or empty.");
  const matches = mime === "image/png" ? decoded.startsWith("\x89PNG\r\n\x1a\n") : mime === "image/jpeg" ? decoded.startsWith("\xff\xd8\xff") : decoded.startsWith("%PDF-");
  if (!matches) throw new Error("The file contents do not match the selected file type.");
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}