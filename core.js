// True Audio core: parse YouTube Music InnerTube responses, find audio (ATV) twins for music videos (OMV).
// Pure logic, no DOM. Works in the page (globalThis.TrueAudioCore) and in Node (module.exports) for tests.
(function (root) {
  "use strict";
  const ATV = "MUSIC_VIDEO_TYPE_ATV";
  const SONGS_PARAMS = "EgWKAQIIAWoMEA4QChADEAQQCRAF"; // search filter "songs"
  const SEPARATORS = new Set(["", ",", "&", "•", "x", "and", "feat.", "with"]);

  function norm(s) {
    s = (s || "").normalize("NFKC").toLowerCase().replace(/’/g, "'");
    s = s.replace(/\s*[\(\[](feat|ft|with)\.?[^\)\]]*[\)\]]/g, "");
    s = s.replace(/[^\p{L}\p{N}_\s']/gu, " ");
    return s.replace(/\s+/g, " ").trim();
  }

  function walk(obj, key, out = []) {
    if (obj && typeof obj === "object") {
      if (Array.isArray(obj)) obj.forEach((x) => walk(x, key, out));
      else for (const k of Object.keys(obj)) { if (k === key) out.push(obj[k]); walk(obj[k], key, out); }
    }
    return out;
  }
  const first = (obj, key) => walk(obj, key)[0];
  const runsText = (t) => (t && (t.runs ? t.runs.map((r) => r.text).join("") : t.simpleText)) || "";

  function seconds(s) {
    if (!s || !/^\d+(:\d{2}){1,2}$/.test(s)) return null;
    return s.split(":").reduce((a, x) => a * 60 + Number(x), 0);
  }

  function artistNames(runs) {
    // runs before the first " • ", without separators
    const out = [];
    for (const r of runs || []) {
      const t = (r.text || "").trim();
      if (t === "•") break;
      if (SEPARATORS.has(t.toLowerCase())) continue;
      if (["Song", "Video", "Album", "Single", "EP"].includes(t)) continue;
      out.push(t);
    }
    return out;
  }

  function parseItem(r) {
    const cols = (r.flexColumns || []).map((c) => (c.musicResponsiveListItemFlexColumnRenderer || {}).text || {});
    const play = (((r.overlay || {}).musicItemThumbnailOverlayRenderer || {}).content || {}).musicPlayButtonRenderer || {};
    const we = (play.playNavigationEndpoint || {}).watchEndpoint || {};
    const titleWe = first(cols[0], "watchEndpoint") || {};
    const videoId = (r.playlistItemData || {}).videoId || we.videoId || titleWe.videoId || null;
    const videoType = first(we, "musicVideoType") || first(titleWe, "musicVideoType") || null;
    const runs2 = (cols[1] && cols[1].runs) || [];
    let dur = null;
    const fixed = (r.fixedColumns || []).map((c) => runsText((c.musicResponsiveListItemFixedColumnRenderer || {}).text));
    for (const t of fixed) if (seconds(t)) dur = seconds(t);
    if (!dur) for (const x of runs2) if (seconds((x.text || "").trim())) dur = seconds(x.text.trim());
    return {
      title: runsText(cols[0]),
      artists: artistNames(runs2),
      videoId,
      videoType,
      duration: dur,
      available: !!(r.playlistItemData || {}).videoId || !!we.videoId,
    };
  }

  function parseAlbum(resp) {
    const header = first(resp, "musicResponsiveHeaderRenderer") || {};
    const title = runsText(header.title);
    const artists = artistNames((header.straplineTextOne || {}).runs);
    const scope = ((resp.contents || {}).twoColumnBrowseResultsRenderer || {}).secondaryContents || resp;
    const tracks = walk(scope, "musicResponsiveListItemRenderer").map(parseItem).filter((t) => t.videoId);
    const m = JSON.stringify(resp).match(/OLAK5uy_[\w-]+/);
    return { title, artists, tracks, audioPlaylistId: m ? m[0] : null };
  }

  function parseSearch(resp) {
    return walk(resp, "musicResponsiveListItemRenderer").map(parseItem).filter((t) => t.videoId);
  }

  function findTwin(track, albumArtists, hits) {
    const wantT = norm(track.title);
    const wantA = new Set((track.artists.length ? track.artists : albumArtists).map(norm));
    for (const h of hits) {
      if ((h.videoType || ATV) !== ATV) continue;
      if (norm(h.title) !== wantT) continue;
      if (!h.artists.map(norm).some((a) => wantA.has(a))) continue;
      if (track.duration && h.duration && Math.abs(track.duration - h.duration) > 10) continue;
      return h;
    }
    return null;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // api: { browse(browseId), search(query, params), albumBrowseId(olakId) }
  async function planAlbum(api, albumId, onProgress = () => {}) {
    const browseId = albumId.startsWith("MPREb_") ? albumId : await api.albumBrowseId(albumId);
    if (!browseId) throw new Error("album browseId not found");
    const album = parseAlbum(await api.browse(browseId));
    album.browseId = browseId;
    if (!album.audioPlaylistId && albumId.startsWith("OLAK5uy_")) album.audioPlaylistId = albumId;
    const lines = [];
    const videos = album.tracks.filter((t) => t.videoType !== ATV);
    let done = 0;
    for (const t of album.tracks) {
      if (t.videoType === ATV) { lines.push({ track: t, status: "audio", id: t.videoId }); continue; }
      const q = `${(t.artists.length ? t.artists : album.artists).join(" ")} ${t.title}`;
      const hits = parseSearch(await api.search(q, SONGS_PARAMS));
      const twin = findTwin(t, album.artists, hits);
      lines.push(twin ? { track: t, status: "swap", id: twin.videoId, twin } : { track: t, status: "video", id: t.videoId });
      onProgress(++done, videos.length);
      await sleep(400 + Math.random() * 400);
    }
    const name = `${album.title} — ${album.artists.join(", ")}`;
    return {
      album, name, lines,
      total: album.tracks.length,
      videos: videos.length,
      swapped: lines.filter((l) => l.status === "swap").length,
      kept: lines.filter((l) => l.status === "video").length,
      action: videos.length ? "create_playlist" : "save_album",
      videoIds: lines.map((l) => l.id),
    };
  }

  function playlistTitles(resp) {
    // library playlists page: [{title, playlistId}]
    return walk(resp, "musicTwoRowItemRenderer").map((r) => {
      const b = first(r.navigationEndpoint, "browseId") || "";
      return { title: runsText(r.title), playlistId: b.startsWith("VL") ? b.slice(2) : b };
    });
  }

  const api = { ATV, SONGS_PARAMS, norm, walk, parseItem, parseAlbum, parseSearch, findTwin, planAlbum, playlistTitles, seconds };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TrueAudioCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
