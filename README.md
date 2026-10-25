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
    }
  ],
  onSelect(field, value) {
    console.log("Selected", field.id, value);
  },
  onError(error) {
    console.error("[visual-editor-sdk]", error);
  }
});

// If this SPA unmounts the page/integration, call:
 // sdk.destroy();
```

### DOM Auto-Discovery and Field Types

`fields` in `initVisualEditor` is optional. The SDK automatically discovers any DOM elements with `data-ve-id` and infers their field type from their HTML tag or `data-ve-type` attribute.

Supported field types and replacement behaviors:

| Field Type | Target / Replacement Behavior | HTML Tag Inference / Attributes |
|---|---|---|
| `text` | Sets `textContent` (or `.value` for `<input>`) | Default for most elements, or `<input type="text">` |
| `textarea` | Sets `textContent` (or `.value` for `<textarea>`) | `<textarea>` or `data-ve-type="textarea"` |
| `html` / `richtext` | Sets `innerHTML` | `data-ve-type="html"` or `data-ve-type="richtext"` |
| `image` | Sets `src` (or `srcset` on `<source>`, or `style.backgroundImage` on non-media elements) | `<img>`, `<source>`, `<video>`, `<audio>`, or `data-ve-type="image"` |
| `link` | Sets `href` attribute | `<a>` or `data-ve-type="link"` |
| `color` | Sets `style.color` or `style[styleProperty]` (or `.value` for `<input type="color">`) | `<input type="color">` or `data-ve-type="color"` |
| `style` | Sets CSS style property via `style.setProperty(prop, val)` | `data-ve-type="style" data-ve-style-prop="..."` |
| `boolean` / `toggle` | Toggles `.checked` on checkbox/radio, attribute presence, or `hidden` | `<input type="checkbox">` or `data-ve-type="boolean"` |
| `attribute` | Sets custom attribute via `element.setAttribute(...)` | `data-ve-type="attribute" data-ve-attribute="..."` |

Example markup with markers:

```html
<h1 data-ve-id="home.hero.title">Build Better Digital Experiences</h1>
<p data-ve-id="home.hero.description" data-ve-type="textarea">We help businesses grow.</p>
<div data-ve-id="home.rich" data-ve-type="html"><p>Rich <strong>formatted</strong> content.</p></div>
<a data-ve-id="home.hero.cta" href="/contact">Get started</a>
<img data-ve-id="home.hero.image" src="/images/hero.webp" alt="Team at work">
<div data-ve-id="home.banner-bg" data-ve-type="image" style="background-image: url('/images/hero.jpg');"></div>
<button data-ve-id="home.btn" data-ve-type="attribute" data-ve-attribute="aria-label" aria-label="Action">Click</button>
<div data-ve-id="home.accent" data-ve-type="color" data-ve-style-prop="background-color">Accent</div>
<div data-ve-id="home.banner" data-ve-type="boolean" data-ve-attribute="data-visible" data-visible>Active Banner</div>
```

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
    // Open your editor panel using message.field.id/type/label/value.
    console.log("Selected content", message.field);
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
- `CONTENT_SELECTED`: selected field metadata and current value.
- `PONG`: response to `PING`.
- `SDK_ERROR`: an error message.

Parent → child:
- `PING`
- `SET_EDIT_MODE`
- `UPDATE_PREVIEW`
- `RESTORE_PREVIEW`
- `RESTORE_ALL_PREVIEWS`

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
- This initial version supports text, textarea, link and image attribute previews. Rich text, lists, components, authentication, persistence, publishing, undo/redo and responsive viewport controls are not included.
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
