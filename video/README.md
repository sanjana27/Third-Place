# Third Place — original concept teaser

**Finished film:** `output\third-place-teaser.mp4`

The film is a 59.5-second, 1920 × 1080, 30 fps, H.264/AAC MP4. It uses original
editorial café illustrations, a generic scripted assistant interface, fictional
profiles, local Windows narration, and an original synthesized musical score.
The persistent disclosure is **“Scripted demo · fictional profiles.”**

This is not footage of the application, a deployed service, real users, or an
official integration with any assistant or messaging provider.

## Play and inspect

Open `output\third-place-teaser.mp4` in a browser or ordinary video player.
`output\contact-sheet.jpg` and `output\stills` contain representative review
frames. `output\third-place-poster.png` is the end-card image.
`output\third-place-teaser.srt` is the accompanying caption file.
The film also burns in concise narrative captions, with the final tagline
shown directly on the end card.

`output\verification.json` records the actual final file's probe results,
full-decode validation, duration, codecs, frame rate, layout checks, narration
timings, audio headroom, black/silence detection, encoded-frame comparisons,
and SHA-256. After a full render, the contact sheet, stills, and poster are
extracted from the actual encoded MP4, rather than only the source renderer.

## Re-render

From the repository directory, in PowerShell:

```powershell
.\video\render.ps1
```

Render review frames without encoding or speech:

```powershell
.\video\render.ps1 -StillsOnly
```

Change all branded titles and spoken brand mentions without editing scenes:

```powershell
.\video\render.ps1 -Title "Third Place"
```

For a music-only version:

```powershell
.\video\render.ps1 -SkipSpeech
```

These commands overwrite this project's output files. The final confirmed name
is **Third Place**, without “Connect.” The title remains configurable for easy
future editing, not because the current branding is unresolved.

## Local prerequisites

- Python 3.12, Pillow, and NumPy. The versions used are in `requirements.txt`;
  they were already installed, so no dependencies were installed for this film.
- `ffmpeg` and `ffprobe` available on `PATH`.
- Windows' installed Georgia and Segoe UI typefaces. Font files are read from
  Windows, not copied into or redistributed with this project.
- Windows PowerShell and a local System.Speech voice. The default is
  **Microsoft Zira**, with Microsoft Zira Desktop as a fallback.

There are no network requests, hosted AI calls, cloud resources, credentials,
app dependencies, or reads of application implementation. Scratch audio,
encoder logs, and tool caches stay in `..\.hackathon\video`. The wrapper scopes
temporary directories and Python/pip caches to that location.

## Edit the story or replace prototype scenes

`config.json` controls branding, question, conversation opener, timing, voice,
and narration. `src\render.py` contains the illustrated scene source and complete
renderer. `src\synthesize.ps1` produces local narration WAV segments.

| Time | Source method | Story |
|---|---|---|
| 0–8 s | `Film.scene(0)` / `cafe_art(False)` | People reading and working in the same café |
| 8–15 s | `Film.assistant` | A typed request to a generic personal assistant |
| 15–25 s | `Film.capability` | Intent, shared interests, same café, explicit opt-in |
| 25–38 s | `Film.match` | Fictional match, shared interests, conversation opener |
| 38–48 s | `Film.consent` | Alex requests; Maya independently accepts |
| 48–54.3 s | `Film.scene(5)` / `cafe_art(True)` | Both meet; the assistant remains the interface |
| 54.3–59.5 s | `Film.scene(6)` | Brand, tagline, and connection-infrastructure positioning |

The `assistant`, `capability`, `match`, and `consent` methods draw only into the
right-side scene region. Replace those methods with your own legitimate
prototype screenshots or deterministic rendered frames later; retain their
local-time arguments, disclosure, safe margins, and consent ordering. Keep
headlines and narration in sync. For a fully static screenshot, load a local
image from `assets`, resize/crop it to the method's panel region, and composite
it with `put`.

The built-in layout check rejects several key text overflows before rendering.
The final check requires 45–60 seconds, 1080p H.264 yuv420p, stereo AAC, and a
successful decode of the complete MP4. Review the contact sheet after any edit.

## A 90-second hackathon pitch

Play the 59.5-second teaser, then spend the remaining 30 seconds on one clear
technical point: **the assistant interprets intent; Third Place provides the
opt-in discovery and mutual-consent connection API.** Show the actual prototype's
API boundary and consent state change, and distinguish working functionality
from planned Gemini / Cloud Run / Cloud SQL deployment.
