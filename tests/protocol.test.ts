import { describe, expect, it } from "vitest";
import { isEditorMessage, makeFieldPayload } from "../src/protocol.js";

describe("isEditorMessage", () => {
  it("accepts valid update messages", () => {
    expect(isEditorMessage({
      channel: "visual-editor-sdk",
      version: 1,
      type: "UPDATE_PREVIEW",
      id: "home.title",
      value: "Hello"
    })).toBe(true);
  });

  it("accepts valid SELECT_DATA_ITEM messages", () => {
    expect(isEditorMessage({
      channel: "visual-editor-sdk",
      version: 1,
      type: "SELECT_DATA_ITEM",
      id: "home.articles",
      itemId: "article-1",
      scrollIntoView: true
    })).toBe(true);

    expect(isEditorMessage({
      channel: "visual-editor-sdk",
      version: 1,
      type: "SELECT_DATA_ITEM",
      id: "home.articles",
      itemId: "article-1"
    })).toBe(true);

    expect(isEditorMessage({
      channel: "visual-editor-sdk",
      version: 1,
      type: "SELECT_DATA_ITEM",
      id: "home.articles",
      itemId: 123
    })).toBe(false);
  });

  it("accepts valid UPDATE_DATA_ITEM_PREVIEW messages", () => {
    expect(isEditorMessage({
      channel: "visual-editor-sdk",
      version: 1,
      type: "UPDATE_DATA_ITEM_PREVIEW",
      id: "home.articles",
      itemId: "article-1",
      fieldSelector: "h3",
      value: "New Article Title"
    })).toBe(true);

    expect(isEditorMessage({
      channel: "visual-editor-sdk",
      version: 1,
      type: "UPDATE_DATA_ITEM_PREVIEW",
      id: "home.articles",
      itemId: "article-1",
      attribute: "href",
      value: "https://example.com"
    })).toBe(true);

    expect(isEditorMessage({
      channel: "visual-editor-sdk",
      version: 1,
      type: "UPDATE_DATA_ITEM_PREVIEW",
      id: "home.articles",
      itemId: "article-1",
      attribute: "invalid-attr",
      value: "bad"
    })).toBe(false);
  });

  it("accepts valid RESTORE_DATA_ITEM_PREVIEW messages", () => {
    expect(isEditorMessage({
      channel: "visual-editor-sdk",
      version: 1,
      type: "RESTORE_DATA_ITEM_PREVIEW",
      id: "home.articles"
    })).toBe(true);

    expect(isEditorMessage({
      channel: "visual-editor-sdk",
      version: 1,
      type: "RESTORE_DATA_ITEM_PREVIEW",
      id: "home.articles",
      itemId: "article-1"
    })).toBe(true);
  });

  it("rejects a wrong channel", () => {
    expect(isEditorMessage({
      channel: "other",
      version: 1,
      type: "PING"
    })).toBe(false);
  });

  it("rejects malformed updates", () => {
    expect(isEditorMessage({
      channel: "visual-editor-sdk",
      version: 1,
      type: "UPDATE_PREVIEW",
      id: 42,
      value: "Hello"
    })).toBe(false);
  });

  it("rejects unknown message types", () => {
    expect(isEditorMessage({
      channel: "visual-editor-sdk",
      version: 1,
      type: "EXECUTE_SCRIPT"
    })).toBe(false);
  });
});

describe("makeFieldPayload", () => {
  it("includes collection and items for data field payloads", () => {
    const payload = makeFieldPayload(
      { id: "home.articles", type: "data", label: "Articles", collection: "articles" },
      "2 items",
      {
        selectedItemId: "article-1",
        items: [{ id: "article-1", label: "First Post" }, { id: "article-2" }]
      }
    );

    expect(payload).toEqual({
      id: "home.articles",
      type: "data",
      label: "Articles",
      value: "2 items",
      collection: "articles",
      selectedItemId: "article-1",
      items: [{ id: "article-1", label: "First Post" }, { id: "article-2" }]
    });
  });
});
