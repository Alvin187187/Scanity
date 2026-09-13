# Contributing to Scanity

Scanity is an academic team project. `main` is the integration branch. Open a pull request for every change.

## Before you start

1. Pull the latest `main`.
2. Create a branch from `main` (not from `dev` or an old feature branch).
3. Keep the PR to **one job** (auth, or database extras, or frontend — not all three).

## Secrets and local config

- Real keys, passwords, and database URLs belong only in `BackEnd/.env` on your machine.
- `BackEnd/.env` is gitignored. **Never commit it.**
- `BackEnd/.env.example` is the shared template. Use **placeholders only** (`YOUR_PROJECT`, `your_supabase_jwt_secret`).
- After you copy `.env.example` to `.env`, fill in your own values. Do not paste those values back into the example file.

If a secret was committed by mistake, tell the repo owner privately, rotate it in the dashboard, and do not post the value in the PR.

## Pull request rules

- Target **`main`**.
- If `main` moved after you branched, rebase (or merge `main` into your branch) before asking for review.
- Do not overwrite shared files such as `BackEnd/main.py` with an old copy. Add only your lines (for example, one new router).
- Add new Python packages to `BackEnd/requirements.txt`.
- Do not commit `__pycache__/`, `*.pyc`, `node_modules/`, `*.db`, or `desktop.ini`.
- Wait for review. Do not merge your own PR unless the owner asks you to.

## How we review

Reviewers check:

1. What is this PR for (one sentence)?
2. Secrets or junk files?
3. Does it break current `main` (especially `main.py`, `config.py`, `session.py`)?
4. Can a teammate run it after merge (example env + install instructions)?

## After merge

- Pull `main`.
- Delete your feature branch if GitHub still shows it.
- Update your local `.env` if new placeholder keys were added to `.env.example`.
