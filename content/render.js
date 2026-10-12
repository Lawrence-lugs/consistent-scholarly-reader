// Builds the reading-mode overlay: a full-viewport Shadow DOM host appended
// to the page, so the publisher site's own CSS can never bleed into (or be
// bled into by) the reading-mode styling.
(function () {
  "use strict";
  const CSR = window.CSR;

  const STYLE = `
:host{all:initial}
.csr-root{
  position:fixed;inset:0;z-index:2147483647;
  background:#F2F5F3;color:#16252C;
  font-family:Georgia,'Literata',serif;line-height:1.65;
  display:flex;flex-direction:column;
}
.csr-root *{box-sizing:border-box}
.csr-topbar{
  flex:0 0 auto;display:flex;align-items:center;gap:1rem;
  padding:.6rem 1rem;background:#FBFCFB;border-bottom:1px solid #CBD6D3;
  font-family:'Instrument Sans',system-ui,sans-serif;font-size:.85rem;color:#5B6C73;
}
.csr-brand{font-weight:600;color:#16252C}
.csr-hint{flex:1 1 auto}
.csr-close{
  appearance:none;border:1px solid #CBD6D3;background:#FBFCFB;border-radius:6px;
  width:1.8rem;height:1.8rem;cursor:pointer;font-size:1rem;color:#16252C;line-height:1;
}
.csr-close:hover{background:#F2F5F3}
.csr-scroll{flex:1 1 auto;overflow-y:auto;padding:2.5rem 1.25rem}
.csr-page{max-width:72ch;margin:0 auto}
.csr-page header p.csr-venue{font-family:'Instrument Sans',system-ui,sans-serif;font-size:.85rem;color:#5B6C73;margin:0}
.csr-page header h1{font-family:'Instrument Sans',system-ui,sans-serif;font-size:1.8rem;font-weight:600;line-height:1.25;margin:.3rem 0}
.csr-page header p.csr-authors{font-family:'Instrument Sans',system-ui,sans-serif;font-size:.95rem;color:#5B6C73;margin:0 0 1rem}
h2.s{font-family:'Instrument Sans',system-ui,sans-serif;font-weight:600;font-size:1.3rem;border-left:4px solid #0E6B73;padding-left:.7rem;margin:2.2rem 0 .8rem}
.csr-page p{margin:.75rem 0;text-align:justify;text-justify:inter-word;hyphens:auto;overflow-wrap:break-word}
.csr-page ul,.csr-page ol{padding-left:1.3rem;margin:.6rem 0}
.csr-page li{margin:.3rem 0}
.csr-page blockquote{border-left:3px solid #CBD6D3;padding-left:1rem;color:#5B6C73;margin:1.1rem 0}
.csr-page figure{background:#FBFCFB;border:1px solid #CBD6D3;padding:.6rem;margin:1.4rem 0}
.csr-page figure img{display:block;width:100%;height:auto;margin:0}
.csr-page figure object{display:block;width:100%;height:auto;margin:0;pointer-events:none}
.csr-page figcaption{font-size:.8rem;color:#5B6C73;margin-top:.4rem}
.csr-page table{border-collapse:collapse;width:100%;font-size:.88rem;margin:1rem 0}
.csr-page th,.csr-page td{border-bottom:1px solid #CBD6D3;padding:.45rem .5rem;text-align:left;vertical-align:top}
.csr-page a{color:#0E6B73}
.csr-page sup a[data-csr-cite-ref],.csr-page a[data-csr-cite-ref]{cursor:help;text-decoration:underline dotted}
/* Reading mark */
.rd.on{background:rgba(22,37,44,.15);box-shadow:0 0 0 2px rgba(22,37,44,.15);border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.csr-root.rd-active .rd:hover:not(.on){background:rgba(22,37,44,.06)}
.csr-hint-badge{position:absolute;right:.9rem;bottom:.7rem;font:600 .7rem 'Instrument Sans',system-ui,sans-serif;color:#5B6C73;background:#FBFCFB;border:1px solid #CBD6D3;border-radius:6px;padding:.2rem .55rem;opacity:.9;pointer-events:none}
/* Citation peek tooltip */
.csr-peek{
  position:fixed;max-width:32ch;z-index:2147483647;
  font-family:'Instrument Sans',system-ui,sans-serif;font-size:.78rem;line-height:1.4;color:#16252C;
  background:#FBFCFB;border:1px solid #CBD6D3;border-radius:6px;padding:.5rem .65rem;
  box-shadow:0 4px 14px rgba(22,37,44,.18);pointer-events:none;
}
`;

  function buildHeader(doc, article) {
    const header = doc.createElement("header");
    if (article.venueLine) {
      const venue = doc.createElement("p");
      venue.className = "csr-venue";
      venue.textContent = article.venueLine;
      header.appendChild(venue);
    }
    const h1 = doc.createElement("h1");
    h1.textContent = article.title;
    header.appendChild(h1);
    if (article.authors) {
      const authors = doc.createElement("p");
      authors.className = "csr-authors";
      authors.textContent = article.authors;
      header.appendChild(authors);
    }
    return header;
  }

  CSR.renderOverlay = function renderOverlay(article) {
    const host = document.createElement("div");
    host.id = "csr-overlay-host";
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLE;
    shadow.appendChild(style);

    const root = document.createElement("div");
    root.className = "csr-root";
    root.id = "csr-root";

    const topbar = document.createElement("div");
    topbar.className = "csr-topbar";
    topbar.innerHTML = `<span class="csr-brand">Reading mode</span><span class="csr-hint">Press <b>R</b> for the reading mark · <b>\u2191</b>/<b>\u2193</b> or <b>k</b>/<b>j</b> to move it · hover a citation to peek it</span>`;
    const closeBtn = document.createElement("button");
    closeBtn.className = "csr-close";
    closeBtn.setAttribute("aria-label", "Exit reading mode");
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", () => CSR.teardownOverlay());
    topbar.appendChild(closeBtn);
    root.appendChild(topbar);

    const scroll = document.createElement("div");
    scroll.className = "csr-scroll";
    const page = document.createElement("div");
    page.className = "csr-page";

    const main = document.createElement("main");
    main.appendChild(buildHeader(document, article));
    article.sections.forEach((sec) => {
      if (sec.title) {
        const h2 = document.createElement("h2");
        h2.className = "s";
        h2.id = sec.id;
        h2.textContent = sec.title;
        main.appendChild(h2);
      }
      main.appendChild(sec.content);
    });
    page.appendChild(main);
    scroll.appendChild(page);
    root.appendChild(scroll);
    shadow.appendChild(root);

    document.documentElement.appendChild(host);
    document.documentElement.style.overflow = "hidden";

    CSR.readingMark.attach(shadow, root);
    CSR.citationPeek.attach(shadow, article.bibliography);

    return { host, shadow, root, scroll };
  };

  CSR.teardownOverlay = function teardownOverlay() {
    const host = document.getElementById("csr-overlay-host");
    if (!host) return;
    CSR.readingMark.detach();
    CSR.citationPeek.detach();
    host.remove();
    document.documentElement.style.overflow = "";
  };
})();
