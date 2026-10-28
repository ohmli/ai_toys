# Neural Style Transfer

Apply the look of one image to another, entirely in your browser. Nothing is uploaded; there is no server.

It uses the pretrained [Magenta arbitrary style transfer](https://github.com/magenta/magenta/tree/main/magenta/models/arbitrary_image_stylization) networks through TensorFlow.js, plus a processing layer around them (auto-tuning, detail protection, palette matching and more).

## Run it

**Locally** — open `index.html` in a browser. Or serve the folder if you prefer:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

**On GitHub Pages**

1. Push these files to a repository (keep `index.html` at the root).
2. Go to **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
3. After a minute the site is live at `https://<user>.github.io/<repo>/`.

All paths are relative, so it works under a project sub-path. The `.nojekyll` file makes Pages serve the files as they are.

The first visit downloads the models (a few MB) and stores them in the browser; after that the app also works offline.

## Controls

| Control | What it does |
|---|---|
| Style strength | 0–150%. Above 100% exaggerates the style. |
| Keep original colors | Keeps the photo's colours and takes only brightness/texture from the stylized result. |
| Protect important detail | Stylizes strong edges (faces, text) more gently than flat areas. |
| Match style palette | Pulls the result's colour statistics toward the style image's. |
| Restore fine detail | Adds sharp detail from the original back in. |
| Refine passes | Re-applies the style for a stronger effect. |
| Multi-scale style analysis | Averages style readings from three scales for a richer style. |
| Auto-tune | Finds the strongest style that still keeps your chosen share of the photo's edge structure. |
| Blend two styles | Mixes a second style image into the first. |
| Live preview | Quick low-resolution draft while you move sliders; **Stylize** makes the full-size image. |

You can drop, paste or choose images. Ctrl/Cmd+Enter stylizes.

## Project layout

```
index.html            page structure
css/style.css         styles (light and dark)
js/presets.js         built-in sample and style images, drawn procedurally
js/model.js           downloads and caches the two networks
js/pipeline.js        the Engine: style-vector cache, stylization, auto-tune (no DOM code)
js/app.js             interface, settings, job scheduling
sw.js                 service worker for offline use
manifest.webmanifest  installable-app metadata
```

## Notes

- **TensorFlow.js is pinned to 1.7.4** because the pretrained model files were exported for that version. Do not upgrade it without re-exporting the models.
- A render that runs out of GPU memory is retried automatically at a smaller size.
- If you change files after deploying, bump `CACHE` in `sw.js` so returning visitors drop the old copies.
- Very large outputs (1024 px) need a decent GPU; on phones, stay at 384–512.

## Credits

Style transfer model by Ghiasi et al. ([Exploring the structure of a real-time, arbitrary neural artistic stylization network](https://arxiv.org/abs/1705.06830)), released through Magenta; browser port by [reiinakano](https://github.com/reiinakano/arbitrary-image-stylization-tfjs). Check those projects for their licenses before redistributing the model files.

The code in this repository is released under the MIT license (see `LICENSE`).
