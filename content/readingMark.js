// Reading mark: a moveable highlighted "unit" (sentence or display
// equation). Activated with R, moved with Up/Down or j/k, exited with Esc
// or R again, or by clicking a unit directly. Adapted from a standalone
// prototype (see reference/) to operate inside the reading-mode Shadow DOM
// instead of a whole page.
(function () {
  "use strict";
  const CSR = window.CSR;

  const BLK = ".csr-page p, .csr-page li, .csr-page blockquote, .csr-page figcaption, .csr-page td";
  const DISPLAY_MATH = "math[display='block'], mjx-container[display='true']";
  const ALL = `${BLK}, ${DISPLAY_MATH}`;
  const ABBR = /(?:\b(?:e\.g|i\.e|et al|etc|vs|cf|Figs?|Eqs?|Secs?|Tab|Refs?|Algs?|approx|resp|No)|\b[A-Z])\.$/;
  const OBJ = "\uFFFC";

  let shadow = null;
  let root = null;
  let units = [];
  let idx = -1;
  let on = false;
  let hintEl = null;
  let keydownHandler = null;
  let clickHandler = null;

  function tokens(block) {
    const items = [];
    let run = [];
    const flush = () => {
      if (run.length) items.push({ run });
      run = [];
    };
    const walk = (n) => {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          run.push({ t: c });
        } else if (c.nodeType === 1) {
          const tag = c.tagName;
          if (tag === "MATH" || tag === "MJX-CONTAINER") {
            const display = c.getAttribute("display") === "true" || c.getAttribute("display") === "block";
            if (display) {
              flush();
              items.push({ disp: c });
            } else {
              run.push({ a: c });
            }
          } else if (tag === "SCRIPT" || tag === "STYLE" || tag === "IMG") {
            // skip
          } else {
            walk(c);
          }
        }
      }
    };
    walk(block);
    flush();
    return items;
  }

  function sentences(run) {
    let s = "";
    const map = [];
    for (const p of run) {
      if (p.t) {
        const v = p.t.nodeValue;
        for (let i = 0; i < v.length; i++) map.push({ n: p.t, o: i, L: v.length });
        s += v;
      } else {
        map.push({ a: p.a });
        s += OBJ;
      }
    }
    const cuts = [0];
    const re = /[.!?]+["'\u2019\u201d)\]]*(?=\s+[A-Z0-9"'\u201c\u2018(\[\uFFFC])/g;
    let m;
    while ((m = re.exec(s))) {
      const end = m.index + m[0].length;
      if (!ABBR.test(s.slice(Math.max(0, end - 10), end))) cuts.push(end);
    }
    cuts.push(s.length);
    const out = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      let a = cuts[i];
      let b = cuts[i + 1];
      while (a < b && /\s/.test(s[a])) a++;
      while (b > a && /\s/.test(s[b - 1])) b--;
      if (b > a) out.push([a, b]);
    }
    return { out, map };
  }

  function rangeFor(block, map, a, b) {
    const r = document.createRange();
    const f = map[a];
    const l = map[b - 1];
    if (f.a) r.setStartBefore(f.a);
    else if (f.o === 0) {
      let n = f.n;
      while (n.parentNode !== block && n === n.parentNode.firstChild) n = n.parentNode;
      r.setStartBefore(n);
    } else r.setStart(f.n, f.o);
    if (l.a) r.setEndAfter(l.a);
    else if (l.o === l.L - 1) {
      let n = l.n;
      while (n.parentNode !== block && n === n.parentNode.lastChild) n = n.parentNode;
      r.setEndAfter(n);
    } else r.setEnd(l.n, l.o + 1);
    return r;
  }

  function build(block) {
    const out = [];
    for (const it of tokens(block)) {
      if (it.disp) {
        it.disp.classList.add("rd");
        out.push(it.disp);
        continue;
      }
      const { out: ss, map } = sentences(it.run);
      const spans = [];
      for (let i = ss.length - 1; i >= 0; i--) {
        const r = rangeFor(block, map, ss[i][0], ss[i][1]);
        const sp = document.createElement("span");
        sp.className = "rd";
        sp.appendChild(r.extractContents());
        r.insertNode(sp);
        spans.push(sp);
      }
      out.push(...spans.reverse());
    }
    return out;
  }

  function hint() {
    if (!hintEl) {
      hintEl = document.createElement("div");
      hintEl.className = "csr-hint-badge";
      root.appendChild(hintEl);
    }
    hintEl.textContent = on ? "\u2191 \u2193 move \u00b7 Esc exit" : "R: reading marker";
  }

  function inView(i) {
    const r = units[i].getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  }
  function firstVisible() {
    for (let i = 0; i < units.length; i++) if (units[i].getBoundingClientRect().top >= 96) return i;
    return units.length - 1;
  }
  function ensure(u, fast) {
    const r = u.getBoundingClientRect();
    const h = innerHeight;
    const scroller = root.querySelector(".csr-scroll");
    if (r.top < h * 0.22 || r.bottom > h * 0.82) {
      scroller.scrollBy({ top: r.top - h * 0.42, behavior: fast ? "auto" : "smooth" });
    }
  }
  function set(i, scroll, fast) {
    if (units[idx]) units[idx].classList.remove("on");
    idx = Math.max(0, Math.min(units.length - 1, i));
    units[idx].classList.add("on");
    if (scroll) ensure(units[idx], fast);
  }
  function activate(i) {
    on = true;
    root.classList.add("rd-active");
    set(i !== undefined ? i : idx >= 0 && inView(idx) ? idx : firstVisible(), i === undefined);
    hint();
  }
  function deactivate() {
    on = false;
    root.classList.remove("rd-active");
    if (units[idx]) units[idx].classList.remove("on");
    hint();
  }

  function onKeydown(e) {
    if (!units.length || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      on ? deactivate() : activate();
      return;
    }
    if (!on) return;
    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      set(idx + 1, true, e.repeat);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      set(idx - 1, true, e.repeat);
    } else if (e.key === "Escape") {
      deactivate();
    }
  }

  function onClick(e) {
    const sel = shadow.getSelection ? shadow.getSelection() : getSelection();
    if (sel && !sel.isCollapsed) return;
    const target = e.composedPath ? e.composedPath()[0] : e.target;
    if (!units.length || (target.closest && target.closest("a,button"))) return;
    const u = target.closest && target.closest(".rd");
    if (!u) return;
    const i = units.indexOf(u);
    if (i < 0) return;
    if (on) set(i, false);
    else activate(i);
  }

  CSR.readingMark = {
    attach(shadowRoot, rootEl) {
      shadow = shadowRoot;
      root = rootEl;
      units = [];
      idx = -1;
      on = false;
      hintEl = null;
      for (const el of Array.from(shadow.querySelectorAll(ALL))) {
        if (el.tagName === "MATH" || el.tagName === "MJX-CONTAINER") {
          if (!el.parentElement.closest(BLK)) {
            el.classList.add("rd");
            units.push(el);
          }
          continue;
        }
        if (el.querySelector(DISPLAY_MATH)) continue;
        units.push(...build(el));
      }
      hint();
      keydownHandler = onKeydown;
      clickHandler = onClick;
      document.addEventListener("keydown", keydownHandler);
      shadow.addEventListener("click", clickHandler);
    },
    detach() {
      if (keydownHandler) document.removeEventListener("keydown", keydownHandler);
      if (clickHandler && shadow) shadow.removeEventListener("click", clickHandler);
      units = [];
      idx = -1;
      on = false;
      hintEl = null;
      shadow = null;
      root = null;
    },
  };
})();
