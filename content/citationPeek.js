// Citation hover peek: hovering (or focusing) an in-text citation link
// shows a small tooltip with the matching bibliography entry's text, pulled
// from the same page -- no network calls or external APIs.
(function () {
  "use strict";
  const CSR = window.CSR;

  let shadow = null;
  let root = null;
  let bibliography = {};
  let tooltip = null;
  let overHandler = null;
  let outHandler = null;
  let moveHandler = null;
  let focusInHandler = null;
  let focusOutHandler = null;

  function findRefTarget(node) {
    while (node && node !== shadow) {
      if (node.hasAttribute && node.hasAttribute("data-csr-cite-ref")) return node;
      node = node.parentNode;
    }
    return null;
  }

  function showFor(target, x, y) {
    const ref = target.getAttribute("data-csr-cite-ref");
    const entry = bibliography[ref];
    const text = entry ? entry.text : "Reference details not found on this page.";
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "csr-peek";
      root.appendChild(tooltip);
    }
    tooltip.textContent = text;
    tooltip.style.display = "block";
    position(tooltip, x, y);
  }

  function position(el, x, y) {
    const pad = 12;
    const rect = el.getBoundingClientRect();
    let left = x + pad;
    let top = y + pad;
    if (left + rect.width > innerWidth - pad) left = innerWidth - rect.width - pad;
    if (top + rect.height > innerHeight - pad) top = y - rect.height - pad;
    el.style.left = Math.max(pad, left) + "px";
    el.style.top = Math.max(pad, top) + "px";
  }

  function hide() {
    if (tooltip) tooltip.style.display = "none";
  }

  CSR.citationPeek = {
    attach(shadowRoot, bibliographyMap) {
      shadow = shadowRoot;
      root = shadowRoot.getElementById("csr-root");
      bibliography = bibliographyMap || {};

      overHandler = (e) => {
        const target = findRefTarget(e.composedPath ? e.composedPath()[0] : e.target);
        if (target) showFor(target, e.clientX, e.clientY);
      };
      moveHandler = (e) => {
        if (tooltip && tooltip.style.display === "block") position(tooltip, e.clientX, e.clientY);
      };
      outHandler = (e) => {
        const target = findRefTarget(e.composedPath ? e.composedPath()[0] : e.target);
        if (target) hide();
      };
      focusInHandler = (e) => {
        const target = findRefTarget(e.composedPath ? e.composedPath()[0] : e.target);
        if (!target) return;
        const r = target.getBoundingClientRect();
        showFor(target, r.left, r.bottom);
      };
      focusOutHandler = () => hide();

      shadow.addEventListener("mouseover", overHandler);
      shadow.addEventListener("mousemove", moveHandler);
      shadow.addEventListener("mouseout", outHandler);
      shadow.addEventListener("focusin", focusInHandler);
      shadow.addEventListener("focusout", focusOutHandler);
    },
    detach() {
      if (shadow) {
        shadow.removeEventListener("mouseover", overHandler);
        shadow.removeEventListener("mousemove", moveHandler);
        shadow.removeEventListener("mouseout", outHandler);
        shadow.removeEventListener("focusin", focusInHandler);
        shadow.removeEventListener("focusout", focusOutHandler);
      }
      tooltip = null;
      shadow = null;
      root = null;
      bibliography = {};
    },
  };
})();
