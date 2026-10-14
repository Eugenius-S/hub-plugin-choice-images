// Картинки в вариантах ответа: вариант карточки вопроса, в подписи которого путь к картинке, показывает её саму.
// Клик по картинке — окно хаба крупно (картинки всех вариантов вопроса, листаются; зум — его и плагина «Картинки в
// чате», если стоит), вариант при этом не выбирается. Окна хаба нет — своё простое окно.
// Вопрос с несколькими ответами (multiSelect), в тексте которого списком пути к картинкам, — сетка с галочками: сколько
// угодно картинок, отметить любое число; в ответ уходят подписи отмеченных (владелец 14.10: «хоть 50, выбрать хоть 1,
// хоть все»). У формы Claude Code не больше 4 вариантов — картинки идут в тексте вопроса, не вариантами.
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
const PATH = /(\/[^\n`"'<>|]*?\.(?:png|jpe?g|gif|webp))(?![\w.])/gi;   // путь в тексте подписи, и с пробелами
const DONE = "chiDone";
const LOUPE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" '
  + 'stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5M11 8v6M8 11h6"/></svg>';
let hub = null, core = null;

// картинки варианта: пути ссылок ядра (data-path) или, если ядро их не разметило, пути из текста
export function pathsOf(opt) {
  const found = [];
  for (const n of opt.querySelectorAll("[data-path]")) if (IMAGE.test(n.dataset.path) && n.dataset.path.startsWith("/")) found.push(n.dataset.path);
  if (!found.length) for (const m of (opt.textContent || "").matchAll(PATH)) found.push(m[1].trim());
  return [...new Set(found)];
}

const stem = (p) => p.split("/").pop().replace(/\.[^.]+$/, "");

function src(path, raw) {
  if (!raw) return "/api/file?path=" + encodeURIComponent(path);
  const port = hub?.snapshot()?.files_port || 8788;
  return `${location.protocol}//${location.hostname}:${port}/raw?path=${encodeURIComponent(path)}`;
}

// ядро отдаёт только показанные сессией файлы, «Файлы» — папки проектов: не вышло у одного — второй
function image(path, failed) {
  const img = document.createElement("img");
  img.alt = path.split("/").pop();
  img.dataset.path = path;
  img.loading = "lazy";
  img.src = src(path, false);
  img.addEventListener("error", () => {
    if (!img.dataset.raw) { img.dataset.raw = "1"; img.src = src(path, true); return; }
    failed(img);
  });
  return img;
}

function picture(path) {
  const img = image(path, (img) => {
    const box = img.parentElement, opt = img.closest(".opt");
    img.remove();
    if (box && !box.children.length) { box.remove(); opt?.classList.remove("chi"); }
  });
  img.title = `${img.alt} — открыть крупно`;
  img.addEventListener("click", (e) => {   // по картинке — крупно, а не выбор варианта (и не ответ у карточки в одно касание)
    e.preventDefault();
    e.stopPropagation();
    open(img);
  });
  return img;
}

// пункты сетки из текста вопроса: пункт списка (или абзац) с одной картинкой — подпись его текстом без пути
// («- MJ-3:2 `/путь`» → «MJ-3:2»), без текста — имя файла; в абзаце несколько картинок — имена файлов
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
  const seen = new Map();   // одинаковые подписи — с номером, иначе в ответе не различить
  for (const it of items) {
    const n = (seen.get(it.label) || 0) + 1;
    seen.set(it.label, n);
    if (n > 1) it.label += ` (${n})`;
  }
  return { items, hide };
}

function gallery(fs) {
  const legend = fs.querySelector(":scope > legend"), box = fs.querySelector("input[type=checkbox]");
  if (!legend || !box) return false;   // только вопрос с несколькими ответами
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
    mark.name = box.name;   // карточка хаба собирает ответ из отмеченных input[name=qN] — подпись и уходит
    mark.value = label;
    cap.className = "chi-cap";
    cap.textContent = label;
    const zoom = document.createElement("button");
    zoom.type = "button";
    zoom.className = "chi-zoom";
    zoom.title = "Открыть крупно";
    zoom.setAttribute("aria-label", `${label} — открыть крупно`);
    zoom.innerHTML = LOUPE;
    const img = image(path, () => tile.classList.add("chi-broken"));
    img.title = `${label} — отметить`;
    zoom.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); open(img); });
    tile.append(img, mark, cap, zoom);
    return tile;
  });
  const marks = tiles.map((t) => t.querySelector("input"));
  const set = (on) => { for (const m of marks) m.checked = on; update(); };
  const all = document.createElement("button"), none = document.createElement("button");
  all.type = none.type = "button";
  all.className = none.className = "btn chi-all";
  all.textContent = "Отметить все";
  none.textContent = "Снять";
  all.addEventListener("click", () => set(true));
  none.addEventListener("click", () => set(false));
  const update = () => {
    const n = marks.filter((m) => m.checked).length;
    count.textContent = `Отмечено ${n} из ${marks.length}`;
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

export function scan(root) {
  for (const fs of root.querySelectorAll?.(".ask-card fieldset") || []) if (!fs.dataset[DONE]) gallery(fs);
  for (const opt of root.querySelectorAll?.(".ask-card label.opt") || []) {
    if (opt.dataset[DONE]) continue;
    const paths = pathsOf(opt);
    if (!paths.length) continue;   // путь ещё не размечен — придёт следующей мутацией
    opt.dataset[DONE] = "1";
    const box = document.createElement("span");
    box.className = "chi-pics";
    for (const p of paths) box.append(picture(p));
    (opt.querySelector(":scope > span") || opt).append(box);
    opt.classList.add("chi");
    opt.closest("fieldset")?.classList.add("chi-set");
  }
}

function open(img) {
  const all = [...(img.closest("fieldset") || img.closest(".ask-card")).querySelectorAll(":is(.chi-pics, .chi-gal) img")];
  if (core?.openLightbox) return core.openLightbox(all, all.indexOf(img));
  popup(img);
}

// своё окно — если окна хаба нет: крупно, клик по картинке — в натуральную величину, мимо или Esc — закрыть
function popup(img) {
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
  // окно хаба — тот же модуль, что у страницы (один адрес — один экземпляр); заранее, чтобы клик открывал сразу
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
