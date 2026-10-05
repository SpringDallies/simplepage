    // ---------- favicons ----------
    const PREFIX = "icon-v5:";

    // Load any image URL and return it as a small PNG data URL (null on failure)
    const toDataURL = url => new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onerror = () => resolve(null);
    img.onload = () => {
        try {
        const s = Math.min(1, 64 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * s) || 64;
        c.height = Math.round(img.naturalHeight * s) || 64;
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
        } catch { resolve(null); }
    };
    img.src = url;
    });

    async function findIcon(pageUrl) {
    const { origin, hostname } = new URL(pageUrl);
    const urls = [];

    try {
        const res = await fetch(pageUrl, { signal: AbortSignal.timeout(5000) });
        const doc = new DOMParser().parseFromString(await res.text(), "text/html");
        doc.querySelectorAll('link[rel~="apple-touch-icon"], link[rel~="icon"]').forEach(l =>
        urls.push(new URL(l.getAttribute("href"), res.url).href)
        );
    } catch {}

    urls.push(
        `${origin}/favicon.ico`,
        `https://icons.duckduckgo.com/ip3/${hostname}.ico`
    );

    for (const url of new Set(urls)) {
        const data = await toDataURL(url);
        if (data) return data;
    }
    }

    const pending = {}; // one lookup per site, even if several links share it

    function addFavicon(a) {
    const { origin, hostname } = new URL(a.href);
    const override = a.dataset.icon;           // manual icon URL, if the site has one
    const key = PREFIX + (override || origin);

    const add = src => {
        const img = new Image(20, 20);
        img.referrerPolicy = "no-referrer";      // stops hotlink protection blocking the icon
        img.src = src;
        a.prepend(img);
    };

    const cached = localStorage.getItem(key);
    if (cached) return add(cached);

    pending[key] ??= (override
        ? toDataURL(override).then(d => d || findIcon(a.href))
        : findIcon(a.href)
    ).then(icon => {
        if (icon) localStorage.setItem(key, icon);
        return icon;
    });

    // if nothing could be converted to cached data, still show a plain image (not cached)
    pending[key].then(icon =>
        add(icon || override || `https://icons.duckduckgo.com/ip3/${hostname}.ico`)
    );
    }

    // ---------- sites (add / remove) ----------
    const SITES_KEY = "sites";
    const DEFAULT_SITES = [
    { name: "Youtube",   url: "https://www.youtube.com/" },
    { name: "Reddit",    url: "https://www.reddit.com/" },
    { name: "Forums",    url: "https://cracked.st/" },
    { name: "Anime",     url: "https://reanime.to/" },
    { name: "Pinterest", url: "https://in.pinterest.com/" },
    { name: "Fmhy",      url: "https://fmhy.net", icon: "https://fmhy.net/pwa_icon.png" },
    { name: "Linux",     url: "https://archive.org/details/native-linux-games-collection?tab=collection" },
    { name: "Cobalt",    url: "https://cobalt.meowing.de/" },
    ];

    const linkContainer = document.getElementById("link-container");

    function loadSites() {
    try {
        const saved = JSON.parse(localStorage.getItem(SITES_KEY));
        if (Array.isArray(saved)) {
        return saved.filter(s => s && typeof s.url === "string" && typeof s.name === "string");
        }
    } catch {}
    return DEFAULT_SITES.map(s => ({ ...s }));
    }

    let sites = loadSites();
    const saveSites = () => localStorage.setItem(SITES_KEY, JSON.stringify(sites));

    // Accepts "example.com" or a full URL; only http(s) is allowed
    function normalizeURL(input) {
    let v = input.trim();
    if (!v) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = "https://" + v;
    try {
        const u = new URL(v);
        return /^https?:$/.test(u.protocol) ? u.href : null;
    } catch { return null; }
    }

    function renderLinks() {
    linkContainer.replaceChildren();

    sites.forEach((site, i) => {
        const row = document.createElement("div");
        row.className = "link";

        const a = document.createElement("a");
        a.href = site.url;
        if (site.icon) a.dataset.icon = site.icon;

        const label = document.createElement("span");
        label.className = "label";
        label.textContent = site.name;
        a.append(label);

        const rm = document.createElement("button");
        rm.className = "remove";
        rm.type = "button";
        rm.textContent = "×";
        rm.dataset.index = i;
        rm.title = "Remove";
        rm.setAttribute("aria-label", "Remove " + site.name);

        row.append(a, rm);
        linkContainer.append(row);
        addFavicon(a);
    });
    }

    // remove (event delegation, so it survives re-renders)
    linkContainer.addEventListener("click", e => {
    const btn = e.target.closest(".remove");
    if (!btn) return;

    const [removed] = sites.splice(Number(btn.dataset.index), 1);
    saveSites();

    // drop the cached icon if no other link uses that site
    const origin = new URL(removed.url).origin;
    if (!sites.some(s => new URL(s.url).origin === origin)) {
        localStorage.removeItem(PREFIX + origin);
        delete pending[PREFIX + origin];
    }
    if (removed.icon) {
        localStorage.removeItem(PREFIX + removed.icon);
        delete pending[PREFIX + removed.icon];
    }
    renderLinks();
    });

    // add
    const addForm = document.getElementById("add-form");
    const urlInput = addForm.elements.url;

    urlInput.addEventListener("input", () => urlInput.classList.remove("invalid"));

    addForm.addEventListener("submit", e => {
    e.preventDefault();
    const url = normalizeURL(urlInput.value);
    if (!url) {
        urlInput.classList.add("invalid");
        urlInput.focus();
        return;
    }
    const name = addForm.elements.name.value.trim() || new URL(url).hostname.replace(/^www\./, "");
    sites.push({ name, url });
    saveSites();
    renderLinks();
    addForm.reset();
    });

    // reset to the default list
    document.getElementById("reset-sites").addEventListener("click", () => {
    if (!confirm("Reset links to the defaults?")) return;
    sites = DEFAULT_SITES.map(s => ({ ...s }));
    saveSites();
    renderLinks();
    });

    // edit mode (shows the × buttons); not saved, so it always starts off
    const root = document.documentElement;
    root.dataset.editing = "false";
    document.getElementById("opt-edit").addEventListener("change", e => {
    root.dataset.editing = e.target.checked;
    });

    renderLinks();

    // ---------- settings ----------
    const SETTINGS_KEY = "settings";
    const DEFAULTS = { icons: true, row: false, align: "left", iconAlign: "text" };

    let settings = { ...DEFAULTS };
    try {
    Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)));
    } catch {}

    const win = document.getElementById("window");

    function setMenu(open) {
    win.hidden = !open;
    root.dataset.menu = open ? "open" : "closed"; // CSS uses this to shift the links
    }
    setMenu(false);

    function applySettings() {
    // CSS reads these attributes
    root.dataset.icons = settings.icons;
    root.dataset.row = settings.row;
    root.dataset.align = settings.align;
    root.dataset.iconAlign = settings.iconAlign; // becomes data-icon-align

    // keep the controls in sync with the saved values
    document.querySelectorAll("[data-setting]").forEach(box => {
        box.checked = settings[box.dataset.setting];
    });
    document.querySelectorAll(".segmented button[data-key]").forEach(btn => {
        btn.classList.toggle("active", settings[btn.dataset.key] === btn.dataset.value);
    });

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    // checkboxes
    document.querySelectorAll("[data-setting]").forEach(box => {
    box.addEventListener("change", () => {
        settings[box.dataset.setting] = box.checked;
        applySettings();
    });
    });

    // segmented controls (text align, icon align, and any you add later)
    document.querySelectorAll(".segmented button[data-key]").forEach(btn => {
    btn.addEventListener("click", () => {
        settings[btn.dataset.key] = btn.dataset.value;
        applySettings();
    });
    });

    // open/close the settings window
    document.getElementById("settings-btn").addEventListener("click", () => {
    setMenu(win.hidden);
    });
    document.addEventListener("click", e => {
    // clicking outside closes it, except on the × buttons so you can remove several in a row
    if (!e.target.closest("#settings, .remove")) setMenu(false);
    });
    document.addEventListener("keydown", e => {
    if (e.key === "Escape") setMenu(false);
    });

    applySettings();
