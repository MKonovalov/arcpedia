import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { batchIngestUrls } from "../ingest-batch";
import { extractUrlContent } from "../ingest-url";
import { createIngestJob, updateIngestJob } from "../ingest-jobs";
import { resolveSourceUrl } from "../source-index";
import { enqueueTask } from "../tasks";
import { logger } from "../logger";

vi.mock("../ingest-url", () => ({
  extractUrlContent: vi.fn(),
}));

vi.mock("../ingest-jobs", () => ({
  createIngestJob: vi.fn(async () => ({ jobId: "test-job", status: "queued" })),
  updateIngestJob: vi.fn(async () => ({ jobId: "test-job", status: "done" })),
}));

vi.mock("../source-index", () => ({
  resolveSourceUrl: vi.fn(async () => null),
}));

vi.mock("../tasks", () => ({
  enqueueTask: vi.fn(async () => true),
}));

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockedExtract = vi.mocked(extractUrlContent);
const mockedCreate = vi.mocked(createIngestJob);
const mockedUpdate = vi.mocked(updateIngestJob);
const mockedResolve = vi.mocked(resolveSourceUrl);
const mockedEnqueue = vi.mocked(enqueueTask);
const mockedLogger = vi.mocked(logger);

beforeEach(() => {
  vi.clearAllMocks();
  mockedCreate.mockResolvedValue({
    jobId: "test-job",
    status: "queued",
    owner: "alice",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  mockedUpdate.mockResolvedValue({
    jobId: "test-job",
    status: "done",
    owner: "alice",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  mockedResolve.mockResolvedValue(null);
  mockedEnqueue.mockResolvedValue(true);
});

describe("batchIngestUrls", () => {
  it("ingests a single URL successfully", async () => {
    mockedExtract.mockResolvedValue({
      title: "Example Domain",
      content: "This domain is for use in illustrative examples.",
      sourceUrl: "https://example.com",
      metadata: {
        sourceUrl: "https://example.com",
        fetchedAt: "2026-01-01",
        contentLength: 40,
        sourceType: "url",
        triggeredBy: "alice",
      },
      sourceEntry: {
        type: "url",
        url: "https://example.com",
        fetched: "2026-01-01",
        triggered_by: "alice",
        raw_id: "raw-1",
      },
    });

    const result = await batchIngestUrls(
      ["https://example.com"],
      "alice",
      "alice",
    );

    expect(result.totalUrls).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].url).toBe("https://example.com");
    expect(result.results[0].slug).toBe("https://example.com");
    expect(result.status).toBe("done");
    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "alice" }),
    );
  });

  it("deduplicates URLs within the batch array", async () => {
    mockedExtract.mockResolvedValue({
      title: "Example",
      content: "Content.",
      sourceUrl: "https://example.com",
      metadata: {
        sourceUrl: "https://example.com",
        fetchedAt: "2026-01-01",
        contentLength: 8,
        sourceType: "url",
        triggeredBy: "alice",
      },
      sourceEntry: {
        type: "url",
        url: "https://example.com",
        fetched: "2026-01-01",
        triggered_by: "alice",
        raw_id: "raw-1",
      },
    });

    const result = await batchIngestUrls(
      ["https://example.com", "https://example.com"],
      "alice",
    );

    expect(result.totalUrls).toBe(2);
    expect(result.results).toHaveLength(1);
  });

  it("skips already-ingested URLs via resolveSourceUrl", async () => {
    mockedResolve.mockResolvedValueOnce("existing-page");

    const result = await batchIngestUrls(
      ["https://example.com/skip-me"],
      "alice",
    );

    expect(result.totalUrls).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.results[0].skipped).toBe(true);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].slug).toBe("existing-page");
    expect(mockedExtract).not.toHaveBeenCalled();
  });

  it("marks individual URL as failed when extractUrlContent throws", async () => {
    mockedExtract.mockRejectedValue(new Error("Fetch failed"));

    const result = await batchIngestUrls(
      ["https://example.com/broken"],
      "alice",
    );

    expect(result.totalUrls).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toBe("Fetch failed");
    expect(result.status).toBe("failed");
  });

  it("includes partial failures in overall batch status", async () => {
    mockedExtract
      .mockResolvedValueOnce({
        title: "Good",
        content: "Content.",
        sourceUrl: "https://good.com",
        metadata: {
          sourceUrl: "https://good.com",
          fetchedAt: "2026-01-01",
          contentLength: 8,
          sourceType: "url",
          triggeredBy: "alice",
        },
        sourceEntry: {
          type: "url",
          url: "https://good.com",
          fetched: "2026-01-01",
          triggered_by: "alice",
          raw_id: "raw-1",
        },
      })
      .mockRejectedValueOnce(new Error("Network error"));

    const result = await batchIngestUrls(
      ["https://good.com", "https://bad.com"],
      "alice",
    );

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.status).toBe("failed");
  });

  it("throws when URL count exceeds MAX_BATCH_URLS", async () => {
    const tooMany = Array(21)
      .fill("https://example.com")
      .map((u, i) => `${u}/${i}`);

    await expect(
      batchIngestUrls(tooMany, "alice"),
    ).rejects.toThrow(/maximum size of 20 URLs/);
  });

  it("enqueues ingest tasks via enqueueTask for each non-dup URL", async () => {
    mockedExtract.mockResolvedValue({
      title: "Example",
      content: "Content.",
      sourceUrl: "https://example.com",
      metadata: {
        sourceUrl: "https://example.com",
        fetchedAt: "2026-01-01",
        contentLength: 8,
        sourceType: "url",
        triggeredBy: "alice",
      },
      sourceEntry: {
        type: "url",
        url: "https://example.com",
        fetched: "2026-01-01",
        triggered_by: "alice",
        raw_id: "raw-1",
      },
    });

    await batchIngestUrls(["https://example.com"], "alice");

    expect(mockedEnqueue).toHaveBeenCalledTimes(1);
    const task = mockedEnqueue.mock.calls[0][0] as Extract<
      Parameters<typeof enqueueTask>[0],
      { kind: "ingest" }
    >;
    expect(task.kind).toBe("ingest");
    expect(task.url).toBe("https://example.com");
    expect(task.owner).toBe("alice");
    expect(task.sourceType).toBe("url");
  });

  it("passes tags and vaultId through the task when provided", async () => {
    mockedExtract.mockResolvedValue({
      title: "Tagged Page",
      content: "Content.",
      sourceUrl: "https://example.com/tagged",
      metadata: {
        sourceUrl: "https://example.com/tagged",
        fetchedAt: "2026-01-01",
        contentLength: 8,
        sourceType: "url",
        triggeredBy: "alice",
      },
      sourceEntry: {
        type: "url",
        url: "https://example.com/tagged",
        fetched: "2026-01-01",
        triggered_by: "alice",
        raw_id: "raw-1",
      },
    });

    await batchIngestUrls(
      ["https://example.com/tagged"],
      "alice",
      undefined,
      ["batch-tag"],
      "vault-123",
    );

    const task = mockedEnqueue.mock.calls[0][0] as Extract<
      Parameters<typeof enqueueTask>[0],
      { kind: "ingest" }
    >;
    expect(task.tags).toEqual(["batch-tag"]);
    expect(task.vaultId).toBe("vault-123");
  });

  it("updates batch job status to failed when any URL fails", async () => {
    mockedExtract.mockRejectedValue(new Error("Fetch failed"));

    await batchIngestUrls(["https://example.com/bad"], "alice");

    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        status: "failed",
      }),
    );
  });

  it("updates batch job status to done when all URLs succeed", async () => {
    mockedExtract.mockResolvedValue({
      title: "Example",
      content: "Content.",
      sourceUrl: "https://example.com",
      metadata: {
        sourceUrl: "https://example.com",
        fetchedAt: "2026-01-01",
        contentLength: 8,
        sourceType: "url",
        triggeredBy: "alice",
      },
      sourceEntry: {
        type: "url",
        url: "https://example.com",
        fetched: "2026-01-01",
        triggered_by: "alice",
        raw_id: "raw-1",
      },
    });

    await batchIngestUrls(["https://example.com"], "alice");

    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        status: "done",
      }),
    );
  });

  it("passes triggeredBy to extractUrlContent", async () => {
    mockedExtract.mockResolvedValue({
      title: "Example",
      content: "Content.",
      sourceUrl: "https://example.com",
      metadata: {
        sourceUrl: "https://example.com",
        fetchedAt: "2026-01-01",
        contentLength: 8,
        sourceType: "url",
        triggeredBy: "bob",
      },
      sourceEntry: {
        type: "url",
        url: "https://example.com",
        fetched: "2026-01-01",
        triggered_by: "bob",
        raw_id: "raw-1",
      },
    });

    await batchIngestUrls(["https://example.com"], "alice", "bob");

    expect(mockedExtract).toHaveBeenCalledWith("https://example.com", "bob");
  });

  it("logs per-URL success and failure for observability", async () => {
    mockedExtract.mockResolvedValue({
      title: "Logged",
      content: "Content.",
      sourceUrl: "https://logged.com",
      metadata: {
        sourceUrl: "https://logged.com",
        fetchedAt: "2026-01-01",
        contentLength: 8,
        sourceType: "url",
        triggeredBy: "alice",
      },
      sourceEntry: {
        type: "url",
        url: "https://logged.com",
        fetched: "2026-01-01",
        triggered_by: "alice",
        raw_id: "raw-1",
      },
    });

    await batchIngestUrls(["https://logged.com"], "alice");

    expect(mockedLogger.info).toHaveBeenCalledWith(
      "ingest-batch",
      "Batch ingest succeeded for URL:",
      expect.objectContaining({ url: "https://logged.com" }),
    );
  });

  it("logs warn when a URL fails", async () => {
    mockedExtract.mockRejectedValue(new Error("Network error"));

    await batchIngestUrls(["https://errored.com"], "alice");

    expect(mockedLogger.warn).toHaveBeenCalledWith(
      "ingest-batch",
      "Batch ingest failed for URL:",
      expect.objectContaining({
        url: "https://errored.com",
        error: "Network error",
      }),
    );
  });

  it("logs info when a URL is skipped as already ingested", async () => {
    mockedResolve.mockResolvedValueOnce("existing-slug");

    await batchIngestUrls(["https://skip.com"], "alice");

    expect(mockedLogger.info).toHaveBeenCalledWith(
      "ingest-batch",
      "Skipped already-ingested URL:",
      expect.objectContaining({
        url: "https://skip.com",
        existingSlug: "existing-slug",
      }),
    );
  });
});