// Parser for nature.com articles.
//
// ⚠️ Best-effort / unverified: built from commonly-documented Nature DOM
// conventions (c-article-* class names, JATS-derived section/reference
// markup), not confirmed against a live subscriber page (paywalled pages
// serve near-empty HTML to unauthenticated fetches). If extraction misses
// content on a real page, capture the article body/reference-list outerHTML
// from devtools and the selectors below can be corrected.
(function () {
  "use strict";
  const CSR = window.CSR;

  function detect(doc) {
    return /(^|\.)nature\.com$/.test(doc.location.hostname);
  }

  const BODY_SELECTORS = [
    "div.c-article-body",
    "div[data-component='article-body']",
    "article .c-article-body",
  ];
  const REF_LIST_SELECTORS = [
    "ol.c-article-references",
    "ul.c-article-references",
    "div.c-article-references",
    "section[aria-labelledby='Bib1'] ol",
  ];

  function tagCitations(root) {
    root.querySelectorAll('a[href*="#ref-CR"], a[href*="#Bib"], a[href^="#CR"]').forEach((a) => {
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
    const sections = body.querySelectorAll("section");
    if (sections.length) {
      sections.forEach((sec) => {
        const titleEl = sec.querySelector("h2, h3");
        const title = titleEl ? CSR.util.textContentOf(titleEl) : "";
        const clone = sec.cloneNode(true);
        const cloneTitle = clone.querySelector("h2, h3");
        if (cloneTitle) cloneTitle.remove();
        tagCitations(clone);
        out.push({
          id: sec.id || CSR.util.slugify(title),
          title,
          content: CSR.util.cloneClean(clone, { baseURI: doc.baseURI }),
        });
      });
    } else {
      // Flat fallback: no <section> wrappers found, treat the whole body as one block.
      const clone = body.cloneNode(true);
      tagCitations(clone);
      out.push({ id: "body", title: "", content: CSR.util.cloneClean(clone, { baseURI: doc.baseURI }) });
    }
    return out;
  }

  function parse(doc) {
    doc = doc || document;
    const body = CSR.util.genericArticleBody(doc, BODY_SELECTORS);
    if (!body) return null;

    const m = CSR.util.citationMeta(doc);
    const venueParts = [];
    if (m.journal) venueParts.push(m.journal);
    if (m.date) venueParts.push(m.date);
    if (m.doi) venueParts.push("doi:" + m.doi);

    return {
      site: "nature",
      title: m.title || CSR.util.textContentOf(doc.querySelector("h1")) || "Untitled",
      authors: m.authors.length ? m.authors.join(", ") : null,
      venueLine: venueParts.join(" \u00b7 "),
      sourceUrl: doc.location.href,
      sections: sectionsFrom(doc, body),
      bibliography: buildBibliography(doc),
    };
  }

  CSR.parsers.push({ id: "nature", detect, parse });
})();
