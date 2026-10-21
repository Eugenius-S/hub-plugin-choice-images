"""The "Choice images" plugin: the manifest and what the behaviour rests on. Standard library, no hub and no network.
Run: python3 -m unittest discover -s tests"""
import json
import os
import re
import shutil
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(name):
    with open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return f.read()


class Manifest(unittest.TestCase):
    def test_manifest_is_complete(self):
        man = json.loads(read("hub-plugin.json"))
        self.assertEqual((man["name"], man["web"], man["hub"]), ("choice-images", "main.js", "^1.10"))
        for key in ("icon", "description", "why", "version"):
            self.assertTrue(str(man.get(key) or "").strip(), key)
        self.assertTrue(os.path.isfile(os.path.join(ROOT, man["web"])))

    def test_manifest_is_english_with_russian_translation(self):
        man = json.loads(read("hub-plugin.json"))
        for key in ("description", "why"):
            self.assertIsNone(re.search("[\u0400-\u04ff]", man[key]), key)       # the base text is English
            self.assertTrue(man["i18n"]["ru"][key].strip(), key)                  # Russian is in i18n.ru
            self.assertIsNotNone(re.search("[\u0400-\u04ff]", man["i18n"]["ru"][key]), key)


class Source(unittest.TestCase):
    def test_rules_of_the_owner(self):
        # images go right in the options; the plugin's zoom if installed; if not, still large in a window
        js = read("main.js")
        self.assertIn('".ask-card label.opt"', js)
        self.assertIn('import("/static/js/lightbox.js")', js)      # the hub window: its zoom and the "Chat images" zoom
        self.assertIn("core.openLightbox(list, all.indexOf(img))", js)
        self.assertIn("popup(img)", js)                              # no hub window: our own
        click = js[js.index('img.addEventListener("click"'):]
        self.assertLess(click.index("e.preventDefault()"), click.index("open(img)"))   # a click on the image is not a choice
        self.assertIn('"/api/file?path="', js)
        self.assertIn("/raw?path=", js)                               # the core did not serve it: "Files"

    def test_picture_in_question_text(self):
        # a path to an image in the question text is a thumbnail in the card, not a link
        js, css = read("main.js"), read("style.css")
        self.assertIn("if (!fs.dataset[DONE]) inQuestion(fs);", js)   # the grid did not take it: thumbnail below the text
        self.assertIn('box.className = "chi-pics chi-q"', js)
        self.assertIn(".ask-card legend.chi :is([data-path$=\".png\" i]", css)   # the path of a shown image is hidden

    def test_path_in_text(self):
        # a path in the label text, also with spaces in folder names
        pat = re.search(r"const PATH = /(.+)/gi;", read("main.js")).group(1).replace("(?<![\\w.])", "")
        text = "Option 1 /home/me/Work/My Project/Styles/MJ/error-MJ-2-grid-1.png and that is all"
        self.assertEqual(re.findall(pat.replace("\\/", "/"), text, re.I),
                         ["/home/me/Work/My Project/Styles/MJ/error-MJ-2-grid-1.png"])

    def test_gallery(self):
        # "even 50 images, pick even 1, even all": the Claude Code form has at most 4 options, so the images
        # are listed in the text of a multi-answer question; the ticked ones go as the answer via the card's input[name=qN]
        js = read("main.js")
        self.assertIn('fs.querySelector("input[type=checkbox]")', js)   # multiSelect only
        self.assertIn("mark.name = box.name", js)                      # the hub card builds the answer
        self.assertIn("mark.value = label", js)
        self.assertIn('":is(.chi-pics, .chi-gal) .chi-img"', js)      # zoom pages through the grid too
        # 14.10: 60 grids of 2048 px hung a Mac: previews on a TILE px canvas, AT_ONCE at a time, when the tile is near the screen
        self.assertIn("const TILE = 400, AT_ONCE = 2, KEEP = 120;", js)
        self.assertIn("IntersectionObserver", js)
        self.assertIn('im.src = "";', js)
        self.assertIn('t("all")', js)
        css = read("style.css")
        self.assertIn(".chi-gal { display: grid; grid-template-columns: repeat(4", css)
        self.assertIn(".chi-tile:has(input:checked)", css)

    def test_a_new_card_loads_the_file_again(self):
        # 16.10: a frame was replaced at the same path, and a new card showed the old one from page
        # memory. A preview is per question and path, not per path
        js = read("main.js")
        self.assertIn("export function shrink(path, ask = \"\")", js)
        self.assertIn('const key = ask + "\\n" + path;', js)
        self.assertIn('shrink(c.dataset.chi, c.closest("[data-ask]")?.dataset.ask)', js)
        self.assertNotIn("small.set(path,", js)
        self.assertIn("load(src(path, raw, ask))", js)               # and a different address: the browser's document memory

    def test_css(self):
        css = read("style.css")
        self.assertIn("fieldset.chi-set", css)        # with images: side by side as a grid
        self.assertIn("cursor: zoom-in", css)
        self.assertIn('[data-path$=".png" i]', css)   # the shown path is hidden


class Strings(unittest.TestCase):
    """The interface strings are looked up at the moment of use by hub.lang: English by default, Russian for ru."""

    @staticmethod
    def run_t(lang, key, vars_="{}"):
        script = (
            "import fs from 'node:fs';\n"
            "const src = fs.readFileSync(process.argv[1], 'utf8');\n"
            "const body = src.slice(src.indexOf('const STR'), src.indexOf('// images of an option'));\n"
            "const make = new Function(body + '\\nreturn { t, STR, setHub: (h) => { hub = h; } };');\n"
            "const m = make();\n"
            "m.setHub(process.argv[2] === 'none' ? {} : { lang: process.argv[2] });\n"
            "console.log(m.t(process.argv[3], JSON.parse(process.argv[4])));\n"
        )
        out = subprocess.run(["node", "--input-type=module", "-e", script, os.path.join(ROOT, "main.js"), lang, key, vars_],
                             capture_output=True, text=True, encoding="utf-8")
        assert out.returncode == 0, out.stderr
        return out.stdout.strip()

    @unittest.skipUnless(shutil.which("node"), "node is required")
    def test_english_is_the_default(self):
        self.assertEqual(self.run_t("en", "all"), "Select all")
        self.assertEqual(self.run_t("none", "all"), "Select all")     # no language: English
        self.assertEqual(self.run_t("de", "none"), "Clear")           # unknown language: English
        self.assertEqual(self.run_t("en", "count", '{"n": 2, "m": 5}'), "Selected 2 of 5")
        self.assertEqual(self.run_t("en", "mark", '{"label": "MJ-1:2"}'), "MJ-1:2 — select")

    @unittest.skipUnless(shutil.which("node"), "node is required")
    def test_russian_works(self):
        # the original Russian texts, verbatim
        self.assertEqual(self.run_t("ru", "all"), "\u041e\u0442\u043c\u0435\u0442\u0438\u0442\u044c \u0432\u0441\u0435")
        self.assertEqual(self.run_t("ru", "none"), "\u0421\u043d\u044f\u0442\u044c")
        self.assertEqual(self.run_t("ru", "count", '{"n": 2, "m": 5}'), "\u041e\u0442\u043c\u0435\u0447\u0435\u043d\u043e 2 \u0438\u0437 5")
        self.assertEqual(self.run_t("ru", "open"), "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043a\u0440\u0443\u043f\u043d\u043e")
        self.assertEqual(self.run_t("ru", "openNamed", '{"name": "a.png"}'), "a.png — \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u043a\u0440\u0443\u043f\u043d\u043e")
        self.assertEqual(self.run_t("ru", "mark", '{"label": "MJ-1:2"}'), "MJ-1:2 — \u043e\u0442\u043c\u0435\u0442\u0438\u0442\u044c")

    def test_tables_have_the_same_keys_and_language_is_read_at_use_time(self):
        js = read("main.js")
        table = js[js.index("const STR"):js.index("let hub = null")]
        en, ru = table.split("  ru: {")
        keys = lambda part: re.findall(r"^\s+(\w+):", part, re.M)
        self.assertEqual(keys(en.split("en: {")[1]), keys(ru))
        self.assertIn("hub?.lang", js)                               # looked up in t(), not at module load
        self.assertNotIn("textContent = \"", js)                     # no hard-coded UI text


if __name__ == "__main__":
    unittest.main()
