# mimi-os site

[![CI](https://github.com/Mimi-agent-os/Mimi-agent-os.github.io/actions/workflows/ci.yml/badge.svg)](https://github.com/Mimi-agent-os/Mimi-agent-os.github.io/actions/workflows/ci.yml)

The public website of mimi-os, at [mimi-agent-os.github.io](https://mimi-agent-os.github.io/): a landing page and a wiki.
The wiki shows the README and docs of each mimi-os repo, read from GitHub when a page opens.
GitHub Pages serves this repo's files as they are, from the root of `main`.

Any static server serves the site; the CI link check runs on Node.js 24 or newer.

```
index.html             the landing, four questions in order: what it is (with the app's chat and approval as an HTML demo),
                       what for and why mimi-os (text beside pictures of the app) and how it works (the encrypted
                       link between the app and the gateway, then three steps into the wiki); code samples live in the wiki
landing.css            the app's colors and type, and the landing's layout and motion
landing.js             scroll entrances, the chat demo and the encryption demo; reduced motion shows the final state
wiki/index.html        the wiki's shell: sidebar, home page, page area
wiki/repos.js          the list of repos the wiki shows: org, branch and one line per repo
wiki/wiki.js           routing, fetching, caching and rendering
wiki/wiki.css          the app's colors and type, and the wiki's layout
wiki/vendor/           marked 18.0.14 (lib/marked.esm.js) and DOMPurify 3.4.16 (dist/purify.min.js), as published on npm
assets/, favicon*      the mascot and the app's icons, shared by both
.github/               CI: check-links.mjs checks that every local link, asset, import, anchor and wiki route resolves
```

The landing loads its own files plus Google Fonts and is cookie-free. Its copy follows the repos' READMEs and
changes with them. wren, loom and scout on the landing are fictional example agents.

## The wiki

The wiki has a section for each core repo: the repo's `README.md` is the section's front page, and every markdown
file under its `docs/` folder (nested folders included) is a page.

### How live reading works

The wiki is deployed once. Everything else is read from GitHub in the browser when a page opens, so a
push to any repo's README or `docs/` shows up in the wiki without touching this repo.

- Content comes from `raw.githubusercontent.com/Mimi-agent-os/<repo>/main/<path>`. It allows any origin,
  and GitHub caches it for about 5 minutes, so a push can take that long to appear.
- The list of a repo's pages takes one REST call when its section first opens in a visit:
  `GET api.github.com/repos/Mimi-agent-os/<repo>/git/trees/main?recursive=1`. GitHub allows 60
  unauthenticated calls an hour per IP. The listing is kept in localStorage with its ETag, and the next visit
  revalidates it with `If-None-Match`; an unchanged tree answers 304.
- When the API call fails (a 403 or 429 rate limit, or a network error), the wiki uses the last saved
  listing. Before any listing is saved, the section shows its README and the page asked for, with a short
  note that gives the reason.
- Page titles are each page's first `#` heading, else the file name; pages are ordered by path.
- Markdown is rendered with marked (GitHub-flavored) and sanitized with DOMPurify. Links to a README or
  a `docs/` page of a repo listed in `wiki/repos.js` stay in the wiki, other relative links open the file on GitHub,
  and relative images load from raw.githubusercontent.com.

Routes are hashes after `/wiki/`, so `wiki/index.html` serves every route: `#/sdk` is the sdk README,
`#/sdk/docs/<page>.md` a page in its docs/ folder, and `#/sdk/docs/<page>.md#<heading>` a heading on it.

### Adding a repo

Add one line to `repos` in `wiki/repos.js`, with the line the wiki's home page shows for it:

```js
{ name: "newrepo", what: "what it is, in a few words" },
```

The repo must be public, and its default branch must be `main`.

## Preview locally

Any static server at the repo's root works. The wiki's pages come from GitHub, so they show what is pushed
to `main`.

```sh
python3 -m http.server 8000    # then open http://localhost:8000/ and http://localhost:8000/wiki/
node .github/check-links.mjs   # what CI runs
```

To update a vendored library, download the exact version's file from
`https://cdn.jsdelivr.net/npm/<package>@<version>/<file>` into `wiki/vendor/`, keep its license header, and
change the version here.

Licensed under Apache-2.0, see LICENSE.
