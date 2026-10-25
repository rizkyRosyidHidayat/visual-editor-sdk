import type {
  ChildToEditorMessage,
  EditorToChildMessage,
  FieldPayload
} from "./types.js";

export const CHANNEL = "visual-editor-sdk" as const;
export const PROTOCOL_VERSION = 1 as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isEditorMessage(value: unknown): value is EditorToChildMessage {
  if (!isRecord(value)) return false;
  if (value.channel !== CHANNEL || value.version !== PROTOCOL_VERSION) return false;

  switch (value.type) {
    case "PING":
    case "RESTORE_ALL_PREVIEWS":
      return true;
    case "SET_EDIT_MODE":
      return typeof value.enabled === "boolean";
    case "UPDATE_PREVIEW":
      return typeof value.id === "string" && typeof value.value === "string";
    case "UPDATE_CONTENT": {
      if (!isRecord(value.data)) return false;
      if ("dataFiles" in value && value.dataFiles !== undefined) {
        if (!Array.isArray(value.dataFiles) || !value.dataFiles.every((f) => typeof f === "string")) {
          return false;
        }
      }
      return true;
    }
    case "RESTORE_PREVIEW":
      return typeof value.id === "string";
    default:
      return false;
  }
}

export function makeMessage<T extends ChildToEditorMessage["type"]>(
  type: T,
  payload: Omit<Extract<ChildToEditorMessage, { type: T }>, "channel" | "version" | "type">
): Extract<ChildToEditorMessage, { type: T }> {
  return {
    channel: CHANNEL,
    version: PROTOCOL_VERSION,
    type,
    ...payload
  } as Extract<ChildToEditorMessage, { type: T }>;
}

export function makeFieldPayload(
  field: { id: string; type: FieldPayload["type"]; label?: string },
  value: string
): FieldPayload {
  return {
    id: field.id,
    type: field.type,
    label: field.label ?? field.id,
    value
  };
}
