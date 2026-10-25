import { beforeEach, describe, expect, it, vi } from "vitest";
import { initVisualEditor } from "../src/index.js";
import type { EditableField } from "../src/types.js";

describe("Field types content replacement and auto-discovery", () => {
  const origin = "https://editor.example.com";
  let mockParent: { postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    document.body.innerHTML = `
      <main>
        <h1 data-ve-id="home.title">Original Title</h1>
        <p data-ve-id="home.desc" data-ve-type="textarea">Line 1\nLine 2</p>
        <div data-ve-id="home.rich" data-ve-type="html"><span>Original</span> HTML</div>
        <img data-ve-id="home.avatar" src="/images/avatar.jpg" alt="User avatar" />
        <div data-ve-id="home.hero-bg" data-ve-type="image" style="background-image: url('/images/hero.jpg');"></div>
        <a data-ve-id="home.cta" href="/about">About Us</a>
        <input data-ve-id="home.input" type="text" value="initial text" />
        <textarea data-ve-id="home.input-area">initial textarea</textarea>
        <input data-ve-id="home.active" type="checkbox" checked />
        <div data-ve-id="home.badge" data-ve-type="color" data-ve-style-prop="color" style="color: rgb(255, 0, 0);">Red text</div>
        <div data-ve-id="home.card" data-ve-type="style" data-ve-style-prop="display" style="display: block;">Card</div>
        <button data-ve-id="home.btn" data-ve-type="attribute" data-ve-attribute="aria-label" aria-label="Submit button">Click</button>
        <div data-ve-id="home.banner" data-ve-type="boolean" data-ve-attribute="data-active" data-active="true">Banner</div>
        <div data-ve-id="home.hidden-box" data-ve-type="boolean">Visible Box</div>
      </main>
    `;

    mockParent = {
      postMessage: vi.fn()
    };
    Object.defineProperty(window, "parent", {
      value: mockParent,
      configurable: true,
      writable: true
    });
  });

  it("auto-discovers fields from elements with data-ve-id when fields option is omitted", () => {
    const sdk = initVisualEditor({
      siteId: "auto-site",
      editorOrigin: origin
    });

    const fields = sdk.getFields();
    expect(fields.length).toBe(14);

    const titleField = fields.find((f) => f.id === "home.title");
    expect(titleField).toBeDefined();
    expect(titleField?.type).toBe("text");
    expect(titleField?.value).toBe("Original Title");

    const imgField = fields.find((f) => f.id === "home.avatar");
    expect(imgField).toBeDefined();
    expect(imgField?.type).toBe("image");
    expect(imgField?.value).toBe("/images/avatar.jpg");

    const linkField = fields.find((f) => f.id === "home.cta");
    expect(linkField).toBeDefined();
    expect(linkField?.type).toBe("link");
    expect(linkField?.value).toBe("/about");

    const htmlField = fields.find((f) => f.id === "home.rich");
    expect(htmlField).toBeDefined();
    expect(htmlField?.type).toBe("html");
    expect(htmlField?.value).toBe("<span>Original</span> HTML");

    const checkboxField = fields.find((f) => f.id === "home.active");
    expect(checkboxField).toBeDefined();
    expect(checkboxField?.type).toBe("boolean");
    expect(checkboxField?.value).toBe("true");

    const bgField = fields.find((f) => f.id === "home.hero-bg");
    expect(bgField).toBeDefined();
    expect(bgField?.type).toBe("image");
    expect(bgField?.value).toBe("/images/hero.jpg");

    sdk.destroy();
  });

  it("replaces content for html / richtext field and restores properly", () => {
    const sdk = initVisualEditor({
      siteId: "auto-site",
      editorOrigin: origin
    });

    const el = document.querySelector('[data-ve-id="home.rich"]')!;

    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_PREVIEW",
          id: "home.rich",
          value: "<strong>Updated</strong> <em>Rich Content</em>"
        }
      })
    );

    expect(el.innerHTML).toBe("<strong>Updated</strong> <em>Rich Content</em>");

    sdk.restorePreview("home.rich");
    expect(el.innerHTML).toBe("<span>Original</span> HTML");

    sdk.destroy();
  });

  it("replaces content for input and textarea elements via value and restores properly", () => {
    const sdk = initVisualEditor({
      siteId: "auto-site",
      editorOrigin: origin
    });

    const input = document.querySelector<HTMLInputElement>('[data-ve-id="home.input"]')!;
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-ve-id="home.input-area"]')!;

    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_PREVIEW",
          id: "home.input",
          value: "new input value"
        }
      })
    );

    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_PREVIEW",
          id: "home.input-area",
          value: "new textarea value"
        }
      })
    );

    expect(input.value).toBe("new input value");
    expect(textarea.value).toBe("new textarea value");

    sdk.restoreAllPreviews();
    expect(input.value).toBe("initial text");
    expect(textarea.value).toBe("initial textarea");

    sdk.destroy();
  });

  it("replaces image background url and restores properly", () => {
    const sdk = initVisualEditor({
      siteId: "auto-site",
      editorOrigin: origin
    });

    const el = document.querySelector<HTMLElement>('[data-ve-id="home.hero-bg"]')!;

    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_PREVIEW",
          id: "home.hero-bg",
          value: "/images/new-hero.png"
        }
      })
    );

    expect(el.style.backgroundImage).toContain("/images/new-hero.png");

    sdk.restorePreview("home.hero-bg");
    expect(el.style.backgroundImage).toContain("/images/hero.jpg");

    sdk.destroy();
  });

  it("replaces color and style properties and restores properly", () => {
    const sdk = initVisualEditor({
      siteId: "auto-site",
      editorOrigin: origin
    });

    const badge = document.querySelector<HTMLElement>('[data-ve-id="home.badge"]')!;
    const card = document.querySelector<HTMLElement>('[data-ve-id="home.card"]')!;

    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_PREVIEW",
          id: "home.badge",
          value: "blue"
        }
      })
    );

    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_PREVIEW",
          id: "home.card",
          value: "none"
        }
      })
    );

    expect(badge.style.color).toBe("blue");
    expect(card.style.display).toBe("none");

    sdk.restoreAllPreviews();
    expect(badge.style.color).toBe("rgb(255, 0, 0)");
    expect(card.style.display).toBe("block");

    sdk.destroy();
  });

  it("replaces custom attribute and restores properly", () => {
    const sdk = initVisualEditor({
      siteId: "auto-site",
      editorOrigin: origin
    });

    const btn = document.querySelector<HTMLButtonElement>('[data-ve-id="home.btn"]')!;

    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_PREVIEW",
          id: "home.btn",
          value: "Updated button label"
        }
      })
    );

    expect(btn.getAttribute("aria-label")).toBe("Updated button label");

    sdk.restorePreview("home.btn");
    expect(btn.getAttribute("aria-label")).toBe("Submit button");

    sdk.destroy();
  });

  it("replaces boolean attribute, checkbox state, and hidden attribute", () => {
    const sdk = initVisualEditor({
      siteId: "auto-site",
      editorOrigin: origin
    });

    const checkbox = document.querySelector<HTMLInputElement>('[data-ve-id="home.active"]')!;
    const banner = document.querySelector<HTMLElement>('[data-ve-id="home.banner"]')!;
    const hiddenBox = document.querySelector<HTMLElement>('[data-ve-id="home.hidden-box"]')!;

    // 1. Checkbox toggle
    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_PREVIEW",
          id: "home.active",
          value: "false"
        }
      })
    );
    expect(checkbox.checked).toBe(false);

    // 2. Boolean with data-active attribute
    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_PREVIEW",
          id: "home.banner",
          value: "false"
        }
      })
    );
    expect(banner.hasAttribute("data-active")).toBe(false);

    // 3. Boolean toggling hidden
    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_PREVIEW",
          id: "home.hidden-box",
          value: "false"
        }
      })
    );
    expect(hiddenBox.hasAttribute("hidden")).toBe(true);

    // Restore all
    sdk.restoreAllPreviews();
    expect(checkbox.checked).toBe(true);
    expect(banner.hasAttribute("data-active")).toBe(true);
    expect(hiddenBox.hasAttribute("hidden")).toBe(false);

    sdk.destroy();
  });

  it("selects an auto-discovered element on click when edit mode is active", () => {
    const onSelect = vi.fn();
    const sdk = initVisualEditor({
      siteId: "auto-site",
      editorOrigin: origin,
      onSelect
    });

    sdk.setEditMode(true);

    const btn = document.querySelector<HTMLButtonElement>('[data-ve-id="home.btn"]')!;
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(btn.getAttribute("data-ve-selected")).toBe("true");
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "home.btn",
        type: "attribute",
        attribute: "aria-label"
      }),
      "Submit button"
    );

    sdk.destroy();
  });

  it("merges configured fields with auto-discovered fields", () => {
    const customFields: EditableField[] = [
      {
        id: "custom.manual",
        type: "text",
        selector: "#custom-selector",
        label: "Manual Field"
      }
    ];

    const manualEl = document.createElement("div");
    manualEl.id = "custom-selector";
    manualEl.textContent = "Manual Content";
    document.body.appendChild(manualEl);

    const sdk = initVisualEditor({
      siteId: "auto-site",
      editorOrigin: origin,
      fields: customFields
    });

    const fields = sdk.getFields();
    // 14 auto-discovered + 1 custom
    expect(fields.length).toBe(15);
    expect(fields.some((f) => f.id === "custom.manual")).toBe(true);
    expect(fields.some((f) => f.id === "home.title")).toBe(true);

    sdk.destroy();
    manualEl.remove();
  });

  it("executes applyValue on init when field.value is provided in fields", () => {
    const titleEl = document.querySelector<HTMLHeadingElement>('[data-ve-id="home.title"]')!;
    expect(titleEl.textContent).toBe("Original Title");

    const sdk = initVisualEditor({
      siteId: "auto-site",
      editorOrigin: origin,
      fields: [
        {
          id: "home.title",
          type: "text",
          value: "Updated Title From Config"
        }
      ]
    });

    // Immediately applied to the DOM on initialization
    expect(titleEl.textContent).toBe("Updated Title From Config");
    expect(sdk.getCurrentData()["home.title"]).toBe("Updated Title From Config");

    sdk.destroy();
  });

  it("executes applyValue on init when initialData / data is provided in options", () => {
    const cta = document.querySelector<HTMLAnchorElement>('[data-ve-id="home.cta"]')!;
    expect(cta.getAttribute("href")).toBe("/about");

    const sdk = initVisualEditor({
      siteId: "auto-site",
      editorOrigin: origin,
      initialData: {
        "home.cta": "/contact-us",
        "home.title": "Title From initialData"
      }
    });

    expect(cta.getAttribute("href")).toBe("/contact-us");
    expect(document.querySelector('[data-ve-id="home.title"]')!.textContent).toBe("Title From initialData");

    sdk.destroy();
  });

  it("executes applyValue on init when data-ve-value attribute is on the DOM element", () => {
    const el = document.createElement("div");
    el.setAttribute("data-ve-id", "home.autoval");
    el.setAttribute("data-ve-type", "text");
    el.setAttribute("data-ve-value", "Value from DOM attribute");
    el.textContent = "Uninitialized text";
    document.body.appendChild(el);

    const sdk = initVisualEditor({
      siteId: "auto-site",
      editorOrigin: origin
    });

    expect(el.textContent).toBe("Value from DOM attribute");

    sdk.destroy();
    el.remove();
  });
});
