"""Плагин «Картинки в вариантах»: манифест и то, на чём держится поведение. Стандартная библиотека, без хаба и сети.
Запуск: python3 -m unittest discover -s tests"""
import json
import os
import re
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


class Source(unittest.TestCase):
    def test_rules_of_the_owner(self):
        # владелец 14.10: картинки — прямо в вариантах; зум плагина, если стоит; если нет — всё равно крупно в окне
        js = read("main.js")
        self.assertIn('".ask-card label.opt"', js)
        self.assertIn('import("/static/js/lightbox.js")', js)      # окно хаба — его зум и зум «Картинок в чате»
        self.assertIn("core.openLightbox(all, all.indexOf(img))", js)
        self.assertIn("popup(img)", js)                              # окна хаба нет — своё
        click = js[js.index('img.addEventListener("click"'):]
        self.assertLess(click.index("e.preventDefault()"), click.index("open(img)"))   # клик по картинке — не выбор
        self.assertIn('"/api/file?path="', js)
        self.assertIn("/raw?path=", js)                               # не отдало ядро — «Файлы»

    def test_path_in_text(self):
        # путь в тексте подписи, и с пробелами в папках — как у владельца
        pat = re.search(r"const PATH = /(.+)/gi;", read("main.js")).group(1).replace("(?<![\\w.])", "")
        text = "Вариант 1 /Users/me/Work/!!! 2M DESIGN/Generated styles/MJ/error-MJ-2-grid-1.png и всё"
        self.assertEqual(re.findall(pat.replace("\\/", "/"), text, re.I),
                         ["/Users/me/Work/!!! 2M DESIGN/Generated styles/MJ/error-MJ-2-grid-1.png"])

    def test_css(self):
        css = read("style.css")
        self.assertIn("fieldset.chi-set", css)        # с картинками — сеткой рядом
        self.assertIn("cursor: zoom-in", css)
        self.assertIn('[data-path$=".png" i]', css)   # показанный путь — скрыт


if __name__ == "__main__":
    unittest.main()
