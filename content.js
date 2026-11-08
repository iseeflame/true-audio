// True Audio content script (MAIN world on music.youtube.com).
// Adds a "True Audio" button on album pages. Check = read only. Writes happen only on an explicit click.
(function () {
  "use strict";
  if (window.__trueAudio) return;
  window.__trueAudio = true;
  const core = window.TrueAudioCore;
  const ORIGIN = "https://music.youtube.com";
  const STORE = "trueaudio:";

  // ---------- InnerTube client on the user's own session ----------
  const cfg = (k) => (window.ytcfg && window.ytcfg.get ? window.ytcfg.get(k) : undefined);

  function cookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&") + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function sha1hex(s) {
    const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  async function headers() {
    const h = {
      "Content-Type": "application/json",
      "X-Origin": ORIGIN,
      "X-Goog-AuthUser": String(cfg("SESSION_INDEX") || 0),
      "X-Youtube-Client-Name": String(cfg("INNERTUBE_CONTEXT_CLIENT_NAME") || 67),
      "X-Youtube-Client-Version": String(cfg("INNERTUBE_CLIENT_VERSION") || ""),
    };
    const vid = cfg("VISITOR_DATA");
    if (vid) h["X-Goog-Visitor-Id"] = vid;
    const sapisid = cookie("SAPISID") || cookie("__Secure-3PAPISID");
    if (sapisid) {
      const ts = Math.floor(Date.now() / 1000);
      h["Authorization"] = `SAPISIDHASH ${ts}_${await sha1hex(`${ts} ${sapisid} ${ORIGIN}`)}`;
    }
    return h;
  }

  const signedIn = () => !!(cookie("SAPISID") || cookie("__Secure-3PAPISID"));

  async function call(endpoint, body) {
    const r = await fetch(`/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: "POST",
      credentials: "include",
      headers: await headers(),
      body: JSON.stringify({ context: cfg("INNERTUBE_CONTEXT"), ...body }),
    });
    if (!r.ok) throw new Error(`${endpoint}: HTTP ${r.status}`);
    return r.json();
  }

  const api = {
    browse: (browseId) => call("browse", { browseId }),
    search: (query, params) => call("search", { query, params }),
    albumBrowseId: async (olak) => {
      const html = await (await fetch(`/playlist?list=${encodeURIComponent(olak)}`, { credentials: "include" })).text();
      const m = html.match(/MPREb_[A-Za-z0-9_-]+/);
      return m ? m[0] : null;
    },
    createPlaylist: async (title, description, videoIds) => {
      const r = await call("playlist/create", { title, description, privacyStatus: "PRIVATE", videoIds });
      if (!r.playlistId) throw new Error("playlist/create: no playlistId in response");
      return r.playlistId;
    },
    saveAlbum: (audioPlaylistId) => call("like/like", { target: { playlistId: audioPlaylistId } }),
    libraryPlaylists: async () => core.playlistTitles(await call("browse", { browseId: "FEmusic_liked_playlists" })),
  };

  // ---------- page detection ----------
  function albumKey() {
    const u = new URL(location.href);
    const list = u.searchParams.get("list") || "";
    if (u.pathname === "/playlist" && list.startsWith("OLAK5uy_")) return list;
    const m = u.pathname.match(/^\/browse\/(MPREb_[\w-]+)/);
    return m ? m[1] : null;
  }

  const load = (k) => { try { return JSON.parse(localStorage.getItem(STORE + k) || "null"); } catch (e) { return null; } };
  const save = (k, v) => { try { localStorage.setItem(STORE + k, JSON.stringify(v)); } catch (e) { /* ignore */ } };

  // ---------- UI (DOM API only: the page enforces Trusted Types, no innerHTML) ----------
  const css = `
  #ta-wrap{position:relative;display:flex;justify-content:center;margin-top:16px;width:100%}
  #ta-btn{display:flex;align-items:center;gap:8px;
    padding:9px 16px;border-radius:20px;border:1px solid rgba(255,255,255,.18);background:#212121;color:#fff;
    font:500 14px/1 Roboto,Arial,sans-serif;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.5)}
  #ta-btn:hover{background:#303030}
  #ta-btn .dot{width:8px;height:8px;border-radius:50%;background:#909090}
  #ta-btn.ok .dot{background:#3ddc84} #ta-btn.warn .dot{background:#ffb74d} #ta-btn.busy .dot{background:#64b5f6}
  #ta-panel{position:absolute;top:calc(100% + 8px);left:0;right:0;margin:0 auto;z-index:100;max-width:440px;text-align:left;
    max-height:62vh;display:flex;flex-direction:column;background:#181818;color:#fff;border:1px solid rgba(255,255,255,.14);
    border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.6);font:13px/1.4 Roboto,Arial,sans-serif}
  #ta-panel header{padding:14px 16px 8px;font-weight:500;font-size:15px}
  #ta-panel .sum{padding:0 16px 10px;color:#aaa}
  #ta-panel ol{margin:0;padding:0 16px 0 40px;overflow:auto;flex:1}
  #ta-panel li{padding:3px 0;color:#ddd} #ta-panel li .st{font-size:11px;margin-left:6px}
  #ta-panel .audio{color:#3ddc84} #ta-panel .swap{color:#64b5f6} #ta-panel .video{color:#ffb74d}
  #ta-panel footer{display:flex;gap:8px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid rgba(255,255,255,.1)}
  #ta-panel button{padding:8px 14px;border-radius:18px;border:0;font:500 13px Roboto,Arial,sans-serif;cursor:pointer}
  #ta-panel .primary{background:#fff;color:#000} #ta-panel .ghost{background:#2a2a2a;color:#fff}
  #ta-panel button:disabled{opacity:.5;cursor:default}
  #ta-panel a{color:#64b5f6} #ta-panel .msg{padding:0 16px 10px;color:#ffb74d}`;

  function el(tag, props = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of kids) if (c) e.append(c);
    return e;
  }

  let wrap, btn, panel, current = null, busy = false;

  function ensureUi() {
    if (btn) return;
    document.head.append(el("style", { text: css }));
    btn = el("button", { id: "ta-btn", title: "Check whether this album plays music videos instead of tracks", onclick: onButton },
      el("span", { class: "dot" }), el("span", { class: "label", text: "True Audio" }));
    wrap = el("div", { id: "ta-wrap" }, btn);
  }

  // Put the button right under the album action buttons (save / play / menu) of the visible header.
  function mount() {
    const ab = [...document.querySelectorAll("ytmusic-responsive-header-renderer #action-buttons")]
      .find((e) => e.offsetParent !== null);
    if (!ab) { wrap.style.display = "none"; return; }
    if (wrap.previousElementSibling !== ab) ab.after(wrap);
    wrap.style.display = "";
  }

  function setButton(state, label) {
    btn.className = state || "";
    btn.querySelector(".label").textContent = label;
  }

  function closePanel() { if (panel) { panel.remove(); panel = null; } }

  function refresh() {
    const k = albumKey();
    if (k && btn) mount();
    if (k === current) return;
    current = k;
    closePanel();
    if (!k) { if (wrap) wrap.style.display = "none"; return; }
    ensureUi();
    mount();
    const s = load(k);
    if (!s) setButton("", "True Audio");
    else if (s.playlistUrl) setButton("ok", "True Audio · playlist ready");
    else if (s.saved) setButton("ok", "True Audio ✓ saved");
    else if (s.videos === 0) setButton("ok", "True Audio ✓");
    else setButton("warn", `True Audio · ${s.videos}/${s.total} videos`);
  }

  async function onButton() {
    if (busy) return;
    if (panel) { closePanel(); return; }
    const k = current;
    busy = true;
    setButton("busy", "True Audio · checking…");
    try {
      const plan = await core.planAlbum(api, k, (d, n) => setButton("busy", `True Audio · finding audio ${d}/${n}`));
      if (k !== current) return;
      const prev = load(k) || {};
      save(k, { ...prev, total: plan.total, videos: plan.videos, kept: plan.kept, checkedAt: Date.now() });
      setButton(plan.videos ? "warn" : "ok", plan.videos ? `True Audio · ${plan.videos}/${plan.total} videos` : "True Audio ✓");
      showPanel(k, plan);
    } catch (e) {
      setButton("warn", "True Audio · error");
      showError(String(e.message || e));
    } finally {
      busy = false;
    }
  }

  function showError(text) {
    closePanel();
    panel = el("div", { id: "ta-panel" }, el("header", { text: "True Audio" }), el("div", { class: "msg", text }),
      el("footer", {}, el("button", { class: "ghost", text: "Close", onclick: closePanel })));
    wrap.append(panel);
  }

  function showPanel(k, plan) {
    closePanel();
    const st = load(k) || {};
    const sum = plan.videos
      ? `Tracks: ${plan.total}. Music videos instead of tracks: ${plan.videos}. Audio versions found: ${plan.swapped}.` +
        (plan.kept ? ` No audio version, the video stays: ${plan.kept}.` : "")
      : `All ${plan.total} tracks are audio versions. The album can be saved as is.`;
    const list = el("ol", {});
    for (const l of plan.lines) {
      const label = { audio: "audio", swap: "video → audio", video: "video, no audio found" }[l.status];
      list.append(el("li", {}, l.track.title, el("span", { class: "st " + l.status, text: label })));
    }
    const msg = el("div", { class: "msg" });
    const foot = el("footer", {});
    const close = el("button", { class: "ghost", text: "Close", onclick: closePanel });

    if (!signedIn()) {
      msg.textContent = "Sign in to YouTube Music to save.";
    } else if (plan.action === "create_playlist") {
      if (st.playlistUrl) {
        foot.append(el("a", { href: st.playlistUrl, text: "Open audio version" }));
      } else {
        const b = el("button", { class: "primary", text: "Create audio playlist" });
        b.addEventListener("click", async () => {
          b.disabled = true; b.textContent = "Creating…"; msg.textContent = "";
          try {
            const existing = (await api.libraryPlaylists()).find((p) => p.title === plan.name);
            if (existing) {
              const url = `${ORIGIN}/playlist?list=${existing.playlistId}`;
              save(k, { ...(load(k) || {}), playlistUrl: url });
              msg.textContent = "A playlist with this name is already in your library. No new playlist was created.";
              b.replaceWith(el("a", { href: url, text: "Open it" }));
              return;
            }
            const desc = `True Audio: audio versions of ${ORIGIN}/browse/${plan.album.browseId}`;
            const pid = await api.createPlaylist(plan.name, desc, plan.videoIds);
            const url = `${ORIGIN}/playlist?list=${pid}`;
            save(k, { ...(load(k) || {}), playlistUrl: url });
            setButton("ok", "True Audio · playlist ready");
            b.replaceWith(el("a", { href: url, text: "Playlist created — open" }));
          } catch (e) {
            b.disabled = false; b.textContent = "Create audio playlist";
            msg.textContent = "Failed: " + (e.message || e);
          }
        });
        foot.append(b);
      }
    } else if (st.saved) {
      msg.textContent = "The album is already in your library.";
    } else if (plan.album.audioPlaylistId) {
      const b = el("button", { class: "primary", text: "Save album to library" });
      b.addEventListener("click", async () => {
        b.disabled = true; msg.textContent = "";
        try {
          await api.saveAlbum(plan.album.audioPlaylistId);
          save(k, { ...(load(k) || {}), saved: true });
          setButton("ok", "True Audio ✓ saved");
          b.replaceWith(el("span", { class: "audio", text: "Saved" }));
        } catch (e) {
          b.disabled = false; msg.textContent = "Failed: " + (e.message || e);
        }
      });
      foot.append(b);
    }
    foot.append(close);
    panel = el("div", { id: "ta-panel" }, el("header", { text: plan.name }), el("div", { class: "sum", text: sum }), msg, list, foot);
    wrap.append(panel);
  }

  // YouTube Music is a single-page app: watch the URL.
  setInterval(refresh, 800);
  refresh();
})();
