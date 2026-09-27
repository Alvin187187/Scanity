# Scanity

Scanity helps a shopper decide whether a packaged food fits the allergies and health conditions saved on their account. A scan returns a personal safety result and a separate nutrition grade. The explanation describes that result. It does not change it.

This is an academic project under development. The repository is closed. See [Access](#access).

## What a shopper does

1. Create an account, confirm email, and sign in.
2. Save allergies and health conditions. Allergies cover peanut, tree nuts, milk, egg, wheat, soy, fish, shellfish, and sesame, plus any other allergy typed in. Conditions cover diabetes, hypertension, celiac disease, lactose intolerance, IBS / Crohn's, kidney disease, and heart disease, plus any other condition typed in.
3. Scan a product.
4. Read the result, save it, ask about it, or compare it with another saved scan.

## How a product is scanned

**Barcode.** The camera, a gallery photo, or a typed number can supply an 8, 12, 13, or 14 digit barcode (EAN-8, EAN-13, UPC-A, UPC-E, Code 128, or ITF). Scanity looks the product up through its API and uses Open Food Facts when that lookup does not return a product. Ingredient names are shown in English when Open Food Facts has an English name.

**Package photo.** The camera or a gallery photo can be aimed at the product name. If a gallery photo has no barcode, Scanity reads the package instead. The reader keeps the product name and leaves out ingredient lists, nutrition panels, and marketing lines. Scanity then asks whether that product is the one in the photo. Yes opens the result. No sends the shopper back to try again.

## What a result shows

- **Safe, Caution, or Avoid** for the saved allergies and conditions. Avoid means something on the label lines up with an allergy or condition the shopper asked Scanity to watch. Caution means an item still needs a closer look. Safe means this label did not match those saved items.
- A **safety score** for that personal result.
- A **Nutri-Score letter from A to E** for the product's nutrition quality. The letter does not use the shopper's allergies.
- Flagged and avoid ingredients, plus notes on sugar, E-numbers, and other known additives. Opening a chip explains that ingredient in plain language.
- A short explanation of what the result means. Gemini writes that explanation when it is available. A local summary is used when it is not. The model does not assign Safe, Caution, or Avoid.
- A chat on the same product, a save action, and a path into comparison.

Saved scans stay in scan history. A shopper can open a past scan, mark it as saved, and put two scans side by side.

Search looks up ingredients, allergens, additives, and other food terms in Scanity's knowledge notes.

## Account

Sign-up, email verification, sign-in, password reset, password change, profile, and account deletion are in the app. The health profile is stored with the account and used on later scans.

## How it is built

| Part | What it uses |
| --- | --- |
| App | React 19, TypeScript, Vite, Tailwind CSS |
| API | FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL on Supabase, with SQLite available for local development |
| Sign-in | Supabase Auth, with JWTs checked by the API |
| Barcode | ZXing in the browser, then the Scanity barcode API and Open Food Facts |
| Package name | Gemini vision on the API, with RapidOCR only if that read fails |
| Product facts | Open Food Facts |
| Explanations | Gemini when configured. The allergy rules still decide the verdict. |

## Access

This repository is closed. Contributors are not allowed, and the repository and its files are not available to take. Only the owners have the right to access and change it. See the [license](LICENSE), [CONTRIBUTING.md](CONTRIBUTING.md), the [Code of Conduct](CODE_OF_CONDUCT.md), and the [security policy](SECURITY.md).
