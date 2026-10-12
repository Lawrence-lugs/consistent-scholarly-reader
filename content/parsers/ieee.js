// Parser for ieeexplore.ieee.org document pages.
//
// ⚠️ Best-effort / unverified: IEEE Xplore mostly renders only the abstract
// server-side and loads full text (when available at all) asynchronously;
// article pages are frequently abstract-only even with access. The
// selectors below are a best guess, not confirmed against a live page. If
// extraction misses content, capture the article body/reference-list
// outerHTML from devtools so the selectors can be corrected.
(function () {
  "use strict";
  const CSR = window.CSR;

  function detect(doc) {
    return /(^|\.)ieeexplore\.ieee\.org$/.test(doc.location.hostname);
  }

  const BODY_SELECTORS = [
    "div.article-content",
    "section.document-content",
    "div.text",
    "div#article",
  ];
  const ABSTRACT_SELECTORS = ["div.abstract-text", "div.u-mb-1 .abstract-text", "meta[name='description']"];
  const REF_LIST_SELECTORS = [
    "div.reference-container ol",
    "section.reference-container ol",
    "ol.references-list",
  ];

  function tagCitations(root) {
    root.querySelectorAll('a[href*="#reference-"], a.reference-link, a[href^="#ref"]').forEach((a) => {
      const href = a.getAttribute("href") || "";
      const hash = href.includes("#") ? href.slice(href.indexOf("#") + 1) : href;
      if (hash) a.setAttribute("data-csr-cite-ref", hash);
    });
  }

  function buildBibliography(doc) {
    const list = CSR.util.genericBibliography(doc, REF_LIST_SELECTORS);
    const map = {};
    if (!list) return map;
    list.querySelectorAll("li[id]").forEach((item) => {
      const clone = item.cloneNode(true);
      const frag = CSR.util.cloneClean(clone, { baseURI: doc.baseURI });
      map[item.id] = { id: item.id, text: CSR.util.textContentOf(frag) };
    });
    return map;
  }

  function sectionsFrom(doc, body) {
    const out = [];
    const headings = body.querySelectorAll("h2, h3");
    if (!headings.length) {
      const clone = body.cloneNode(true);
      tagCitations(clone);
      out.push({ id: "body", title: "", content: CSR.util.cloneClean(clone, { baseURI: doc.baseURI }) });
      return out;
    }
    let current = null;
    const groups = [];
    Array.from(body.children).forEach((node) => {
      if (/^H[23]$/.test(node.tagName)) {
        current = { title: CSR.util.textContentOf(node), id: node.id || CSR.util.slugify(node.textContent), nodes: [] };
        groups.push(current);
      } else if (current) {
        current.nodes.push(node);
      }
    });
    groups.forEach((sec) => {
      const wrapper = doc.createElement("div");
      sec.nodes.forEach((n) => wrapper.appendChild(n.cloneNode(true)));
      tagCitations(wrapper);
      out.push({ id: sec.id, title: sec.title, content: CSR.util.cloneClean(wrapper, { baseURI: doc.baseURI }) });
    });
    return out;
  }

  function parse(doc) {
    doc = doc || document;
    const m = CSR.util.citationMeta(doc);
    let body = CSR.util.genericArticleBody(doc, BODY_SELECTORS);
    let sections;
    if (body) {
      sections = sectionsFrom(doc, body);
    } else {
      // Full text unavailable: fall back to just the abstract so the toggle
      // still produces something useful rather than silently doing nothing.
      let abstractText = null;
      for (const sel of ABSTRACT_SELECTORS) {
        const el = doc.querySelector(sel);
        if (!el) continue;
        abstractText = el.tagName === "META" ? el.getAttribute("content") : CSR.util.textContentOf(el);
        if (abstractText) break;
      }
      if (!abstractText) return null;
      const p = doc.createElement("p");
      p.textContent = abstractText;
      sections = [{ id: "abstract", title: "Abstract", content: CSR.util.cloneClean(p, { baseURI: doc.baseURI }) }];
    }

    const venueParts = [];
    if (m.journal) venueParts.push(m.journal);
    if (m.date) venueParts.push(m.date);
    if (m.doi) venueParts.push("doi:" + m.doi);

    return {
      site: "ieee",
      title: m.title || CSR.util.textContentOf(doc.querySelector("h1")) || "Untitled",
      authors: m.authors.length ? m.authors.join(", ") : null,
      venueLine: venueParts.join(" \u00b7 "),
      sourceUrl: doc.location.href,
      sections,
      bibliography: buildBibliography(doc),
    };
  }

  CSR.parsers.push({ id: "ieee", detect, parse });
})();
