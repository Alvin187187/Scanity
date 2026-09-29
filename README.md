# Scanity

Scanity is a packaged-food checker for a shopper who has already saved allergies and health conditions. A scan returns two separate numbers:

- a **personal safety result** (Safe / Caution / Avoid, plus a 0–100 safety score)
- a **Nutri-Score letter** (A–E) about nutrition quality

Those two answers do not override each other. A product can be Nutri-Score A and still Avoid for someone with a milk allergy. Gemini, when it is available, only explains the rule result. It does not assign Safe, Caution, Avoid, or the score.

This is an academic project under development. It is **not** a medical device, a diagnosis, or a substitute for the printed package or a clinician. The repository is closed. See [Access](#access).

Live app: [https://scanity-eta.vercel.app](https://scanity-eta.vercel.app)  
Live API: [https://scanity-api.onrender.com](https://scanity-api.onrender.com)

---

## What a shopper does

1. Create an account, confirm email, and sign in.
2. Save allergies and health conditions. Allergies cover peanut, tree nuts, milk, egg, wheat, soy, fish, shellfish, and sesame, plus any other allergy typed in. Conditions cover diabetes, hypertension, celiac disease, lactose intolerance, IBS / Crohn's, kidney disease, and heart disease, plus any other condition typed in.
3. Scan a product (barcode or package name).
4. Confirm the product when Scanity shows a name from a photo.
5. Read the result, open ingredient chips, save the scan, ask about it, or compare it with another saved scan.

---

## Repository layout

```
Scanity/
  FrontEnd/          React app (screens, camera, API clients)
    src/App.tsx      All shopper screens in one module
    src/api/         HTTP clients: auth, scan, ocr, profile, history, AI
  BackEnd/           FastAPI service
    main.py          App, CORS, router mount, DB health check
    app/routers/     HTTP routes
    app/services/    Lookup, OCR, scoring glue, explanations
    app/models/      SQLAlchemy tables (schema.py)
    app/dependencies/auth.py   JWT check
    migrations/      Alembic
  ai/                Rule engines, Gemini client, prompts, RAG
  seed/              CSV knowledge + loaders (in-memory, not the app DB)
  docs/              Database responsibility notes
```

The UI is one large React module (`FrontEnd/src/App.tsx`) with a screen union (`splash`, `login`, `register`, allergies, health, dashboard, barcode, package photo, result, history, compare, account). Navigation is an in-memory `go(screen)` function, not a URL router. API calls live in `FrontEnd/src/api/`.

---

## Runtime architecture

```
Phone / browser (Vercel, React + Vite)
        |  HTTPS  Bearer JWT  /api/v1
        v
Scanity API (Render, FastAPI)
        |-- PostgreSQL (Supabase or local)   accounts, profiles, product cache
        |-- Supabase Auth JWKS               token verification
        |-- ai/allergy_engine.py             allergen flags
        |-- ai/condition_engine.py           diet + nutrition flags, safety score
        |-- seed/*.csv                       loaded into process memory
        |-- Gemini (Google AI Studio or OpenRouter)
        |-- RapidOCR (PP-OCRv5)              package-name fallback
        |-- optional Ollama                  explanation fallback
        v
Open Food Facts                            name, ingredients, nutrients, official Nutri-Score
```

### App (Vercel)

The shopper UI is React 19 + TypeScript + Vite, deployed on **Vercel** (`scanity-eta.vercel.app`). It holds the camera, ZXing barcode decoder, health-profile screens, results, history, and compare. Production calls `https://scanity-api.onrender.com/api/v1`. Local `vite` development calls `http://localhost:8000/api/v1` unless `VITE_API_BASE_URL` says otherwise. Preview deploys on `*.vercel.app` are allowed by CORS.

The browser does **not** hold the Gemini key. Package vision and explanations run on the API. If the API is asleep or unreachable, the app can still:

- look a barcode up on Open Food Facts
- read a package name on the device with Tesseract.js and search Open Food Facts by that title
- apply a thinner copy of the allergy bands (`localAllergyAnalysis` in `FrontEnd/src/api/scan.ts`) so chips still appear

Scan history on the phone lives in `localStorage` (`scanityScanHistory`, active result under `scanityProductResult`). The `scan_histories` table exists in the schema and is cleared on account deletion, but the shopper history the UI reopens is the browser copy.

### API (Render)

The backend is FastAPI, deployed on **Render** (`scanity-api.onrender.com`). Render can spin the free instance down when idle. The first request after sleep is slow. Login calls `wakeApi()` against `/` first. Barcode and package flows keep an Open Food Facts path so a cold API does not end as “Unable to scan.”

Startup (`BackEnd/main.py` lifespan) runs `SELECT 1`. If that fails, the process refuses to serve. Routers are mounted under `/api/v1`. `SQLAlchemyError` is mapped to a generic database error so raw SQL does not leak to the phone.

### Database and sign-in (Supabase)

Supabase Auth owns registration, email confirmation, login, refresh, logout, password reset, and password change. The API talks to Supabase Auth with the project URL and key (`BackEnd/app/services/auth_service.py`). Passwords are not stored in `users`.

Every protected route uses `get_current_user` (`BackEnd/app/dependencies/auth.py`):

1. Read the `Authorization: Bearer` token.
2. Fetch the signing key from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
3. Decode with algorithm **ES256** and audience `authenticated`.
4. Return `user_id` (`sub`) and `email`.

The same UUID is the primary key of `users`. `GET/PUT /users/me` creates that row on first profile save if it is missing, then writes `health_profiles`, `user_allergies`, and `user_health_conditions`. Canonical allergy and condition names are inserted into `allergy_types` and `health_condition_types` on demand. Free-text extras are stored under the keys `__other_allergy__` and `__other_condition__`.

**SQLite** (`scanity.db`) is only a local stand-in for those app tables. It is **not** the allergen encyclopedia. Matching uses CSV files loaded in memory.

---

## HTTP surface

All routes below are prefixed with `/api/v1` except the two health routes.

| Method | Path | Auth | What it does |
| --- | --- | --- | --- |
| GET | `/` | no | Wake / welcome |
| GET | `/health/db` | no | `SELECT 1` |
| POST | `/register` `/login` `/refresh` `/logout` | mixed | Supabase Auth proxy |
| POST | `/password-reset/request` `/password-reset/confirm` `/password/change` | mixed | Password flows |
| DELETE | `/account` | yes | Delete Auth user and local rows |
| GET, PUT | `/users/me` | yes | Read or replace allergies and conditions |
| POST | `/scan/barcode` | yes | Cache or Open Food Facts, then full analysis |
| GET | `/scan/search?q=` | yes | Open Food Facts name search (min 3 characters) |
| POST | `/scan/ocr` | yes | Analyze already extracted ingredient text |
| POST | `/scan/ocr/image` | yes | Photo → product name (Gemini, then RapidOCR). Does not score yet |
| POST | `/scan/ai/product-title` | yes | Clean OCR lines into a search title |
| POST | `/scan/ai/chat` | yes | Coach reply about the current product |
| POST | `/scan/ai/safety-report` | yes | Longer written report from the same flags |
| POST | `/scan/ai/ingredient-explain` | yes | Chip copy: CSV first, Gemini if the row is missing |
| GET | `/knowledge/search?q=` | yes | Search `ingredient_knowledge.csv` |

`POST /scan/barcode` body is `{ barcode, user_allergies, user_conditions }`. The profile is sent by the client on each scan. The server does not re-read the database profile inside the scan handler. Invalid barcodes (not 8–14 digits) return **422**. Unknown products return **404** with `suggest_ocr: true`. Open Food Facts failures return **503**.

---

## Where each kind of data lives

| Data | Source | Where it lives |
| --- | --- | --- |
| Product name, brand, barcode, ingredients, nutrients, official Nutri-Score | [Open Food Facts](https://world.openfoodfacts.org) | Fetched at scan time. A successful lookup is also written to `products` / `ingredients` when the write succeeds |
| Allergen names, aliases, categories | `seed/seed_allergens.csv` via `seed/allergen_seed_loader.py` | Process memory. Cached after first `check_allergies` |
| Additives, E-numbers, sugars, salts, chip copy, `affects_allergens` / `affects_diets` | `seed/ingredient_knowledge.csv` via `seed/ingredient_knowledge_loader.py` | Process memory, inverted index |
| Accounts, health profiles, cached products | PostgreSQL (Supabase or local) | App tables in `BackEnd/app/models/schema.py` |
| Package name from a photo | Gemini Vision, else RapidOCR, else on-device Tesseract | Used only to search Open Food Facts |
| Explanation, chat, chip text when the CSV misses | Gemini, else Ollama, else a template | Describes flags that already exist |
| Shopper history the UI shows | Browser `localStorage` | Separate from `scan_histories` |

Changing `seed/seed_allergens.csv` or `seed/ingredient_knowledge.csv` changes what the engine knows. Changing Postgres does not.

Tables (UUID keys so `users.user_id` matches the Supabase Auth user):

- `users` — `user_id`, `full_name`, `email`
- `health_profiles` — one row per user
- `allergy_types`, `user_allergies` (with `severity`)
- `health_condition_types`, `user_health_conditions`
- `products` — barcode unique, name, brand, category, raw ingredient text
- `ingredients`, `product_ingredients`
- `nutrition_rules`, `product_nutrition_flags`
- `scan_histories` — present in the schema; the live history UI uses `localStorage`

Brand and category columns are short (`String(25)`). The barcode mapper clips values to those limits before insert. If the cache read or write throws, the scan still returns the live Open Food Facts payload (`_safe_get_local_product` / `_safe_store_product` in `barcode_lookup_service.py`). A cache hit that is missing nutrition or an image is refreshed from Open Food Facts and merged.

---

## Barcode scan, step by step

1. **Browser.** The camera, a gallery photo, or a typed number supplies an 8, 12, 13, or 14 digit code (EAN-8, EAN-13, UPC-A, UPC-E, Code 128, or ITF). ZXing (`@zxing/browser`) decodes the image. `lookupBarcodeProduct` in `FrontEnd/src/api/scan.ts` starts an Open Food Facts fetch immediately and, if a session token exists, also `POST /scan/barcode` with a 10 second timeout.
2. **API cache.** `get_product_by_barcode` checks `products.barcode`. A complete cache row can return without another catalog call. A row missing nutrition or `image_url` is enriched from Open Food Facts.
3. **Open Food Facts.** `fetch_product_by_barcode` loads the product. `prefer_english_ingredients_text` prefers an English ingredient list when the catalog has one. Nutriments are mapped to per-100 g fields: energy kJ (kcal × 4.184 when only kcal exists), sugars, saturated fat, sodium in mg, fiber, protein, plus `nutriscore_grade` when the letter is `a`–`e`.
4. **Ingredient list.** Named ingredient objects are used first. If that list is empty, `clean_ingredient_text` splits `ingredients_raw_text`.
5. **Analysis.** `analyze_ingredients` runs the pipeline in the next section. The response is product fields plus `allergy_flags`, `allergy_matches`, `label_insights`, `verdict`, `safety_score`, `nutri_score_grade`, `explanation`, and `ai_source`.
6. **Client fallback.** 401, 404, 5xx, timeout, or an empty product body falls through to the Open Food Facts promise. That path still builds nutrition and runs `localAllergyAnalysis` (substring allergy and a short diabetes / lactose list). It does not load the CSV seed.

---

## Package-photo scan, step by step

The camera (or a gallery photo with no barcode) is aimed at the **product name**, not the nutrition panel. Ingredient lists used for scoring come from Open Food Facts after the product is identified.

1. **Upload.** `readPackageTitle` (`FrontEnd/src/api/ocr.ts`) posts the image to `POST /scan/ocr/image` and starts Tesseract.js in parallel. The API attempt is aborted after 12 seconds.
2. **API read.** `extract_text_from_image` rejects empty files, files over 8 MB, and types other than JPEG, PNG, WebP, or BMP. Pillow downscales the long edge to 1024 px and re-encodes JPEG.
3. **Gemini Vision first.** `title_from_package_photo` sends the image to Gemini with temperature 0 and asks for one product-name line. Answers that look like ingredients, slogans, `UNKNOWN`, or more than eight words are discarded.
4. **RapidOCR second.** If Vision returns nothing, PP-OCRv5 (ONNX, English recognizer when it loads, otherwise multilingual) returns lines with confidence at least 0.45. The call is time-capped so a cold model load cannot hang the request. The route returns that text as `product_name` and an empty ingredient list. Scoring waits until the shopper confirms a catalog match.
5. **On-device third.** If the API has no title, Tesseract.js (`eng`, single block) reads the photo. `candidateProductTitles` drops nutrition headings, weights, and marketing sentences, then ranks remaining lines (generic one-word titles such as “Water” rank last).
6. **Search.** `lookupProductByPackageName` tries up to five title guesses. Each guess calls `GET /scan/search`, then the public Open Food Facts search if the API returns nothing. Hits are ranked by token overlap with the query (brand and exact-name bonuses). The best barcode is passed back through `lookupBarcodeProduct`, which is the full analysis path above.
7. **Confirm.** The UI asks whether that product is the one in the photo. Yes opens the result. No returns the shopper to try again.

`POST /scan/ocr` is the text path: already extracted or edited ingredient lines go through `process_ocr_result` and then the same `analyze_ingredients` pipeline, without a barcode.

---

## How a result is decided

`analyze_ingredients` (`BackEnd/app/services/scan_analysis_service.py`) is the only scoring entry used by barcode and OCR text. Order:

1. **`check_allergies`** (`ai/allergy_engine.py`) — one flag per ingredient: `avoid`, `caution`, or `safe`.
2. **`enrich_flag_with_knowledge`** — attach chip fields from `ingredient_knowledge.csv`.
3. **`apply_condition_rules`** (`ai/condition_engine.py`) — raise severity for saved conditions, and append nutrition-panel flags (sugars, sodium, saturated fat).
4. **Enrich again** so new flags pick up knowledge rows.
5. **`overall_verdict`** — Avoid if any avoid, else Caution if any caution or if the flag list is empty, else Safe.
6. **`compute_safety_score`** — delegates to `compute_personalized_score`.
7. **`nutri_score_grade`** — official letter if Open Food Facts sent one, otherwise the local estimate.
8. **`explain_scan`** — Gemini (prompt grounded with RAG), else Ollama, else a fixed template. The verdict string passed in is already decided.
9. **`_label_insights`** — up to 40 chips. Flagged names come first. A name with no CSV row is still returned with `needs_ai: true` so the chip can call `/scan/ai/ingredient-explain`.

Gemini never votes on the verdict. An unknown ingredient is Caution. An empty ingredient list is Caution (score 58), not Safe.

---

## Allergy engine

`check_allergies(user_allergies, ingredients)` loads `seed/seed_allergens.csv` once and builds two maps: normalized ingredient name → row, and alias → row. Keys are sorted longest-first.

**Profile names.** Free text such as “dairy” or “Tree Nuts” is mapped through `CATEGORY_SYNONYMS` to seed slugs (`milk`, `tree_nuts`, …). A slug that is already canonical is left as-is.

**Per ingredient, in order:**

1. Non-strings become Caution.
2. Inert carriers (plain water and similar short “water” phrases, excluding things like rose water) are Safe.
3. Benign pantry items (sugar, salt, and similar) are Safe at this stage. Condition rules can still raise them later.
4. Match the seed:
   - exact name
   - exact alias, unless the alias row is a long recipe phrase that does not actually contain the query
   - word-boundary “contains” on names of length ≥ 4, skipping generic tokens (`flavor`, `oil`, `extract`, …)
   - word-boundary “contains” on aliases of length ≥ 5; single-token aliases shorter than 10 characters are exact-only, so “calcium” does not fire inside unrelated recipes
5. If the seed misses, look up `ingredient_knowledge.csv`. If that row’s `affects_allergens` hits the profile, status is **Avoid**. If the row exists but does not hit the profile, status is **Safe** (the chip still explains it). If nothing matches, status is **Caution**.

A seed hit whose `allergen_category` or `affects_allergens` intersects the profile is **Avoid**. A seed hit for an allergen the shopper did not save is **Safe**, with the category recorded so the UI can say what it was.

`overall_verdict` precedence is avoid, then caution, then safe. An empty flag list is caution: there was nothing to confirm.

---

## Condition engine

`apply_condition_rules` runs after allergy flags. It only **raises** severity (`safe` < `caution` < `avoid`). It does not clear an Avoid.

Saved names are normalized: “lactose intolerance” → `lactose`, “high blood pressure” → `hypertension`, “celiac disease” → `celiac`, Crohn’s / IBS variants → `ibs`.

Two ways a condition attaches to an ingredient:

1. **Feature flags.** If the ingredient’s `affects_diets` includes an active condition, severity becomes Avoid for lactose and celiac, Caution for diabetes, hypertension, heart, kidney, and IBS.
2. **Marker words** in `CONDITION_MARKERS`, used when feature flags did not already cover that diet. Longer markers win (`high fructose corn syrup` before `sugar`). Examples: diabetes watches sugar, syrup, maltodextrin, honey; lactose watches milk, whey, casein, cream; celiac watches wheat, barley, rye, malt, gluten; hypertension watches salt, MSG, soy sauce; kidney watches salt, phosphate, potassium; heart watches salt, palm oil, hydrogenated fat; IBS watches inulin, polyols, onion, garlic, wheat.

**Nutrition panel** (numbers are per 100 g from Open Food Facts):

| Profile | Input | Threshold | Flag |
| --- | --- | --- | --- |
| diabetes | sugars g | ≥ 22, or ≥ 8 | Caution, “Sugars … g/100g” |
| hypertension | sodium mg | ≥ 600, or ≥ 300 | Caution, “Sodium … mg/100g” |
| heart | saturated fat g | ≥ 5 | Caution, “Sat. fat … g/100g” |

These are extra flag rows. They feed the same verdict and score as ingredient rows.

---

## Safety score

The safety score is **personal**. It uses the shopper’s saved allergies and conditions plus this product’s ingredients (and sugars / sodium when those nutrients exist). It is **not** Nutri-Score. Implementation: `compute_personalized_score` in `ai/condition_engine.py`.

| Score | Band shown |
| --- | --- |
| 70–100 | Safe |
| 40–69 | Caution / Flagged |
| 0–39 | Avoid |

**Avoid (0–39).** Any ingredient marked avoid (saved allergy, lactose restriction, celiac / gluten, and similar hard hits) puts the product in this band:

`max(0, 26 − 7 × (number of avoid items − 1))`

One avoid item scores **26**. Each extra avoid item drops the score by 7, not below 0.

**Caution only (40–69).** Start at 100, then subtract:

- 12 for a caution tied to a saved condition
- 14 for a “sugars …” nutrition line
- 12 for a “sodium …” nutrition line
- 3 for an unmatched / unknown ingredient

Diabetes also subtracts from sugars per 100 g: 22 if ≥ 22 g, 14 if ≥ 12 g, 8 if ≥ 5 g. Hypertension subtracts from sodium: 18 if ≥ 600 mg, 10 if ≥ 300 mg. If any caution remains, the score is **capped at 66**, so the UI cannot say Safe while something is still flagged.

**Empty or incomplete ingredient list.** Score **58** (Caution). Extra sugar rules for diabetes can pull that to **48**.

**No flags.** Score **100**, unless nutrition rules for a saved condition still apply.

Overall product verdict is **Avoid > Caution > Safe**. Chips follow the same flags: red Avoid, gold Flagged, info chips from the ingredient-knowledge file.

When the API is down, the browser uses a **simpler copy** of these bands (substring match, dairy words, sugar words, the same avoid formula, and a smaller caution penalty). The full formula lives only on the server.

---

## Nutri-Score

Nutri-Score is a **nutrition-quality letter from A (better) to E (poorer)**. Scanity does **not** mix it with allergies. Implementation: `BackEnd/app/services/nutriscore_service.py`. The browser repeats the same estimate in `estimateNutriScoreGrade` when it is scoring an Open Food Facts payload itself.

**Preferred source.** If Open Food Facts already published an official Nutri-Score for that product, Scanity shows that letter and skips the estimate.

**Fallback estimate.** If there is no official letter, Scanity estimates A–E from per-100 g values when at least three of these are present: energy, sugars, saturated fat, sodium, fiber, protein. Energy may arrive as kJ or kcal (kcal × 4.184). Sodium values ≤ 5 are treated as grams and multiplied by 1000.

The estimate adds points for energy, sugars, saturated fat, and sodium, and subtracts points for fiber and protein, then maps the total:

| Points | Letter |
| --- | --- |
| ≤ −1 | A |
| ≤ 2 | B |
| ≤ 10 | C |
| ≤ 18 | D |
| higher | E |

Point steps (each nutrient, 0 through 4 unfavorable, or 0 through 3 favorable):

| Nutrient | 0 | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- | --- |
| Energy (kJ) | < 335 | < 670 | < 1005 | < 1340 | ≥ 1340 |
| Sugars (g) | < 4.5 | < 9 | < 13.5 | < 18 | ≥ 18 |
| Saturated fat (g) | < 1 | < 2 | < 3 | < 4 | ≥ 4 |
| Sodium (mg) | < 90 | < 180 | < 270 | < 360 | ≥ 360 |
| Fiber (g), subtracted | < 0.9 | < 1.9 | < 2.8 | ≥ 2.8 | — |
| Protein (g), subtracted | < 1.6 | < 3.2 | < 4.8 | ≥ 4.8 | — |

This fallback is a **short approximation** used when Open Food Facts has no letter. It is not the full official Nutri-Score algorithm (which also uses fruit, vegetable, nut, and other category rules). Treat the letter as a nutrition hint, not a medical grade.

A product can be letter A and still Avoid for the shopper. A product can be letter E and still Safe for their saved allergies if nothing on the label matched.

---

## Knowledge files and retrieval

**Allergen seed** (`seed/seed_allergens.csv`). One row per ingredient name, pipe-separated aliases, `allergen_category`, optional `affects_allergens` and `affects_diets`, a shopper explanation, a source note, and a verified flag. Rows name their sources in the CSV, including Open Food Facts exports, an `allergies_10k.csv` set, EFSA/WHO-style additive notes, and rows still marked **not yet dataset-verified**. Unverified aliases exist so odd label wording can still match; they are not a clinical gold standard.

**Ingredient knowledge** (`seed/ingredient_knowledge.csv`). Chip copy: what it is, where it shows up, possible effects, allergen and diet flags, aliases. Lookup is exact, then E-number, then a contains-scan of longer keys. Whole-recipe lines (commas, parentheses, or very long names) do not donate feature flags to other ingredients. `search_ingredient_knowledge` backs `GET /knowledge/search`.

**RAG** (`ai/rag_layer.py`). Explanations and chat can be grounded with snippets, not with a second verdict.

1. A local corpus is built from both CSVs (cached).
2. `retrieve_local` scores query tokens against that corpus.
3. If `RAGFLOW_API_URL`, `RAGFLOW_API_KEY`, and `RAGFLOW_CHAT_ID` are set, those snippets can be supplemented from a hosted RAGFlow OpenAPI. The repo does not run the RAGFlow Docker stack itself.
4. `enrich_prompt_with_rag` pastes the snippets into the Gemini prompt.

---

## Explanations, chat, and chips

`ai/gemini_client.py` never raises. It returns model text or a fixed fallback sentence. The key is read from the process environment or `BackEnd/.env`.

- Keys starting with `AIza` call Google AI Studio (`generativelanguage.googleapis.com`).
- Keys starting with `sk-or-` call OpenRouter with a `google/gemini-*` model.
- Default model name is `gemini-3.1-flash-lite` (`GEMINI_MODEL`).
- `AI_PROVIDER` can force `google` or `openrouter`.

**Scan paragraph.** `explain_scan` builds a prompt from the flags and the letter (`ai/prompt.py`), adds RAG snippets, and calls Gemini. If that returns the fallback, it tries Ollama (`OLLAMA_HOST`, default model `phi4-mini`, 8 second timeout). If that is empty, `_template_explanation` writes a short Safe / Flagged / Avoid paragraph from the same flags and reminds the shopper that Nutri-Score does not change the allergy result. Markdown asterisks are stripped before the text is stored.

**Chat and safety report.** `POST /scan/ai/chat` and `POST /scan/ai/safety-report` send the product, the profile, and the already computed verdict into `ai_assistant_service.py`. The model is instructed not to overturn Safe / Caution / Avoid. Short questions are trimmed; “why / explain / compare” questions are allowed a few more lines.

**Ingredient sheet.** Opening a chip uses the insight payload when `needs_ai` is false. Otherwise `explain_ingredient` returns the CSV row immediately. If the CSV misses, it calls Gemini with a short JSON schema (7 second chip timeout) and local RAG context. The model fills `what_it_is` and `possible_effects`. It does not change the chip’s avoid / caution color; that color came from the rule engines.

---

## Result screen, history, and compare

`ProductResultScreen` reads the active scan from `localStorage`. It shows the band from the score, the Nutri-Score letter, Avoid and Flagged chips, “On this label” notes, the explanation, and nutrition rows. “Explain this” and the coach composer call `/scan/ai/chat` with the stored product and the saved profile. Compare loads two stored scans and lines up verdict, letter, and flagged names. Nothing in compare re-runs the engines.

History filters (all vs saved) are also local (`scanityHistoryFilter`).

---

## Technical safety

- **Verdicts are deterministic.** `ai/allergy_engine.py` and `ai/condition_engine.py` decide flags. Gemini cannot change Safe / Caution / Avoid.
- **Unknown is not Safe.** An ingredient that does not match the seed, the pantry list, or ingredient knowledge is Caution.
- **Incomplete labels stay Caution.** An empty ingredient list scores in the Caution band.
- **Severity only moves up.** Condition rules do not downgrade an Avoid to Safe.
- **Gemini keys stay on the server.** The Vercel app does not embed `GEMINI_API_KEY`.
- **Auth.** Passwords and sessions go through Supabase. Scan, profile, OCR, and AI routes require a bearer token checked against Supabase JWKS (ES256).
- **CORS.** Listed origins plus `https://*.vercel.app` may call the API from a browser. Credentials are allowed.
- **Secrets.** Render, Supabase, and local `.env` hold keys. Those files are not for the public README and must not be committed.
- **Fallbacks.** If Render is cold, Open Food Facts and on-device reading still try to produce a result. Database cache failures do not hide a live catalog hit.
- **No remote code from the model.** The model returns short text (a product name, an explanation, or chip JSON), not executable instructions.
- **Image limits.** Package uploads over 8 MB are rejected. OCR lines under 0.45 confidence are dropped.

This is still a student system: seed rows are mixed in quality, Open Food Facts can be incomplete or wrong, OCR can misread a name, the on-device allergy copy is thinner than the server engines, and the Nutri-Score fallback is approximate.

---

## Tech stack

| Layer | What Scanity uses |
| --- | --- |
| App hosting | **Vercel** — `scanity-eta.vercel.app` |
| API hosting | **Render** — `scanity-api.onrender.com` |
| App | React 19, TypeScript, Vite 8, Tailwind CSS v4 |
| Barcode in the browser | ZXing (`@zxing/browser`) |
| On-device package text (API down) | Tesseract.js |
| API | Python, FastAPI, SQLAlchemy, Alembic, httpx, Pillow |
| Database | PostgreSQL on **Supabase**; SQLite for local FastAPI only |
| Sign-in | Supabase Auth; API checks JWTs (ES256 / JWKS) |
| Product catalog | Open Food Facts (`world.openfoodfacts.org`, search host) |
| Package-name vision | Gemini on the API (`GEMINI_API_KEY` on Render) |
| Local OCR fallback on the API | RapidOCR (PP-OCRv5, ONNX Runtime) |
| Explanations and chip copy | Gemini when configured; otherwise Ollama or local templates |
| Allergy / condition rules | `ai/allergy_engine.py`, `ai/condition_engine.py`, CSV seeds in `seed/` |
| Optional retrieval | Local CSV corpus; optional RAGFlow HTTP API |
| Optional local LLM | Ollama (explanations only, not verdicts) |

Gemini on Render needs `GEMINI_API_KEY` in the Render environment (Google AI Studio `AIza…` or OpenRouter `sk-or-…`). A key that only exists on a laptop does not apply to the live app.

---

## Medical and safety claims (limits)

Scanity is a **decision aid for a school project**, not medical care.

- It does **not** diagnose allergy, intolerance, diabetes, celiac disease, or any other condition.
- It does **not** say a food is safe to eat in the clinical sense. “Safe” only means: *this label, as Scanity parsed it, did not match the allergies and conditions saved on this account.*
- It does **not** replace the physical ingredient list, “may contain” / “produced in a facility” lines, or a doctor, dietitian, or allergist.
- Cross-contact, recipe changes, regional SKUs, and missing Open Food Facts data are outside what the engine can see.
- Unverified seed rows and OCR mistakes can both miss a trigger or flag the wrong product.
- Nutri-Score is about nutrient density, not allergen safety, and the local estimate is not an official front-of-pack claim.
- Gemini text can be incomplete or slightly wrong; the chips and score are the source of truth.

If a shopper has a serious allergy or a prescribed diet, they should treat Scanity as a second look at a label they still read themselves, not as clearance to eat.

---

## Account

Sign-up, email verification, sign-in, password reset, password change, profile, and account deletion are in the app. The health profile is stored with the account (`PUT /users/me`) and sent again on later scans as `user_allergies` and `user_conditions`.

---

## Access

This repository is closed. Contributors are not allowed, and the repository and its files are not available to take. Only the owners have the right to access and change it. See the [license](LICENSE), [CONTRIBUTING.md](CONTRIBUTING.md), the [Code of Conduct](CODE_OF_CONDUCT.md), and the [security policy](SECURITY.md).
