// The wiki: each repo's README.md and docs/**/*.md, read from GitHub in the browser and rendered.
import { marked } from "./vendor/marked.esm.js";
import { branch, org, repos } from "./repos.js";

const DOMPurify = window.DOMPurify;
const RAW = `https://raw.githubusercontent.com/${org}`;
const GITHUB = `https://github.com/${org}`;
const API = `https://api.github.com/repos/${org}`;
const STORE = "mimi-wiki:docs:";
const SANITIZE = {
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select"],
    FORBID_ATTR: ["style", "class", "id"],
};

const nav = document.getElementById("wiki-nav");
const main = document.getElementById("wiki-main");
const home = document.getElementById("wiki-home");
const page = document.getElementById("wiki-page");
const menu = document.getElementById("wiki-menu");
const names = new Set(repos.map((r) => r.name));
const pending = new Map(); // repo -> the promise of its docs listing, asked for once per visit
const listed = new Map(); // repo -> its docs listing once it arrived
const scrolls = new Map(); // history entry -> scrollY when it was left

let shown = null; // "<repo>/<path>" on screen, "" for home
let current = { repo: "", path: "", title: "" };
let entry = 0;

// The one owner of the route format: #/<repo>, #/<repo>/<path>, each with an optional #<heading>
function routeTo(repo, path, anchor = "") {
    const file =
        path === "README.md" ? "" : `/${path.split("/").map(encodeURIComponent).join("/")}`;
    return `#/${repo}${file}${anchor ? `#${encodeURIComponent(anchor)}` : ""}`;
}

async function loadText(repo, path) {
    const res = await fetch(
        `${RAW}/${repo}/${branch}/${path.split("/").map(encodeURIComponent).join("/")}`,
    );
    if (!res.ok) throw new Error(String(res.status));
    return res.text();
}

// A page's title is its first # heading, as plain text
function titleOf(text) {
    const heading = marked.lexer(text).find((t) => t.type === "heading" && t.depth === 1);
    return heading
        ? DOMPurify.sanitize(marked.parseInline(heading.text), SANITIZE).textContent.trim()
        : "";
}

// One trees call per repo and visit, revalidated by ETag; on a refusal, the last saved listing
async function fetchListing(repo) {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(STORE + repo) ?? "null");
    } catch {}
    // the origin is shared with every Pages site of the org, so a saved entry is used only in this shape
    if (!Array.isArray(saved?.files) || !saved.titles) saved = null;
    let res = null;
    let body = null;
    try {
        res = await fetch(`${API}/${repo}/git/trees/${branch}?recursive=1`, {
            headers: saved?.etag ? { "If-None-Match": saved.etag } : {},
        });
        if (res.ok) body = await res.json();
    } catch {}
    if (res?.status === 304 && saved) return { ...saved, note: "" };
    if (Array.isArray(body?.tree)) {
        const files = body.tree
            .filter((e) => e.type === "blob" && /^docs\/.+\.md$/i.test(e.path))
            .map((e) => e.path)
            .sort();
        const listing = { etag: res.headers.get("ETag") ?? "", files, titles: saved?.titles ?? {} };
        try {
            localStorage.setItem(STORE + repo, JSON.stringify(listing));
        } catch {}
        return { ...listing, note: "" };
    }
    if (saved) return { ...saved, note: "" };
    if (res?.status === 404) return { etag: "", files: [], titles: {}, note: "" };
    const reset = Number(res?.headers.get("X-RateLimit-Reset"));
    const time = new Date(reset * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
    const until = reset ? ` until ${time}` : "";
    const why =
        res?.status === 403 || res?.status === 429
            ? `GitHub's API limit for this network is used up${until}`
            : "GitHub's API did not answer";
    return {
        etag: "",
        files: [],
        titles: {},
        note: `The list of this repo's pages is missing for now: ${why}.`,
    };
}

// Titles come from the pages themselves; raw files have no rate limit
async function fillTitles(repo, listing) {
    if (listing.note) return;
    const titles = {};
    await Promise.all(
        listing.files.map(async (file) => {
            try {
                titles[file] = titleOf(await loadText(repo, file));
            } catch {
                titles[file] = listing.titles[file] ?? "";
            }
        }),
    );
    listing.titles = titles;
    try {
        localStorage.setItem(
            STORE + repo,
            JSON.stringify({ etag: listing.etag, files: listing.files, titles }),
        );
    } catch {}
    if (current.repo === repo) renderNav();
}

function renderNav() {
    const { repo, path } = current;
    const listing = listed.get(repo);
    const list = document.createElement("ul");
    for (const r of repos) {
        const item = list.appendChild(document.createElement("li"));
        const link = item.appendChild(
            Object.assign(document.createElement("a"), {
                href: routeTo(r.name, "README.md"),
                textContent: r.name,
            }),
        );
        if (r.name !== repo) continue;
        item.className = "open";
        if (path === "README.md") link.setAttribute("aria-current", "page");
        // the page on screen stays listed when the listing is missing or older than the link to it
        const files = listing?.files ?? [];
        const shownFiles =
            path === "README.md" || files.includes(path) ? files : [...files, path].sort();
        if (!shownFiles.length) continue;
        const pages = item.appendChild(document.createElement("ul"));
        let dir = "docs";
        for (const file of shownFiles) {
            const parent = file.slice(0, file.lastIndexOf("/"));
            if (parent !== dir && parent !== "docs") {
                pages.appendChild(
                    Object.assign(document.createElement("li"), {
                        className: "dir",
                        textContent: parent.slice(5),
                    }),
                );
            }
            dir = parent;
            const name = file.slice(file.lastIndexOf("/") + 1).replace(/\.md$/i, "");
            const title = listing?.titles[file] || (file === path && current.title) || name;
            const a = pages.appendChild(document.createElement("li")).appendChild(
                Object.assign(document.createElement("a"), {
                    href: routeTo(repo, file),
                    textContent: title,
                }),
            );
            if (parent !== "docs") a.className = "nested";
            if (file === path) a.setAttribute("aria-current", "page");
        }
    }
    const label = Object.assign(document.createElement("p"), {
        className: "label",
        textContent: "Repositories",
    });
    const foot = Object.assign(document.createElement("p"), {
        className: "nav-foot",
        textContent: "Read live from ",
    });
    foot.append(
        Object.assign(document.createElement("a"), {
            href: GITHUB,
            textContent: `github.com/${org}`,
        }),
    );
    nav.replaceChildren(label, list, foot);
}

// Markdown to a sanitized fragment: links stay in the wiki where they can, images load from GitHub
function render(text, repo, path) {
    const doc = DOMPurify.sanitize(marked.parse(text, { gfm: true }), SANITIZE);
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const isAbsolute = /^[a-z][a-z\d+.-]*:|^\/\//i;

    for (const link of doc.querySelectorAll("a[href]")) {
        const href = link.getAttribute("href");
        const relative = !isAbsolute.test(href);
        try {
            if (href.startsWith("#")) {
                link.setAttribute("href", routeTo(repo, path, decodeURIComponent(href.slice(1))));
                continue;
            }
            // GitHub reads a leading slash as the repo root
            const url = new URL(
                relative && href.startsWith("/") ? `${GITHUB}/${repo}/blob/${branch}${href}` : href,
                `${GITHUB}/${repo}/blob/${branch}/${encoded}`,
            );
            const match =
                url.origin === "https://github.com"
                    ? url.pathname.match(
                          /^\/([^/]+)\/([^/]+)(?:\/(?:blob|tree)\/([^/]+)\/?(.*?))?\/?$/,
                      )
                    : null;
            const [, owner = "", name = "", ref = "", file = ""] = match ?? [];
            const target = decodeURIComponent(file);
            const inWiki =
                owner.toLowerCase() === org.toLowerCase() &&
                names.has(name.toLowerCase()) &&
                (!ref || ref === branch) &&
                (!target || target === "README.md" || /^docs\/.+\.md$/i.test(target));
            if (inWiki) {
                const anchor = url.hash === "#readme" ? "" : decodeURIComponent(url.hash.slice(1));
                link.setAttribute(
                    "href",
                    routeTo(name.toLowerCase(), target || "README.md", anchor),
                );
                continue;
            }
            if (relative) link.setAttribute("href", url.href);
            link.rel = "noopener";
        } catch {
            link.rel = "noopener";
        }
    }

    for (const image of doc.querySelectorAll("img[src]")) {
        const src = image.getAttribute("src");
        if (!isAbsolute.test(src)) {
            image.src = new URL(
                src.startsWith("/") ? `${RAW}/${repo}/${branch}${src}` : src,
                `${RAW}/${repo}/${branch}/${encoded}`,
            ).href;
        }
        image.loading = "lazy";
    }

    // GitHub's heading ids, so links written for github.com land on the same heading here
    const seen = new Map();
    for (const heading of doc.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
        const slug = heading.textContent
            .trim()
            .toLowerCase()
            .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
            .replace(/ /g, "-");
        const n = seen.get(slug) ?? 0;
        seen.set(slug, n + 1);
        heading.id = n ? `${slug}-${n}` : slug;
        const anchor = Object.assign(document.createElement("a"), {
            className: "anchor",
            href: routeTo(repo, path, heading.id),
            textContent: "#",
        });
        anchor.setAttribute("aria-label", "Link to this section");
        heading.append(anchor);
    }

    for (const table of doc.querySelectorAll("table")) {
        const wrap = Object.assign(document.createElement("div"), { className: "scroll" });
        table.style.setProperty("--cols", table.rows[0]?.cells.length ?? 1);
        table.replaceWith(wrap);
        wrap.append(table);
    }
    return doc;
}

// Back and Forward return to where the entry was left; a new entry goes to its heading, or the top
function settle(anchor) {
    const target = anchor && page.querySelector(`[id="${CSS.escape(anchor)}"]`);
    if (scrolls.has(entry)) scrollTo(0, scrolls.get(entry));
    else if (target) target.scrollIntoView();
    else scrollTo(0, 0);
}

function setMenu(open) {
    document.documentElement.toggleAttribute("data-menu", open);
    main.inert = open;
    menu.setAttribute("aria-expanded", String(open));
    menu.textContent = open ? "Close" : "Menu";
}

async function show() {
    const lost = main.contains(document.activeElement) || nav.contains(document.activeElement);
    const hash = location.hash.slice(1);
    const cut = hash.indexOf("#", 1);
    let repo = "";
    let path = "README.md";
    let anchor = "";
    try {
        const [first = "", ...rest] = (cut < 0 ? hash : hash.slice(0, cut))
            .split("/")
            .filter(Boolean)
            .map(decodeURIComponent);
        repo = first;
        path = rest.join("/") || "README.md";
        anchor = cut < 0 ? "" : decodeURIComponent(hash.slice(cut + 1));
    } catch {}
    // only a repo's README.md and docs/**/*.md are pages; a dot segment would leave the repo in the fetch URL
    const known =
        names.has(repo) &&
        (path === "README.md" ||
            (/^docs\/.+\.md$/i.test(path) &&
                !path.split("/").some((part) => part === "." || part === "..")));

    scrolls.set(entry, scrollY);
    entry = history.state?.entry ?? 0;
    if (!entry) {
        entry = Date.now() + Math.random();
        history.replaceState({ entry }, "");
    }
    setMenu(false);

    const key = repo && `${repo}/${path}`;
    if (key === shown) {
        settle(anchor);
        return;
    }
    shown = key;
    current = { repo: known ? repo : "", path, title: "" };
    renderNav();
    home.hidden = Boolean(repo);
    page.hidden = !repo;
    if (lost) main.focus({ preventScroll: true });
    if (!repo) {
        document.title = "mimi-os wiki";
        settle("");
        return;
    }

    if (!known) {
        const missing = Object.assign(document.createElement("p"), {
            className: "failed",
            textContent: names.has(repo)
                ? `${repo} has no page at ${path}. `
                : `There is no section named “${repo}”. `,
        });
        missing.append(
            Object.assign(document.createElement("a"), {
                href: "#/",
                textContent: "Back to the start",
            }),
        );
        page.replaceChildren(missing);
        page.dataset.state = "error";
        document.title = "Not found · mimi-os wiki";
        settle("");
        return;
    }

    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const meta = Object.assign(document.createElement("div"), { className: "meta" });
    const crumbs = Object.assign(document.createElement("span"), { className: "crumbs" });
    crumbs.append(
        Object.assign(document.createElement("a"), {
            href: routeTo(repo, "README.md"),
            textContent: repo,
        }),
        ` / ${path.split("/").join(" / ")}`,
    );
    const links = Object.assign(document.createElement("span"), { className: "meta-links" });
    links.append(
        Object.assign(document.createElement("a"), {
            href: `${GITHUB}/${repo}/blob/${branch}/${encoded}`,
            rel: "noopener",
            textContent: "View on GitHub",
        }),
    );
    meta.append(crumbs, links);
    const note = Object.assign(document.createElement("p"), { className: "note", hidden: true });
    const body = Object.assign(document.createElement("article"), { className: "md" });
    body.append(
        Object.assign(document.createElement("p"), {
            className: "loading",
            textContent: `Reading ${repo}/${path} from GitHub`,
        }),
    );
    page.replaceChildren(meta, note, body);
    page.dataset.state = "loading";
    document.title = `${path === "README.md" ? repo : path.slice(path.lastIndexOf("/") + 1)} · mimi-os wiki`;
    scrollTo(0, 0);

    if (!pending.has(repo)) {
        const listing = fetchListing(repo).then((l) => {
            listed.set(repo, l);
            void fillTitles(repo, l);
            return l;
        });
        pending.set(repo, listing);
    }
    // the same page opened again while this call waits has its own elements; this call leaves them alone
    void pending.get(repo).then((listing) => {
        if (shown !== key || !note.isConnected) return;
        note.textContent = listing.note;
        note.hidden = !listing.note;
        renderNav();
    });

    let text = "";
    try {
        text = await loadText(repo, path);
    } catch (error) {
        if (shown !== key || !body.isConnected) return;
        const failed = Object.assign(document.createElement("p"), { className: "failed" });
        if (error.message === "404" && path === "README.md") {
            failed.append(`${repo} has no README.md on ${branch}, or the repo is not public yet. `);
            failed.append(
                Object.assign(document.createElement("a"), {
                    href: `${GITHUB}/${repo}`,
                    rel: "noopener",
                    textContent: "Open it on GitHub",
                }),
            );
        } else if (error.message === "404") {
            failed.append(`${path} is not on ${branch} in ${repo}. `);
            failed.append(
                Object.assign(document.createElement("a"), {
                    href: routeTo(repo, "README.md"),
                    textContent: `Go to the ${repo} README`,
                }),
            );
        } else {
            failed.append(`GitHub did not answer (${error.message}). `);
            const retry = Object.assign(document.createElement("button"), {
                type: "button",
                className: "retry",
                textContent: "Try again",
            });
            retry.addEventListener("click", () => {
                shown = null;
                void show();
            });
            failed.append(retry);
        }
        body.replaceChildren(failed);
        page.dataset.state = "error";
        return;
    }
    if (shown !== key || !body.isConnected) return;

    current.title =
        path === "README.md"
            ? ""
            : titleOf(text) || path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
    document.title = current.title
        ? `${current.title} · ${repo} · mimi-os wiki`
        : `${repo} · mimi-os wiki`;
    body.replaceChildren(render(text, repo, path));
    page.dataset.state = "ready";
    renderNav();
    settle(anchor);
}

document.getElementById("wiki-repos").replaceChildren(
    ...repos.map((r) => {
        const item = document.createElement("li");
        const what = document.createElement("span");
        what.append(DOMPurify.sanitize(marked.parseInline(r.what), SANITIZE));
        item.append(
            Object.assign(document.createElement("a"), {
                href: routeTo(r.name, "README.md"),
                textContent: r.name,
            }),
            what,
        );
        return item;
    }),
);

document.querySelector(".skip").addEventListener("click", (event) => {
    event.preventDefault();
    main.focus();
});
menu.addEventListener("click", () => setMenu(!document.documentElement.hasAttribute("data-menu")));
nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenu(false);
});
matchMedia("(max-width: 900px)").addEventListener("change", () => setMenu(false));
addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !document.documentElement.hasAttribute("data-menu")) return;
    if (nav.contains(document.activeElement)) menu.focus();
    setMenu(false);
});
// a link to the route already shown fires no hashchange, so it goes to its heading here
document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href^='#/']");
    if (!link || event.metaKey || event.ctrlKey || link.getAttribute("href") !== location.hash) return;
    event.preventDefault();
    const cut = location.hash.indexOf("#", 1);
    scrolls.delete(entry);
    settle(cut < 0 ? "" : decodeURIComponent(location.hash.slice(cut + 1)));
});
history.scrollRestoration = "manual";
addEventListener("hashchange", show);
void show();
