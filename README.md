# web-video-trans

**web-video-trans** is a lightweight, local-first, open-source tool for music listening, waveform inspection, and transcription directly in the browser. You can use it right now at **https://tangkk.github.io/web-video-trans/**, and the full source code is openly available at **https://github.com/tangkk/web-video-trans**. If you want a practical ear-training and transcription helper that stays transparent, hackable, and fully open source, this is exactly that.

A local-first web app for carefully listening to, inspecting, and transcribing music from video or audio files.

## What this app is for

This tool is mainly designed for **music transcription** work:

- slowing down a performance without making the workflow heavy
- zooming into the waveform to inspect short phrases, attacks, and note boundaries
- looping small sections with A/B markers
- using EQ presets (and manual EQ shaping) to bring out instruments or voices you want to hear more clearly
- turning the current A/B loop into a piano-roll-style transcription view
- working from local video/audio files directly in the browser, without uploading them anywhere

Typical use cases:

- transcribing guitar lines from a live clip
- checking bass movement in a dense mix
- isolating vocal details for melody or lyric transcription
- inspecting drums, saxophone, trumpet, piano, or other instruments with EQ emphasis
- learning by ear from downloaded performance videos or screen-recorded clips

## Core features

- **Local-only processing**: files stay in your browser
- **Waveform view**: inspect timing and phrase boundaries visually
- **Zoom + seek**: move around precisely in the material
- **A/B loop**: repeat short passages for close listening
- **Speed control**: slow material down for transcription
- **Graphic EQ**:
  - preset EQ targets such as Guitar, Bass, Saxophone, Piano, Vocal, Trumpet, Drums
  - draggable EQ points for manual shaping
- **Video + audio support**: load common local media formats directly
- **A/B transcription panel**:
  - transcribe the current A/B loop into a piano-roll note view
  - horizontal scrolling for longer windows, with cursor-following playback
  - visible custom horizontal scrollbar for navigation
  - hover note labels directly on notes
  - focus mode for a robust pitch-range view with outlier suppression
  - fixed **2 octave** mode for a stable compact pitch view
- **Interactive piano roll**:
  - hover notes to inspect pitch names
  - press / drag on notes or the pitch axis to preview pitches
  - mouse wheel pitch-range browsing without losing the current mode
- **Waveform interaction improvements**:
  - A/B marker dragging has priority when the pointer is actually on A or B
  - scrub remains available when not directly hitting A/B markers

## Why it is useful for transcription

When transcribing music, the hard part is often not just hearing the note — it is hearing the note **clearly enough, enough times, in a small enough window**, to make a confident decision.

This app helps with that by combining:

- repeat listening
- waveform-guided navigation
- playback speed adjustment
- spectral emphasis via EQ
- loop-based transcription visualization

That combination makes it easier to:

- detect note starts and endings
- hear inner parts in a mix
- compare repeated phrases
- confirm articulation, rhythm, and pitch movement
- spot note distribution visually inside a short loop

## Workflow suggestion

A practical transcription workflow in this app:

1. Open a local video or audio file
2. Find the phrase you want to study
3. Set an A/B loop around the phrase
4. Reduce speed if needed
5. Apply an EQ preset that highlights the target instrument
6. Fine-tune the EQ by dragging the graphic EQ points
7. Zoom into the waveform for more accurate seeking
8. Run **Transcribe A-B** to generate the piano roll
9. Use **Focus** or **2 octave** mode depending on whether you want adaptive range or a fixed compact range
10. Hover notes to inspect pitch names and keep looping until the phrase is clear enough to write down

## Notes

- The app is meant for **careful listening and transcription**, not full DAW-style production.
- EQ presets are heuristic listening aids, not mixing presets.
- The transcription view is designed as a practical listening aid, not a perfect symbolic transcription engine.
- Results depend on the source audio, arrangement density, and instrument clarity.
- Short, relatively clean, single-instrument passages usually work best.

## Local development

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

If you want to test from a phone on the same Wi‑Fi:

```bash
npm run dev -- --host 0.0.0.0
```

Then open:

```text
http://<your-mac-lan-ip>:5173/web-video-trans/
```

## Open source

This project is open source.

- Live demo: https://tangkk.github.io/web-video-trans/
- Source code: https://github.com/tangkk/web-video-trans
