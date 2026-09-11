# License Admin (React + Vite)

A React port of the single-file admin page, so config values live in a `.env`
file (git-ignored) instead of being hardcoded in the source.

## Setup

```bash
npm install
cp .env.example .env
# then fill in .env with your Firebase + EmailJS values
npm run dev
```

Build for deployment:

```bash
npm run build   # outputs static files to dist/
```

`dist/` can be hosted anywhere static (Firebase Hosting, Netlify, GitHub
Pages, etc.) — it's the same kind of static bundle the original single HTML
file was, just built from source.

## Read this before you deploy

Moving to React and `.env` keeps these values **out of your git repository**,
which is worth doing. It does **not** hide them from anyone who opens the
deployed site, because `npm run build` bakes the `.env` values straight into
the JavaScript bundle that ships to every visitor's browser — same as the
original HTML did. Anyone can open dev tools, view the bundle, and read them
back out. There is no client-side technique (React, Vite, obfuscation, etc.)
that changes this; a static site's JS is public by construction.

That's actually fine here, because both sets of keys are designed to be
public:

- **Firebase web config** (`apiKey`, `authDomain`, `projectId`) identifies
  *which* Firebase project to talk to. It is not a secret — Google's own docs
  say so. What actually protects your data is your **Firestore Security
  Rules** (who can read/write which collections) and **Firebase
  Authentication** (who can sign in at all). Double-check those rules rather
  than worrying about this value leaking.
- **EmailJS public key** is, by name and design, meant to be shipped to
  browsers — that's how EmailJS's client-side send works. What limits abuse
  is EmailJS's **domain allowlist** (Account → Security on emailjs.com) —
  make sure only your real deployed domain(s) are listed there, or anyone
  who copies your public key could send email through your account from
  their own page.

If you ever add a value that's a genuine secret (a private API key, a
service-account credential, anything with real write/delete power with no
rule enforcement behind it), it must **not** go in `VITE_`-prefixed env vars
or anywhere in this frontend — it needs a backend or serverless function
that holds the secret and the browser only talks to your endpoint.

## Project structure

- `src/firebase.js` — Firebase app/auth/db init, reading config from
  `import.meta.env`.
- `src/emailjs.js` — EmailJS wrapper, same env-var pattern.
- `src/utils.js` — pure helper functions (code generation, formatting,
  error messages) ported 1:1 from the original script.
- `src/App.jsx` — all UI: sign-in screen, issue codes, send to client,
  codes/licenses/devices tables.
- `src/App.css` — styling, ported from the original `<style>` block.
