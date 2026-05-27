<h1> <div align="center"> Dollop</div></h1>
<div align="center">a fork of Klecks where unadded and rejected features live</div>
<h3 align="center">
  <a href="https://klecks.kelpw.ing">
    Try out Dollop!
  </a>
  |
  <a href="https://discord.gg/dcmsbXU5Yf">
    Discord Server
  </a> 
  |
  <a href="https://klecki.com">
    Kleki
  </a>
</h3>
<img width="1493" height="936" alt="image" src="https://github.com/user-attachments/assets/c05ebf9d-c991-4705-b1d2-5cbc2fc936db" />
The name Dollop means a small amount of something. It represents the idea of a portion of features that are not part of the main project, but still have value and can be enjoyed by users.

The aim of Dollop is to provide a home to the features that are proposed for Klecks but not added. This can be for various reasons, e.g. the feature is not fully developed yet, it is not polished enough, it is too niche, it is too resource intensive, it does not fit the vision of Klecks, etc.

It also allows users to try out these features without having to wait for them to be added to Klecks, or hosting their own. Not everyone has the technical knowledge to do that, and this exists to make it as easy as possible for them to try out these features.

---

Maintained by [kelpwing](https://github.com/itz-winter)
> By artists, for artists.

---

**WARNING:** Dollop is not as polished as Klecks and may contain bugs, performance issues, or compatibility problems. It is not recommended to rely on Dollop for production purposes or in projects where stability is important. Use it at your own risk.

---

The following blob is the original `README.md` of Klecks.
<h6>Last fetched: 27/05/2026 @ 16:18:03 PST</h6>

---

<div align="center">
 <img src="https://bitbof.com/stuff/2022-01-klecks/2026-04-06-logo.png" alt="Klecks" title="Klecks">
</div>

<div align="center">
  Modern and feature-rich painting app for the web
</div>

<div align="center">
  <h3>
    <a href="https://kleki.com">
      Try it out
    </a>
    <span> | </span>
    <a href="https://kleki.com/about/">
      About
    </a>
    <span> | </span>
    <a href="https://blog.kleki.com">
      Dev Blog
    </a>
    <span> | </span>
    <a href="https://kleki.com/donate/">
      Donate
    </a>
  </h3>
</div>

<p align="center">
<img src="https://bitbof.com/stuff/2022-01-klecks/2026-03-28-klecks-github.png" alt="Klecks"><br>
</p>

Klecks (German for "splash of color", pronounced "clex") is the official open-source release of the community-funded online painting app [Kleki](https://kleki.com).

Klecks can run in standalone mode (e.g. on [kleki.com](https://kleki.com)), or embed (e.g. on [2draw.net](https://2draw.net)) for drawing communities.

## Features

- Layers
- Pen-support with pressure and stabilizer
- Touch gestures
- Brushes: pen, blend, sketchy, pixel, chemy, smudge, eraser
- Tools: selection, paint bucket, text, shapes, gradient
- WebGL-powered filters: blur, tilt-shift, curves, distort, noise.
- Lineart extraction
- Editing tools: transform, warp, crop/expand, resize, perspective
- Supports all major form factors: desktop, tablet and phone
- Multi-language (10+ languages)

---

Created by developer/artist [bitbof](https://bitbof.com)

---

# Commands

- initialize via `npm ci` (requires node and npm to be installed already)
- `npm run lang:build` - generate language files necessary to run Klecks
- `npm run lang:build -- --missing` - generate language files and list all keys with a missing translation.
- `npm run start` - dev server (to run it locally)
- `npm run build` - build standalone into `/dist/`
- `npm run build:embed` - build of embed into `/dist/`
- `npm run build:help` - build help page (when clicking the question mark) into `/dist/`

# Embed

Example usage of the embed can be found under: `/examples/embed/`

# Docker

To run Klecks (standalone) within a Docker container, run the following commands in project root:

`docker-compose build`

`docker-compose up -d`

It is then accessible through: http://localhost:5050

# Contributing

How you can contribute to this project:

- Bug reporting (detailed bug reports that are reproducible)
- Contribute to a translation (see below)
- Donate to this project (Klecks, Kleki) [Donate](https://kleki.com/donate/)

# Translations

Are you a native speaker or have advanced skills in a language? Any contribution by you is highly encouraged and appreciated!

### Where are translation files?

Translations are located in `src/languages` where each translation is its own JSON5 file, e.g. `de.json5` for German.
Within such a file everything except `value` is to be kept in sync with `_base-en.json5`.

### Structure of a translation file

```json5
{
  // key by which this text is referenced in code
  stabilizer: {
    // A hint, further explaining the text
    hint: "Common feature in drawing software to make lines smoother",

    // Original text (English)
    original: "Stabilizer",

    // Translated text
    value: "抖动修正",
  },
  // ...
}
```

### Creating/editing a translation

To **create a new translation** run `npm run lang:add <code>`, which creates `src/languages/<code>.json5`. You find all
(ISO 639-1) language codes in `src/languages/languages.json`. The generated file will already include everything except `value`.
To **edit an existing translation**, simply edit one of the files in `src/languages`. If a language file is out of sync with
`src/languages/_base-en.json5` (English), whatever key is out of sync will be ignored and fall back on English. English is the
source of truth. A translation cannot add new keys without them also being present in `_base-en.json5`.

To **see your changes** in Klecks, run `npm run lang:build`. It needs to be run whenever changes to `src/languages` are
made or it won't be up-to-date. Then build or start Klecks.

A translation should try not to cause additional line-breaks in the UI if possible. Test to make sure translations
fit the context of the application. Note, some texts are only visible in the standalone-version and vice versa with
the embed-version.

### List of commands

- `npm run lang:add <code>` - creates new language file `src/languages/<code>.json5`.
  - See (ISO 639-1) language codes in `src/languages/languages.json`
- `npm run lang:sync <code>` - synchronizes with base file. (TODO)
- `npm run lang:build` - generates JSON & TS files in `src/app/languages`
  - Problems are printed to the command line output

# Help fund this project

Klecks and Kleki are community funded. [Donate today](https://kleki.com/donate/)

# License

bitbof © 2026 - Released under the MIT License. Icons by bitbof are public domain (excluding the Klecks logo, bitbof logo).
While Kleki and Klecks are jointly developed, Kleki's license is separate from Klecks. Kleki at [kleki.com](https://kleki.com) is free to use, but the name and brand "Kleki" are not covered by this license — you may not use Klecks to offer a service branded or presented as "Kleki" without a license from bitbof.
