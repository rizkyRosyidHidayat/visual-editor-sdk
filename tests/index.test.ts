import { beforeEach, describe, expect, it, vi } from "vitest";
import { initVisualEditor } from "../src/index.js";
import type { EditableField } from "../src/types.js";

describe("initVisualEditor with nested elements", () => {
  const origin = "https://editor.example.com";
  let mockParent: { postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    document.body.innerHTML = `
      <main>
        <a data-ve-id="home.hero.cta" href="/contact">
          <span data-ve-id="home.hero.cta.text">Contact Us</span>
        </a>
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

  const fields: EditableField[] = [
    {
      id: "home.hero.cta",
      type: "link",
      label: "CTA link",
      attribute: "href"
    },
    {
      id: "home.hero.cta.text",
      type: "text",
      label: "CTA text"
    }
  ];

  it("selects the child component on first click and cycles to the parent on repeat click", () => {
    const onSelect = vi.fn();
    const sdk = initVisualEditor({
      siteId: "test-site",
      editorOrigin: origin,
      fields,
      onSelect
    });

    sdk.setEditMode(true);

    const anchor = document.querySelector<HTMLAnchorElement>('[data-ve-id="home.hero.cta"]')!;
    const span = document.querySelector<HTMLSpanElement>('[data-ve-id="home.hero.cta.text"]')!;

    // 1st click directly on the child span element
    span.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(span.getAttribute("data-ve-selected")).toBe("true");
    expect(anchor.getAttribute("data-ve-selected")).toBeNull();
    expect(onSelect).toHaveBeenLastCalledWith(fields[1], "Contact Us");

    const selectMessage1 = mockParent.postMessage.mock.calls.find(
      ([msg]) => msg.type === "CONTENT_SELECTED" && msg.field.id === "home.hero.cta.text"
    );
    expect(selectMessage1).toBeDefined();
    expect(selectMessage1![0].field.value).toBe("Contact Us");

    // 2nd click on the span when it is already selected cycles to the parent anchor
    span.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(anchor.getAttribute("data-ve-selected")).toBe("true");
    expect(span.getAttribute("data-ve-selected")).toBeNull();
    expect(onSelect).toHaveBeenLastCalledWith(fields[0], "/contact");

    const selectMessage2 = mockParent.postMessage.mock.calls.find(
      ([msg]) => msg.type === "CONTENT_SELECTED" && msg.field.id === "home.hero.cta"
    );
    expect(selectMessage2).toBeDefined();
    expect(selectMessage2![0].field.value).toBe("/contact");

    // 3rd click cycles back to the child span
    span.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(span.getAttribute("data-ve-selected")).toBe("true");
    expect(anchor.getAttribute("data-ve-selected")).toBeNull();
    expect(onSelect).toHaveBeenLastCalledWith(fields[1], "Contact Us");

    sdk.destroy();
  });

  it("selects the parent anchor when clicking directly on the anchor", () => {
    const onSelect = vi.fn();
    const sdk = initVisualEditor({
      siteId: "test-site",
      editorOrigin: origin,
      fields,
      onSelect
    });

    sdk.setEditMode(true);

    const anchor = document.querySelector<HTMLAnchorElement>('[data-ve-id="home.hero.cta"]')!;
    const span = document.querySelector<HTMLSpanElement>('[data-ve-id="home.hero.cta.text"]')!;

    // Click on anchor directly
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(anchor.getAttribute("data-ve-selected")).toBe("true");
    expect(span.getAttribute("data-ve-selected")).toBeNull();
    expect(onSelect).toHaveBeenLastCalledWith(fields[0], "/contact");

    sdk.destroy();
  });

  it("updates and restores preview for nested fields without interfering with each other", () => {
    const sdk = initVisualEditor({
      siteId: "test-site",
      editorOrigin: origin,
      fields
    });

    const anchor = document.querySelector<HTMLAnchorElement>('[data-ve-id="home.hero.cta"]')!;
    const span = document.querySelector<HTMLSpanElement>('[data-ve-id="home.hero.cta.text"]')!;

    // Update child text preview via message
    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_PREVIEW",
          id: "home.hero.cta.text",
          value: "Get in Touch"
        }
      })
    );

    expect(span.textContent).toBe("Get in Touch");
    expect(anchor.getAttribute("href")).toBe("/contact");

    // Update parent link preview via message
    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_PREVIEW",
          id: "home.hero.cta",
          value: "/get-in-touch"
        }
      })
    );

    expect(anchor.getAttribute("href")).toBe("/get-in-touch");
    expect(span.textContent).toBe("Get in Touch");

    // Restore all previews
    sdk.restoreAllPreviews();

    expect(span.textContent).toBe("Contact Us");
    expect(anchor.getAttribute("href")).toBe("/contact");

    sdk.destroy();
  });
});

describe("initVisualEditor with type: 'data' (database sections and items)", () => {
  const origin = "https://editor.example.com";
  let mockParent: { postMessage: ReturnType<typeof vi.fn> };

  const dataFields: EditableField[] = [
    {
      id: "home.articles",
      type: "data",
      label: "Articles Section",
      collection: "articles",
      selector: '[data-ve-id="home.articles"]'
    }
  ];

  beforeEach(() => {
    document.body.innerHTML = `
      <section data-ve-id="home.articles" class="articles-section">
        <h2 class="section-title">Latest Articles</h2>
        <div class="articles-grid">
          <article data-ve-item-id="art-1" class="card">
            <h3 data-ve-field="title">First Article</h3>
            <p data-ve-field="summary">Summary of article one.</p>
            <a data-ve-field="link" href="/blog/art-1">Read more</a>
          </article>
          <article data-ve-item-id="art-2" class="card">
            <h3 data-ve-field="title">Second Article</h3>
            <p data-ve-field="summary">Summary of article two.</p>
            <a data-ve-field="link" href="/blog/art-2">Read more</a>
          </article>
        </div>
      </section>
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

  it("discovers items and emits CONTENT_SELECTED when the section container is selected directly", () => {
    const onSelect = vi.fn();
    const sdk = initVisualEditor({
      siteId: "test-site",
      editorOrigin: origin,
      fields: dataFields,
      onSelect
    });

    sdk.setEditMode(true);

    const sectionTitle = document.querySelector<HTMLHeadingElement>(".section-title")!;
    const section = document.querySelector<HTMLElement>('[data-ve-id="home.articles"]')!;

    // Click on section title outside cards
    sectionTitle.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(section.getAttribute("data-ve-selected")).toBe("true");

    const contentSelectedCall = mockParent.postMessage.mock.calls.find(
      ([msg]) => msg.type === "CONTENT_SELECTED" && msg.field.id === "home.articles"
    );
    expect(contentSelectedCall).toBeDefined();
    const payload = contentSelectedCall![0].field;
    expect(payload.type).toBe("data");
    expect(payload.collection).toBe("articles");
    expect(payload.selectedItemId).toBeUndefined();
    expect(payload.items).toEqual([
      { id: "art-1", label: "First Article" },
      { id: "art-2", label: "Second Article" }
    ]);

    sdk.destroy();
  });

  it("selects individual card on 1st click and cycles to section container on 2nd click", () => {
    const onSelect = vi.fn();
    const onSelectItem = vi.fn();
    const sdk = initVisualEditor({
      siteId: "test-site",
      editorOrigin: origin,
      fields: dataFields,
      onSelect,
      onSelectItem
    });

    sdk.setEditMode(true);

    const section = document.querySelector<HTMLElement>('[data-ve-id="home.articles"]')!;
    const card1 = document.querySelector<HTMLElement>('[data-ve-item-id="art-1"]')!;
    const cardTitle = card1.querySelector("h3")!;

    // 1st click inside card1
    cardTitle.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(card1.getAttribute("data-ve-selected")).toBe("true");
    expect(section.getAttribute("data-ve-selected")).toBeNull();
    expect(onSelectItem).toHaveBeenCalledWith(dataFields[0], "art-1", card1);

    const dataItemMsg = mockParent.postMessage.mock.calls.find(
      ([msg]) => msg.type === "DATA_ITEM_SELECTED" && msg.itemId === "art-1"
    );
    expect(dataItemMsg).toBeDefined();
    expect(dataItemMsg![0].field.collection).toBe("articles");
    expect(dataItemMsg![0].field.selectedItemId).toBe("art-1");

    // 2nd click on the same card cycles to the parent data section (table view)
    cardTitle.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(section.getAttribute("data-ve-selected")).toBe("true");
    expect(card1.getAttribute("data-ve-selected")).toBeNull();

    const lastCall = mockParent.postMessage.mock.calls[mockParent.postMessage.mock.calls.length - 1]![0];
    expect(lastCall.type).toBe("CONTENT_SELECTED");
    expect(lastCall.field.id).toBe("home.articles");
    expect(lastCall.field.selectedItemId).toBeUndefined();

    // 3rd click cycles back to the card (detail view)
    cardTitle.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(card1.getAttribute("data-ve-selected")).toBe("true");
    expect(section.getAttribute("data-ve-selected")).toBeNull();

    sdk.destroy();
  });

  it("selects item from parent message SELECT_DATA_ITEM and sdk.selectDataItem", () => {
    const onSelectItem = vi.fn();
    const sdk = initVisualEditor({
      siteId: "test-site",
      editorOrigin: origin,
      fields: dataFields,
      onSelectItem
    });

    sdk.setEditMode(true);

    const card2 = document.querySelector<HTMLElement>('[data-ve-item-id="art-2"]')!;

    // Message from parent to select card 2
    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "SELECT_DATA_ITEM",
          id: "home.articles",
          itemId: "art-2"
        }
      })
    );

    expect(card2.getAttribute("data-ve-selected")).toBe("true");
    expect(onSelectItem).toHaveBeenCalledWith(dataFields[0], "art-2", card2);

    // Programmatic method on sdk
    const card1 = document.querySelector<HTMLElement>('[data-ve-item-id="art-1"]')!;
    sdk.selectDataItem("home.articles", "art-1");

    expect(card1.getAttribute("data-ve-selected")).toBe("true");
    expect(card2.getAttribute("data-ve-selected")).toBeNull();
    expect(onSelectItem).toHaveBeenCalledWith(dataFields[0], "art-1", card1);

    sdk.destroy();
  });

  it("updates and restores preview for data items via UPDATE_DATA_ITEM_PREVIEW and RESTORE_DATA_ITEM_PREVIEW", () => {
    const onPreviewUpdate = vi.fn();
    const sdk = initVisualEditor({
      siteId: "test-site",
      editorOrigin: origin,
      fields: dataFields,
      onPreviewUpdate
    });

    const card1 = document.querySelector<HTMLElement>('[data-ve-item-id="art-1"]')!;
    const title1 = card1.querySelector("h3")!;
    const link1 = card1.querySelector("a")!;

    // Update text in card 1
    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_DATA_ITEM_PREVIEW",
          id: "home.articles",
          itemId: "art-1",
          fieldSelector: '[data-ve-field="title"]',
          value: "Updated Article 1"
        }
      })
    );

    expect(title1.textContent).toBe("Updated Article 1");
    expect(onPreviewUpdate).toHaveBeenCalledWith(dataFields[0], "Updated Article 1");

    // Update attribute in card 1
    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "UPDATE_DATA_ITEM_PREVIEW",
          id: "home.articles",
          itemId: "art-1",
          fieldSelector: '[data-ve-field="link"]',
          attribute: "href",
          value: "/updated-link"
        }
      })
    );

    expect(link1.getAttribute("href")).toBe("/updated-link");

    // Restore preview for art-1
    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: window.parent,
        data: {
          channel: "visual-editor-sdk",
          version: 1,
          type: "RESTORE_DATA_ITEM_PREVIEW",
          id: "home.articles",
          itemId: "art-1"
        }
      })
    );

    expect(title1.textContent).toBe("First Article");
    expect(link1.getAttribute("href")).toBe("/blog/art-1");

    sdk.destroy();
  });
});
