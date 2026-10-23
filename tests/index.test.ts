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
