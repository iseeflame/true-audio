# True Audio for YouTube Music

A browser extension for Brave and Chrome. It adds a **True Audio** button to album pages on [music.youtube.com](https://music.youtube.com). The button finds tracks that play as a music video instead of the album track, and builds a playlist of the album tracks.

## The problem

YouTube Music has two kinds of items:

- **Song** (`MUSIC_VIDEO_TYPE_ATV`): the audio track from the release.
- **Music video** (`MUSIC_VIDEO_TYPE_OMV`): the official video. Its audio is often a different mix, with intros, sound effects or lower quality.

Many album pages list the music video in place of the song. You cannot change a public album, but you can play its songs from your own playlist.

## What the button does

1. **Check (read only).** For each track the button reads its type. For each music video it searches for the song with the same title, at least one common artist, and a duration within 10 seconds.
2. **Result.** The panel lists every track as `audio`, `video → audio` or `video, no audio found`.
3. **Action (only when you click it):**
   - No music videos: **Save album to library**.
   - One or more music videos: **Create audio playlist**. It creates a private playlist `<Album> — <Artist>` in album order. Each video is replaced by its song. A video with no matching song stays in the playlist.

The button shows the album state:

| Button | Meaning |
|---|---|
| `True Audio` | Not checked yet |
| `True Audio · 18/26 videos` | 18 of 26 tracks are music videos |
| `True Audio ✓` | All tracks are songs |
| `True Audio · playlist ready` | The audio playlist exists |
| `True Audio ✓ saved` | The album is saved to the library |

The extension does not create a second playlist with the same name. If one exists in your library, it offers a link to it.

## Install

1. Download this repository (Code → Download ZIP) and unzip it, or clone it.
2. Open `brave://extensions` (or `chrome://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the folder that contains `manifest.json`.
5. Open or reload music.youtube.com and go to an album.

To update: replace the files, click ↻ on the extension card, reload the tab.

## Privacy

- The extension runs only on `music.youtube.com`.
- It sends requests only to YouTube Music, from your open browser session. It does not export cookies and has no server.
- It keeps the album state in the page's `localStorage` (keys `trueaudio:*`).

## Limits

- The extension uses the internal YouTube Music web API, the same one the site uses. It is not an official API and can change without notice. YouTube's Terms of Service do not permit automated access outside official APIs. The extension acts only when you click, one album at a time. Use it at your own risk.
- The duplicate check reads only the first page of your library playlists.
- Some songs do not exist as a separate audio track. These videos stay in the playlist.

## Development

- `core.js`: parses YouTube Music responses and finds songs for music videos. No DOM.
- `content.js`: requests from the open session, the button and the panel. The page enforces Trusted Types, so the UI uses DOM APIs only (no `innerHTML`).
- `test/node_test.js`: read-only check of `core.js` against live YouTube Music, without sign-in:

  ```
  node test/node_test.js OLAK5uy_lIa0E_bBWQxM0bX-G9A1D7FjDdWMKHpyo
  ```

- `tools/make_icons.py`: draws the icons (needs Pillow).
