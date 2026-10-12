// Parser for arXiv's generated-HTML papers (arxiv.org/html/... and the
// ar5iv mirror), which are produced by LaTeXML and use its stable `ltx_*`
// class naming (verified against a live LaTeXML output page).
(function () {
  "use strict";
  const CSR = window.CSR;

  function detect(doc) {
    return /^https?:\/\/(arxiv\.org|ar5iv\.labs\.arxiv\.org)\//.test(doc.location.href);
  }

  function tagCitations(root) {
    root.querySelectorAll('a[href^="#bib"]').forEach((a) => {
      a.setAttribute("data-csr-cite-ref", a.getAttribute("href").slice(1));
    });
  }

  function buildBibliography(doc) {
    const list = doc.querySelector(".ltx_biblist, .ltx_bibliography");
    const map = {};
    if (!list) return map;
    list.querySelectorAll(".ltx_bibitem[id]").forEach((item) => {
      const clone = item.cloneNode(true);
      clone.querySelectorAll(".ltx_tag").forEach((n) => n.remove());
      const frag = CSR.util.cloneClean(clone, { baseURI: doc.baseURI });
      map[item.id] = { id: item.id, text: CSR.util.textContentOf(frag) };
    });
    return map;
  }

  function sectionsFrom(doc, article) {
    const out = [];

    const abstract = article.querySelector(".ltx_abstract");
    if (abstract) {
      const clone = abstract.cloneNode(true);
      clone.querySelectorAll(":scope > .ltx_title").forEach((n) => n.remove());
      tagCitations(clone);
      out.push({
        id: "abstract",
        title: "Abstract",
        content: CSR.util.cloneClean(clone, { baseURI: doc.baseURI }),
      });
    }

    article.querySelectorAll(".ltx_section").forEach((sec) => {
      // Only top-level sections: subsections are nested inside and copied
      // along with their parent, so skip anything already inside a section.
      if (sec.parentElement.closest(".ltx_section")) return;
      const titleEl = sec.querySelector(":scope > .ltx_title");
      const title = titleEl ? CSR.util.textContentOf(titleEl) : "";
      const clone = sec.cloneNode(true);
      const cloneTitle = clone.querySelector(":scope > .ltx_title");
      if (cloneTitle) cloneTitle.remove();
      tagCitations(clone);
      out.push({
        id: sec.id || CSR.util.slugify(title),
        title,
        content: CSR.util.cloneClean(clone, { baseURI: doc.baseURI }),
      });
    });

    const biblio = article.querySelector(".ltx_bibliography");
    if (biblio) {
      const clone = biblio.cloneNode(true);
      const cloneTitle = clone.querySelector(".ltx_title");
      if (cloneTitle) cloneTitle.remove();
      out.push({
        id: "references",
        title: "References",
        content: CSR.util.cloneClean(clone, { baseURI: doc.baseURI }),
      });
    }

    return out;
  }

  function parse(doc) {
    doc = doc || document;
    const article = doc.querySelector(".ltx_document");
    if (!article) return null; // e.g. arxiv.org/abs/* has no full-text body

    const m = CSR.util.citationMeta(doc);
    const titleEl = article.querySelector(".ltx_title.ltx_title_document, h1.ltx_title");
    const title = m.title || (titleEl ? CSR.util.textContentOf(titleEl) : CSR.util.textContentOf(doc.querySelector("title")));

    const authorEls = article.querySelectorAll(".ltx_personname");
    const authors = m.authors.length
      ? m.authors.join(", ")
      : authorEls.length
      ? Array.from(authorEls).map((e) => CSR.util.textContentOf(e)).join(", ")
      : null;

    const venueParts = [];
    const arxivId = m.arxivId || (doc.location.href.match(/(\d{4}\.\d{4,5})(v\d+)?/) || [])[0];
    if (arxivId) venueParts.push("arXiv:" + arxivId);
    if (m.date) venueParts.push(m.date);

    return {
      site: "arxiv",
      title: title || "Untitled",
      authors,
      venueLine: venueParts.join(" \u00b7 "),
      sourceUrl: doc.location.href,
      sections: sectionsFrom(doc, article),
      bibliography: buildBibliography(doc),
    };
  }

  CSR.parsers.push({ id: "arxiv", detect, parse });
})();
