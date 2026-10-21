# Choice images — an Agents Hub plugin

When a session asks you to pick an image, the images show right in the answer options:

- an option's description holds the path to an image (`/full/path/picture.png`; png, jpg, webp, gif);
- options with images go 4 in a row (2 on a phone); an option without an image ("none fits") takes the full width;
- the path the image is shown for is hidden in the label;
- a click on an image opens it large and does not select the option. The images of all the question's options can be
  paged with the arrows. If the "Chat images" plugin is installed, its zoom to the click point and dragging work;
  without it the stock behaviour applies: a click on the image shows it at natural size.

A path to an image in the question text itself ("What is wrong with this icon? `/path/icon.png`") becomes a thumbnail
below the text, the path is hidden; a click opens it large.

## Many images — a grid with checkboxes

The question form has at most 4 options. To pick one, several or all of any number of images (even 50), the session asks
a question with several answers (`multiSelect: true`) and lists the images in the question text — one item per image,
a label and a path:

```
Which ones to upscale?

- MJ-1:1 `/full/path/MJ-1-grid-1.png`
- MJ-1:2 `/full/path/MJ-1-grid-2.png`
```

The plugin shows them as a grid, 4 in a row (2 on a phone): a tap ticks an image, the magnifier in the corner opens it
large (all the images can be paged), and at the top there are "Selected N of M", "Select all" and "Clear". The labels of
the ticked images go to the session as the answer, comma-separated: `MJ-1:2, MJ-3:4`. An item without a label uses the
file name. The question's options (2–4, for example "None") stay under the grid and go along with the ticked images.
Without the plugin it is the same question as text, answered in your own words.

The plugin has no network and no process.

The interface text is English by default and Russian when the hub language is Russian (`hub.lang`); any other language
falls back to English.

## Install

"Settings" → "Plugins" → paste the link to this repository → "Check and install". Needs a hub with plugin API 1.10.

## Tests

`python3 -m unittest discover -s tests` — standard library, no hub and no browser (`node` is used for the string test
when present).

Icon — [3D Fluency](https://icons8.com/icons/3d-fluency) by Icons8.
