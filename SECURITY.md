# Security policy

This repository is closed. Only the owners may access it.

## Outside access

- Do not clone, fork, download, or copy the repository or its files to look for problems.
- Do not open a public issue, pull request, or discussion about this project.
- Only the repository owners have the right to hold and inspect these files.

## Owners

If you already have owner access and you find a security problem, tell [@Alvin187187](https://github.com/Alvin187187) in a private GitHub message. Do not open a public issue, and do not paste secrets into chat.

Include what is exposed, where you found it, and whether the credential was already rotated. Leave the secret itself out of the message.

Owners do not commit `BackEnd/.env`, service-role keys, JWT secrets, database passwords, or real keys in `.env.example`. If a secret lands in git, rotate it. History still contains the old value.
