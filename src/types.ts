export type EditableFieldType = "text" | "textarea" | "link" | "image";

export interface EditableField {
  /** Stable identifier unique within the page, e.g. "home.hero.title". */
  id: string;
  /** Field type controls which values are accepted for preview updates. */
  type: EditableFieldType;
  /** Human-readable label shown in the parent editor. */
  label?: string;
  /** Optional CSS selector; defaults to [data-ve-id="<id>"]. */
  selector?: string;
  /** Optional attribute to update for link/image fields. */
  attribute?: "href" | "src" | "alt";
  /** Optional maximum length for text values. */
  maxLength?: number;
}

export interface VisualEditorSdkOptions {
  /** Exact origin of the parent editor, e.g. https://editor.example.com. No paths. */
  editorOrigin: string;
  /** Stable site identifier provisioned by your application. */
  siteId: string;
  /** Editable fields supported by this page. */
  fields: EditableField[];
  /** Start listening immediately. Defaults to true. */
  enabled?: boolean;
  /** Attribute used for generated selection outline. Defaults to data-ve-selected. */
  selectedAttribute?: string;
  /** Attribute toggled on documentElement while edit mode is active. */
  editModeAttribute?: string;
  /** Called after a field is selected. */
  onSelect?: (field: EditableField, value: string) => void;
  /** Called after a valid preview update is applied. */
  onPreviewUpdate?: (field: EditableField, value: string) => void;
  /** Called when the SDK receives an invalid or unsupported message. */
  onError?: (error: Error) => void;
}

export interface FieldPayload {
  id: string;
  type: EditableFieldType;
  label: string;
  value: string;
}

export type EditorToChildMessage =
  | { channel: "visual-editor-sdk"; version: 1; type: "PING" }
  | { channel: "visual-editor-sdk"; version: 1; type: "SET_EDIT_MODE"; enabled: boolean }
  | { channel: "visual-editor-sdk"; version: 1; type: "UPDATE_PREVIEW"; id: string; value: string }
  | { channel: "visual-editor-sdk"; version: 1; type: "RESTORE_PREVIEW"; id: string }
  | { channel: "visual-editor-sdk"; version: 1; type: "RESTORE_ALL_PREVIEWS" };

export type ChildToEditorMessage =
  | { channel: "visual-editor-sdk"; version: 1; type: "EDITOR_READY"; siteId: string; fields: FieldPayload[] }
  | { channel: "visual-editor-sdk"; version: 1; type: "CONTENT_SELECTED"; siteId: string; field: FieldPayload }
  | { channel: "visual-editor-sdk"; version: 1; type: "PONG"; siteId: string }
  | { channel: "visual-editor-sdk"; version: 1; type: "SDK_ERROR"; siteId: string; message: string };

export interface VisualEditorSdk {
  destroy(): void;
  setEditMode(enabled: boolean): void;
  restorePreview(id: string): void;
  restoreAllPreviews(): void;
  getFields(): FieldPayload[];
}
