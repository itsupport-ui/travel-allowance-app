export const SECURE_DRAFT_CHUNK_CHARACTERS = 400;
export const MAX_SECURE_DRAFT_CHUNKS = 160;
export const SECURE_DRAFT_VERSION = 2 as const;

export interface SecureDraftMetadata {
  chunkCount: number;
  digest: string;
  generation: string;
  savedAt: string;
  version: typeof SECURE_DRAFT_VERSION;
}

export const splitSecureDraft = (value: string): string[] => {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += SECURE_DRAFT_CHUNK_CHARACTERS) {
    chunks.push(value.slice(index, index + SECURE_DRAFT_CHUNK_CHARACTERS));
  }
  if (chunks.length > MAX_SECURE_DRAFT_CHUNKS) {
    throw new Error("This draft is too large to store securely on the device.");
  }
  return chunks.length ? chunks : [""];
};

export const isSecureDraftMetadata = (
  value: unknown
): value is SecureDraftMetadata => {
  if (typeof value !== "object" || value === null) return false;
  const metadata = value as Partial<SecureDraftMetadata>;
  return (
    metadata.version === SECURE_DRAFT_VERSION &&
    typeof metadata.digest === "string" &&
    /^[a-f0-9]{64}$/.test(metadata.digest) &&
    typeof metadata.generation === "string" &&
    /^[a-f0-9]{32}$/.test(metadata.generation) &&
    typeof metadata.savedAt === "string" &&
    Number.isInteger(metadata.chunkCount) &&
    Number(metadata.chunkCount) >= 1 &&
    Number(metadata.chunkCount) <= MAX_SECURE_DRAFT_CHUNKS
  );
};
