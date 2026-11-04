# Explainer film · storyline and build

Version 2 (4 November 2026), 87 s, the same narration voice as version 1. Everything here is reproducible on a Mac
with Google Chrome, Python 3 with Pillow, and the Swift toolchain; no ffmpeg.

## Storyline

One idea and one figure per scene, each scene mirroring one section of the page. The voice is the 31 October 2026
recording with the four survey-figure sentences removed; the first word comes at 1.05 s. The first sentence is the 4 October recording, so "of organizations" is spoken again; the 5 October patch had cut those two words.

| Scene | Voice (exact, also the captions) | Picture |
| --- | --- | --- |
| 1 Hook | McKinsey finds that 89 percent of organizations now use AI. · Using AI has become common. Repeating it has not. | Ten squares, nine lit, the numeral 89%, source line |
| 2 The gap (01) | The Adoption Tree Model is an operating model for that gap. It takes an organization from one working AI use case to the ability to repeat it. | One live use case on the Adoption Office trunk, three dotted "?" slots |
| 3 The tree (02) | Read it as a tree. The branches… The roots… And the trunk is the Adoption Office… | The site's own tree SVG drawn in: branches, roots, office |
| 4 The wave (03) | The office takes each use case through six gates… Each gate is a decision… A reference wave takes twenty-four weeks… In a regulated enterprise, plan nine to twelve months elapsed. | The 24-week wave ruler of section 03, gates stepping with the voice, lanes drawn on "twenty-four weeks" |
| 5 What stays (05) | What sets the model apart happens after go-live. Every live use case leaves something behind: approved data, a tested control, trained people. That flows back into the roots… The foundation enables the use case. The use case makes the foundation stronger. | Pills drop into the roots, the return arrow reaches use case 02 ("starts further ahead"), then the portfolio effect: waves 1, 2 and 3 as shortening bars (24 weeks · faster, more reliable, lower cost · starts further ahead again) under "Project by project, the organization transforms." (design expectation, whitepaper p. 11) |
| 6 Built to leave (04) | And the office is built to leave: dependency is designed to decline, and trained Adoption Coaches stay. | The four-step handover strip of section 04; the office meter empties, the people meter fills |
| 7 Close | The Adoption Tree Model. Build AI capability that stays. Get the whitepaper at adoptiontree.ai. | Wordmark with ®, tagline, call to action |

Copy rule: every sentence on screen is a sentence the voice says, and it appears when it is spoken (cue start).
Everything else on screen is a short label or a figure. A paraphrase next to the voice reads as the narrator
skipping words, which is what the first v2 draft got wrong.

## Build

1. `audio_cut.py <scratch>` reads the version 1 film's decoded audio (`audio.wav`, 48 kHz, made with
   `afconvert -f WAVE -d LEI16@48000 <old mp4> audio.wav`), takes the cue times from `captions-v1.vtt`, removes
   cues 1 to 4 at the pauses between sentences, trims the lead-in to `LEAD_IN` (1.4 s) and the tail to `TAIL`
   (1.9 s), and writes `narration.wav`, `cues.json` (the new cue times) and `captions.vtt`.
   `afconvert -f m4af -d aac -b 80000 narration.wav narration.m4a` makes the track the film is muxed with
   (kept here so the film can be rebuilt without the old mp4).
   Then `restore_sentence1.py <original.wav>` puts the 4 October first sentence back (`original.wav` is
   `afconvert -f WAVE -d LEI16@48000` of `git show 70948a2:docs/assets/video/adoption-tree-model-explainer.mp4`):
   first word at 1.05 s, junction in the silence at 5.73 s, cue 5 onward sample-identical; it rewrites `narration.wav`,
   cue 0 in `cues.json` and `captions.vtt`. Re-encode `narration.m4a` after it.
2. `build_film.py` writes `film.html` next to a `site` symlink to `docs/`. The page loads the site's own CSS and fonts,
   lifts the tree SVG, the wave strip and chart, and the handover steps and visual out of `index.html` (balanced-div
   extraction, so nothing is left unclosed), and renders one 1920x1080 stage per requested time: `?times=5,20,40`
   for checks, `?from=<frame>&n=14` for batches. Every scene is a pure function of time, so frames are deterministic.
   All scene timing is keyed to the cue times in `cues.json`; change a cue and the pictures follow.
3. `capture.py test 2,6,11.5` renders check frames to `test/`; `capture.py full 30 <from> <to>` renders frames with
   headless Chrome into `frames/f00000.png` and so on. Run three ranges in parallel (each worker uses its own temp
   file); 2616 frames take about 12 minutes on an M-series Mac. Empty `frames/` first: the encoder reads until the
   first missing frame number.
4. `swiftc -O encode.swift -o encode && ./encode frames 30 video-only.mp4 900` encodes H.264 at 900 kbps;
   `swiftc -O mux.swift -o mux && ./mux video-only.mp4 narration.m4a explainer.mp4` adds the narration (passthrough).
5. Poster: a frame of scene 1 with both lines visible (9.8 s), saved as JPEG quality 86.

Checks before publishing: decode the muxed audio back to WAV and compare its speech segments with `cues.json`
(every cue must start inside a speech segment that begins within 0.1 s of it), and look at a contact sheet of one
frame per cue to confirm the sentence on screen is the sentence being spoken.

Copy the three files into `docs/assets/video/` under the existing names and bump the `?v=` keys in `docs/index.html`.
