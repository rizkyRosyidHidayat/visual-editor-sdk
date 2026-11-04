import type {
  ChildToEditorMessage,
  DataItemSummary,
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
    case "RESTORE_PREVIEW":
      return typeof value.id === "string";
    case "SELECT_DATA_ITEM":
      return (
        typeof value.id === "string" &&
        typeof value.itemId === "string" &&
        (value.scrollIntoView === undefined || typeof value.scrollIntoView === "boolean")
      );
    case "UPDATE_DATA_ITEM_PREVIEW":
      return (
        typeof value.id === "string" &&
        typeof value.itemId === "string" &&
        typeof value.value === "string" &&
        (value.fieldSelector === undefined || typeof value.fieldSelector === "string") &&
        (value.attribute === undefined ||
          value.attribute === "href" ||
          value.attribute === "src" ||
          value.attribute === "alt")
      );
    case "RESTORE_DATA_ITEM_PREVIEW":
      return (
        typeof value.id === "string" &&
        (value.itemId === undefined || typeof value.itemId === "string")
      );
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
  field: { id: string; type: FieldPayload["type"]; label?: string | undefined; collection?: string | undefined },
  value: string,
  extras?: { selectedItemId?: string | undefined; items?: DataItemSummary[] | undefined } | undefined
): FieldPayload {
  const payload: FieldPayload = {
    id: field.id,
    type: field.type,
    label: field.label ?? field.id,
    value
  };
  if (field.collection !== undefined) {
    payload.collection = field.collection;
  }
  if (extras?.selectedItemId !== undefined) {
    payload.selectedItemId = extras.selectedItemId;
  }
  if (extras?.items !== undefined) {
    payload.items = extras.items;
  }
  return payload;
}
