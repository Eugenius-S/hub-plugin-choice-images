// Картинки в вариантах ответа: вариант карточки вопроса, в подписи которого путь к картинке, показывает её саму.
// Клик по картинке — окно хаба крупно (картинки всех вариантов вопроса, листаются; зум — его и плагина «Картинки в
// чате», если стоит), вариант при этом не выбирается. Окна хаба нет — своё простое окно.
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
const PATH = /(\/[^\n`"'<>|]*?\.(?:png|jpe?g|gif|webp))(?![\w.])/gi;   // путь в тексте подписи, и с пробелами
const DONE = "chiDone";
let hub = null, core = null;

// картинки варианта: пути ссылок ядра (data-path) или, если ядро их не разметило, пути из текста
export function pathsOf(opt) {
  const found = [];
  for (const n of opt.querySelectorAll("[data-path]")) if (IMAGE.test(n.dataset.path) && n.dataset.path.startsWith("/")) found.push(n.dataset.path);
  if (!found.length) for (const m of (opt.textContent || "").matchAll(PATH)) found.push(m[1].trim());
  return [...new Set(found)];
}

function src(path, raw) {
  if (!raw) return "/api/file?path=" + encodeURIComponent(path);
  const port = hub?.snapshot()?.files_port || 8788;
  return `${location.protocol}//${location.hostname}:${port}/raw?path=${encodeURIComponent(path)}`;
}

function picture(path) {
  const img = document.createElement("img");
  img.alt = path.split("/").pop();
  img.title = `${img.alt} — открыть крупно`;
  img.dataset.path = path;
  img.src = src(path, false);
  // ядро отдаёт только показанные сессией файлы, «Файлы» — папки проектов: не вышло у одного — второй
  img.addEventListener("error", () => {
    if (!img.dataset.raw) { img.dataset.raw = "1"; img.src = src(path, true); return; }
    const box = img.parentElement, opt = img.closest(".opt");
    img.remove();
    if (box && !box.children.length) { box.remove(); opt?.classList.remove("chi"); }
  });
  img.addEventListener("click", (e) => {   // по картинке — крупно, а не выбор варианта (и не ответ у карточки в одно касание)
    e.preventDefault();
    e.stopPropagation();
    open(img);
  });
  return img;
}

export function scan(root) {
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
  const all = [...(img.closest("fieldset") || img.closest(".ask-card")).querySelectorAll(".chi-pics img")];
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
