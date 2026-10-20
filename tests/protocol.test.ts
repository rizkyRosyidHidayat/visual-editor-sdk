import { describe, expect, it } from "vitest";
import { isEditorMessage } from "../src/protocol.js";

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
