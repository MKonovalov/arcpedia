import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractUrlContent } from "../ingest-url";
import { fetchUrlContent } from "../fetch";
import { logger } from "../logger";

vi.mock("../fetch", () => ({
  fetchUrlContent: vi.fn(),
}));

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("extractUrlContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a structured result with title, content, and metadata from a URL", async () => {
    const mockFetch = vi.mocked(fetchUrlContent);
    mockFetch.mockResolvedValue({
      title: "Example Domain",
      content: "This domain is for use in illustrative examples in documents.",
    });

    const result = await extractUrlContent("https://example.com");

    expect(result.title).toBe("Example Domain");
    expect(result.content).toBe(
      "This domain is for use in illustrative examples in documents.",
    );
    expect(result.sourceUrl).toBe("https://example.com");
    expect(result.metadata.sourceUrl).toBe("https://example.com");
    expect(result.metadata.sourceType).toBe("url");
    expect(result.metadata.contentLength).toBe(
      "This domain is for use in illustrative examples in documents.".length,
    );
    expect(result.metadata.fetchedAt).toBeDefined();
    expect(result.sourceEntry.type).toBe("url");
    expect(result.sourceEntry.url).toBe("https://example.com");
    expect(result.sourceEntry.triggered_by).toBe("system");
  });

  it("records the triggeredBy actor in metadata and sourceEntry", async () => {
    const mockFetch = vi.mocked(fetchUrlContent);
    mockFetch.mockResolvedValue({
      title: "Test Page",
      content: "Test content.",
    });

    const result = await extractUrlContent(
      "https://example.com/page",
      "alice",
    );

    expect(result.metadata.triggeredBy).toBe("alice");
    expect(result.sourceEntry.triggered_by).toBe("alice");
  });

  it("logs ingest source metadata at info level", async () => {
    const mockFetch = vi.mocked(fetchUrlContent);
    mockFetch.mockResolvedValue({
      title: "Logged Page",
      content: "Some content here.",
    });

    await extractUrlContent("https://example.com/logged");

    expect(logger.info).toHaveBeenCalledWith(
      "ingest-url",
      "Fetched URL source:",
      expect.objectContaining({
        url: "https://example.com/logged",
        title: "Logged Page",
        contentLength: "Some content here.".length,
        triggeredBy: "system",
      }),
    );
  });

  it("throws when fetchUrlContent throws", async () => {
    const mockFetch = vi.mocked(fetchUrlContent);
    mockFetch.mockRejectedValue(new Error("Network error"));

    await expect(
      extractUrlContent("https://example.com/broken"),
    ).rejects.toThrow("Network error");
  });

  it("returns result with empty contentLength for empty body", async () => {
    const mockFetch = vi.mocked(fetchUrlContent);
    mockFetch.mockResolvedValue({
      title: "Empty Page",
      content: "",
    });

    const result = await extractUrlContent("https://example.com/empty");

    expect(result.metadata.contentLength).toBe(0);
    expect(result.title).toBe("Empty Page");
  });
});