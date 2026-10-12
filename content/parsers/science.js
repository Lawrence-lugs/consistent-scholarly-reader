// Parser for science.org (AAAS) articles, served on the Atypon Literatum
// platform (shared by several publishers), which commonly renders JATS XML
// through NLM_* classes.
//
// ⚠️ Best-effort / unverified: not confirmed against a live subscriber page.
// If a real page doesn't extract cleanly, capture the article body/reference
// list outerHTML from devtools so the selectors can be corrected.
(function () {
  "use strict";
  const CSR = window.CSR;

  function detect(doc) {
    return /(^|\.)science\.org$/.test(doc.location.hostname);
  }

  const BODY_SELECTORS = [
    "div.hlFld-Fulltext",
    "div.article__body",
    "section.article__sections",
  ];
  const REF_LIST_SELECTORS = [
    "div.NLM_back ol.references",
    "ol.rlist",
    "div.ref-list ol",
    "section#bibliography ol",
  ];

  function tagCitations(root) {
    root.querySelectorAll('a.ref, a[href*="#core-R"], a[href*="#bib"], a[href^="#B"]').forEach((a) => {
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
    const sections = body.querySelectorAll("div.NLM_sec, section");
    if (sections.length) {
      sections.forEach((sec) => {
        if (sec.parentElement.closest("div.NLM_sec, section")) return;
        const titleEl = sec.querySelector(".NLM_title, h2, h3");
        const title = titleEl ? CSR.util.textContentOf(titleEl) : "";
        const clone = sec.cloneNode(true);
        const cloneTitle = clone.querySelector(".NLM_title, h2, h3");
        if (cloneTitle) cloneTitle.remove();
        tagCitations(clone);
        out.push({
          id: sec.id || CSR.util.slugify(title),
          title,
          content: CSR.util.cloneClean(clone, { baseURI: doc.baseURI }),
        });
      });
    } else {
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
      site: "science",
      title: m.title || CSR.util.textContentOf(doc.querySelector("h1")) || "Untitled",
      authors: m.authors.length ? m.authors.join(", ") : null,
      venueLine: venueParts.join(" \u00b7 "),
      sourceUrl: doc.location.href,
      sections: sectionsFrom(doc, body),
      bibliography: buildBibliography(doc),
    };
  }

  CSR.parsers.push({ id: "science", detect, parse });
})();
