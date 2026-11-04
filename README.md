# Visual Editor SDK

A framework-agnostic TypeScript SDK for allowing a parent visual editor to select and preview-edit registered content in a website loaded inside an iframe.

> **Important:** This SDK only enables editing/preview messaging. It does not connect to Supabase, persist content, authenticate users, or publish changes. Your parent editor/backend must implement those parts. It works only on websites where you can install this SDK and register editable fields.

## Requirements

- A website that can be modified to include the SDK.
- A parent visual editor hosted at a known HTTP(S) origin.
- The target website must permit iframe embedding through its CSP / `X-Frame-Options` configuration.
- Node.js 18+ for development/build.

## Install

After publishing under your npm scope:

```bash
npm install visual-editor-sdk
```

Before publishing, change `visual-editor-sdk` in `package.json` to your available npm package name.

## 1. Register editable fields in the child website

Install and initialize the SDK in the website you want to edit:

```ts
import { initVisualEditor } from "visual-editor-sdk";

const sdk = initVisualEditor({
  siteId: "company-site-001",
  editorOrigin: "https://editor.example.com",
  fields: [
    {
      id: "home.hero.title",
      type: "text",
      label: "Hero title",
      selector: '[data-ve-id="home.hero.title"]',
      maxLength: 120
    },
    {
      id: "home.hero.description",
      type: "textarea",
      label: "Hero description",
      selector: '[data-ve-id="home.hero.description"]',
      maxLength: 500
    },
    {
      id: "home.hero.cta",
      type: "link",
      label: "Hero CTA URL",
      selector: '[data-ve-id="home.hero.cta"]',
      attribute: "href"
    },
    {
      id: "home.hero.image",
      type: "image",
      label: "Hero image",
      selector: '[data-ve-id="home.hero.image"]',
      attribute: "src"
    },
    // Database-backed section (articles, plans, team, products, etc.)
    {
      id: "home.articles",
      type: "data",
      label: "Articles Section",
      collection: "articles", // database collection or table identifier
      selector: '[data-ve-id="home.articles"]',
      itemSelector: '[data-ve-item-id]', // defaults to [data-ve-item-id]
      itemIdAttribute: 'data-ve-item-id' // defaults to data-ve-item-id
    }
  ],
  onSelect(field, value, itemContext) {
    console.log("Selected field", field.id, value, itemContext);
  },
  onSelectItem(field, itemId, element) {
    console.log("Selected item:", itemId, "in section:", field.id);
  },
  onError(error) {
    console.error("[visual-editor-sdk]", error);
  }
});

// If this SPA unmounts the page/integration, call:
// sdk.destroy();
```

Add matching markers to the rendered page:

```html
<h1 data-ve-id="home.hero.title">Build Better Digital Experiences</h1>
<p data-ve-id="home.hero.description">We help businesses grow.</p>
<a data-ve-id="home.hero.cta" href="/contact">Get started</a>
<img data-ve-id="home.hero.image" src="/images/hero.webp" alt="Team at work">

<!-- Database-backed section with items -->
<section data-ve-id="home.articles" class="articles-section">
  <h2>Recent Articles</h2>
  <div class="articles-grid">
    <article data-ve-item-id="article-101" class="card">
      <h3 data-ve-field="title">First Article</h3>
      <p data-ve-field="summary">Summary of first article...</p>
    </article>
    <article data-ve-item-id="article-102" class="card">
      <h3 data-ve-field="title">Second Article</h3>
      <p data-ve-field="summary">Summary of second article...</p>
    </article>
  </div>
</section>
```

### Data Fields & Database Views

For `type: "data"` fields:
- **Table Data List View**: When the section container (e.g. section title or padding) is clicked or selected, `CONTENT_SELECTED` is dispatched with `field.type = "data"`, `field.collection = "articles"`, and `field.items` containing the IDs of all rendered items. The parent visual editor can display a table of database records for this collection.
- **Item Detail View**: When an individual card/item (`[data-ve-item-id]`) is clicked in the iframe, the child SDK dispatches `DATA_ITEM_SELECTED` with `itemId` and `field`. The parent editor displays the detail edit form for that specific record.
- **Hierarchical Click Cycling**: Clicking a card selects the item first (detail view). Clicking the same item again cycles up to select the parent section (table view).

## 2. Parent editor: receive selection and update preview

```ts
const iframe = document.querySelector<HTMLIFrameElement>("#site-preview");
if (!iframe) throw new Error("Preview iframe not found");

const previewOrigin = "https://company.example.com";

window.addEventListener("message", (event: MessageEvent) => {
  // Always validate both origin and iframe source.
  if (event.origin !== previewOrigin) return;
  if (event.source !== iframe.contentWindow) return;

  const message = event.data;
  if (!message || message.channel !== "visual-editor-sdk" || message.version !== 1) return;

  if (message.type === "EDITOR_READY") {
    console.log("Preview ready", message.siteId, message.fields);
  }

  if (message.type === "CONTENT_SELECTED") {
    if (message.field.type === "data" && !message.field.selectedItemId) {
      // Open table data list from database for collection: message.field.collection
      console.log("Display table list for collection:", message.field.collection, message.field.items);
    } else {
      // Scalar text/image/link field selected
      console.log("Selected content", message.field);
    }
  }

  if (message.type === "DATA_ITEM_SELECTED") {
    // Open item detail view for message.itemId in collection message.field.collection
    console.log("Display item detail for:", message.itemId, "in", message.field.collection);
  }

  if (message.type === "SDK_ERROR") {
    console.error("Child SDK error", message.message);
  }
});

function setEditMode(enabled: boolean) {
  iframe.contentWindow?.postMessage(
    { channel: "visual-editor-sdk", version: 1, type: "SET_EDIT_MODE", enabled },
    previewOrigin
  );
}

// Select a specific database item from the parent editor (e.g. clicking table row)
function selectDataItem(fieldId: string, itemId: string) {
  iframe.contentWindow?.postMessage(
    { channel: "visual-editor-sdk", version: 1, type: "SELECT_DATA_ITEM", id: fieldId, itemId, scrollIntoView: true },
    previewOrigin
  );
}

// Preview changes on a data item
function updateDataItemPreview(fieldId: string, itemId: string, fieldSelector: string, value: string) {
  iframe.contentWindow?.postMessage(
    { channel: "visual-editor-sdk", version: 1, type: "UPDATE_DATA_ITEM_PREVIEW", id: fieldId, itemId, fieldSelector, value },
    previewOrigin
  );
}

function updatePreview(id: string, value: string) {
  iframe.contentWindow?.postMessage(
    { channel: "visual-editor-sdk", version: 1, type: "UPDATE_PREVIEW", id, value },
    previewOrigin
  );
}

function restorePreview(id: string) {
  iframe.contentWindow?.postMessage(
    { channel: "visual-editor-sdk", version: 1, type: "RESTORE_PREVIEW", id },
    previewOrigin
  );
}
```

Use the exact expected origin, never `"*"` for sensitive editor communication. The child SDK validates both `event.origin` and `event.source`.

## Protocol

All messages contain:

```ts
{
  channel: "visual-editor-sdk",
  version: 1,
  type: string
}
```

Child → parent:
- `EDITOR_READY`: site ID and registered fields currently found in the DOM.
- `CONTENT_SELECTED`: selected field metadata, current value, collection, and item list if `type: "data"`.
- `DATA_ITEM_SELECTED`: emitted when an individual card/item in a `data` field is selected, including `itemId` and field metadata.
- `PONG`: response to `PING`.
- `SDK_ERROR`: an error message.

Parent → child:
- `PING`
- `SET_EDIT_MODE`: `{ enabled: boolean }`
- `UPDATE_PREVIEW`: `{ id: string, value: string }`
- `RESTORE_PREVIEW`: `{ id: string }`
- `RESTORE_ALL_PREVIEWS`
- `SELECT_DATA_ITEM`: `{ id: string, itemId: string, scrollIntoView?: boolean }`
- `UPDATE_DATA_ITEM_PREVIEW`: `{ id: string, itemId: string, fieldSelector?: string, attribute?: string, value: string }`
- `RESTORE_DATA_ITEM_PREVIEW`: `{ id: string, itemId?: string }`

## Security notes

- This SDK is **not** an authorization system. Never trust a field ID or value as permission to write to a database.
- Validate user identity, site ownership, field schema, content size, and revision on your backend before saving or publishing.
- Do not expose Supabase service-role keys in the browser or iframe.
- Use a strict `editorOrigin`; do not use `"*"` as the message target origin.
- Only register trusted selectors and known fields. Do not build arbitrary selectors from untrusted message data.
- For URLs, validate allowed schemes and preferably enforce a stricter site-specific URL policy server-side.
- Configure `Content-Security-Policy: frame-ancestors ...` on the child website to permit only the intended editor origin(s). Check `X-Frame-Options` if embedding fails.
- For production, consider a per-session nonce or signed, short-lived preview token to bind a site/session to the editor. A `siteId` alone is not a secret.

## Limitations

- Requires integration in the target website; cannot edit arbitrary third-party sites from a URL alone.
- `UPDATE_PREVIEW` changes only the current DOM. It does not save data or guarantee that a framework-managed component will retain the update after re-render.
- Supported field types are `text`, `textarea`, `link`, `image`, and `data` (database-backed sections and items). Rich text block editors and complex nested state management must be handled in your visual editor application.
- For SPA sites, initialize after the page content is rendered and reinitialize or manage SDK lifecycle as routes change.
- This package does not bypass browser same-origin restrictions or a website's iframe embedding policy.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Publish to npm

1. Choose an available package name and update `package.json`.
2. Ensure README and license are correct.
3. Run `npm login`.
4. Run `npm pack --dry-run` and inspect included files.
5. Run `npm publish --access public` for a new public scoped package.
6. Tag the release in Git.

The `prepublishOnly` script runs typecheck, tests and build before publishing.
