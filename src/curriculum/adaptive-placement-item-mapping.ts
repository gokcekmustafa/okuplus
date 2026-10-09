import type { AdaptiveRouteEvidenceDimension } from "../modules/measurements/adaptive-route-contract.js";

/**
 * Editorial mapping for the immutable v1 placement item bank. This is a
 * separate, versioned contract so published QuestionVersion rows do not need
 * to be rewritten. A mapping is valid only for the exact canonical item-bank
 * manifest version and stable question id stored in generationMetadata.
 */
export const ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION = "P1_ADAPTIVE_ITEM_MAPPING_V1" as const;
export const ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION = "1.0.1" as const;

export type AdaptivePlacementItemMapping = Readonly<{
  mappingVersion: typeof ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION;
  itemBankManifestVersion: typeof ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION;
  dimensions: readonly AdaptiveRouteEvidenceDimension[];
}>;

const MAPPINGS: Readonly<Record<string, AdaptivePlacementItemMapping>> = Object.freeze({
  "PLV1-Q001": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: [],
  },
  "PLV1-Q002": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["EVIDENCE_FINDING"],
  },
  "PLV1-Q003": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["INFERENCE"],
  },
  "PLV1-Q004": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: [],
  },
  "PLV1-Q005": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["EVIDENCE_FINDING"],
  },
  "PLV1-Q006": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["INFERENCE", "EVIDENCE_RELATION"],
  },
  "PLV1-Q007": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: [],
  },
  "PLV1-Q008": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["EVIDENCE_FINDING"],
  },
  "PLV1-Q009": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["INFERENCE"],
  },
  "PLV1-Q010": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: [],
  },
  "PLV1-Q011": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["EVIDENCE_FINDING"],
  },
  "PLV1-Q012": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["INFERENCE"],
  },
  "PLV1-Q013": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["EVIDENCE_RELATION"],
  },
  "PLV1-Q014": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["EVIDENCE_FINDING"],
  },
  "PLV1-Q015": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["INFERENCE"],
  },
  "PLV1-Q016": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: [],
  },
  "PLV1-Q017": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["EVIDENCE_FINDING"],
  },
  "PLV1-Q018": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["INFERENCE", "EVIDENCE_RELATION"],
  },
  "PLV1-Q019": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: [],
  },
  "PLV1-Q020": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["EVIDENCE_FINDING"],
  },
  "PLV1-Q021": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["INFERENCE"],
  },
  "PLV1-Q022": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: [],
  },
  "PLV1-Q023": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["EVIDENCE_FINDING"],
  },
  "PLV1-Q024": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["INFERENCE"],
  },
  "PLV1-Q025": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: [],
  },
  "PLV1-Q026": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["EVIDENCE_FINDING"],
  },
  "PLV1-Q027": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["INFERENCE"],
  },
  "PLV1-Q028": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: [],
  },
  "PLV1-Q029": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["EVIDENCE_FINDING"],
  },
  "PLV1-Q030": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["INFERENCE", "EVIDENCE_RELATION"],
  },
  "PLV1-Q031": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: [],
  },
  "PLV1-Q032": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["EVIDENCE_FINDING"],
  },
  "PLV1-Q033": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["INFERENCE"],
  },
  "PLV1-Q034": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: [],
  },
  "PLV1-Q035": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["EVIDENCE_FINDING"],
  },
  "PLV1-Q036": {
    mappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    itemBankManifestVersion: ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
    dimensions: ["INFERENCE"],
  },
});

export function readAdaptivePlacementItemMapping(
  metadata: Record<string, unknown>,
): AdaptivePlacementItemMapping | null {
  if (
    metadata.itemBankManifestVersion !== ADAPTIVE_PLACEMENT_ITEM_BANK_MANIFEST_VERSION ||
    typeof metadata.stableQuestionId !== "string"
  ) {
    return null;
  }
  return MAPPINGS[metadata.stableQuestionId] ?? null;
}

export const ADAPTIVE_PLACEMENT_ITEM_MAPPINGS = MAPPINGS;
