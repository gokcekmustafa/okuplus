import { importFingerprint } from "./duplicate-detector.js";

/** Metadata namespace reserved for runner-owned idempotency information. */
export const CONTENT_IMPORT_METADATA_KEY = "okuPlusImport";

export type ContentImportMetadataMarker = {
  manifestId: string;
  manifestVersion: 1;
  externalKey: string;
  stableIdentity: string;
  fingerprint: string;
  targetVersion?: number;
  contentExternalKey?: string;
  contentVersion?: number;
};

export function contentImportIdentity(manifestId: string, externalKey: string): string {
  return `${manifestId}:CONTENT:${externalKey}`;
}

export function contentImportVersionIdentity(
  manifestId: string,
  externalKey: string,
  version: number,
): string {
  return `${contentImportIdentity(manifestId, externalKey)}:VERSION:v${version}`;
}

export function questionImportIdentity(manifestId: string, externalKey: string): string {
  return `${manifestId}:QUESTION:${externalKey}`;
}

export function questionImportVersionIdentity(manifestId: string, externalKey: string): string {
  return `${questionImportIdentity(manifestId, externalKey)}:VERSION`;
}

export function buildImportMarker(
  marker: Omit<ContentImportMetadataMarker, "manifestVersion">,
): ContentImportMetadataMarker {
  return { ...marker, manifestVersion: 1 };
}

export function buildImportMetadata(
  value: Record<string, unknown> | undefined,
  marker: ContentImportMetadataMarker,
): Record<string, unknown> {
  return {
    ...(value ?? {}),
    [CONTENT_IMPORT_METADATA_KEY]: marker,
  };
}

export function importMetadataMarker(value: unknown): ContentImportMetadataMarker | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const marker = record[CONTENT_IMPORT_METADATA_KEY];
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return null;
  const markerRecord = marker as Record<string, unknown>;
  if (
    typeof markerRecord.manifestId !== "string" ||
    markerRecord.manifestVersion !== 1 ||
    typeof markerRecord.externalKey !== "string" ||
    typeof markerRecord.stableIdentity !== "string" ||
    typeof markerRecord.fingerprint !== "string"
  ) {
    return null;
  }
  const targetVersion = markerRecord.targetVersion;
  if (
    targetVersion !== undefined &&
    (typeof targetVersion !== "number" || !Number.isInteger(targetVersion) || targetVersion < 1)
  ) {
    return null;
  }
  const contentVersion = markerRecord.contentVersion;
  if (
    contentVersion !== undefined &&
    (typeof contentVersion !== "number" || !Number.isInteger(contentVersion) || contentVersion < 1)
  ) {
    return null;
  }
  if (
    markerRecord.contentExternalKey !== undefined &&
    typeof markerRecord.contentExternalKey !== "string"
  ) {
    return null;
  }
  return markerRecord as unknown as ContentImportMetadataMarker;
}

export function markerFingerprint(value: unknown): string {
  return importFingerprint(value);
}
