/*
 * Shared README renderer for Frontier source dossiers.
 * Markdown is parsed with marked (MIT, https://github.com/markedjs/marked),
 * then trimmed of badges, sanitized, and pointed at the vendored source copy.
 */
(function (global) {
  "use strict";

  const BADGE_URL = /(?:badge\.fury\.io|img\.shields\.io|shields\.io|isitmaintained\.com|travis-ci|codecov|bundlephobia|discourse|dev\.azure\.com|npmjs\.com\/package|badgen\.net|api\.star-history\.com\/badge|trendshift\.io\/api\/badge|rawgit\.com\/.+\/badge|\/badge\.(?:svg|png|gif)|visitor-badge\.|\/badge\?|github\.com\/.+\/badge)/i;

  const DROP_TAGS = new Set([
    "script", "style", "iframe", "object", "embed", "form", "textarea", "select",
    "option", "button", "link", "meta", "base", "svg", "canvas", "video", "audio",
    "track", "map", "area", "frame", "frameset", "applet"
  ]);

  const ALLOWED_TAGS = new Set([
    "a", "abbr", "b", "blockquote", "br", "caption", "center", "cite", "code",
    "col", "colgroup", "dd", "del", "details", "dfn", "div", "dl", "dt", "em",
    "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i",
    "img", "ins", "kbd", "li", "mark", "ol", "p", "picture", "pre", "q", "s",
    "samp", "small", "span", "strike", "strong", "sub", "summary", "sup",
    "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "tt", "u",
    "ul", "var", "wbr", "input"
  ]);

  const ALLOWED_ATTRS = new Set([
    "align", "alt", "checked", "class", "colspan", "disabled", "height", "href",
    "id", "loading", "media", "open", "rel", "rowspan", "sizes", "src", "srcset",
    "start", "target", "title", "type", "width"
  ]);

  function isBadgeUrl(url) {
    return BADGE_URL.test(String(url || ""));
  }

  // Remove complete badge syntax before marked sees it. The DOM pass below
  // catches HTML badges and any wrappers left behind.
  function stripBadgeSyntax(line) {
    let output = line;
    output = output.replace(/\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/g, (match, alt, imageUrl, href) => {
      return isBadgeUrl(imageUrl) || isBadgeUrl(href) ? "" : match;
    });
    output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, imageUrl) => {
      return isBadgeUrl(imageUrl) ? "" : match;
    });
    output = output.replace(/<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi, (match, a, b, c) => {
      return isBadgeUrl(a || b || c) ? "" : match;
    });
    output = output.replace(/\[\]\s*\(\s*([^)]+?)\s*\)/g, (match, href) => {
      return isBadgeUrl(href) ? "" : match;
    });
    return output;
  }

  function stripInlineCode(line) {
    const slots = [];
    const held = line.replace(/`+[^`\n]*`+/g, (match) => {
      const token = `\u0000${slots.length}\u0000`;
      slots.push(match);
      return token;
    });
    const cleaned = stripBadgeSyntax(held);
    return cleaned.replace(/\u0000(\d+)\u0000/g, (match, index) => slots[Number(index)] || "");
  }

  function stripBadgeLines(markdown) {
    const lines = String(markdown || "").replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "").split("\n");
    let fenced = false;
    let fenceMarker = "";
    return lines.map((line) => {
      const fence = line.match(/^\s*(```+|~~~+)/);
      if (fence) {
        if (!fenced) {
          fenced = true;
          fenceMarker = fence[1][0];
        } else if (fence[1][0] === fenceMarker) {
          fenced = false;
          fenceMarker = "";
        }
        return line;
      }
      if (fenced || !line.trim()) return line;
      const cleaned = stripInlineCode(line).replace(/\s+$/, "");
      return cleaned.trim() ? cleaned : "";
    }).join("\n");
  }

  function resolveUrl(raw, baseUrl, kind) {
    let value = String(raw || "").trim();
    if (!value) return null;
    value = value.replace(/^<|>$/g, "");
    if (/^(?:javascript|vbscript):/i.test(value)) return null;
    if (/^data:/i.test(value)) {
      return kind === "image" && /^data:image\//i.test(value) ? value : null;
    }
    if (value.startsWith("#")) return value;
    if (value.startsWith("//")) value = "https:" + value;
    try {
      return new URL(value, baseUrl).href;
    } catch (error) {
      return null;
    }
  }

  function resolveSrcset(value, baseUrl) {
    const parts = String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
    const resolved = [];
    for (const part of parts) {
      const fields = part.split(/\s+/);
      const url = fields.shift();
      const href = resolveUrl(url, baseUrl, "image");
      if (href && !isBadgeUrl(url)) resolved.push([href].concat(fields).join(" "));
    }
    return resolved.join(", ");
  }

  function removeEmptyWrappers(root) {
    const cleanWrappers = () => {
      root.querySelectorAll("p,div,center,span,section,picture,li,blockquote").forEach((element) => {
        const tag = element.tagName.toLowerCase();
        if (tag === "blockquote" && element.querySelector("p,ul,ol,pre,table")) return;
        const hasText = Boolean(element.textContent.trim());
        const hasMedia = Boolean(element.querySelector("img,table,pre,code,figure,details,ul,ol,hr,blockquote"));
        if (!hasText && !hasMedia) element.remove();
      });
    };

    const cleanAnchors = () => {
      root.querySelectorAll("a").forEach((anchor) => {
        if (!anchor.textContent.trim() && !anchor.querySelector("img")) anchor.remove();
      });
    };

    cleanWrappers();
    cleanAnchors();
    cleanWrappers();
  }

  function removeBadges(root) {
    root.querySelectorAll("img").forEach((image) => {
      const src = image.getAttribute("src") || "";
      const srcset = image.getAttribute("srcset") || "";
      if (!isBadgeUrl(src) && !isBadgeUrl(srcset)) return;
      const anchor = image.closest("a");
      if (anchor) anchor.remove();
      else image.remove();
    });

    root.querySelectorAll("a").forEach((anchor) => {
      const href = anchor.getAttribute("href") || "";
      if (isBadgeUrl(href)) anchor.remove();
    });
  }

  function unwrap(element) {
    const parent = element.parentNode;
    if (!parent) return;
    while (element.firstChild) parent.insertBefore(element.firstChild, element);
    element.remove();
  }

  function cleanAttributes(element, tag, baseUrl) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      if (name.startsWith("on") || !ALLOWED_ATTRS.has(name)) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (name === "class" || name === "id") {
        if (!/^[A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+)*$/.test(value.trim())) element.removeAttribute(attribute.name);
        continue;
      }

      if (name === "align") {
        if (!/^(?:left|center|right|justify)$/i.test(value.trim())) element.removeAttribute(attribute.name);
        continue;
      }

      if (name === "width" || name === "height") {
        if (!/^\d{1,4}(?:px|%)?$/.test(value.trim())) element.removeAttribute(attribute.name);
        continue;
      }

      if (name === "colspan" || name === "rowspan" || name === "start") {
        if (!/^\d{1,4}$/.test(value.trim())) element.removeAttribute(attribute.name);
        continue;
      }

      if (name === "href") {
        const href = resolveUrl(value, baseUrl, "link");
        if (!href || isBadgeUrl(value)) {
          element.removeAttribute("href");
        } else {
          element.setAttribute("href", href);
        }
        continue;
      }

      if (name === "src") {
        const src = resolveUrl(value, baseUrl, "image");
        if (!src || isBadgeUrl(value)) element.removeAttribute("src");
        else element.setAttribute("src", src);
        continue;
      }

      if (name === "srcset") {
        const srcset = resolveSrcset(value, baseUrl);
        if (srcset) element.setAttribute("srcset", srcset);
        else element.removeAttribute("srcset");
        continue;
      }

      if (name === "type") {
        if (tag === "source") {
          if (!/^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/.test(value.trim())) element.removeAttribute(attribute.name);
        } else if (tag === "ol") {
          if (!/^(?:1|a|A|i|I)$/.test(value.trim())) element.removeAttribute(attribute.name);
        } else if (tag === "input") {
          if (value.toLowerCase() !== "checkbox") element.removeAttribute(attribute.name);
        } else {
          element.removeAttribute(attribute.name);
        }
        continue;
      }

      if (name === "target" && tag !== "a") element.removeAttribute(attribute.name);
      if (name === "rel" && tag !== "a") element.removeAttribute(attribute.name);
      if (name === "alt" && tag !== "img") element.removeAttribute(attribute.name);
      if (name === "loading" && tag !== "img") element.removeAttribute(attribute.name);
      if ((name === "media" || name === "sizes") && tag !== "source" && tag !== "img") element.removeAttribute(attribute.name);
      if ((name === "checked" || name === "disabled") && tag !== "input") element.removeAttribute(attribute.name);
      if (name === "open" && tag !== "details") element.removeAttribute(attribute.name);
    }
  }

  function sanitizeChildren(parent, baseUrl) {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === 3) continue;
      if (node.nodeType !== 1) {
        node.remove();
        continue;
      }

      const tag = node.tagName.toLowerCase();
      if (DROP_TAGS.has(tag)) {
        node.remove();
        continue;
      }

      if (!ALLOWED_TAGS.has(tag)) {
        sanitizeChildren(node, baseUrl);
        unwrap(node);
        continue;
      }

      cleanAttributes(node, tag, baseUrl);

      if (tag === "img" && !node.getAttribute("src")) {
        node.remove();
        continue;
      }
      if (tag === "source" && !node.getAttribute("srcset")) {
        node.remove();
        continue;
      }
      if (tag === "a" && !node.getAttribute("href")) {
        sanitizeChildren(node, baseUrl);
        unwrap(node);
        continue;
      }
      if (tag === "input" && (node.getAttribute("type") || "").toLowerCase() !== "checkbox") {
        node.remove();
        continue;
      }

      sanitizeChildren(node, baseUrl);

      if (tag === "a") {
        if ((node.getAttribute("href") || "").startsWith("#")) {
          node.removeAttribute("target");
          node.removeAttribute("rel");
        } else {
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer");
        }
      } else if (tag === "img") {
        node.setAttribute("loading", "lazy");
        if (!node.hasAttribute("alt")) node.setAttribute("alt", "");
      } else if (tag === "input") {
        node.setAttribute("disabled", "");
      }
    }
  }

  function demoteHeadings(root) {
    root.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((heading) => {
      const level = Number(heading.tagName.charAt(1));
      const next = heading.ownerDocument.createElement("h" + Math.min(level + 1, 5));
      for (const attribute of Array.from(heading.attributes)) next.setAttribute(attribute.name, attribute.value);
      while (heading.firstChild) next.appendChild(heading.firstChild);
      heading.replaceWith(next);
    });
  }

  function renderMarkdown(markdown, baseUrl, doc) {
    const documentObject = doc || global.document;
    if (!documentObject) throw new Error("A document is required to render a dossier README.");
    const parser = global.marked;
    if (!parser || typeof parser.parse !== "function") throw new Error("marked is not loaded.");

    const clean = stripBadgeLines(
      String(markdown).replace(/\*\*([^*\n]*?)\[([^\]]+)\](\*\*:)/g, "**$1$2$3")
    );
    const template = documentObject.createElement("template");
    template.innerHTML = parser.parse(clean, { gfm: true, breaks: false });

    removeBadges(template.content);
    sanitizeChildren(template.content, baseUrl);
    removeEmptyWrappers(template.content);
    demoteHeadings(template.content);
    template.content.querySelectorAll("table").forEach((table) => {
      const wrapper = documentObject.createElement("div");
      wrapper.className = "table-scroll";
      table.replaceWith(wrapper);
      wrapper.appendChild(table);
    });

    return template.innerHTML;
  }

  async function loadDossier() {
    const box = document.getElementById("readme");
    if (!box) return;
    const base = box.dataset.base || "../source/vendor/";
    const baseUrl = new URL(base, global.location.href);
    if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";
    const names = ["README.md", "readme.md", "Readme.md", "README.MD", "README.adoc", "readme.adoc"];
    let markdown = "";
    for (const name of names) {
      try {
        const response = await fetch(new URL(name, baseUrl).href, { cache: "no-store" });
        if (response.ok) {
          markdown = await response.text();
          break;
        }
      } catch (error) {
        // Try the next case variant.
      }
    }
    if (!markdown.trim()) {
      box.innerHTML = "<p>The vendored copy has no README in the usual names.</p>";
      return;
    }
    box.innerHTML = renderMarkdown(markdown, baseUrl, document);
  }

  global.renderDossierMarkdown = renderMarkdown;
  global.stripDossierBadges = stripBadgeLines;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { renderMarkdown, stripBadgeLines };
  }

  if (typeof document !== "undefined") loadDossier();
})(typeof window !== "undefined" ? window : globalThis);
