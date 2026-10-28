# JALRANG site — credits and licences

JALRANG is a fictional brand, designed by J&J Co. as a concept project.

## Code libraries (vendored in `js/vendor/`, no build step)

- three.js 0.186.1 — MIT licence — https://threejs.org — bundled to one ES module with only the parts this site uses.
- GSAP 3.15.0 with ScrollTrigger and CustomEase, the files the pages load — GSAP Standard "No Charge" licence — https://gsap.com/standard-license. (`js/vendor/` also holds `gsap-3.15.0-SplitText.min.js`; no page loads it, so it is not part of what the site runs.)
- Lenis 1.3.26 — MIT licence — https://github.com/darkroomengineering/lenis

## Fonts (self-hosted in `assets/fonts/`, each with its licence beside it)

Both are under the SIL Open Font License 1.1, which allows commercial web use and self-hosting. The files are the Google Fonts web files (latin and latin-ext subsets), unmodified; जलरंग comes from Google Fonts' own `text=` subset of Jaini (`jaini-normal-400-jalrang.woff2`, those five letters only).

- Jaini, Ek Type, SIL OFL 1.1, from Google Fonts (github.com/EkType/Jaini): display type, the giant colour words and the wordmark, including जलरंग, drawn with the same pen as the Latin. Files `jaini-normal-400-*.woff2`. Licence: `assets/fonts/LICENSE-Jaini.txt`.
- Mukta, Ek Type (Girish Dalvi), SIL OFL 1.1, from Google Fonts: text, labels, buttons, prices (₹) and figures. Files `mukta-normal-{400,500,600}-*.woff2`. Licence: `assets/fonts/LICENSE-Mukta.txt`.

## Images and films

- Every photograph, painting, packshot and film was generated with AI for this concept (images with GPT Image 2, films by J&J Co. with video models), in the visual language of each tradition. The footer says so on the page.
- The bottle is drawn in real time with three.js from the same paintings (on the landing, the shop and the product pages); its contact shadow is plain CSS. The plinths were retired on 16 October 2026.
- The opening's caustic light (landing, L1, 20 October 2026) is baked from J&J Co.'s own AI-made water clip (`footage/v01-water-surface-alt.mp4`, a few frames, light only) into one grey picture, `assets/hero/caustic.webp` (`tools/hero/bake_caustic.py`); the red water, the splash, the droplets, the bubbles and the ripples are drawn in code, and no video plays. The earlier ink frames (`assets/hero/ink-*.webp`, from `footage/v02-bloom-c.mp4`) are kept on disk and no longer used.
- `assets/img/coin-01.webp` to `coin-10.webp` are 160 px crops of the ten paintings, shown as the small chip in the cursor's pill over a bottle (`js/shop/cursor.js`).
- `assets/img/og-jalrang.jpg` (1200 × 630, JPEG, 19 October 2026) is the share card that every page's Open Graph tags name: J&J Co.'s own composition of the label "Edition One · 750 ml", JALRANG in Jaini, the line "Ten Indian art traditions, drawn all the way round.", the ten packshots on one Kajal line and the footer's first honesty line, set in the site's own fonts. No page shows it.
- `assets/svg/motif-*.svg` (ten traced motif drawings) are kept on disk from an earlier version and are not used by the page.
- Sound effects, off unless the visitor turns them on in the menu, are synthesised in the browser (Web Audio); there are no audio files.

## Honesty lines on the page

- Footer: "Concept project — designed by J&J Co. JALRANG is a fictional brand." and "The patterns, photographs and films on this page were made with AI for this concept, in the visual language of each tradition. A real edition would be drawn by artists of these communities."
- Footer, on every page (`index.html`, `shop.html`, `product.html`, `bag.html`, `account.html`, `checkout.html`): the two lines above.
- Out in the world (the landing, `index.html`, L5): "Illustrative clips made with AI for this concept. The people shown are not customers."
- The No. 01 product page (`product.html?n=01`), Gallery tab "Edition film": "Film made with AI for this concept".
- The product page's buy panel, the bag, the checkout summary and every empty bag or checkout: "A concept shop. Nothing is sold or charged here."
- The checkout's confirmation: "This is a concept shop." / "No order was placed and nothing was charged." The checkout's review: "There is no payment step: this shop is a concept."
- The Passport form (footer of the landing and the shop): "A concept: nothing you type here is sent or stored." The account form: "A concept: nothing you type here is sent, and only your first name is kept, for this visit, on this device." Signed in: "A concept: only your first name is kept, for this visit, on this device."
