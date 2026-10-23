import type {
  EditableField,
  FieldPayload,
  VisualEditorSdk,
  VisualEditorSdkOptions
} from "./types.js";
import { isEditorMessage, makeFieldPayload, makeMessage } from "./protocol.js";

export type {
  EditableField,
  EditableFieldType,
  EditorToChildMessage,
  ChildToEditorMessage,
  FieldPayload,
  VisualEditorSdk,
  VisualEditorSdkOptions
} from "./types.js";

const DEFAULT_SELECTED_ATTRIBUTE = "data-ve-selected";
const DEFAULT_EDIT_MODE_ATTRIBUTE = "data-ve-edit-mode";

function normalizeOrigin(origin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`Invalid editorOrigin URL: ${origin}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("editorOrigin must use http or https.");
  }
  if (parsed.origin !== origin.replace(/\/$/, "")) {
    throw new Error("editorOrigin must be an origin only (scheme + host + optional port), without a path.");
  }
  return parsed.origin;
}

function validateFields(fields: EditableField[]): Map<string, EditableField> {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error("Visual Editor SDK requires a non-empty fields array.");
  }

  const map = new Map<string, EditableField>();
  for (const field of fields) {
    if (!field || typeof field.id !== "string" || !field.id.trim()) {
      throw new Error("Each editable field must have a non-empty id.");
    }
    if (map.has(field.id)) throw new Error(`Duplicate editable field id: ${field.id}`);
    if (!["text", "textarea", "link", "image"].includes(field.type)) {
      throw new Error(`Unsupported field type for "${field.id}".`);
    }
    if (field.selector && field.selector.length > 500) {
      throw new Error(`Selector is too long for "${field.id}".`);
    }
    map.set(field.id, field);
  }
  return map;
}

function safeQuery(root: ParentNode, selector: string): Element | null {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function currentValue(element: Element, field: EditableField): string {
  if (field.type === "link" || field.type === "image") {
    const attribute = field.attribute ?? (field.type === "link" ? "href" : "src");
    return element.getAttribute(attribute) ?? "";
  }
  return element.textContent ?? "";
}

function applyValue(element: Element, field: EditableField, value: string): void {
  if (field.maxLength !== undefined && value.length > field.maxLength) {
    throw new Error(`Value exceeds maxLength for "${field.id}".`);
  }

  if (field.type === "link" || field.type === "image") {
    const attribute = field.attribute ?? (field.type === "link" ? "href" : "src");
    if (attribute === "href" || attribute === "src") {
      const trimmed = value.trim();
      if (trimmed && !/^(https?:|mailto:|tel:|\/|#)/i.test(trimmed)) {
        throw new Error(`Unsupported URL scheme for "${field.id}".`);
      }
    }
    element.setAttribute(attribute, value);
    return;
  }

  // Plain text only: never interpret editor values as HTML.
  element.textContent = value;
}

export function initVisualEditor(options: VisualEditorSdkOptions): VisualEditorSdk {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Visual Editor SDK can only run in a browser.");
  }
  if (window.parent === window) {
    throw new Error("Visual Editor SDK must run inside an iframe.");
  }

  const editorOrigin = normalizeOrigin(options.editorOrigin);
  if (!options.siteId.trim()) throw new Error("siteId is required.");

  const fieldsById = validateFields(options.fields);
  const selectedAttribute = options.selectedAttribute ?? DEFAULT_SELECTED_ATTRIBUTE;
  const editModeAttribute = options.editModeAttribute ?? DEFAULT_EDIT_MODE_ATTRIBUTE;
  let enabled = options.enabled ?? true;
  let editMode = false;
  let selectedElement: Element | null = null;

  const originalValues = new Map<string, string>();
  const originalAttributes = new Map<string, string | null>();
  const boundElements = new Map<string, Element>();
  const previousOutlineValues = new Map<Element, string | null>();

  function elementFor(field: EditableField): Element | null {
    const selector = field.selector ?? `[data-ve-id="${CSS.escape(field.id)}"]`;
    const element = safeQuery(document, selector);
    if (!element) return null;
    boundElements.set(field.id, element);
    return element;
  }

  function payloadFor(field: EditableField): FieldPayload | null {
    const element = elementFor(field);
    if (!element) return null;
    return makeFieldPayload(field, currentValue(element, field));
  }

  function allPayloads(): FieldPayload[] {
    const payloads: FieldPayload[] = [];
    for (const field of fieldsById.values()) {
      const payload = payloadFor(field);
      if (payload) payloads.push(payload);
    }
    return payloads;
  }

  function send(message: Parameters<typeof window.parent.postMessage>[0]): void {
    if (!enabled) return;
    window.parent.postMessage(message, editorOrigin);
  }

  function restoreSelectionOutline(): void {
    if (!selectedElement) return;
    const oldValue = previousOutlineValues.get(selectedElement);
    if (oldValue === undefined || oldValue === null) {
      selectedElement.removeAttribute(selectedAttribute);
    } else {
      selectedElement.setAttribute(selectedAttribute, oldValue);
    }
    previousOutlineValues.delete(selectedElement);
    selectedElement = null;
  }

  function selectField(field: EditableField): void {
    const element = elementFor(field);
    if (!element) return;
    restoreSelectionOutline();
    selectedElement = element;
    previousOutlineValues.set(element, element.getAttribute(selectedAttribute));
    element.setAttribute(selectedAttribute, "true");
    const payload = makeFieldPayload(field, currentValue(element, field));
    options.onSelect?.(field, payload.value);
    send(makeMessage("CONTENT_SELECTED", { siteId: options.siteId, field: payload }));
  }

  function handleClick(event: MouseEvent): void {
    if (!enabled || !editMode || event.defaultPrevented) return;
    const rawTarget = event.target;
    const target =
      rawTarget instanceof Element
        ? rawTarget
        : rawTarget instanceof Node
          ? rawTarget.parentElement
          : null;
    if (!target) return;

    const candidates: { field: EditableField; element: Element }[] = [];
    for (const field of fieldsById.values()) {
      const element = elementFor(field);
      if (element && (element === target || element.contains(target))) {
        candidates.push({ field, element });
      }
    }

    if (candidates.length === 0) return;

    event.preventDefault();
    event.stopPropagation();

    if (candidates.length > 1) {
      candidates.sort((a, b) => {
        if (a.element === b.element) return 0;
        if (a.element.contains(b.element)) return 1;
        if (b.element.contains(a.element)) return -1;
        return 0;
      });
    }

    const currentIndex = candidates.findIndex((c) => c.element === selectedElement);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % candidates.length : 0;
    const match = candidates[nextIndex];
    if (match) {
      selectField(match.field);
    }
  }

  function handleMessage(event: MessageEvent): void {
    if (!enabled) return;
    if (event.origin !== editorOrigin) return;
    if (event.source !== window.parent) return;
    if (!isEditorMessage(event.data)) return;

    const message = event.data;
    try {
      switch (message.type) {
        case "PING":
          send(makeMessage("PONG", { siteId: options.siteId }));
          break;
        case "SET_EDIT_MODE":
          editMode = message.enabled;
          document.documentElement.toggleAttribute(editModeAttribute, editMode);
          if (!editMode) restoreSelectionOutline();
          break;
        case "UPDATE_PREVIEW": {
          const field = fieldsById.get(message.id);
          if (!field) throw new Error(`Unknown field id: ${message.id}`);
          const element = elementFor(field);
          if (!element) throw new Error(`Element not found for field: ${message.id}`);

          if (!originalValues.has(field.id)) {
            originalValues.set(field.id, currentValue(element, field));
            if (field.type === "link" || field.type === "image") {
              const attr = field.attribute ?? (field.type === "link" ? "href" : "src");
              originalAttributes.set(field.id, element.getAttribute(attr));
            }
          }
          applyValue(element, field, message.value);
          options.onPreviewUpdate?.(field, message.value);
          break;
        }
        case "RESTORE_PREVIEW":
          restoreOne(message.id);
          break;
        case "RESTORE_ALL_PREVIEWS":
          for (const id of originalValues.keys()) restoreOne(id);
          break;
      }
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error("Unknown SDK error");
      options.onError?.(normalized);
      send(makeMessage("SDK_ERROR", {
        siteId: options.siteId,
        message: normalized.message
      }));
    }
  }

  function restoreOne(id: string): void {
    const field = fieldsById.get(id);
    const element = boundElements.get(id) ?? (field ? elementFor(field) : null);
    if (!field || !element || !originalValues.has(id)) return;

    const original = originalValues.get(id)!;
    if (field.type === "link" || field.type === "image") {
      const attr = field.attribute ?? (field.type === "link" ? "href" : "src");
      const originalAttr = originalAttributes.get(id);
      if (originalAttr === null || originalAttr === undefined) {
        element.removeAttribute(attr);
      } else {
        element.setAttribute(attr, originalAttr);
      }
      originalAttributes.delete(id);
    } else {
      element.textContent = original;
    }
    originalValues.delete(id);
  }

  function handleReady(): void {
    send(makeMessage("EDITOR_READY", {
      siteId: options.siteId,
      fields: allPayloads()
    }));
  }

  document.addEventListener("click", handleClick, true);
  window.addEventListener("message", handleMessage);
  window.addEventListener("load", handleReady, { once: true });

  // Also announce immediately for pages whose load event already fired.
  if (document.readyState === "complete" || document.readyState === "interactive") {
    queueMicrotask(handleReady);
  }

  return {
    destroy() {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("load", handleReady);
      restoreSelectionOutline();
      document.documentElement.removeAttribute(editModeAttribute);
    },
    setEditMode(enabledValue: boolean) {
      editMode = enabledValue;
      document.documentElement.toggleAttribute(editModeAttribute, editMode);
      if (!editMode) restoreSelectionOutline();
    },
    restorePreview(id: string) {
      restoreOne(id);
    },
    restoreAllPreviews() {
      for (const id of [...originalValues.keys()]) restoreOne(id);
    },
    getFields() {
      return allPayloads();
    }
  };
}
