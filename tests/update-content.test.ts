import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initVisualEditor } from "../src/index.js";
import type { EditableField } from "../src/types.js";
import { readFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("UPDATE_CONTENT with writeContentToFiles", () => {
  const origin = "https://editor.example.com";
  let mockParent: { postMessage: ReturnType<typeof vi.fn> };
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `ve-sdk-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });

    document.body.innerHTML = `
      <main>
        <h1 data-ve-id="home.hero.title">Original Title</h1>
        <p data-ve-id="home.hero.desc">Original Description</p>
      </main>
    `;

    mockParent = {
      postMessage: vi.fn()
    };
    Object.defineProperty(window, "parent", {
      value: mockParent,
      configurable: true,
      writable: true
    });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  const fields: EditableField[] = [
    {
      id: "home.hero.title",
      type: "text",
      label: "Hero title"
    },
    {
      id: "home.hero.desc",
      type: "text",
      label: "Hero description"
    }
  ];

  it("writes updated content to files specified in options.dataFiles", async () => {
    const file1 = join(testDir, "content1.json");
    const file2 = join(testDir, "sub", "content2.json");

    const onContentChanged = vi.fn();

    const sdk = initVisualEditor({
      siteId: "test-site",
      editorOrigin: origin,
      fields,
      dataFiles: [file1, file2],
      onContentChanged
    });

    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_CONTENT",
          data: {
            "home.hero.title": "Updated Title"
          }
        }
      })
    );

    // Give async file writing time to complete
    await new Promise((r) => setTimeout(r, 100));

    // Verify DOM was updated
    const titleEl = document.querySelector('[data-ve-id="home.hero.title"]')!;
    expect(titleEl.textContent).toBe("Updated Title");

    // Verify both files were written
    const raw1 = await readFile(file1, "utf-8");
    const json1 = JSON.parse(raw1);
    expect(json1["home.hero.title"]).toBe("Updated Title");
    expect(json1["home.hero.desc"]).toBe("Original Description");

    const raw2 = await readFile(file2, "utf-8");
    const json2 = JSON.parse(raw2);
    expect(json2["home.hero.title"]).toBe("Updated Title");

    // Verify CONTENT_CHANGED was emitted
    const contentChangedMsg = mockParent.postMessage.mock.calls.find(
      ([msg]) => msg.type === "CONTENT_CHANGED"
    );
    expect(contentChangedMsg).toBeDefined();
    expect(contentChangedMsg![0].data["home.hero.title"]).toBe("Updated Title");
    expect(contentChangedMsg![0].dataFiles).toEqual([file1, file2]);

    sdk.destroy();
  });

  it("allows message.dataFiles to override options.dataFiles", async () => {
    const defaultFile = join(testDir, "default.json");
    const overrideFile = join(testDir, "override.json");

    const sdk = initVisualEditor({
      siteId: "test-site",
      editorOrigin: origin,
      fields,
      dataFiles: [defaultFile]
    });

    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_CONTENT",
          data: {
            "home.hero.title": "Overridden"
          },
          dataFiles: [overrideFile]
        }
      })
    );

    await new Promise((r) => setTimeout(r, 100));

    // overrideFile was created, defaultFile was not touched
    const raw = await readFile(overrideFile, "utf-8");
    expect(JSON.parse(raw)["home.hero.title"]).toBe("Overridden");

    let defaultExists = false;
    try {
      await readFile(defaultFile, "utf-8");
      defaultExists = true;
    } catch {
      defaultExists = false;
    }
    expect(defaultExists).toBe(false);

    sdk.destroy();
  });

  it("merges existing JSON keys when updating files", async () => {
    const file = join(testDir, "existing.json");
    // Pre-create file with existing content
    const initial = {
      "site.name": "My Website",
      "home.hero.title": "Old Title",
      "home.hero.desc": "Old Description"
    };
    const { writeFile } = await import("node:fs/promises");
    await writeFile(file, JSON.stringify(initial), "utf-8");

    const sdk = initVisualEditor({
      siteId: "test-site",
      editorOrigin: origin,
      fields,
      dataFiles: [file]
    });

    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_CONTENT",
          data: {
            "home.hero.title": "Brand New Title"
          }
        }
      })
    );

    await new Promise((r) => setTimeout(r, 100));

    const raw = await readFile(file, "utf-8");
    const parsed = JSON.parse(raw);
    // Preserves unrelated keys
    expect(parsed["site.name"]).toBe("My Website");
    // Updated key is updated
    expect(parsed["home.hero.title"]).toBe("Brand New Title");
    // Other fields in the DOM are preserved
    expect(parsed["home.hero.desc"]).toBe("Original Description");

    sdk.destroy();
  });

  it("handles errors during writeContentToFiles by calling onError and sending SDK_ERROR", async () => {
    const onError = vi.fn();

    // Use an invalid file path on Windows that will fail to create/write (e.g. NUL byte or illegal filename)
    const invalidFile = join(testDir, "illegal:\0/file.json");

    const sdk = initVisualEditor({
      siteId: "test-site",
      editorOrigin: origin,
      fields,
      dataFiles: [invalidFile],
      onError
    });

    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_CONTENT",
          data: {
            "home.hero.title": "Title"
          }
        }
      })
    );

    await new Promise((r) => setTimeout(r, 100));

    expect(onError).toHaveBeenCalled();
    const sdkErrorMsg = mockParent.postMessage.mock.calls.find(
      ([msg]) => msg.type === "SDK_ERROR"
    );
    expect(sdkErrorMsg).toBeDefined();

    sdk.destroy();
  });
});
