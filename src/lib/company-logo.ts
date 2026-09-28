import path from "node:path";
import { dataDirectory } from "@/db/connection";

export const COMPANY_LOGO_MAX_BYTES = 2 * 1024 * 1024;

export type CompanyLogoImage = {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  extension: "png" | "jpg" | "webp";
};

export function inspectCompanyLogo(mimeType: string, bytes: Uint8Array): CompanyLogoImage | null {
  if (!bytes.byteLength || bytes.byteLength > COMPANY_LOGO_MAX_BYTES) return null;
  if (mimeType === "image/png" && bytes.byteLength >= 24 &&
    bytes.subarray(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index]) &&
    String.fromCharCode(...bytes.subarray(12, 16)) === "IHDR") {
    return { mimeType: "image/png", extension: "png" };
  }
  if (mimeType === "image/jpeg" && bytes.byteLength >= 4 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.byteLength - 2] === 0xff && bytes[bytes.byteLength - 1] === 0xd9) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (mimeType === "image/webp" && bytes.byteLength >= 16 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") {
    return { mimeType: "image/webp", extension: "webp" };
  }
  return null;
}

export function companyLogoPath(companyId: number, filename: string) {
  if (!Number.isInteger(companyId) || companyId <= 0 || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|webp)$/.test(filename)) return null;
  return path.join(dataDirectory, "company-logos", String(companyId), filename);
}

export function resolveCompanyLogoPath(companyId: number, storedPath: string) {
  const root = path.resolve(dataDirectory, "company-logos", String(companyId));
  const candidate = path.resolve(dataDirectory, storedPath);
  return candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}
