import type {
  ContentChangedPayload,
  EditableField,
  EditableFieldType,
  FieldPayload,
  VisualEditorSdk,
  VisualEditorSdkOptions,
  WriteContentOptions
} from "./types.js";
import { isEditorMessage, makeFieldPayload, makeMessage } from "./protocol.js";
import { writeContentToFiles } from "./server.js";

export type {
  ContentChangedPayload,
  EditableField,
  EditableFieldType,
  EditorToChildMessage,
  ChildToEditorMessage,
  FieldPayload,
  VisualEditorSdk,
  VisualEditorSdkOptions,
  WriteContentOptions
} from "./types.js";
export { writeContentToFiles } from "./server.js";

export const SUPPORTED_FIELD_TYPES: readonly EditableFieldType[] = [
  "text",
  "textarea",
  "html",
  "richtext",
  "link",
  "image",
  "color",
  "style",
  "boolean",
  "toggle",
  "attribute"
] as const;

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

function escapeSelectorId(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(id);
  }
  return id.replace(/["\\]/g, "\\$&");
}

function validateFields(fields?: EditableField[]): Map<string, EditableField> {
  const map = new Map<string, EditableField>();
  if (!fields) return map;
  if (!Array.isArray(fields)) {
    throw new Error("Visual Editor SDK requires fields to be an array when provided.");
  }

  for (const field of fields) {
    if (!field || typeof field.id !== "string" || !field.id.trim()) {
      throw new Error("Each editable field must have a non-empty id.");
    }
    if (map.has(field.id)) throw new Error(`Duplicate editable field id: ${field.id}`);
    if (!SUPPORTED_FIELD_TYPES.includes(field.type)) {
      throw new Error(`Unsupported field type "${field.type}" for "${field.id}".`);
    }
    if (field.selector && field.selector.length > 500) {
      throw new Error(`Selector is too long for "${field.id}".`);
    }
    map.set(field.id, field);
  }
  return map;
}

function inferFieldFromElement(element: Element): EditableField | null {
  const id = element.getAttribute("data-ve-id");
  if (!id || !id.trim()) return null;

  const rawType = element.getAttribute("data-ve-type");
  let type: EditableFieldType;
  if (rawType && (SUPPORTED_FIELD_TYPES as readonly string[]).includes(rawType)) {
    type = rawType as EditableFieldType;
  } else {
    const tag = element.tagName.toUpperCase();
    if (tag === "IMG") {
      type = "image";
    } else if (tag === "A") {
      type = "link";
    } else if (tag === "TEXTAREA") {
      type = "textarea";
    } else if (tag === "INPUT") {
      const inputType = (element.getAttribute("type") ?? "text").toLowerCase();
      if (inputType === "checkbox" || inputType === "radio") {
        type = "boolean";
      } else if (inputType === "color") {
        type = "color";
      } else if (inputType === "image") {
        type = "image";
      } else {
        type = "text";
      }
    } else if (tag === "VIDEO" || tag === "AUDIO" || tag === "SOURCE") {
      type = "image";
    } else if (element.hasAttribute("data-ve-attribute")) {
      type = "attribute";
    } else if (element.hasAttribute("data-ve-style-prop")) {
      type = "style";
    } else {
      type = "text";
    }
  }

  const label = element.getAttribute("data-ve-label") ?? id;
  const attribute = element.getAttribute("data-ve-attribute");
  const styleProperty = element.getAttribute("data-ve-style-prop");
  const value = element.getAttribute("data-ve-value");
  const maxLengthAttr = element.getAttribute("data-ve-max-length");
  const parsedLength = maxLengthAttr ? parseInt(maxLengthAttr, 10) : undefined;
  const maxLength = typeof parsedLength === "number" && !Number.isNaN(parsedLength) ? parsedLength : undefined;

  const field: EditableField = { id, type, label };
  if (value !== null) field.value = value;
  if (attribute !== null) field.attribute = attribute;
  if (styleProperty !== null) field.styleProperty = styleProperty;
  if (maxLength !== undefined) field.maxLength = maxLength;

  return field;
}

function safeQuery(root: ParentNode, selector: string): Element | null {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function resolveAttribute(element: Element, field: EditableField): string {
  if (field.attribute) return field.attribute;
  if (field.type === "link") return "href";
  if (field.type === "image") {
    return element.tagName.toUpperCase() === "SOURCE" ? "srcset" : "src";
  }
  if (field.type === "attribute") return "data-value";
  return "";
}

function resolveStyleProperty(field: EditableField): string {
  return field.styleProperty ?? (field.attribute as string) ?? (field.type === "color" ? "color" : "display");
}

function isBackgroundImage(element: Element, field: EditableField): boolean {
  if (field.type !== "image") return false;
  if (field.styleProperty === "backgroundImage" || field.attribute === "background-image") return true;
  const tag = element.tagName.toUpperCase();
  const isMediaTag = tag === "IMG" || tag === "SOURCE" || tag === "VIDEO" || tag === "AUDIO";
  return !isMediaTag && !field.attribute && !element.hasAttribute("src");
}

function currentValue(element: Element, field: EditableField): string {
  switch (field.type) {
    case "text":
    case "textarea": {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.value;
      }
      return element.textContent ?? "";
    }
    case "html":
    case "richtext": {
      return element.innerHTML ?? "";
    }
    case "image": {
      if (isBackgroundImage(element, field)) {
        const bg = (element as HTMLElement).style?.backgroundImage ?? "";
        const match = /url\(['"]?(.*?)['"]?\)/i.exec(bg);
        const extracted = match?.[1];
        return extracted !== undefined ? extracted : bg;
      }
      const attr = resolveAttribute(element, field);
      return element.getAttribute(attr) ?? "";
    }
    case "link":
    case "attribute": {
      const attr = resolveAttribute(element, field);
      return element.getAttribute(attr) ?? "";
    }
    case "color": {
      if (element instanceof HTMLInputElement && element.type === "color") {
        return element.value;
      }
      if (field.attribute && !field.styleProperty && element.hasAttribute(field.attribute)) {
        return element.getAttribute(field.attribute) ?? "";
      }
      const prop = resolveStyleProperty(field);
      const htmlEl = element as HTMLElement;
      return htmlEl.style?.getPropertyValue(prop) || (htmlEl.style as any)?.[prop] || "";
    }
    case "style": {
      const prop = resolveStyleProperty(field);
      const htmlEl = element as HTMLElement;
      return htmlEl.style?.getPropertyValue(prop) || (htmlEl.style as any)?.[prop] || "";
    }
    case "boolean":
    case "toggle": {
      if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
        return String(element.checked);
      }
      if (field.attribute) {
        return String(element.hasAttribute(field.attribute));
      }
      return String(!element.hasAttribute("hidden"));
    }
  }
}

function applyValue(element: Element, field: EditableField, value: string): void {
  if (field.maxLength !== undefined && value.length > field.maxLength) {
    throw new Error(`Value exceeds maxLength for "${field.id}".`);
  }

  switch (field.type) {
    case "text":
    case "textarea": {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        element.textContent = value;
      }
      break;
    }
    case "html":
    case "richtext": {
      element.innerHTML = value;
      break;
    }
    case "image": {
      if (isBackgroundImage(element, field)) {
        const trimmed = value.trim();
        if (trimmed && !/^(https?:|data:|\/|#|\.|\w)/i.test(trimmed)) {
          throw new Error(`Unsupported URL scheme for "${field.id}".`);
        }
        (element as HTMLElement).style.backgroundImage = value ? `url("${value}")` : "";
        return;
      }
      const attr = resolveAttribute(element, field);
      if (attr === "src" || attr === "srcset") {
        const trimmed = value.trim();
        if (trimmed && !/^(https?:|data:|\/|#|\.)/i.test(trimmed)) {
          throw new Error(`Unsupported URL scheme for "${field.id}".`);
        }
      }
      element.setAttribute(attr, value);
      break;
    }
    case "link": {
      const attr = resolveAttribute(element, field);
      if (attr === "href") {
        const trimmed = value.trim();
        if (trimmed && !/^(https?:|mailto:|tel:|\/|#)/i.test(trimmed)) {
          throw new Error(`Unsupported URL scheme for "${field.id}".`);
        }
      }
      element.setAttribute(attr, value);
      break;
    }
    case "attribute": {
      const attr = resolveAttribute(element, field);
      element.setAttribute(attr, value);
      break;
    }
    case "color": {
      if (element instanceof HTMLInputElement && element.type === "color") {
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (field.attribute && !field.styleProperty && element.hasAttribute(field.attribute)) {
        element.setAttribute(field.attribute, value);
      } else {
        const prop = resolveStyleProperty(field);
        (element as HTMLElement).style.setProperty(prop, value);
      }
      break;
    }
    case "style": {
      const prop = resolveStyleProperty(field);
      if (value === "") {
        (element as HTMLElement).style.removeProperty(prop);
      } else {
        (element as HTMLElement).style.setProperty(prop, value);
      }
      break;
    }
    case "boolean":
    case "toggle": {
      const isTrue = value === "true" || value === "1" || value === "on";
      if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
        element.checked = isTrue;
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (field.attribute) {
        if (isTrue) {
          element.setAttribute(field.attribute, value === "true" || value === "1" ? "" : value);
        } else {
          element.removeAttribute(field.attribute);
        }
      } else {
        element.toggleAttribute("hidden", !isTrue);
      }
      break;
    }
  }
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
  const originalAttributes = new Map<string, { attribute: string; value: string | null }>();
  const originalStyles = new Map<string, { property: string; value: string | null }>();
  const originalInputValues = new Map<string, string>();
  const originalChecked = new Map<string, boolean>();
  const boundElements = new Map<string, Element>();
  const previousOutlineValues = new Map<Element, string | null>();

  function getField(id: string): EditableField | null {
    const configured = fieldsById.get(id);
    if (configured) return configured;
    const element = safeQuery(document, `[data-ve-id="${escapeSelectorId(id)}"]`);
    if (element) return inferFieldFromElement(element);
    return null;
  }

  function elementFor(field: EditableField): Element | null {
    const selector = field.selector ?? `[data-ve-id="${escapeSelectorId(field.id)}"]`;
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
    const seenIds = new Set<string>();

    for (const field of fieldsById.values()) {
      const payload = payloadFor(field);
      if (payload) {
        payloads.push(payload);
        seenIds.add(field.id);
      }
    }

    const autoElements = Array.from(document.querySelectorAll("[data-ve-id]"));
    for (const el of autoElements) {
      const id = el.getAttribute("data-ve-id");
      if (!id || seenIds.has(id)) continue;
      const inferred = inferFieldFromElement(el);
      if (inferred) {
        boundElements.set(id, el);
        payloads.push(makeFieldPayload(inferred, currentValue(el, inferred)));
        seenIds.add(id);
      }
    }

    return payloads;
  }

  function collectCurrentData(): Record<string, string> {
    const data: Record<string, string> = {};
    const seenIds = new Set<string>();

    for (const field of fieldsById.values()) {
      const element = elementFor(field);
      if (element) {
        data[field.id] = currentValue(element, field);
        seenIds.add(field.id);
      }
    }

    const autoElements = Array.from(document.querySelectorAll("[data-ve-id]"));
    for (const el of autoElements) {
      const id = el.getAttribute("data-ve-id");
      if (!id || seenIds.has(id)) continue;
      const inferred = inferFieldFromElement(el);
      if (inferred) {
        boundElements.set(id, el);
        data[id] = currentValue(el, inferred);
        seenIds.add(id);
      }
    }

    return data;
  }

  function emitContentChanged(): void {
    const data = collectCurrentData();
    const payload: Record<string, unknown> = { siteId: options.siteId, data };
    if (options.dataFiles && options.dataFiles.length > 0) payload.dataFiles = options.dataFiles;
    send(makeMessage("CONTENT_CHANGED", payload as { siteId: string; data: Record<string, string>; dataFiles?: string[] }));
    options.onContentChanged?.(data, options.dataFiles);
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
    const element = boundElements.get(field.id) ?? elementFor(field);
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
    const seenElements = new Set<Element>();

    for (const field of fieldsById.values()) {
      const element = elementFor(field);
      if (element && (element === target || element.contains(target))) {
        candidates.push({ field, element });
        seenElements.add(element);
      }
    }

    let current: Element | null = target;
    while (current && current !== document.body && current !== document.documentElement) {
      if (current.hasAttribute("data-ve-id") && !seenElements.has(current)) {
        const inferred = inferFieldFromElement(current);
        if (inferred) {
          candidates.push({ field: inferred, element: current });
          seenElements.add(current);
        }
      }
      current = current.parentElement;
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

  function recordOriginal(field: EditableField, element: Element): void {
    if (originalValues.has(field.id)) return;

    originalValues.set(field.id, currentValue(element, field));

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
        originalChecked.set(field.id, element.checked);
      } else {
        originalInputValues.set(field.id, element.value);
      }
    }

    if (isBackgroundImage(element, field)) {
      originalStyles.set(field.id, {
        property: "background-image",
        value: (element as HTMLElement).style?.getPropertyValue("background-image") || null
      });
    } else if (
      field.type === "link" ||
      field.type === "image" ||
      field.type === "attribute" ||
      ((field.type === "boolean" || field.type === "toggle") && field.attribute)
    ) {
      const attr = resolveAttribute(element, field);
      if (attr) {
        originalAttributes.set(field.id, {
          attribute: attr,
          value: element.getAttribute(attr)
        });
      }
    } else if (field.type === "style" || field.type === "color") {
      if (element instanceof HTMLInputElement && element.type === "color") {
        // already recorded in originalInputValues
      } else if (field.attribute && !field.styleProperty && element.hasAttribute(field.attribute)) {
        originalAttributes.set(field.id, {
          attribute: field.attribute,
          value: element.getAttribute(field.attribute)
        });
      } else {
        const prop = resolveStyleProperty(field);
        originalStyles.set(field.id, {
          property: prop,
          value: (element as HTMLElement).style?.getPropertyValue(prop) || null
        });
      }
    }
  }

  async function handleMessage(event: MessageEvent): Promise<void> {
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
          const field = getField(message.id);
          if (!field) throw new Error(`Unknown field id: ${message.id}`);
          const element = boundElements.get(message.id) ?? elementFor(field);
          if (!element) throw new Error(`Element not found for field: ${message.id}`);

          recordOriginal(field, element);
          applyValue(element, field, message.value);
          options.onPreviewUpdate?.(field, message.value);
          emitContentChanged();
          break;
        }
        case "UPDATE_CONTENT": {
          const entries = Object.entries(message.data);
          for (const [id, value] of entries) {
            if (typeof value !== "string") continue;
            const field = getField(id);
            if (!field) continue;
            const element = boundElements.get(id) ?? elementFor(field);
            if (!element) continue;
            recordOriginal(field, element);
            applyValue(element, field, value);
            options.onPreviewUpdate?.(field, value);
          }
          const targetFiles = (Array.isArray(message.dataFiles) && message.dataFiles.length > 0)
            ? message.dataFiles
            : options.dataFiles;
          if (targetFiles && targetFiles.length > 0) {
            await writeContentToFiles(
              {
                data: { ...collectCurrentData(), ...message.data },
                dataFiles: targetFiles
              },
              options.writeOptions
            );
          }
          emitContentChanged();
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
    const field = getField(id);
    const element = boundElements.get(id) ?? (field ? elementFor(field) : null);
    if (!field || !element || !originalValues.has(id)) return;

    const original = originalValues.get(id)!;

    if (originalChecked.has(id)) {
      (element as HTMLInputElement).checked = originalChecked.get(id)!;
      originalChecked.delete(id);
    }

    if (originalInputValues.has(id)) {
      (element as HTMLInputElement | HTMLTextAreaElement).value = originalInputValues.get(id)!;
      originalInputValues.delete(id);
    }

    if (originalStyles.has(id)) {
      const { property, value } = originalStyles.get(id)!;
      if (value === null || value === "") {
        (element as HTMLElement).style?.removeProperty(property);
      } else {
        (element as HTMLElement).style?.setProperty(property, value);
      }
      originalStyles.delete(id);
    }

    if (originalAttributes.has(id)) {
      const { attribute, value } = originalAttributes.get(id)!;
      if (value === null) {
        element.removeAttribute(attribute);
      } else {
        element.setAttribute(attribute, value);
      }
      originalAttributes.delete(id);
    }

    if (field.type === "html" || field.type === "richtext") {
      element.innerHTML = original;
    } else if (field.type === "boolean" || field.type === "toggle") {
      if (!field.attribute && !(element instanceof HTMLInputElement)) {
        element.toggleAttribute("hidden", original === "false");
      }
    } else if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement) &&
      field.type !== "link" &&
      field.type !== "image" &&
      field.type !== "style" &&
      field.type !== "color" &&
      field.type !== "attribute"
    ) {
      element.textContent = original;
    }

    originalValues.delete(id);
  }

  function applyInitialValues(): void {
    for (const field of fieldsById.values()) {
      const element = elementFor(field);
      if (!element) continue;

      const initialVal =
        options.initialData?.[field.id] ??
        options.data?.[field.id] ??
        field.value ??
        element.getAttribute("data-ve-value") ??
        undefined;

      const valToApply = initialVal !== undefined ? initialVal : currentValue(element, field);
      if (initialVal !== undefined) {
        recordOriginal(field, element);
      }
      try {
        applyValue(element, field, valToApply);
      } catch {
        // Ignore initial formatting mismatch errors
      }
    }

    const autoElements = Array.from(document.querySelectorAll("[data-ve-id]"));
    for (const el of autoElements) {
      const id = el.getAttribute("data-ve-id");
      if (!id || fieldsById.has(id)) continue;
      const inferred = inferFieldFromElement(el);
      if (!inferred) continue;
      boundElements.set(id, el);

      const initialVal =
        options.initialData?.[id] ??
        options.data?.[id] ??
        inferred.value ??
        el.getAttribute("data-ve-value") ??
        undefined;

      const valToApply = initialVal !== undefined ? initialVal : currentValue(el, inferred);
      if (initialVal !== undefined) {
        recordOriginal(inferred, el);
      }
      try {
        applyValue(el, inferred, valToApply);
      } catch {
        // Ignore initial formatting mismatch errors
      }
    }
  }

  // Execute applyValue when first initializing visual editor
  applyInitialValues();

  function handleReady(): void {
    applyInitialValues();
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
    },
    getCurrentData() {
      return collectCurrentData();
    }
  };
}
