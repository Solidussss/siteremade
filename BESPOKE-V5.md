# Bespoke (v5) websites

One website designed for one business, the way the 54 hand-built Calgary sites were made. The 36 design packages
give every business in a trade the same layout with new words; a bespoke page is written from scratch for that
business, from its own facts and photos, with one signature interaction made from it, and checked by screenshots.

Owner tool for now: `scripts/bespoke-build.js` writes a folder you open yourself. Nothing is stored in the database,
published, charged or shown to customers. Wiring it into the app (a route, credits, the private preview) is the next
step, after it has been tried on real businesses and the cost per site is measured.

## Run it

```
ANTHROPIC_API_KEY=... node scripts/bespoke-build.js <business-dir> --used used.json
```

`<business-dir>/facts.json`: everything known about the business. Only these facts can appear on the page.

```json
{
  "name": "Millo Millo Bakeshop",
  "status": "open",
  "address": "3003 37 St SW, Calgary, AB",
  "hours": "Wednesday to Sunday 8am to 4pm",
  "instagram": "https://www.instagram.com/millomilloyyc/",
  "menu": ["Onion Cheddar Croissant", "Bagel Breakfast Combo $8.99 until 11am"],
  "own_words": ["Dip. Bite. Repeat.", "Come for one. Leave with a box."],
  "notes": "Opened summer 2025. Listed in Avenue Calgary's new bakeries."
}
```

`<business-dir>/photos/`: the business's own photos (jpg, png, webp). Up to 12 are shown to the AI.
`used.json`: `{ "fonts": [...], "signatures": [...] }` already taken, so each site is different.

Output (default `<business-dir>/v5/`): `index.html`, `media/`, `SPEC.md`, `shots/` (desktop, phone, full pages),
`report.json` (each step, the code check results, the review scores, token use). The command prints the signature,
font, issues, AI calls, estimated USD and seconds.

Set `CHROME_PATH` if Chrome or Chromium is not in a usual place; without one the screenshot review is skipped
(`--no-look` skips it on purpose).

## The steps (lib/bespoke/pipeline.js)

1. **Spec.** Claude reads the fact sheet and looks at every photo. It answers with the intake (what, who visits, the
   ONE primary action and its real link, objections, proof, what is missing), which photos to use with crops (cut
   text overlays, app UI and identifiable people), and the direction: a signature interaction, a display font not in
   the used list, colours from the brand. Saved as SPEC.md.
2. **Media.** The chosen photos are cropped and resized to 1600px wide with ffmpeg (lib/bespoke/media.js).
3. **Build.** Claude writes the single-file page under the rules (lib/bespoke/rules.js). The code checks
   (lib/bespoke/validate.js) send back what is wrong, up to 3 times:
   - noindex, title, description, lang, skip link to #main, focus styles, alt text, no `href="#"`
   - first CSS rule `html,body{background}`, `overflow-x:clip`, reduced motion, still mode (`?still`), the fail safe
     (`js` class plus a timeout of at most 3500 ms)
   - nothing loaded from outside except Google Fonts, gsap@3.12.5 and lenis@1.1.13; images only from media/
   - display font not banned (Inter, Roboto, Arial, Open Sans, Helvetica, Poppins) and not used by another site
   - filler words refused; every price, phone number, clock time and percentage on the page must be in the fact sheet
4. **Look.** Headless Chrome screenshots in still mode at 1440 and 390 wide, full pages cut to the page height, and
   an overflow probe at 390px (lib/bespoke/qa.js). Claude scores them (first impression, hierarchy, signature,
   copy, phone layout, faithful to the photos) and returns a fixed page until every score is 7+ and the average 8+,
   up to 3 rounds. A fix that breaks a code check is not kept.

The hand-built Calgary pages (66 Lime's, 67 AURUM, 69 Millo Millo, 70 Art Café) pass every code check.

## Tests

`node --test test/bespoke.test.js`: the code checks on a good page and on the things they must refuse, the photo crop
filter and file name safety, the overflow probe, and a full run with a scripted AI (never the paid one) where an
invented price goes back to the AI and the fixed page is kept.

## Next

1. Try it on 5 businesses that already have hand-built pages; compare side by side; measure tokens and time.
2. Price it in credits (lib/pricing.js) from those numbers.
3. A route behind the website admin flag: upload photos, fill the fact sheet, run as a background job like
   lib/design-sites.js, private preview with the same owner checks.
4. The 36 design packages: add still mode and the tagline reveal where missing, so they pass the same checks.
