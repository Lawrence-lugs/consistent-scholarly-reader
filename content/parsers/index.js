// Picks the first registered parser that both detects the current page and
// successfully produces content (detect() can be true on e.g. an arXiv
// /abs/ page while parse() still returns null because there's no full text).
(function () {
  "use strict";
  const CSR = window.CSR;

  CSR.findParsedArticle = function findParsedArticle(doc) {
    doc = doc || document;
    for (const parser of CSR.parsers) {
      if (!parser.detect(doc)) continue;
      const result = parser.parse(doc);
      if (result) return result;
    }
    return null;
  };

  CSR.anyParserDetects = function anyParserDetects(doc) {
    doc = doc || document;
    return CSR.parsers.some((p) => p.detect(doc));
  };
})();
