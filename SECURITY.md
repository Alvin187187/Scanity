# Security policy

## Supported versions

This is an academic project under active development. Only the latest `main` branch is supported.

## How to report a vulnerability

Do **not** open a public GitHub issue for secrets, leaked keys, or security bugs.

Contact the repository owner ([@Alvin187187](https://github.com/Alvin187187)) in a private GitHub message or the team group chat. Include:

- What is exposed (for example a JWT secret in a commit)
- Where you found it (PR number or file path — not the secret itself)
- Whether you already rotated the credential

## Secrets

Never commit:

- `BackEnd/.env`
- Supabase service role keys, JWT secrets, or database passwords
- Real project URLs and keys in `.env.example` (use placeholders)

If a secret lands in git, rotate it in Supabase (or the other provider) even after the file is edited. History still contains the old value.

## What happens next

The owner will acknowledge the report, rotate or revoke credentials if needed, and tell the team what to put in their local `.env`.
