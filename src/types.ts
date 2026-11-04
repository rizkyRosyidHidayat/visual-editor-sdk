export type EditableFieldType = "text" | "textarea" | "link" | "image" | "data";

export interface EditableField {
  /** Stable identifier unique within the page, e.g. "home.hero.title" or "home.articles". */
  id: string;
  /** Field type controls which values are accepted for preview updates. */
  type: EditableFieldType;
  /** Human-readable label shown in the parent editor. */
  label?: string | undefined;
  /** Optional CSS selector; defaults to [data-ve-id="<id>"]. */
  selector?: string | undefined;
  /** Optional attribute to update for link/image fields. */
  attribute?: "href" | "src" | "alt" | undefined;
  /** Optional maximum length for text values. */
  maxLength?: number | undefined;
  /** Optional database collection or table identifier for data fields, e.g. "articles" or "plans". */
  collection?: string | undefined;
  /** Optional CSS selector for items within a data field element. Defaults to "[data-ve-item-id]". */
  itemSelector?: string | undefined;
  /** Optional attribute containing the item ID on child item elements. Defaults to "data-ve-item-id". */
  itemIdAttribute?: string | undefined;
}

export interface DataItemSummary {
  id: string;
  label?: string | undefined;
}

export interface FieldPayload {
  id: string;
  type: EditableFieldType;
  label: string;
  value: string;
  /** Collection/table name if type is "data". */
  collection?: string | undefined;
  /** Selected item ID when an item within a data field is selected. */
  selectedItemId?: string | undefined;
  /** List of child items currently rendered in the data section. */
  items?: DataItemSummary[] | undefined;
}

export interface VisualEditorSdkOptions {
  /** Exact origin of the parent editor, e.g. https://editor.example.com. No paths. */
  editorOrigin: string;
  /** Stable site identifier provisioned by your application. */
  siteId: string;
  /** Editable fields supported by this page. */
  fields: EditableField[];
  /** Start listening immediately. Defaults to true. */
  enabled?: boolean | undefined;
  /** Attribute used for generated selection outline. Defaults to data-ve-selected. */
  selectedAttribute?: string | undefined;
  /** Attribute toggled on documentElement while edit mode is active. */
  editModeAttribute?: string | undefined;
  /** Called after a field is selected. */
  onSelect?: ((field: EditableField, value: string, itemContext?: { itemId: string }) => void) | undefined;
  /** Called after an individual item within a data field is selected. */
  onSelectItem?: ((field: EditableField, itemId: string, itemElement: Element) => void) | undefined;
  /** Called after a valid preview update is applied. */
  onPreviewUpdate?: ((field: EditableField, value: string) => void) | undefined;
  /** Called when the SDK receives an invalid or unsupported message. */
  onError?: ((error: Error) => void) | undefined;
}

export type EditorToChildMessage =
  | { channel: "visual-editor-sdk"; version: 1; type: "PING" }
  | { channel: "visual-editor-sdk"; version: 1; type: "SET_EDIT_MODE"; enabled: boolean }
  | { channel: "visual-editor-sdk"; version: 1; type: "UPDATE_PREVIEW"; id: string; value: string }
  | { channel: "visual-editor-sdk"; version: 1; type: "RESTORE_PREVIEW"; id: string }
  | { channel: "visual-editor-sdk"; version: 1; type: "RESTORE_ALL_PREVIEWS" }
  | { channel: "visual-editor-sdk"; version: 1; type: "SELECT_DATA_ITEM"; id: string; itemId: string; scrollIntoView?: boolean | undefined }
  | { channel: "visual-editor-sdk"; version: 1; type: "UPDATE_DATA_ITEM_PREVIEW"; id: string; itemId: string; fieldSelector?: string | undefined; attribute?: "href" | "src" | "alt" | undefined; value: string }
  | { channel: "visual-editor-sdk"; version: 1; type: "RESTORE_DATA_ITEM_PREVIEW"; id: string; itemId?: string | undefined };

export type ChildToEditorMessage =
  | { channel: "visual-editor-sdk"; version: 1; type: "EDITOR_READY"; siteId: string; fields: FieldPayload[] }
  | { channel: "visual-editor-sdk"; version: 1; type: "CONTENT_SELECTED"; siteId: string; field: FieldPayload }
  | { channel: "visual-editor-sdk"; version: 1; type: "DATA_ITEM_SELECTED"; siteId: string; field: FieldPayload; itemId: string }
  | { channel: "visual-editor-sdk"; version: 1; type: "PONG"; siteId: string }
  | { channel: "visual-editor-sdk"; version: 1; type: "SDK_ERROR"; siteId: string; message: string };

export interface VisualEditorSdk {
  destroy(): void;
  setEditMode(enabled: boolean): void;
  restorePreview(id: string): void;
  restoreAllPreviews(): void;
  selectDataItem(fieldId: string, itemId: string): void;
  getFields(): FieldPayload[];
}
