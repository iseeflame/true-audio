// Read-only test of core.js against live YouTube Music, anonymous (no cookies).
// Usage: node test/node_test.js [OLAK5uy_...|MPREb_...]
const core = require("../core.js");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const context = { client: { clientName: "WEB_REMIX", clientVersion: "1.20251101.01.00", hl: "en", gl: "US" } };

async function call(endpoint, body) {
  const r = await fetch(`https://music.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://music.youtube.com", "User-Agent": UA },
    body: JSON.stringify({ context, ...body }),
  });
  if (!r.ok) throw new Error(`${endpoint} ${r.status}`);
  return r.json();
}

const api = {
  browse: (browseId) => call("browse", { browseId }),
  search: (query, params) => call("search", { query, params }),
  albumBrowseId: async (olak) => {
    const html = await (await fetch(`https://music.youtube.com/playlist?list=${olak}`, { headers: { "User-Agent": UA } })).text();
    const m = html.match(/MPREb_[A-Za-z0-9_-]+/);
    return m ? m[0] : null;
  },
};

(async () => {
  const id = process.argv[2] || "OLAK5uy_lIa0E_bBWQxM0bX-G9A1D7FjDdWMKHpyo";
  const p = await core.planAlbum(api, id, (d, n) => process.stdout.write(`\rsearch ${d}/${n}`));
  console.log(`\n${p.name} | ${p.action} | total=${p.total} videos=${p.videos} swapped=${p.swapped} kept=${p.kept}`);
  console.log("browseId", p.album.browseId, "audioPlaylistId", p.album.audioPlaylistId);
  for (const l of p.lines) console.log(`  ${l.status.padEnd(5)} ${l.track.title} [${l.track.duration}s] ${l.track.videoId} -> ${l.id}`);
})().catch((e) => { console.error(e); process.exit(1); });
