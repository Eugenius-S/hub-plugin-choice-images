// Images in answer options: an option of a question card whose label contains an image path shows the image itself.
// A click on the image opens it large in the hub window (the images of all the question's options, paged; zoom is the
// hub's and the "chat-images" plugin's, if installed); the option is not selected by that click. If there is no hub
// window, a simple window of our own.
// An image in the question text (not a grid) is shown as a thumbnail below it.
// A question with several answers (multiSelect) whose text lists image paths gets a grid with checkboxes: any number of
// images, tick any number of them; the labels of the ticked ones go into the answer. The Claude Code form has at most
// 4 options, so the images go in the question text, not as options.
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
const PATH = /(\/[^\n`"'<>|]*?\.(?:png|jpe?g|gif|webp))(?![\w.])/gi;   // a path in the label text, also with spaces
const DONE = "chiDone";
const LOUPE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" '
  + 'stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5M11 8v6M8 11h6"/></svg>';

// Interface strings: English by default, Russian when the hub language is Russian; any other language falls back to
// English. The language is read at the moment of use (hub.lang), not at module load.
const STR = {
  en: {
    open: "Open full size",
    openNamed: "{name} — open full size",
    openLabeled: "{label} — open full size",
    mark: "{label} — select",
    all: "Select all",
    none: "Clear",
    count: "Selected {n} of {m}",
  },
  ru: {
    open: "Открыть крупно",
    openNamed: "{name} — открыть крупно",
    openLabeled: "{label} — открыть крупно",
    mark: "{label} — отметить",
    all: "Отметить все",
    none: "Снять",
    count: "Отмечено {n} из {m}",
  },
};
let hub = null, core = null;
const t = (k, v) => (((STR[hub?.lang] ?? STR.en)[k] ?? STR.en[k]) || k).replace(/\{(\w+)\}/g, (m, n) => v?.[n] ?? m);

// images of an option: the core's link paths (data-path) or, if the core did not mark them up, the paths from the text
export function pathsOf(opt) {
  const found = [];
  for (const n of opt.querySelectorAll("[data-path]")) if (IMAGE.test(n.dataset.path) && n.dataset.path.startsWith("/")) found.push(n.dataset.path);
  if (!found.length) for (const m of (opt.textContent || "").matchAll(PATH)) found.push(m[1].trim());
  return [...new Set(found)];
}

const stem = (p) => p.split("/").pop().replace(/\.[^.]+$/, "");

// v is the question: a different address for a new card, otherwise the browser takes the image from the document's memory by the same address
function src(path, raw, v = "") {
  const tail = v ? "&v=" + encodeURIComponent(v) : "";
  if (!raw) return "/api/file?path=" + encodeURIComponent(path) + tail;
  const port = hub?.snapshot()?.files_port || 8788;
  return `${location.protocol}//${location.hostname}:${port}/raw?path=${encodeURIComponent(path)}${tail}`;
}

// Previews, not the images themselves: an MJ grid is 2048 px, 60 of those on a page is gigabytes of memory, the page and
// the Mac hung. The image loads off-page AT_ONCE at a time, when the tile is close to the screen, is shrunk into a
// TILE px canvas, and the big one is released; one per path, so a rebuilt card does not load again. Large view is on click.
// Address: the core serves only the files the session showed, "Files" serves project folders: if one fails, try the other
const TILE = 400, AT_ONCE = 2, KEEP = 120;   // KEEP is the number of previews in memory (a 400 px canvas is about 0.6 MB)
const small = new Map(), full = new Map();   // question+path -> Promise<canvas | null>; question+path -> the address it was loaded from
const waiting = [];
let busy = 0;
function next() {
  while (busy < AT_ONCE && waiting.length) {
    busy++;
    waiting.shift()().finally(() => { busy--; next(); });
  }
}
function load(url) {
  return new Promise((ok, no) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => im.decode().then(() => ok(im), () => ok(im));
    im.onerror = no;
    im.src = url;
  });
}
// A preview is per question and path: a new card loads the file again, since it may have been replaced at the same path
// (16.10: a new frame, but the card showed the old one from page memory); redrawing the same card uses memory
export function shrink(path, ask = "") {
  const key = ask + "\n" + path;
  if (!small.has(key) && small.size >= KEEP) { const old = small.keys().next().value; small.delete(old); full.delete(old); }   // the oldest goes: a day's cards pile up
  if (!small.has(key)) small.set(key, new Promise((done) => {
    waiting.push(async () => {
      for (const raw of [false, true]) {
        try {
          const im = await load(src(path, raw, ask)), k = Math.min(1, TILE / Math.max(im.naturalWidth, im.naturalHeight, 1));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(im.naturalWidth * k));
          c.height = Math.max(1, Math.round(im.naturalHeight * k));
          c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
          im.src = "";
          full.set(key, src(path, raw, ask));
          return done(c);
        } catch { /* next address */ }
      }
      done(null);
    });
    next();
  }));
  return small.get(key);
}
// a tile is a canvas; it is painted when it gets close to the screen
const near = typeof IntersectionObserver === "function" ? new IntersectionObserver((list) => {
  for (const e of list) if (e.isIntersecting) { near.unobserve(e.target); paint(e.target); }
}, { rootMargin: "600px" }) : null;
function paint(c) {
  shrink(c.dataset.chi, c.closest("[data-ask]")?.dataset.ask).then((s) => {
    if (!s) return c.dispatchEvent(new Event("chi-failed"));
    c.width = s.width;
    c.height = s.height;
    c.getContext("2d").drawImage(s, 0, 0);
    c.classList.add("chi-ready");
  });
}
function image(path, failed) {
  const c = document.createElement("canvas");
  c.className = "chi-img";
  c.width = c.height = 1;
  c.dataset.chi = path;   // not data-path: the core marks up links with it, and the style hides a shown path
  c.setAttribute("role", "img");
  c.setAttribute("aria-label", path.split("/").pop());
  c.addEventListener("chi-failed", () => failed(c));
  if (near) near.observe(c); else paint(c);
  return c;
}

function picture(path) {
  const img = image(path, (img) => {
    const box = img.parentElement, opt = img.closest(".opt, legend");
    img.remove();
    if (box && !box.children.length) { box.remove(); opt?.classList.remove("chi"); }
  });
  img.title = t("openNamed", { name: path.split("/").pop() });
  img.addEventListener("click", (e) => {   // a click on the image opens it large, not an option choice (nor an answer for a one-tap card)
    e.preventDefault();
    e.stopPropagation();
    open(img);
  });
  return img;
}

// grid items from the question text: a list item (or paragraph) with one image is labelled by its text without the path
// ("- MJ-3:2 `/path`" -> "MJ-3:2"), without text by the file name; a paragraph with several images uses file names
export function galleryItems(legend) {
  const items = [], hide = [];
  for (const block of legend.querySelectorAll("li, p")) {
    if (block.querySelector("li, p")) continue;
    const paths = pathsOf(block);
    if (!paths.length) continue;
    const rest = block.cloneNode(true);
    for (const n of rest.querySelectorAll("[data-path]")) n.remove();
    let text = rest.textContent;
    for (const p of paths) text = text.split(p).join("");
    text = text.replace(/\s+/g, " ").replace(/^[\s\-–—:·•,.]+|[\s\-–—:·•,]+$/g, "");
    paths.forEach((p) => items.push({ path: p, label: paths.length === 1 && text ? text : stem(p) }));
    if (block.tagName === "LI" || !text) hide.push(block);
  }
  const seen = new Map();   // identical labels get a number, otherwise they cannot be told apart in the answer
  for (const it of items) {
    const n = (seen.get(it.label) || 0) + 1;
    seen.set(it.label, n);
    if (n > 1) it.label += ` (${n})`;
  }
  return { items, hide };
}

function gallery(fs) {
  const legend = fs.querySelector(":scope > legend"), box = fs.querySelector("input[type=checkbox]");
  if (!legend || !box) return false;   // only a question with several answers
  const { items, hide } = galleryItems(legend);
  if (items.length < 2) return false;
  fs.dataset[DONE] = "1";
  for (const b of hide) b.hidden = true;
  for (const list of legend.querySelectorAll("ul, ol")) if (![...list.children].some((li) => !li.hidden)) list.hidden = true;
  const grid = document.createElement("div"), bar = document.createElement("div"), count = document.createElement("span");
  grid.className = "chi-gal";
  bar.className = "chi-bar";
  const tiles = items.map(({ path, label }) => {
    const tile = document.createElement("label"), mark = document.createElement("input"), cap = document.createElement("span");
    tile.className = "chi-tile";
    mark.type = "checkbox";
    mark.name = box.name;   // the hub card builds the answer from the ticked input[name=qN]: the label is what goes out
    mark.value = label;
    cap.className = "chi-cap";
    cap.textContent = label;
    const zoom = document.createElement("button");
    zoom.type = "button";
    zoom.className = "chi-zoom";
    zoom.title = t("open");
    zoom.setAttribute("aria-label", t("openLabeled", { label }));
    zoom.innerHTML = LOUPE;
    const img = image(path, () => tile.classList.add("chi-broken"));
    img.title = t("mark", { label });
    zoom.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); open(img); });
    tile.append(img, mark, cap, zoom);
    return tile;
  });
  const marks = tiles.map((t) => t.querySelector("input"));
  const set = (on) => { for (const m of marks) m.checked = on; update(); };
  const all = document.createElement("button"), none = document.createElement("button");
  all.type = none.type = "button";
  all.className = none.className = "btn chi-all";
  all.textContent = t("all");
  none.textContent = t("none");
  all.addEventListener("click", () => set(true));
  none.addEventListener("click", () => set(false));
  const update = () => {
    const n = marks.filter((m) => m.checked).length;
    count.textContent = t("count", { n, m: marks.length });
    none.hidden = !n;
    all.hidden = n === marks.length;
  };
  grid.addEventListener("change", update);
  bar.append(count, all, none);
  grid.append(...tiles);
  legend.after(bar, grid);
  update();
  return true;
}

// an image in the question text, not as a grid (a single one, or a single-answer question), is a thumbnail below the text, the path is not needed
function inQuestion(fs) {
  const legend = fs.querySelector(":scope > legend");
  if (!legend || legend.dataset[DONE]) return;
  const paths = pathsOf(legend);
  if (!paths.length) return;
  legend.dataset[DONE] = "1";
  const box = document.createElement("span");
  box.className = "chi-pics chi-q";
  for (const p of paths) box.append(picture(p));
  legend.append(box);
  legend.classList.add("chi");
}

export function scan(root) {
  for (const fs of root.querySelectorAll?.(".ask-card fieldset") || []) {
    if (!fs.dataset[DONE]) gallery(fs);
    if (!fs.dataset[DONE]) inQuestion(fs);
  }
  for (const opt of root.querySelectorAll?.(".ask-card label.opt") || []) {
    if (opt.dataset[DONE]) continue;
    const paths = pathsOf(opt);
    if (!paths.length) continue;   // the path is not marked up yet: it will come with the next mutation
    opt.dataset[DONE] = "1";
    const box = document.createElement("span");
    box.className = "chi-pics";
    for (const p of paths) box.append(picture(p));
    (opt.querySelector(":scope > span") || opt).append(box);
    opt.classList.add("chi");
    opt.closest("fieldset")?.classList.add("chi-set");
  }
}

// large view shows the image itself, not the preview; the hub window gets a list of addresses of all the question's images
function open(img) {
  const all = [...(img.closest("fieldset") || img.closest(".ask-card")).querySelectorAll(":is(.chi-pics, .chi-gal) .chi-img")];
  const list = all.map((c) => { const ask = c.closest("[data-ask]")?.dataset.ask || "", u = full.get(ask + "\n" + c.dataset.chi) || src(c.dataset.chi, false, ask); return { src: u, currentSrc: u, alt: c.dataset.chi.split("/").pop() }; });
  if (core?.openLightbox) return core.openLightbox(list, all.indexOf(img));
  popup(list[all.indexOf(img)]);
}

// our own window if there is no hub window: large view, a click on the image toggles natural size, a click outside or Esc closes
function popup(img) {   // img — {src, alt}
  const box = document.createElement("div"), big = document.createElement("img");
  box.className = "chi-popup";
  big.src = img.currentSrc || img.src;
  big.alt = img.alt;
  box.append(big);
  const close = () => { box.remove(); removeEventListener("keydown", key, true); };
  const key = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
  box.addEventListener("click", (e) => { if (e.target === box) close(); });
  big.addEventListener("click", () => box.classList.toggle("zoom"));
  addEventListener("keydown", key, true);
  document.body.append(box);
}

export default function register(h) {
  hub = h;
  hub.addStyle("style.css");
  // the hub window is the same module as the page's (one address, one instance); loaded ahead so a click opens at once
  import("/static/js/lightbox.js").then((m) => { core = m; }, () => {});
  new MutationObserver((list) => {
    for (const m of list) {
      const n = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      const card = n?.closest?.(".ask-card");
      if (card) scan(card);
      else for (const a of m.addedNodes) if (a.nodeType === 1) scan(a);
    }
  }).observe(document.body, { childList: true, subtree: true });
  scan(document);
}
