import { describe, it, expect, vi, beforeEach } from "vitest";
import { scoreConfidence, computeExpiry } from "../confidence-score";
import type { SourcedClaim } from "../synthesize";
import { logger } from "../logger";

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockedLogger = vi.mocked(logger);

function makeSourcedClaim(
  text: string,
  sourceUrl: string,
  confidence: number = 0.7,
): SourcedClaim {
  return {
    text,
    citations: [],
    confidence,
    sourceUrl,
  };
}

describe("scoreConfidence", () => {
  beforeEach(() => {
    mockedLogger.info.mockClear();
  });

  it("returns an empty array for an empty claims array", () => {
    const results = scoreConfidence([]);

    expect(results).toEqual([]);
  });

  it("scores a single claim from a single source", () => {
    const claims = [
      makeSourcedClaim("Machine learning is a subset of AI.", "https://source-a.com"),
    ];

    const results = scoreConfidence(claims);

    expect(results).toHaveLength(1);
    expect(results[0].claim).toBe("Machine learning is a subset of AI.");
    expect(results[0].agreeingSources).toBe(1);
    expect(results[0].totalSources).toBe(1);
    expect(results[0].confidence).toBeGreaterThanOrEqual(0);
    expect(results[0].confidence).toBeLessThanOrEqual(1);
  });

  it("raises confidence when multiple independent sources agree", () => {
    const claims = [
      makeSourcedClaim(
        "Machine learning is a subset of AI.",
        "https://source-a.com",
      ),
      makeSourcedClaim(
        "Machine learning is a subset of AI.",
        "https://source-b.com",
      ),
      makeSourcedClaim(
        "Machine learning is a subset of AI.",
        "https://source-c.com",
      ),
    ];

    const results = scoreConfidence(claims);

    expect(results).toHaveLength(1);
    expect(results[0].agreeingSources).toBe(3);
    expect(results[0].totalSources).toBe(3);
    expect(results[0].confidence).toBeCloseTo(0.5, 5);
  });

  it("lowers confidence when a claim is not agreed upon by all sources", () => {
    const claims = [
      makeSourcedClaim("ML is a subset of AI.", "https://source-a.com"),
      makeSourcedClaim(
        "Neural networks are a subset of AI.",
        "https://source-a.com",
      ),
      makeSourcedClaim("ML is a subset of AI.", "https://source-b.com"),
    ];

    const results = scoreConfidence(claims);

    const mlClaim = results.find(
      (r) => r.claim === "ML is a subset of AI.",
    );
    expect(mlClaim).toBeDefined();
    if (mlClaim) {
      expect(mlClaim.agreeingSources).toBe(2);
      expect(mlClaim.totalSources).toBe(2);
      expect(mlClaim.confidence).toBeCloseTo(0.5, 5);
    }
  });

  it("flags claims below the threshold as low-confidence", () => {
    const claims = [
      makeSourcedClaim("ML is a subset of AI.", "https://source-a.com"),
      makeSourcedClaim("ML is a subset of AI.", "https://source-b.com"),
      makeSourcedClaim("ML is a subset of AI.", "https://source-c.com"),
      makeSourcedClaim(
        "Neural networks use backpropagation.",
        "https://source-d.com",
      ),
    ];

    const results = scoreConfidence(claims);

    const lowConf = results.find(
      (r) => r.claim === "Neural networks use backpropagation.",
    );
    expect(lowConf).toBeDefined();
    if (lowConf) {
      expect(lowConf.flagLowConfidence).toBe(true);
    }
  });

  it("does not flag claims above the threshold as low-confidence", () => {
    const claims = [
      makeSourcedClaim("ML is a subset of AI.", "https://source-a.com"),
      makeSourcedClaim("ML is a subset of AI.", "https://source-b.com"),
      makeSourcedClaim("ML is a subset of AI.", "https://source-c.com"),
      makeSourcedClaim("ML is a subset of AI.", "https://source-d.com"),
      makeSourcedClaim("ML is a subset of AI.", "https://source-e.com"),
    ];

    const results = scoreConfidence(claims);

    expect(results[0].flagLowConfidence).toBe(false);
  });

  it("uses a custom low-confidence threshold when provided", () => {
    const claims = [
      makeSourcedClaim("ML is a subset of AI.", "https://source-a.com"),
      makeSourcedClaim("ML is a subset of AI.", "https://source-b.com"),
    ];

    const results = scoreConfidence(claims, undefined, {
      lowConfidenceThreshold: 0.8,
    });

    expect(results[0].flagLowConfidence).toBe(true);
  });

  it("uses source quality weights when provided", () => {
    const claims = [
      makeSourcedClaim("ML is a subset of AI.", "https://high-quality.com"),
      makeSourcedClaim("ML is a subset of AI.", "https://low-quality.com"),
    ];

    const weights = new Map<string, number>();
    weights.set("https://high-quality.com", 0.9);
    weights.set("https://low-quality.com", 0.3);

    const results = scoreConfidence(claims, weights);

    expect(results).toHaveLength(1);
    expect(results[0].agreeingSources).toBe(2);
    expect(results[0].totalSources).toBe(2);
    expect(results[0].confidence).toBeCloseTo(0.6, 5);
  });

  it("falls back to default weight for sources not in the weight map", () => {
    const claims = [
      makeSourcedClaim("ML is a subset of AI.", "https://known.com"),
      makeSourcedClaim("ML is a subset of AI.", "https://unknown.com"),
    ];

    const weights = new Map<string, number>();
    weights.set("https://known.com", 0.9);

    const results = scoreConfidence(claims, weights);

    expect(results).toHaveLength(1);
    expect(results[0].agreeingSources).toBe(2);
    expect(results[0].totalSources).toBe(2);
  });

  it("deduplicates sources within the same claim group", () => {
    const claims = [
      makeSourcedClaim("ML is a subset of AI.", "https://source-a.com"),
      makeSourcedClaim("ML is a subset of AI.", "https://source-a.com"),
      makeSourcedClaim("ML is a subset of AI.", "https://source-b.com"),
    ];

    const results = scoreConfidence(claims);

    expect(results[0].agreeingSources).toBe(2);
  });

  it("scores multiple unique claims independently", () => {
    const claims = [
      makeSourcedClaim("ML is a subset of AI.", "https://source-a.com"),
      makeSourcedClaim("RAG retrieves documents.", "https://source-a.com"),
      makeSourcedClaim("ML is a subset of AI.", "https://source-b.com"),
      makeSourcedClaim("RAG retrieves documents.", "https://source-b.com"),
      makeSourcedClaim("RAG retrieves documents.", "https://source-c.com"),
    ];

    const results = scoreConfidence(claims);

    expect(results).toHaveLength(2);
    const mlResult = results.find(
      (r) => r.claim === "ML is a subset of AI.",
    );
    const ragResult = results.find(
      (r) => r.claim === "RAG retrieves documents.",
    );
    expect(mlResult).toBeDefined();
    expect(ragResult).toBeDefined();
    if (mlResult) expect(mlResult.agreeingSources).toBe(2);
    if (ragResult) expect(ragResult.agreeingSources).toBe(3);
  });

  it("normalizes claim text for grouping", () => {
    const claims = [
      makeSourcedClaim("Machine learning  is  a subset of AI.", "https://source-a.com"),
      makeSourcedClaim("machine learning is a subset of ai.", "https://source-b.com"),
    ];

    const results = scoreConfidence(claims);

    expect(results).toHaveLength(1);
    expect(results[0].agreeingSources).toBe(2);
  });

  it("logs confidence distribution and low-confidence count", () => {
    const claims = [
      makeSourcedClaim("ML is a subset of AI.", "https://source-a.com"),
      makeSourcedClaim("RAG retrieves documents.", "https://source-b.com"),
    ];

    scoreConfidence(claims);

    const distributionLog = mockedLogger.info.mock.calls.find(
      (call) =>
        typeof call[1] === "string" && call[1] === "Confidence distribution:",
    );
    expect(distributionLog).toBeDefined();
    if (distributionLog) {
      expect(distributionLog[2]).toMatchObject(
        expect.objectContaining({
          totalClaims: 2,
          lowConfidenceCount: expect.any(Number),
          threshold: expect.any(Number),
        }),
      );
    }
  });

  it("logs low-confidence count when claims are below threshold", () => {
    const claims = [
      makeSourcedClaim("ML is a subset of AI.", "https://source-a.com"),
      makeSourcedClaim("ML is a subset of AI.", "https://source-b.com"),
      makeSourcedClaim("ML is a subset of AI.", "https://source-c.com"),
      makeSourcedClaim(
        "Neural networks use backpropagation.",
        "https://source-d.com",
      ),
    ];

    scoreConfidence(claims);

    const distributionLog = mockedLogger.info.mock.calls.find(
      (call) =>
        typeof call[1] === "string" && call[1] === "Confidence distribution:",
    );
    expect(distributionLog).toBeDefined();
    if (distributionLog && typeof distributionLog[2] === "object" && distributionLog[2] !== null) {
      expect((distributionLog[2] as Record<string, unknown>).lowConfidenceCount).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// computeExpiry
// ---------------------------------------------------------------------------

describe("computeExpiry", () => {
  it("returns a Date for high-confidence claims (>= threshold)", () => {
    const expiry = computeExpiry(0.8);
    expect(expiry).toBeInstanceOf(Date);
  });

  it("returns a Date approximately 30 days in the future for claims with confidence >= threshold", () => {
    const expiry = computeExpiry(0.8);
    const now = new Date();
    const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(30, 0);
  });

  it("returns a Date approximately 7 days in the future for low-confidence claims (< threshold)", () => {
    const expiry = computeExpiry(0.3);
    const now = new Date();
    const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });

  it("uses a custom low-confidence threshold", () => {
    const expiry = computeExpiry(0.6, 0.7);
    const now = new Date();
    const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });

  it("returns 30-day expiry for confidence exactly at the threshold", () => {
    const expiry = computeExpiry(0.5);
    const now = new Date();
    const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(30, 0);
  });
});