/**
 * JSON schema validation module for structured output.
 *
 * Validates that {@link StructuredOutput} objects conform to a defined
 * schema for reliable agent consumption. Provides both validation
 * and sanitization utilities.
 *
 * @module output-schema
 */

import { logger } from "./logger";
import type { StructuredOutput } from "./structured-output";

// ---------------------------------------------------------------------------
// Schema definition
// ---------------------------------------------------------------------------

/** The JSON schema shape for validating StructuredOutput objects. */
export interface StructuredOutputSchema {
  /** Required top-level fields. */
  requiredFields: string[];
  /** Fields that must be non-empty strings. */
  requiredStringFields: string[];
  /** Array fields that must be arrays. */
  requiredArrayFields: string[];
  /** Nested object fields that must be objects. */
  requiredObjectFields: string[];
  /** Numeric fields that must be between 0 and 1. */
  scoreFields: string[];
}

/** A validation error with field path and message. */
export interface SchemaError {
  /** The field path where the error was found. */
  field: string;
  /** The validation error message. */
  message: string;
}

/** Result of schema validation. */
export interface SchemaValidationResult {
  /** Whether the output passed validation. */
  valid: boolean;
  /** Array of schema errors (empty if valid). */
  errors: SchemaError[];
}

/** A claim that passed schema validation. */
export interface ValidStructuredClaim {
  /** The validated claim. */
  claim: StructuredOutput["claims"][number];
  /** The source URLs for this claim. */
  sourceUrls: string[];
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** The default JSON schema for {@link StructuredOutput}. */
export const STRUCTURED_OUTPUT_SCHEMA: StructuredOutputSchema = {
  requiredFields: [
    "concept",
    "claims",
    "citations",
    "entities",
    "confidence",
    "sourceUrl",
    "metadata",
  ],
  requiredStringFields: ["concept", "sourceUrl"],
  requiredArrayFields: ["claims", "citations", "entities"],
  requiredObjectFields: ["metadata"],
  scoreFields: ["metadata.avgConfidence", "confidence"],
};

/**
 * Validate a {@link StructuredOutput} object against the schema.
 *
 * Checks that all required fields are present and have the correct types,
 * that score fields are within [0, 1], and that string fields are non-empty.
 *
 * @param output - The structured output to validate.
 * @returns A {@link SchemaValidationResult} with `valid` flag and error list.
 */
export function validateStructuredOutput(
  output: StructuredOutput,
): SchemaValidationResult {
  const errors: SchemaError[] = [];

  for (const field of STRUCTURED_OUTPUT_SCHEMA.requiredFields) {
    if (output[field as keyof StructuredOutput] === undefined) {
      errors.push({
        field,
        message: `Required field "${field}" is missing`,
      });
    }
  }

  for (const field of STRUCTURED_OUTPUT_SCHEMA.requiredStringFields) {
    const value = output[field as keyof StructuredOutput];
    if (typeof value !== "string" || value.length === 0) {
      errors.push({
        field,
        message: `Field "${field}" must be a non-empty string`,
      });
    }
  }

  for (const field of STRUCTURED_OUTPUT_SCHEMA.requiredArrayFields) {
    const value = output[field as keyof StructuredOutput];
    if (!Array.isArray(value)) {
      errors.push({
        field,
        message: `Field "${field}" must be an array`,
      });
    }
  }

  for (const field of STRUCTURED_OUTPUT_SCHEMA.requiredObjectFields) {
    const value = output[field as keyof StructuredOutput];
    if (typeof value !== "object" || value === null) {
      errors.push({
        field,
        message: `Field "${field}" must be an object`,
      });
    }
  }

  if (typeof output.confidence !== "number" || output.confidence < 0 || output.confidence > 1) {
    errors.push({
      field: "confidence",
      message: "Confidence must be a number between 0 and 1",
    });
  }

  const avgConf = output.metadata?.avgConfidence;
  if (typeof avgConf !== "number" || avgConf < 0 || avgConf > 1) {
    errors.push({
      field: "metadata.avgConfidence",
      message: "Average confidence must be a number between 0 and 1",
    });
  }

  const claimEntries = Array.isArray(output.claims) ? output.claims : [];
  for (const [i, claim] of claimEntries.entries()) {
    if (typeof claim.text !== "string" || claim.text.length === 0) {
      errors.push({
        field: `claims[${i}].text`,
        message: "Claim text must be a non-empty string",
      });
    }
    if (!Array.isArray(claim.citations)) {
      errors.push({
        field: `claims[${i}].citations`,
        message: "Claim citations must be an array",
      });
    }
    if (typeof claim.confidence !== "number") {
      errors.push({
        field: `claims[${i}].confidence`,
        message: "Claim confidence must be a number",
      });
    }
  }

  if (errors.length > 0) {
    logger.warn("output-schema", "Structured output validation failed", {
      concept: output.concept,
      errorCount: errors.length,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check whether a {@link StructuredOutput} has valid citations for all claims.
 *
 * Every claim must have at least one citation (wiki slug or URL) to be
 * considered valid.
 *
 * @param output - The structured output to check.
 * @returns True if all claims have at least one citation.
 */
export function hasValidCitations(output: StructuredOutput): boolean {
  return (output.claims ?? []).every(
    (claim) => (claim.citations ?? []).length > 0,
  );
}

/**
 * Sanitize a {@link StructuredOutput} by filling in safe defaults for
 * any missing or invalid fields.
 *
 * @param output - The structured output to sanitize.
 * @returns A sanitized copy of the output.
 */
export function sanitizeStructuredOutput(
  output: Partial<StructuredOutput>,
): StructuredOutput {
  return {
    concept: output.concept ?? "",
    claims: (output.claims ?? []).map((c) => ({
      text: c.text ?? "",
      citations: c.citations ?? [],
      confidence: typeof c.confidence === "number" ? c.confidence : 0,
      sourceUrls: c.sourceUrls ?? [],
      expiryAt: c.expiryAt,
    })),
    citations: output.citations ?? [],
    entities: (output.entities ?? []).map((e) => ({
      name: e.name,
      type: e.type,
    })),
    confidence:
      typeof output.confidence === "number" ? output.confidence : 0,
    sourceUrl: output.sourceUrl ?? "",
    metadata: {
      synthesizedAt: output.metadata?.synthesizedAt ?? new Date(),
      sourceCount: output.metadata?.sourceCount ?? 0,
      avgConfidence: output.metadata?.avgConfidence ?? 0,
      disputed: output.metadata?.disputed ?? false,
    },
    decisions: output.decisions,
    disputed: output.disputed,
  };
}
