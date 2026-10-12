// Shared namespace + DOM sanitizer used by every site parser and the renderer.
// Classic (non-module) script: everything hangs off window.CSR so later-loaded
// content script files in the manifest's content_scripts list can see it.
(function () {
  "use strict";

  const CSR = (window.CSR = window.CSR || {});
  CSR.parsers = CSR.parsers || [];
  CSR.util = CSR.util || {};

  // Tags kept as-is (attributes still filtered per ALLOWED_ATTRS).
  const ALLOWED_TAGS = new Set([
    "p", "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "figure", "figcaption", "img",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
    "blockquote", "a", "span", "strong", "b", "em", "i", "sup", "sub",
    "code", "pre", "br", "hr",
  ]);

  // Tags whose entire subtree is copied verbatim (math typesetting output is
  // too structurally specific to sanitize node-by-node).
  const VERBATIM_TAGS = new Set(["math", "mjx-container", "svg"]);

  // Tags dropped entirely, including their text/children (chrome, scripts,
  // interactive widgets, publisher nav/ads that may be nested in content).
  const DROP_TAGS = new Set([
    "script", "style", "noscript", "button", "nav", "form", "iframe",
    "svg", // only kept verbatim when inside VERBATIM_TAGS check above
    "input", "select", "textarea", "dialog", "template",
  ]);

  const ALLOWED_ATTRS = {
    a: ["href", "data-csr-cite-ref", "data-csr-cite-text"],
    img: ["src", "alt", "width", "height"],
    object: ["data", "type", "width", "height"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
    "*": ["id"],
  };

  // Schemes allowed on an <a href>; anything else (javascript:, vbscript:,
  // etc. -- seen verbatim in some publishers' own markup, e.g. IEEE's
  // `href="javascript:void()"` citation placeholders) is dropped rather than
  // preserved, since a clicked link executing script would be a real risk.
  const SAFE_HREF_SCHEMES = new Set(["http:", "https:", "mailto:", "data:"]);

  function absUrl(url, base) {
    if (!url) return url;
    try {
      const resolved = new URL(url, base || document.baseURI);
      if (!SAFE_HREF_SCHEMES.has(resolved.protocol)) return null;
      return resolved.href;
    } catch (e) {
      return null;
    }
  }
  CSR.util.absUrl = absUrl;

  function slugify(text, fallback) {
    const base = (text || "").toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return base || fallback || ("s" + Math.random().toString(36).slice(2, 8));
  }
  CSR.util.slugify = slugify;

  function copyAllowedAttrs(src, dest, baseURI) {
    const tag = dest.tagName.toLowerCase();
    const allowed = (ALLOWED_ATTRS[tag] || []).concat(ALLOWED_ATTRS["*"]);
    for (const name of allowed) {
      if (!src.hasAttribute(name)) continue;
      let val = src.getAttribute(name);
      if (name === "href" || name === "src" || name === "data") {
        val = absUrl(val, baseURI);
        if (val === null) continue; // unsafe/unresolvable URL -- drop the attribute
      }
      dest.setAttribute(name, val);
    }
  }

  /**
   * Clone a DOM subtree into a sanitized DocumentFragment: only ALLOWED_TAGS
   * survive as elements (others are unwrapped, keeping their children, unless
   * in DROP_TAGS in which case the whole subtree is discarded). VERBATIM_TAGS
   * (math/mjx-container) are deep-cloned untouched.
   */
  function cloneClean(root, opts) {
    const baseURI = (opts && opts.baseURI) || document.baseURI;
    const frag = document.createDocumentFragment();
    for (const child of Array.from(root.childNodes)) {
      const cleaned = cleanNode(child, baseURI);
      if (cleaned) frag.appendChild(cleaned);
    }
    return frag;
  }
  CSR.util.cloneClean = cloneClean;

  function cleanNode(node, baseURI) {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.nodeValue);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const tag = node.tagName.toLowerCase();

    if (VERBATIM_TAGS.has(tag)) {
      return node.cloneNode(true);
    }
    if (DROP_TAGS.has(tag)) {
      return null;
    }
    if (tag === "img") {
      const out = document.createElement("img");
      copyAllowedAttrs(node, out, baseURI);
      out.loading = "lazy";
      return out;
    }
    if (tag === "object") {
      // Vector-graphics figures embedded as <object type="image/svg+xml"
      // data="...">; unlike <img> these have no fallback text/child content
      // of their own, so without this special case they sanitize down to an
      // empty element and get dropped entirely by the empty-element check
      // below (this was the "figures missing" bug).
      if (!node.hasAttribute("data")) return null;
      const out = document.createElement("object");
      copyAllowedAttrs(node, out, baseURI);
      if (!out.hasAttribute("data")) return null; // data: URL failed to resolve/was unsafe
      return out;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      // Unwrap: keep children (e.g. publisher <div>/<section> wrappers)
      // so content isn't lost just because the wrapper itself is disallowed.
      const frag = document.createDocumentFragment();
      for (const child of Array.from(node.childNodes)) {
        const cleaned = cleanNode(child, baseURI);
        if (cleaned) frag.appendChild(cleaned);
      }
      return frag.childNodes.length ? frag : null;
    }

    const out = document.createElement(tag);
    copyAllowedAttrs(node, out, baseURI);
    for (const child of Array.from(node.childNodes)) {
      const cleaned = cleanNode(child, baseURI);
      if (cleaned) out.appendChild(cleaned);
    }
    // Drop elements that sanitized down to nothing (e.g. an icon <a> with
    // only an <svg> child, which was stripped as DROP_TAGS).
    if (!out.childNodes.length && tag !== "br" && tag !== "hr" && tag !== "img") {
      return null;
    }
    return out;
  }

  /**
   * Tags in-text citation links with a `data-csr-cite-ref` id (so
   * citationPeek.js can resolve it against the page's parsed bibliography
   * map) and, when the publisher already embeds the full reference text
   * inline (e.g. Nature's `title="..."` attribute on citation anchors),
   * captures that into `data-csr-cite-text` so peek can show it directly
   * without needing the bibliography list to parse correctly at all.
   *
   * @param {Element} root - subtree to scan (already detached/cloned).
   * @param {string} selector - CSS selector matching citation <a> elements.
   * @param {(a: Element) => string|null} idFromAnchor - extracts the
   *   bibliography entry id this anchor points to, or null if none.
   */
  function tagCitationRefs(root, selector, idFromAnchor) {
    root.querySelectorAll(selector).forEach((a) => {
      const id = idFromAnchor(a);
      if (id) a.setAttribute("data-csr-cite-ref", id);
      const inline = (a.getAttribute("title") || "").trim();
      if (inline.length > 15) a.setAttribute("data-csr-cite-text", inline);
    });
  }
  CSR.util.tagCitationRefs = tagCitationRefs;

  function textContentOf(node) {
    return (node && node.textContent || "").replace(/\s+/g, " ").trim();
  }
  CSR.util.textContentOf = textContentOf;

  /** First matching meta[name=...] or meta[property=...] content value. */
  function meta(doc, names) {
    for (const name of names) {
      const el =
        doc.querySelector(`meta[name="${name}"]`) ||
        doc.querySelector(`meta[property="${name}"]`);
      if (el && el.getAttribute("content")) return el.getAttribute("content").trim();
    }
    return null;
  }
  CSR.util.meta = meta;

  function metaAll(doc, names) {
    const out = [];
    for (const name of names) {
      doc
        .querySelectorAll(`meta[name="${name}"], meta[property="${name}"]`)
        .forEach((el) => {
          const v = el.getAttribute("content");
          if (v && v.trim()) out.push(v.trim());
        });
    }
    return out;
  }
  CSR.util.metaAll = metaAll;

  /**
   * Highwire/Google-Scholar "citation_*" meta tags are the de-facto standard
   * emitted by most scholarly publishers (incl. arXiv's /abs/ page, IEEE,
   * Nature, ACM, Science). Use them as the primary metadata source; callers
   * should fall back to DOM scraping only for fields that come back empty.
   */
  function citationMeta(doc) {
    const title = meta(doc, ["citation_title", "og:title"]);
    const authors = metaAll(doc, ["citation_author"]);
    const date = meta(doc, ["citation_publication_date", "citation_date", "citation_online_date"]);
    const journal = meta(doc, ["citation_journal_title", "citation_conference_title"]);
    const doi = meta(doc, ["citation_doi"]);
    const arxivId = meta(doc, ["citation_arxiv_id"]);
    return { title, authors, date, journal, doi, arxivId };
  }
  CSR.util.citationMeta = citationMeta;

  /**
   * Last-resort body extraction when a site-specific selector list comes up
   * empty: try common wrapper selectors, else pick the element under
   * <main>/<article>/[role=main] with the most paragraph text.
   */
  function genericArticleBody(doc, candidateSelectors) {
    for (const sel of candidateSelectors || []) {
      const el = doc.querySelector(sel);
      if (el && textContentOf(el).length > 200) return el;
    }
    const roots = doc.querySelectorAll("article, main, [role=main]");
    let best = null;
    let bestLen = 0;
    roots.forEach((el) => {
      const len = textContentOf(el).length;
      if (len > bestLen) {
        best = el;
        bestLen = len;
      }
    });
    return bestLen > 200 ? best : null;
  }
  CSR.util.genericArticleBody = genericArticleBody;

  /**
   * Heuristic bibliography-list finder: a list/container element whose
   * children's ids are referenced by in-text citation links in `scope`.
   */
  function genericBibliography(doc, candidateSelectors) {
    for (const sel of candidateSelectors || []) {
      const el = doc.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
  CSR.util.genericBibliography = genericBibliography;

  /** Remove all elements matching any of `selectors` from `root` in place. */
  function stripSelectors(root, selectors) {
    if (!selectors || !selectors.length) return;
    root.querySelectorAll(selectors.join(",")).forEach((el) => el.remove());
  }
  CSR.util.stripSelectors = stripSelectors;
})();
