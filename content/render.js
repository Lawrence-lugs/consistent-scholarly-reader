// Builds the reading-mode overlay: a full-viewport Shadow DOM host appended
// to the page, so the publisher site's own CSS can never bleed into (or be
// bled into by) the reading-mode styling.
(function () {
  "use strict";
  const CSR = window.CSR;

  // Persistent reader location across open/close (issue #7): the section that
  // was reading-marked when the overlay was last torn down, so re-opening can
  // position the reader at the same place; and the page scroll captured on the
  // current enter so teardown can restore it (bidirectional, mapped by section
  // anchor rather than raw pixels so it survives different DOMs).
  let readerLocation = { sectionId: null };
  let capturedPageScroll = null;
  let lastMain = null;

  function currentPageScroll() {
    return document.documentElement ? document.documentElement.scrollTop : 0;
  }

  // Section id (heading anchor) that contains `node` within `main`. Mirrors the
  // reader's structure: main children alternate h2.s headings + content blocks.
  function sectionIdForNode(node, main) {
    let block = node;
    while (block && block.parentNode !== main) block = block.parentNode;
    if (!block) return null;
    let lastH2 = null;
    for (const child of main.childNodes) {
      if (child === block) break;
      if (child.nodeType === 1 && child.tagName === "H2" && child.classList.contains("s")) lastH2 = child;
    }
    return lastH2 ? lastH2.id : null;
  }

  // Scroll `.csr-scroll` to the section whose heading has `sectionId`. Uses the
  // heading's real offset when available, otherwise a synthetic position based
  // on section order so the reader lands below the top for non-first sections.
  function scrollToSectionId(scroll, main, sectionId) {
    if (!sectionId) return 0;
    const headings = Array.from(main.querySelectorAll("h2.s"));
    const heading = headings.find((h) => h.id === sectionId);
    if (!heading) return 0;
    const offset = heading.offsetTop || headings.indexOf(heading) * 200;
    scroll.scrollTop = offset;
    return offset;
  }

  // Clamp preserved blocks (tables/figures) whose computed width overshoots the
  // 72ch reader column so they scroll horizontally instead of breaking layout.
  function clampOversizedBlocks(root) {
    const limit = 72 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    root.querySelectorAll("table, figure").forEach((el) => {
      const width = parseFloat(getComputedStyle(el).width) || 0;
      if (width > limit) {
        el.style.maxWidth = "100%";
        el.style.overflowX = "auto";
      }
    });
  }

  const STYLE = `
:host{all:initial}
.csr-root{
  position:fixed;inset:0;z-index:2147483647;
  background:#F2F5F3;color:#16252C;
  font-family:'Literata',Georgia,serif;line-height:1.65;
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
/* Issue #10: preserved blocks (tables/figures) that overshoot the 72ch column
   scroll horizontally instead of breaking the layout. img/svg inside figures
   are left alone (they already scale via width: 100%). */
.csr-page figure{max-width:100%;overflow-x:auto}
.csr-page table{max-width:100%;overflow-x:auto}
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
/* TOC: floats in the left margin, never affects the content column */
.csr-page h2.s,.csr-page h3{scroll-margin-top:1rem}
.csr-toc{
  display:none;position:absolute;top:4.25rem;left:1rem;width:14rem;
  max-height:calc(100% - 5.75rem);overflow-y:auto;
  font-family:'Instrument Sans',system-ui,sans-serif;font-size:.82rem;line-height:1.35;
}
.csr-toc-title{font-size:.7rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#5B6C73;margin:0 0 .6rem .6rem}
.csr-toc ul{list-style:none;margin:0;padding:0}
.csr-toc a{display:block;padding:.28rem .6rem;color:#5B6C73;text-decoration:none;border-left:2px solid #CBD6D3}
.csr-toc a.sub{padding-left:1.3rem;font-size:.78rem}
.csr-toc a:hover{color:#16252C;background:rgba(22,37,44,.04)}
.csr-toc a.active{color:#0E6B73;border-left-color:#0E6B73;font-weight:600}
.csr-toc-btn{
  display:none;appearance:none;border:1px solid #CBD6D3;background:#FBFCFB;border-radius:6px;
  height:1.8rem;padding:0 .6rem;cursor:pointer;font:inherit;color:#16252C;
}
/* enough free margin: show TOC in place */
.csr-root.csr-toc-wide .csr-toc{display:block}
/* not enough margin: button + drawer */
.csr-root:not(.csr-toc-wide) .csr-toc-btn{display:inline-block}
.csr-root:not(.csr-toc-wide).csr-toc-open .csr-toc{
  display:block;top:3.1rem;left:0;bottom:0;width:17rem;max-height:none;
  background:#FBFCFB;border-right:1px solid #CBD6D3;padding:1rem;z-index:2;
  box-shadow:4px 0 14px rgba(22,37,44,.12);
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

  const FONT_URL =
    "https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600&family=Instrument+Sans:wght@400;600&display=swap";

  // @font-face rules are ignored inside shadow roots, so the stylesheet must
  // live in the host document; the shadow tree can then use the families by name.
  function ensureFonts() {
    if (document.getElementById("csr-fonts")) return;
    const pre = document.createElement("link");
    pre.id = "csr-fonts-preconnect";
    pre.rel = "preconnect";
    pre.href = "https://fonts.googleapis.com";
    const link = document.createElement("link");
    link.id = "csr-fonts";
    link.rel = "stylesheet";
    link.href = FONT_URL;
    document.head.append(pre, link);
  }

  function removeFonts() {
    ["csr-fonts", "csr-fonts-preconnect"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  // Collect h2 section titles (+ optional h3s inside section content).
  const INCLUDE_SUBSECTIONS = true;

  function buildToc(main, scroll, root, page) {
    const items = [];
    let n = 0;
    const add = (el, sub) => {
      const text = el.textContent.replace(/\s+/g, " ").trim();
      if (!text) return;
      if (!el.id) el.id = "csr-h-" + n++;
      items.push({ el, text, sub });
    };
    main.querySelectorAll(INCLUDE_SUBSECTIONS ? "h2.s, h3" : "h2.s").forEach((el) =>
      add(el, el.tagName === "H3")
    );
    if (items.length < 2) return null;

    const toc = document.createElement("nav");
    toc.className = "csr-toc";
    toc.setAttribute("aria-label", "Table of contents");
    const title = document.createElement("p");
    title.className = "csr-toc-title";
    title.textContent = "Contents";
    const ul = document.createElement("ul");
    toc.append(title, ul);

    items.forEach((it) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#" + it.el.id;
      a.textContent = it.text;
      if (it.sub) a.className = "sub";
      a.addEventListener("click", (e) => {
        e.preventDefault(); // don't touch the host page's location hash
        it.el.scrollIntoView({ block: "start", behavior: "smooth" });
        root.classList.remove("csr-toc-open");
      });
      li.appendChild(a);
      ul.appendChild(li);
      it.link = a;
    });

    // Scroll-spy: active = last heading above a line near the top of the viewport.
    let active = null;
    let ticking = false;
    const update = () => {
      ticking = false;
      const line = scroll.getBoundingClientRect().top + 90;
      let cur = items[0];
      for (const it of items) {
        if (it.el.getBoundingClientRect().top <= line) cur = it;
        else break;
      }
      if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 4) {
        cur = items[items.length - 1];
      }
      if (cur === active) return;
      active = cur;
      items.forEach((it) => {
        it.link.classList.toggle("active", it === cur);
        if (it === cur) it.link.setAttribute("aria-current", "true");
        else it.link.removeAttribute("aria-current");
      });
      // keep the active entry visible inside the TOC's own scroller
      const l = cur.link;
      if (l.offsetTop < toc.scrollTop || l.offsetTop + l.offsetHeight > toc.scrollTop + toc.clientHeight) {
        toc.scrollTop = l.offsetTop - toc.clientHeight / 2;
      }
    };
    scroll.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    requestAnimationFrame(update);

    // Show the floating TOC only if the left margin beside the centred
    // column is wide enough for it (1rem offset + 14rem panel + 1.5rem gap).
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const need = 16.5 * rem;
    new ResizeObserver(() => {
      const room = page.getBoundingClientRect().left - scroll.getBoundingClientRect().left;
      root.classList.toggle("csr-toc-wide", room >= need);
    }).observe(scroll); // fires once on observe, so the initial state is set too

    // The panel sits over the margin, so pass wheel scrolling through to the article
    toc.addEventListener("wheel", (e) => {
      if (toc.scrollHeight <= toc.clientHeight) scroll.scrollBy({ top: e.deltaY });
    }, { passive: true });

    return toc;
  }

  CSR.renderOverlay = function renderOverlay(article) {
    ensureFonts();
    // Capture the page scroll on enter so teardown can restore it (issue #7).
    capturedPageScroll = currentPageScroll();
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

    // Floating TOC lives directly under .csr-root (position:fixed => containing
    // block), so the content column above is untouched.
    const toc = buildToc(main, scroll, root, page);
    if (toc) {
      root.appendChild(toc);
      const tocBtn = document.createElement("button");
      tocBtn.className = "csr-toc-btn";
      tocBtn.textContent = "Contents";
      tocBtn.addEventListener("click", () => root.classList.toggle("csr-toc-open"));
      topbar.insertBefore(tocBtn, closeBtn);
    }
    shadow.appendChild(root);

    document.documentElement.appendChild(host);
    document.documentElement.style.overflow = "hidden";

    lastMain = main;
    clampOversizedBlocks(main); // issue #10
    if (readerLocation && readerLocation.sectionId) {
      scrollToSectionId(scroll, main, readerLocation.sectionId); // issue #7
    }

    CSR.readingMark.attach(shadow, root);
    CSR.citationPeek.attach(shadow, article.bibliography);

    return { host, shadow, root, scroll };
  };

  CSR.teardownOverlay = function teardownOverlay() {
    const host = document.getElementById("csr-overlay-host");
    if (!host) return;
    // Remember the reading-marked section before detaching (issue #7), mapped
    // by section anchor so it survives the reader's rebuilt DOM.
    if (CSR.readingMark && CSR.readingMark.units && CSR.readingMark.idx >= 0 && lastMain) {
      const unit = CSR.readingMark.units[CSR.readingMark.idx];
      readerLocation = { sectionId: sectionIdForNode(unit, lastMain) || null };
    } else {
      readerLocation = { sectionId: null };
    }
    CSR.readingMark.detach();
    CSR.citationPeek.detach();
    // Restore the page scroll captured on enter (issue #7).
    if (capturedPageScroll !== null) {
      document.documentElement.scrollTop = capturedPageScroll;
      capturedPageScroll = null;
    }
    host.remove();
    removeFonts();
    document.documentElement.style.overflow = "";
  };
})();