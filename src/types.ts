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
  /** Optional paths of the JSON data files backing these fields. Sent to the parent in CONTENT_CHANGED messages so the server knows which files to update. */
  dataFiles?: string[];
  /** Optional options passed to writeContentToFiles when writing JSON data files on UPDATE_CONTENT. */
  writeOptions?: WriteContentOptions;
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
  /** Called whenever field data changes (after UPDATE_PREVIEW or UPDATE_CONTENT). */
  onContentChanged?: (data: Record<string, string>, dataFiles?: string[]) => void;
  /** Called when the SDK receives an invalid or unsupported message. */
  onError?: (error: Error) => void;
}

export interface WriteContentOptions {
  /**
   * When true (default), the new data is merged into each existing JSON file.
   * When false, each file is overwritten entirely with the new data.
   */
  merge?: boolean;
  /**
   * Number of spaces used for JSON indentation. Defaults to 2.
   */
  indent?: number;
  /**
   * Optional transform applied to the data before writing to each file.
   * Receives the merged/final data and the target file path.
   * Return the object that should be serialised to the file.
   */
  transform?: (data: Record<string, string>, filePath: string) => Record<string, unknown>;
}

export interface ContentChangedPayload {
  /** All current field values as a flat { id: value } map. */
  data: Record<string, string>;
  /** File paths to write the data into. */
  dataFiles?: string[];
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
  | { channel: "visual-editor-sdk"; version: 1; type: "UPDATE_CONTENT"; data: Record<string, string>; dataFiles?: string[] }
  | { channel: "visual-editor-sdk"; version: 1; type: "RESTORE_PREVIEW"; id: string }
  | { channel: "visual-editor-sdk"; version: 1; type: "RESTORE_ALL_PREVIEWS" };

export type ChildToEditorMessage =
  | { channel: "visual-editor-sdk"; version: 1; type: "EDITOR_READY"; siteId: string; fields: FieldPayload[] }
  | { channel: "visual-editor-sdk"; version: 1; type: "CONTENT_SELECTED"; siteId: string; field: FieldPayload }
  | { channel: "visual-editor-sdk"; version: 1; type: "CONTENT_CHANGED"; siteId: string; data: Record<string, string>; dataFiles?: string[] }
  | { channel: "visual-editor-sdk"; version: 1; type: "PONG"; siteId: string }
  | { channel: "visual-editor-sdk"; version: 1; type: "SDK_ERROR"; siteId: string; message: string };

export interface VisualEditorSdk {
  destroy(): void;
  setEditMode(enabled: boolean): void;
  restorePreview(id: string): void;
  restoreAllPreviews(): void;
  getFields(): FieldPayload[];
  /** Returns the current value of every field as a flat { id: value } map. */
  getCurrentData(): Record<string, string>;
}
