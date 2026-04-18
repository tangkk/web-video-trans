# web-video-trans

A local-first web app for carefully listening to, inspecting, and transcribing music from video or audio files.

## What this app is for

This tool is mainly designed for **music transcription** work:

- slowing down a performance without changing workflow complexity too much
- zooming into the waveform to inspect short phrases, attacks, and note boundaries
- looping small sections with A/B markers
- using EQ presets (and manual EQ shaping) to bring out instruments or voices you want to hear more clearly
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

## Why it is useful for transcription

When transcribing music, the hard part is often not just hearing the note — it is hearing the note **clearly enough, enough times, in a small enough window**, to make a confident decision.

This app helps with that by combining:

- repeat listening
- waveform-guided navigation
- playback speed adjustment
- spectral emphasis via EQ

That combination makes it easier to:

- detect note starts and endings
- hear inner parts in a mix
- compare repeated phrases
- confirm articulation, rhythm, and pitch movement

## Workflow suggestion

A practical transcription workflow in this app:

1. Open a local video or audio file
2. Find the phrase you want to study
3. Set an A/B loop around the phrase
4. Reduce speed if needed
5. Apply an EQ preset that highlights the target instrument
6. Fine-tune the EQ by dragging the graphic EQ points
7. Zoom into the waveform for more accurate seeking
8. Repeat until the phrase is clear enough to write down

## Notes

- The app is meant for **careful listening and transcription**, not full DAW-style production.
- EQ presets are heuristic listening aids, not mixing presets.
- Results depend on the source audio and arrangement density.

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
