import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const video = document.getElementById('video');
const viewerCard = document.querySelector('.viewer-card');
const videoFileInput = document.getElementById('videoFile');
const dropZone = document.getElementById('dropZone');
const emptyState = document.getElementById('emptyState');
const mobileClearBtn = document.getElementById('mobileClearBtn');
const mobileAudioClearBtn = document.getElementById('mobileAudioClearBtn');
const statusTextEl = document.getElementById('statusText');
const waveViewport = document.getElementById('waveViewport');
const waveCanvas = document.getElementById('waveCanvas');
const zoomSlider = document.getElementById('zoomSlider');
const zoomLabel = document.getElementById('zoomLabel');
const speedSlider = document.getElementById('speedSlider');
const speedLabel = document.getElementById('speedLabel');
const seekBar = document.getElementById('seekBar');
const playPauseBtn = document.getElementById('playPauseBtn');
const playPauseIcon = document.getElementById('playPauseIcon');
const currentTimeTextEl = document.getElementById('currentTimeText');
const remainingTimeTextEl = document.getElementById('remainingTimeText');
const openFileBtn = document.getElementById('openFileBtn');
const clearBtn = document.getElementById('clearBtn');
const debugToggleBtn = document.getElementById('debugToggleBtn');
const shortcutBtn = document.getElementById('shortcutBtn');
const shortcutPopover = document.getElementById('shortcutPopover');
const stopBtn = document.getElementById('stopBtn');
const setABtn = document.getElementById('setABtn');
const setBBtn = document.getElementById('setBBtn');
const clearLoopBtn = document.getElementById('clearLoopBtn');
const processingPanel = document.getElementById('processingPanel');
const processingStageEl = document.getElementById('processingStage');
const processingDetailEl = document.getElementById('processingDetail');
const processingPercentEl = document.getElementById('processingPercent');
const progressFillEl = document.getElementById('progressFill');
const processingHintEl = document.getElementById('processingHint');
const debugPanelShell = document.getElementById('debugPanelShell');
const debugPanel = document.getElementById('debugPanel');
const copyDebugBtn = document.getElementById('copyDebugBtn');
const clearDebugBtn = document.getElementById('clearDebugBtn');
const eqPanel = document.getElementById('eqPanel');
const eqPresetBadge = document.getElementById('eqPresetBadge');
const eqPresets = document.getElementById('eqPresets');
const eqGraphCanvas = document.getElementById('eqGraphCanvas');
const transcribePanel = document.getElementById('transcribePanel');
const transcribeBody = document.getElementById('transcribeBody');
const transcribeBadge = document.getElementById('transcribeBadge');
const transcribeBtn = document.getElementById('transcribeBtn');
const transcribeMeta = document.getElementById('transcribeMeta');

const ctx = waveCanvas.getContext('2d');
const eqGraphCtx = eqGraphCanvas.getContext('2d');
const transcribeCanvas = document.getElementById('transcribeCanvas');

const transcribeCtx = transcribeCanvas.getContext('2d');

let objectUrl = null;
let audioContext = null;
let decodedAudioBuffer = null;
let shortLoopSourceNode = null;
let shortLoopGainNode = null;
let shortLoopPlayback = {
  active: false,
  start: 0,
  end: 0,
  startedAtContextTime: 0,
  offsetAtStart: 0,
};
let waveformPeaks = [];
let sourcePeaks = [];
let currentFile = null;
let currentJobId = 0;
let lastDrawnProgress = -1;
let ffmpeg = null;
let ffmpegLoadPromise = null;
let lastKnownDuration = 0;
let rafId = null;
let lastTimelineTextSecond = -1;
let zoomLevel = 1;
let playbackRate = 1;
let isPointerSeekingWaveform = false;
let waveformPointerGesture = null;
let waveformLongPressTimer = null;
let waveformPreviewLoopInterval = null;
let isWaveformLongPressPreviewActive = false;
let waveformLongPressPreviewPlayToken = 0;
let waveformPlaybackPrimed = false;
let waveformLongPressPreview = {
  active: false,
  start: 0,
  end: 0,
};
let waveformRangeSelect = {
  active: false,
  anchorRatio: 0,
};
let waveformHandleDrag = {
  active: false,
  handle: null,
  pendingHandle: null,
};
let isWaveViewportPanning = false;
let waveformHoveredHandle = null;
let lastPlayheadX = 0;
let lastPlayheadCssX = 0;
let pipelineDebugLines = [];
let pipelineDebugStartedAt = 0;
let lastProgressDebugAt = -1;
let debugUiEnabled = false;
const EQ_PRESETS = {
  flat: { label: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  guitar: { label: 'Guitar', gains: [-3, -2, -1, 0, 1, 2, 3, 2, 0, -1] },
  bass: { label: 'Bass', gains: [5, 5, 4, 2, 0, -1, -2, -3, -3, -3] },
  saxophone: { label: 'Saxophone', gains: [-3, -2, -1, 1, 2, 3, 3, 2, 0, -1] },
  piano: { label: 'Piano', gains: [-2, -1, 0, 1, 2, 2, 1, 1, 0, -1] },
  vocal: { label: 'Vocal', gains: [-4, -3, -2, -1, 1, 3, 4, 3, 1, -1] },
  trumpet: { label: 'Trumpet', gains: [-5, -4, -3, -1, 1, 3, 4, 4, 2, 0] },
  drums: { label: 'Drums', gains: [4, 4, 3, 1, -1, 0, 2, 3, 2, 0] },
};
const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

let mediaSourceNode = null;
let eqFilters = [];
let currentEqPreset = 'flat';
let currentEqGains = [...EQ_PRESETS.flat.gains];
let activeEqBandIndex = null;
let basicPitchModulePromise = null;
let basicPitchModelPromise = null;
let currentTranscribeJobId = 0;
let transcribeResult = null;
let transcribeHoverNoteIndex = -1;
let transcribePitchPreviewNodes = [];
let activeTranscribePointerId = null;
let transcribeView = {
  minPitch: 48,
  maxPitch: 84,
};
let transcribeState = {
  status: 'idle',
  message: 'Set an A-B loop first.',
  detail: '',
  progress: 0,
};
let loopState = {
  enabledA: false,
  enabledB: false,
  start: 0,
  end: 0,
};
let processingState = {
  active: false,
  percent: 0,
  stage: 'Preparing',
  detail: 'Waiting to start',
  hint: 'The first run may take longer because FFmpeg core needs to load.',
};

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const totalSeconds = Math.floor(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function setStatus(text) {
  statusTextEl.textContent = text;
}

function updatePlaybackRate(rate) {
  const clamped = Math.max(0.1, Math.min(2.0, Math.round(rate * 10) / 10));
  playbackRate = clamped;
  video.playbackRate = clamped;
  speedSlider.value = String(Math.round(clamped * 10));
  speedLabel.textContent = `${clamped.toFixed(1)}×`;
}

function updateZoomLabel() {
  zoomLabel.textContent = `${zoomLevel}×`;
}

function getEqGraphMetrics() {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = eqGraphCanvas.clientWidth || 320;
  const cssHeight = 150;
  const width = Math.floor(cssWidth * dpr);
  const height = Math.floor(cssHeight * dpr);
  const padX = width * 0.08;
  const midY = height / 2;
  const maxGain = 6;
  const graphHeight = height * 0.28;
  return { dpr, cssWidth, cssHeight, width, height, padX, midY, maxGain, graphHeight };
}

function getEqPoints(metrics = getEqGraphMetrics()) {
  const { width, padX, midY, maxGain, graphHeight } = metrics;
  const stepX = (width - padX * 2) / (EQ_FREQUENCIES.length - 1);
  return currentEqGains.map((gain, index) => ({
    x: padX + stepX * index,
    y: midY - (gain / maxGain) * graphHeight,
  }));
}

function drawEqGraph() {
  const metrics = getEqGraphMetrics();
  const { width, height, cssHeight, padX, midY, maxGain, graphHeight } = metrics;

  if (eqGraphCanvas.width !== width || eqGraphCanvas.height !== height) {
    eqGraphCanvas.width = width;
    eqGraphCanvas.height = height;
  }
  eqGraphCanvas.style.height = `${cssHeight}px`;

  eqGraphCtx.clearRect(0, 0, width, height);
  eqGraphCtx.fillStyle = '#ffffff';
  eqGraphCtx.fillRect(0, 0, width, height);

  eqGraphCtx.strokeStyle = 'rgba(0,0,0,0.08)';
  eqGraphCtx.lineWidth = 1;
  for (let i = -6; i <= 6; i += 3) {
    const y = midY - (i / maxGain) * graphHeight;
    eqGraphCtx.beginPath();
    eqGraphCtx.moveTo(padX, y);
    eqGraphCtx.lineTo(width - padX, y);
    eqGraphCtx.stroke();
  }

  eqGraphCtx.strokeStyle = 'rgba(0,0,0,0.16)';
  eqGraphCtx.beginPath();
  eqGraphCtx.moveTo(padX, midY);
  eqGraphCtx.lineTo(width - padX, midY);
  eqGraphCtx.stroke();

  const points = getEqPoints(metrics);

  eqGraphCtx.strokeStyle = '#111111';
  eqGraphCtx.lineWidth = Math.max(2, width * 0.004);
  eqGraphCtx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) eqGraphCtx.moveTo(point.x, point.y);
    else eqGraphCtx.lineTo(point.x, point.y);
  });
  eqGraphCtx.stroke();

  points.forEach((point, index) => {
    eqGraphCtx.fillStyle = activeEqBandIndex === index ? '#d94827' : '#111111';
    eqGraphCtx.beginPath();
    eqGraphCtx.arc(point.x, point.y, Math.max(4, width * 0.009), 0, Math.PI * 2);
    eqGraphCtx.fill();

    eqGraphCtx.fillStyle = '#666666';
    eqGraphCtx.font = `${Math.max(9, width * 0.016)}px Inter, sans-serif`;
    eqGraphCtx.textAlign = 'center';
    const label = EQ_FREQUENCIES[index] >= 1000
      ? `${EQ_FREQUENCIES[index] / 1000}k`
      : `${EQ_FREQUENCIES[index]}`;
    if (index % 2 === 0 || index === EQ_FREQUENCIES.length - 1) {
      eqGraphCtx.fillText(label, point.x, height - 10);
    }

    if (activeEqBandIndex === index) {
      eqGraphCtx.fillStyle = '#d94827';
      eqGraphCtx.fillText(`${currentEqGains[index]} dB`, point.x, Math.max(14, point.y - 12));
    }
  });
}

function updateEqUi() {
  if (eqPresetBadge) {
    eqPresetBadge.textContent = EQ_PRESETS[currentEqPreset]?.label || 'Custom';
  }

  if (eqPresets) {
    eqPresets.querySelectorAll('[data-eq-preset]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.eqPreset === currentEqPreset);
    });
  }

  drawEqGraph();
}

function formatNoteName(midi) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const note = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

function getLoopSpanSeconds() {
  return isLoopActive() ? Math.max(0, loopState.end - loopState.start) : 0;
}

function resetTranscribeResult() {
  transcribeResult = null;
}

function updateTranscribeUi() {
  const loopSpan = getLoopSpanSeconds();
  const hasLoop = isLoopActive();
  const tooLong = hasLoop && loopSpan > 30;
  const busy = transcribeState.status === 'running';
  const hasResult = Boolean(transcribeResult);

  if (transcribeBody) {
    transcribeBody.classList.toggle('has-result', hasResult);
  }

  if (transcribeBadge) {
    const labelMap = {
      idle: 'Idle',
      running: 'Running',
      done: 'Done',
      error: 'Failed',
    };
    transcribeBadge.textContent = labelMap[transcribeState.status] || 'Idle';
    transcribeBadge.dataset.state = transcribeState.status;
  }

  if (transcribeBtn) {
    transcribeBtn.disabled = !decodedAudioBuffer || !hasLoop || tooLong || busy || processingState.active;
  }

  if (transcribeMeta) {
    if (busy) {
      transcribeMeta.textContent = transcribeState.detail || transcribeState.message || 'Transcribing…';
    } else if (!decodedAudioBuffer) {
      transcribeMeta.textContent = 'Load a file first.';
    } else if (!hasLoop) {
      transcribeMeta.textContent = 'Set an A-B loop first.';
    } else if (tooLong) {
      transcribeMeta.textContent = `Selection is ${loopSpan.toFixed(1)}s. Trim it to 30.0s or less.`;
    } else if (transcribeState.status === 'done' && transcribeResult?.notes?.length) {
      transcribeMeta.textContent = `${transcribeResult.notes.length} notes · ${loopSpan.toFixed(2)}s window`;
    } else if (transcribeState.status === 'done') {
      transcribeMeta.textContent = `No confident notes found in ${loopSpan.toFixed(2)}s.`;
    } else if (transcribeState.status === 'error') {
      transcribeMeta.textContent = transcribeState.message || 'Transcription failed.';
    } else {
      transcribeMeta.textContent = `Ready to transcribe ${loopSpan.toFixed(2)}s from A-B.`;
    }
  }

  drawTranscriptionRoll();
}

function setTranscribeState(status, message = '', detail = '', progress = 0) {
  transcribeState = { status, message, detail, progress };
  updateTranscribeUi();
}

function resizeTranscribeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = transcribeCanvas.clientWidth || 640;
  const cssHeight = 260;
  const width = Math.max(480, Math.floor(cssWidth * dpr));
  const height = Math.max(240, Math.floor(cssHeight * dpr));

  transcribeCanvas.style.height = `${cssHeight}px`;
  if (transcribeCanvas.width !== width || transcribeCanvas.height !== height) {
    transcribeCanvas.width = width;
    transcribeCanvas.height = height;
  }
}

function getTranscriptionMetrics() {
  const width = transcribeCanvas.width;
  const height = transcribeCanvas.height;
  const padLeft = Math.max(42, width * 0.07);
  const padRight = Math.max(14, width * 0.03);
  const padTop = 12;
  const padBottom = 24;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;
  return { width, height, padLeft, padRight, padTop, padBottom, innerWidth, innerHeight };
}

function syncTranscribeViewToResult() {
  if (!transcribeResult?.notes?.length) {
    transcribeView.minPitch = 48;
    transcribeView.maxPitch = 84;
    return;
  }
  const minPitch = Math.min(...transcribeResult.notes.map((note) => note.pitchMidi));
  const maxPitch = Math.max(...transcribeResult.notes.map((note) => note.pitchMidi));
  const span = Math.max(12, maxPitch - minPitch + 5);
  transcribeView.minPitch = Math.max(21, minPitch - 2);
  transcribeView.maxPitch = Math.min(108, transcribeView.minPitch + span);
}

function getTranscribeCursorSeconds() {
  if (!transcribeResult) return null;
  const absoluteCurrent = shortLoopPlayback.active
    ? (shortLoopPlayback.start + (((audioContext?.currentTime || 0) - shortLoopPlayback.startedAtContextTime) % Math.max(0.001, shortLoopPlayback.end - shortLoopPlayback.start)))
    : (video.currentTime || 0);
  const relative = absoluteCurrent - transcribeResult.startedAt;
  if (!Number.isFinite(relative)) return null;
  return Math.max(0, Math.min(transcribeResult.duration, relative));
}

function getTranscribeNoteAtEvent(event) {
  if (!transcribeResult?.notes?.length) return { index: -1, note: null };
  const rect = transcribeCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const x = (event.clientX - rect.left) * dpr;
  const y = (event.clientY - rect.top) * dpr;
  const { padLeft, padTop, innerWidth, innerHeight } = getTranscriptionMetrics();
  const duration = Math.max(0.001, transcribeResult.duration || 1);
  const pitchMin = transcribeView.minPitch;
  const pitchMax = transcribeView.maxPitch;
  const pitchSpan = Math.max(1, pitchMax - pitchMin + 1);

  for (let i = transcribeResult.notes.length - 1; i >= 0; i -= 1) {
    const note = transcribeResult.notes[i];
    if (note.pitchMidi < pitchMin || note.pitchMidi > pitchMax) continue;
    const noteX = padLeft + (note.startTimeSeconds / duration) * innerWidth;
    const noteWidth = Math.max(2, (note.durationSeconds / duration) * innerWidth);
    const row = pitchMax - note.pitchMidi;
    const noteY = padTop + (row / pitchSpan) * innerHeight + 1;
    const noteH = Math.max(4, innerHeight / pitchSpan - 2);
    if (x >= noteX && x <= noteX + noteWidth && y >= noteY && y <= noteY + noteH) {
      return { index: i, note };
    }
  }

  return { index: -1, note: null };
}

function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function stopTranscribePitchPreview() {
  transcribePitchPreviewNodes.forEach(({ oscillator, gain }) => {
    try {
      if (audioContext) {
        gain.gain.cancelScheduledValues(audioContext.currentTime);
        gain.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.02);
        oscillator.stop(audioContext.currentTime + 0.08);
      } else {
        oscillator.stop();
      }
    } catch (error) {}
    try { oscillator.disconnect(); } catch (error) {}
    try { gain.disconnect(); } catch (error) {}
  });
  transcribePitchPreviewNodes = [];
}

async function startSustainedTranscribedPitch(pitchMidi) {
  if (!Number.isFinite(pitchMidi)) return;
  const context = await ensureAudioContext();
  if (context.state === 'suspended') {
    await context.resume();
  }
  stopTranscribePitchPreview();

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.value = midiToFrequency(pitchMidi);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.012);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  transcribePitchPreviewNodes.push({ oscillator, gain, pitchMidi });
}

function getPitchFromTranscribeYAxis(event) {
  if (!transcribeResult?.notes?.length) return null;
  const rect = transcribeCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const x = (event.clientX - rect.left) * dpr;
  const y = (event.clientY - rect.top) * dpr;
  const { padLeft, padTop, innerHeight } = getTranscriptionMetrics();
  if (x > padLeft - 4) return null;
  const pitchMin = transcribeView.minPitch;
  const pitchMax = transcribeView.maxPitch;
  const pitchSpan = Math.max(1, pitchMax - pitchMin + 1);
  const relativeY = Math.max(0, Math.min(innerHeight - 1, y - padTop));
  const row = Math.floor((relativeY / innerHeight) * pitchSpan);
  return Math.max(pitchMin, Math.min(pitchMax, pitchMax - row));
}

function drawTranscriptionRoll() {
  if (!transcribeCanvas || !transcribeCtx) return;
  resizeTranscribeCanvas();

  const { width, height, padLeft, padRight, padTop, padBottom, innerWidth, innerHeight } = getTranscriptionMetrics();
  transcribeCtx.clearRect(0, 0, width, height);
  transcribeCtx.fillStyle = '#ffffff';
  transcribeCtx.fillRect(0, 0, width, height);

  transcribeCtx.strokeStyle = 'rgba(0,0,0,0.08)';
  transcribeCtx.lineWidth = 1;
  transcribeCtx.strokeRect(padLeft, padTop, innerWidth, innerHeight);

  if (!transcribeResult) {
    transcribeCtx.fillStyle = '#777777';
    transcribeCtx.font = `${Math.max(12, width * 0.015)}px Inter, sans-serif`;
    transcribeCtx.textAlign = 'center';
    transcribeCtx.textBaseline = 'middle';
    transcribeCtx.fillText('No transcription yet', width / 2, height / 2);
    return;
  }

  const notes = transcribeResult.notes || [];
  const duration = Math.max(0.001, transcribeResult.duration || getLoopSpanSeconds() || 1);
  if (!notes.length) {
    transcribeCtx.fillStyle = '#777777';
    transcribeCtx.font = `${Math.max(12, width * 0.015)}px Inter, sans-serif`;
    transcribeCtx.textAlign = 'center';
    transcribeCtx.textBaseline = 'middle';
    transcribeCtx.fillText('No confident notes found', width / 2, height / 2);
    return;
  }

  const pitchMin = transcribeView.minPitch;
  const pitchMax = transcribeView.maxPitch;
  const pitchSpan = Math.max(1, pitchMax - pitchMin + 1);

  for (let pitch = pitchMin; pitch <= pitchMax + 1; pitch += 1) {
    const row = pitchMax - pitch + 1;
    const y = padTop + (row / pitchSpan) * innerHeight;
    transcribeCtx.beginPath();
    transcribeCtx.moveTo(padLeft, y);
    transcribeCtx.lineTo(width - padRight, y);
    transcribeCtx.strokeStyle = pitch % 12 === 0 ? 'rgba(0,0,0,0.09)' : 'rgba(0,0,0,0.04)';
    transcribeCtx.stroke();
  }

  const ticks = Math.min(8, Math.max(2, Math.ceil(duration)));
  for (let i = 0; i <= ticks; i += 1) {
    const ratio = i / ticks;
    const x = padLeft + ratio * innerWidth;
    transcribeCtx.beginPath();
    transcribeCtx.moveTo(x, padTop);
    transcribeCtx.lineTo(x, padTop + innerHeight);
    transcribeCtx.strokeStyle = 'rgba(0,0,0,0.06)';
    transcribeCtx.stroke();

    transcribeCtx.fillStyle = '#777777';
    transcribeCtx.font = `${Math.max(10, width * 0.012)}px Inter, sans-serif`;
    transcribeCtx.textAlign = i === 0 ? 'left' : i === ticks ? 'right' : 'center';
    transcribeCtx.textBaseline = 'top';
    transcribeCtx.fillText(`${(ratio * duration).toFixed(1)}s`, x, height - padBottom + 6);
  }

  for (let pitch = pitchMin; pitch <= pitchMax; pitch += 1) {
    const row = pitchMax - pitch;
    const y = padTop + (row / pitchSpan) * innerHeight;
    const rowHeight = innerHeight / pitchSpan;
    const isNatural = !formatNoteName(pitch).includes('#');
    transcribeCtx.fillStyle = isNatural ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.06)';
    transcribeCtx.fillRect(0, y, padLeft - 6, rowHeight);
    transcribeCtx.fillStyle = '#777777';
    transcribeCtx.font = `${Math.max(9, width * 0.011)}px Inter, sans-serif`;
    transcribeCtx.textAlign = 'right';
    transcribeCtx.textBaseline = 'middle';
    transcribeCtx.fillText(formatNoteName(pitch), padLeft - 8, y + rowHeight / 2);
  }

  notes.forEach((note, index) => {
    if (note.pitchMidi < pitchMin || note.pitchMidi > pitchMax) return;
    const x = padLeft + (note.startTimeSeconds / duration) * innerWidth;
    const noteWidth = Math.max(2, (note.durationSeconds / duration) * innerWidth);
    const row = pitchMax - note.pitchMidi;
    const y = padTop + (row / pitchSpan) * innerHeight + 1;
    const h = Math.max(4, innerHeight / pitchSpan - 2);
    const confidence = Math.max(0, Math.min(1, note.amplitude ?? 0.6));
    const isHovered = index === transcribeHoverNoteIndex;
    transcribeCtx.fillStyle = isHovered ? 'rgba(217,72,39,0.92)' : `rgba(17,17,17,${0.35 + confidence * 0.55})`;
    roundRect(transcribeCtx, x, y, noteWidth, h, Math.min(4, h / 2));
    transcribeCtx.fill();
  });

  const cursorSeconds = getTranscribeCursorSeconds();
  if (cursorSeconds != null) {
    const cursorX = padLeft + (cursorSeconds / duration) * innerWidth;
    transcribeCtx.fillStyle = 'rgba(217,72,39,0.92)';
    transcribeCtx.fillRect(cursorX, padTop, Math.max(2, width * 0.0018), innerHeight);
  }
}


async function ensureBasicPitchModel() {
  if (!basicPitchModulePromise) {
    basicPitchModulePromise = import('@spotify/basic-pitch');
  }
  const mod = await basicPitchModulePromise;
  if (!basicPitchModelPromise) {
    const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
    const modelUrl = new URL('basic-pitch-model/model.json', baseUrl).href;
    basicPitchModelPromise = Promise.resolve(new mod.BasicPitch(modelUrl));
  }
  return { mod, model: await basicPitchModelPromise };
}

function resampleMonoBuffer(sourceBuffer, targetSampleRate = 22050) {
  const start = Math.max(0, Math.floor(loopState.start * sourceBuffer.sampleRate));
  const end = Math.min(sourceBuffer.length, Math.ceil(loopState.end * sourceBuffer.sampleRate));
  const frameCount = Math.max(1, end - start);
  const channelCount = sourceBuffer.numberOfChannels;
  const mono = new Float32Array(frameCount);

  for (let channel = 0; channel < channelCount; channel += 1) {
    const data = sourceBuffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i += 1) {
      mono[i] += data[start + i] / channelCount;
    }
  }

  if (sourceBuffer.sampleRate === targetSampleRate) {
    return mono;
  }

  const ratio = targetSampleRate / sourceBuffer.sampleRate;
  const outputLength = Math.max(1, Math.round(frameCount * ratio));
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const position = i / ratio;
    const left = Math.floor(position);
    const right = Math.min(frameCount - 1, left + 1);
    const mix = position - left;
    output[i] = mono[left] * (1 - mix) + mono[right] * mix;
  }
  return output;
}

async function runTranscription() {
  if (!decodedAudioBuffer) {
    setStatus('Load a file first');
    updateTranscribeUi();
    return;
  }
  if (!isLoopActive()) {
    setStatus('Set an A-B loop before transcribing');
    updateTranscribeUi();
    return;
  }

  const span = getLoopSpanSeconds();
  if (span > 30) {
    setTranscribeState('error', `Selection is ${span.toFixed(1)}s. Trim it to 30.0s or less.`, '', 0);
    setStatus('Transcribe refused: A-B loop is longer than 30s');
    return;
  }

  const jobId = ++currentTranscribeJobId;
  resetTranscribeResult();
  if (transcribePanel) transcribePanel.open = true;
  setTranscribeState('running', 'Loading transcription model…', 'Loading Basic Pitch…', 0);
  setStatus('Transcribing A-B loop…');

  try {
    const { mod, model } = await ensureBasicPitchModel();
    if (jobId !== currentTranscribeJobId) return;

    setTranscribeState('running', 'Preparing audio segment…', `Using ${span.toFixed(2)}s from the current A-B loop`, 0.08);
    const mono22050 = resampleMonoBuffer(decodedAudioBuffer, 22050);
    if (jobId !== currentTranscribeJobId) return;

    const frameCollector = { frames: [], onsets: [], contours: [] };
    setTranscribeState('running', 'Running Basic Pitch…', 'Extracting note candidates…', 0.15);
    await model.evaluateModel(
      mono22050,
      (frames, onsets, contours) => {
        frameCollector.frames.push(...frames);
        frameCollector.onsets.push(...onsets);
        frameCollector.contours.push(...contours);
      },
      (percent) => {
        if (jobId !== currentTranscribeJobId) return;
        setTranscribeState('running', 'Running Basic Pitch…', `${Math.round(percent * 100)}%`, 0.15 + percent * 0.75);
      },
    );
    if (jobId !== currentTranscribeJobId) return;

    const noteFrames = mod.outputToNotesPoly(frameCollector.frames, frameCollector.onsets, 0.5, 0.3, 5, true, null, null, true, 11);
    const timedNotes = mod.noteFramesToTime(noteFrames)
      .map((note) => ({
        pitchMidi: note.pitchMidi,
        amplitude: note.amplitude,
        startTimeSeconds: note.startTimeSeconds,
        durationSeconds: note.durationSeconds,
      }))
      .filter((note) => note.durationSeconds > 0.03)
      .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || a.pitchMidi - b.pitchMidi);

    transcribeResult = {
      notes: timedNotes,
      duration: span,
      startedAt: loopState.start,
      endedAt: loopState.end,
    };
    syncTranscribeViewToResult();
    setTranscribeState('done', timedNotes.length ? 'Transcription ready.' : 'No confident notes found.', '', 1);
    setStatus(timedNotes.length ? `Transcribed ${timedNotes.length} notes from A-B loop` : 'Transcription finished with no confident notes');
  } catch (error) {
    console.error(error);
    if (jobId !== currentTranscribeJobId) return;
    setTranscribeState('error', error?.message || 'Transcription failed.', '', 0);
    setStatus(`Transcription failed: ${error?.message || 'unknown error'}`);
  }
}

async function ensureEqChain() {
  const context = await ensureAudioContext();
  if (!mediaSourceNode) {
    mediaSourceNode = context.createMediaElementSource(video);
  }
  if (!eqFilters.length) {
    eqFilters = EQ_FREQUENCIES.map((frequency, index) => {
      const filter = context.createBiquadFilter();
      filter.type = index === 0 ? 'lowshelf' : index === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
      filter.frequency.value = frequency;
      filter.Q.value = 1.0;
      filter.gain.value = 0;
      return filter;
    });

    mediaSourceNode.disconnect();
    let previousNode = mediaSourceNode;
    eqFilters.forEach((filter) => {
      previousNode.connect(filter);
      previousNode = filter;
    });
    previousNode.connect(context.destination);
  }
  return context;
}

async function syncEqFiltersToCurrentGains() {
  if (!currentFile) return;
  const context = await ensureEqChain();
  eqFilters.forEach((filter, index) => {
    const gain = currentEqGains[index] ?? 0;
    filter.gain.setTargetAtTime(gain, context.currentTime, 0.015);
  });
  if (shortLoopGainNode) {
    const linearGain = Math.pow(10, ((currentEqGains[4] ?? 0) + (currentEqGains[5] ?? 0)) / 40);
    shortLoopGainNode.gain.setTargetAtTime(linearGain, context.currentTime, 0.015);
  }
}

async function applyEqPreset(presetKey) {
  if (!EQ_PRESETS[presetKey]) return;
  currentEqPreset = presetKey;
  currentEqGains = [...EQ_PRESETS[presetKey].gains];
  updateEqUi();
  await syncEqFiltersToCurrentGains();
}

function syncDebugUi() {
  document.body.classList.toggle('debug-ui-enabled', debugUiEnabled);
  if (debugPanelShell) {
    debugPanelShell.hidden = !debugUiEnabled;
  }
  if (debugToggleBtn) {
    debugToggleBtn.classList.toggle('is-active', debugUiEnabled);
    debugToggleBtn.setAttribute('aria-pressed', debugUiEnabled ? 'true' : 'false');
    debugToggleBtn.setAttribute('title', debugUiEnabled ? 'Hide debug panel' : 'Show debug panel');
  }
}

function toggleDebugUi() {
  debugUiEnabled = !debugUiEnabled;
  syncDebugUi();
  setStatus(debugUiEnabled ? 'Debug panel enabled · text selection enabled' : 'Debug panel hidden · text selection disabled');
}

function resetPipelineDebug() {
  pipelineDebugLines = [];
  pipelineDebugStartedAt = performance.now();
  updateDebugPanel();
}

function pushPipelineDebug(label, extra = '') {
  const elapsed = pipelineDebugStartedAt ? ((performance.now() - pipelineDebugStartedAt) / 1000).toFixed(2) : '0.00';
  pipelineDebugLines.push(`${elapsed}s  ${label}${extra ? `  ${extra}` : ''}`);
  pipelineDebugLines = pipelineDebugLines.slice(-20);
  updateDebugPanel();
}

function updateDebugPanel() {
  if (!debugPanel) return;
  debugPanel.textContent = pipelineDebugLines.length
    ? pipelineDebugLines.join('\n')
    : 'debug panel ready';
}

function updateEqBandFromPointer(event) {
  const rect = eqGraphCanvas.getBoundingClientRect();
  const metrics = getEqGraphMetrics();
  const points = getEqPoints(metrics);
  const dpr = metrics.dpr;
  const x = (event.clientX - rect.left) * dpr;
  const y = (event.clientY - rect.top) * dpr;

  if (activeEqBandIndex == null) {
    let closestIndex = -1;
    let closestDistance = Infinity;
    points.forEach((point, index) => {
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    if (closestDistance > 28 * dpr) return;
    activeEqBandIndex = closestIndex;
  }

  const gain = ((metrics.midY - y) / metrics.graphHeight) * metrics.maxGain;
  currentEqPreset = 'custom';
  currentEqGains[activeEqBandIndex] = Math.max(-6, Math.min(6, Math.round(gain)));
  updateEqUi();
  syncEqFiltersToCurrentGains();
}

function stepPlaybackRate(delta) {
  updatePlaybackRate(playbackRate + delta);
}

function updatePlayPauseButton() {
  const paused = shortLoopPlayback.active ? false : (video.paused || video.ended);
  playPauseIcon.innerHTML = paused
    ? '<path d="M4.5 3.5L11.5 8L4.5 12.5V3.5Z" fill="currentColor"></path>'
    : '<rect x="4.5" y="3.5" width="2.5" height="9" fill="currentColor"></rect><rect x="9" y="3.5" width="2.5" height="9" fill="currentColor"></rect>';
  playPauseBtn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
  playPauseBtn.setAttribute('title', paused ? 'Play' : 'Pause');
}

function syncMediaMode(file) {
  const isAudio = Boolean(file && (file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(file.name)));
  viewerCard.classList.toggle('audio-mode', isAudio);
}

function isLoopActive() {
  return loopState.enabledA && loopState.enabledB && loopState.end > loopState.start;
}

function getLoopDuration() {
  return isLoopActive() ? Math.max(0, loopState.end - loopState.start) : 0;
}

function shouldUseShortAudioLoop() {
  return Boolean(decodedAudioBuffer && isLoopActive() && getLoopDuration() > 0 && getLoopDuration() <= 0.3);
}

function updateLoopButtons() {
  setABtn.classList.toggle('is-active', loopState.enabledA);
  setBBtn.classList.toggle('is-active', loopState.enabledB);
  clearLoopBtn.disabled = !loopState.enabledA && !loopState.enabledB;
  updateTranscribeUi();
}

function setBusyUi(busy) {
  videoFileInput.disabled = busy;
  openFileBtn.disabled = busy;
  clearBtn.disabled = busy;
  mobileClearBtn.disabled = busy || !currentFile;
  if (mobileAudioClearBtn) mobileAudioClearBtn.disabled = busy || !currentFile;
  stopBtn.disabled = busy || !currentFile;
  shortcutBtn.disabled = busy;
  setABtn.disabled = busy || !currentFile;
  setBBtn.disabled = busy || !currentFile;
  clearLoopBtn.disabled = busy || (!loopState.enabledA && !loopState.enabledB);
  zoomSlider.disabled = busy;
}

function updateProcessingUi() {
  processingPanel.hidden = !processingState.active;
  processingStageEl.textContent = processingState.stage;
  processingDetailEl.textContent = processingState.detail;
  processingPercentEl.textContent = `${Math.max(0, Math.min(100, Math.round(processingState.percent)))}%`;
  progressFillEl.style.width = `${Math.max(0, Math.min(100, processingState.percent))}%`;
  processingHintEl.textContent = processingState.hint;
  setBusyUi(processingState.active);
  updateLoopButtons();
}

function startProcessing(stage, detail, hint = 'Everything runs locally in your browser. No file is uploaded.', percent = 0) {
  processingState = { active: true, stage, detail, hint, percent };
  updateProcessingUi();
}

function updateProcessing({ stage, detail, hint, percent }) {
  processingState = {
    ...processingState,
    active: true,
    ...(stage !== undefined ? { stage } : {}),
    ...(detail !== undefined ? { detail } : {}),
    ...(hint !== undefined ? { hint } : {}),
    ...(percent !== undefined ? { percent } : {}),
  };
  updateProcessingUi();
}

function finishProcessing(success = true, detail = success ? 'Done' : 'Failed') {
  processingState = {
    active: false,
    percent: success ? 100 : processingState.percent,
    stage: success ? 'Done' : 'Failed',
    detail,
    hint: success ? 'You can now click or drag across the waveform to seek.' : 'Try another file and run again.',
  };
  updateProcessingUi();
  updateDebugPanel();
}

function clearLoop() {
  loopState.enabledA = false;
  loopState.enabledB = false;
  loopState.start = 0;
  loopState.end = 0;
  currentTranscribeJobId += 1;
  resetTranscribeResult();
  setTranscribeState('idle', 'Set an A-B loop first.', '', 0);
  updateLoopButtons();
}

function describeLoopState() {
  if (isLoopActive()) {
    return `A-B loop: ${formatTime(loopState.start)} → ${formatTime(loopState.end)}`;
  }
  if (loopState.enabledA) {
    return `A set at ${formatTime(loopState.start)}`;
  }
  if (loopState.enabledB) {
    return `B set at ${formatTime(loopState.end)}`;
  }
  return 'A-B loop cleared';
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 720px)').matches;
}

function getWaveformHandleHit(event, { allowNearest = false } = {}) {
  if (!video.duration || !Number.isFinite(video.duration)) return null;
  if (!(loopState.enabledA || loopState.enabledB)) return null;

  const ratio = getViewportPointerRatio(event);
  const threshold = event.pointerType === 'touch' ? 0.02 : 0.012;
  let hit = null;
  let bestDistance = Infinity;

  if (loopState.enabledA) {
    const aRatio = loopState.start / video.duration;
    const distance = Math.abs(ratio - aRatio);
    if ((distance <= threshold || allowNearest) && distance < bestDistance) {
      hit = 'A';
      bestDistance = distance;
    }
  }

  if (loopState.enabledB) {
    const bRatio = loopState.end / video.duration;
    const distance = Math.abs(ratio - bRatio);
    if ((distance <= threshold || allowNearest) && distance < bestDistance) {
      hit = 'B';
      bestDistance = distance;
    }
  }

  return hit;
}

function syncWaveViewportTouchAction() {
  if (waveformHandleDrag.active || waveformHandleDrag.pendingHandle) {
    waveViewport.style.touchAction = 'none';
    return;
  }
  waveViewport.style.touchAction = '';
}

function updateViewportCursorVisibility(event = null) {
  const handle = event ? getWaveformHandleHit(event) : waveformHoveredHandle;
  waveformHoveredHandle = handle;
  if (waveformHandleDrag.active || handle) {
    waveCanvas.style.cursor = 'ew-resize';
    return;
  }
  waveCanvas.style.cursor = 'default';
}

function getBaseTimelineWidth() {
  return Math.max(640, Math.floor(waveViewport.clientWidth || 640));
}

function getTimelineWidth() {
  return Math.max(getBaseTimelineWidth(), Math.floor(getBaseTimelineWidth() * zoomLevel));
}

function resizeCanvasForDisplay() {
  const dpr = window.devicePixelRatio || 1;
  const widthCss = getTimelineWidth();
  const heightCss = 160;
  const width = Math.max(300, Math.floor(widthCss * dpr));
  const height = Math.max(180, Math.floor(heightCss * dpr));

  waveCanvas.style.width = `${widthCss}px`;
  waveCanvas.style.height = `${heightCss}px`;

  if (waveCanvas.width !== width || waveCanvas.height !== height) {
    waveCanvas.width = width;
    waveCanvas.height = height;
  }
}

function resetCanvas() {
  waveformPeaks = [];
  sourcePeaks = [];
  lastDrawnProgress = -1;
  drawWaveform();
}

function generatePlaceholderPeaks(count = 180) {
  const peaks = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / count;
    const base = 0.15 + 0.55 * Math.abs(Math.sin(t * Math.PI * 4.6));
    const detail = 0.18 * Math.abs(Math.sin(t * Math.PI * 17.3 + 0.5));
    const random = 0.08 * Math.random();
    peaks.push(Math.min(1, base + detail + random));
  }
  return peaks;
}

function drawMarker(x, label, width, height) {
  const markerWidth = Math.max(14, width * 0.012);
  const markerHeight = Math.max(11, height * 0.1);
  const clampedX = Math.max(markerWidth / 2, Math.min(width - markerWidth / 2, x));
  const top = 4;

  ctx.beginPath();
  ctx.moveTo(clampedX - markerWidth / 2, top);
  ctx.lineTo(clampedX + markerWidth / 2, top);
  ctx.lineTo(clampedX, top + markerHeight);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.max(9, height * 0.06)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(label, clampedX, top + 1);
}

function getDisplayPeaks(targetCount) {
  const base = sourcePeaks.length ? sourcePeaks : generatePlaceholderPeaks(1200);
  const count = Math.max(64, targetCount);
  if (base.length === count) return base;

  const sampled = [];
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor((i / count) * base.length);
    const end = Math.max(start + 1, Math.floor(((i + 1) / count) * base.length));
    let max = 0;
    for (let j = start; j < end && j < base.length; j += 1) {
      if (base[j] > max) max = base[j];
    }
    sampled.push(max);
  }
  return sampled;
}

function drawWaveform(progress = video.duration ? video.currentTime / video.duration : 0) {
  progress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  resizeCanvasForDisplay();

  const width = waveCanvas.width;
  const height = waveCanvas.height;
  const mid = height / 2;
  const targetPeakCount = Math.max(180, Math.floor(width / 3));
  const peaks = getDisplayPeaks(targetPeakCount);
  waveformPeaks = peaks;
  const barWidth = Math.max(2, Math.floor(width / peaks.length) - 1);
  const gap = 1;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  if (isLoopActive() && video.duration > 0) {
    const startX = (loopState.start / video.duration) * width;
    const endX = (loopState.end / video.duration) * width;
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(startX, 0, Math.max(0, endX - startX), height);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, mid - 0.5, width, 1);

  peaks.forEach((value, index) => {
    const x = index * (barWidth + gap);
    const normalized = Math.max(0.04, value);
    const barHeight = normalized * (height * 0.82);
    const y = mid - barHeight / 2;

    const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
    gradient.addColorStop(0, 'rgba(0,0,0,0.82)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.58)');

    ctx.fillStyle = gradient;
    roundRect(ctx, x, y, barWidth, barHeight, Math.min(4, barWidth / 2));
    ctx.fill();
  });

  if (video.duration > 0) {
    if (loopState.enabledA) {
      drawMarker((loopState.start / video.duration) * width, 'A', width, height);
    }
    if (loopState.enabledB) {
      drawMarker((loopState.end / video.duration) * width, 'B', width, height);
    }
  }

  if (isLoopActive() && video.duration > 0) {
    const startX = (loopState.start / video.duration) * width;
    const endX = (loopState.end / video.duration) * width;
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = Math.max(1, width * 0.0012);
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(startX, 1, Math.max(0, endX - startX), height - 2);
    ctx.setLineDash([]);
  }

  const playheadX = Math.max(0, Math.min(width, progress * width));
  lastPlayheadX = playheadX;
  lastPlayheadCssX = Math.max(0, Math.min(parseFloat(waveCanvas.style.width || '0') || 0, progress * (parseFloat(waveCanvas.style.width || '0') || 0)));
  ctx.fillStyle = 'rgba(0,0,0,0.92)';
  ctx.fillRect(playheadX, 0, Math.max(2, width * 0.0018), height);

  keepPlayheadInView(lastPlayheadCssX);
  updateDebugPanel();
}

function scrollWaveViewportToPlayhead(playheadCssX, marginRatio = 0.18) {
  const viewportWidth = waveViewport.clientWidth;
  if (!viewportWidth) return;

  const canvasCssWidth = parseFloat(waveCanvas.style.width || '0') || viewportWidth;
  const margin = Math.max(48, viewportWidth * marginRatio);
  const left = waveViewport.scrollLeft;
  const right = left + viewportWidth;
  const maxScroll = Math.max(0, canvasCssWidth - viewportWidth);

  let targetLeft = left;
  if (playheadCssX < left + margin) {
    targetLeft = playheadCssX - margin;
  } else if (playheadCssX > right - margin) {
    targetLeft = playheadCssX - viewportWidth + margin;
  }

  waveViewport.scrollLeft = Math.max(0, Math.min(maxScroll, targetLeft));
}

function keepPlayheadInView(playheadX) {
  const viewportWidth = waveViewport.clientWidth;
  if (!viewportWidth) return;
  if (isPointerSeekingWaveform) return;
  if (waveformHandleDrag.active || waveformRangeSelect.active) return;

  scrollWaveViewportToPlayhead(playheadX, 0.18);
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

async function ensureAudioContext() {
  pushPipelineDebug('ensureAudioContext:start', `hasContext=${Boolean(audioContext)}`);
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    pushPipelineDebug('ensureAudioContext:created', `state=${audioContext.state}`);
  }
  pushPipelineDebug('ensureAudioContext:done', `state=${audioContext.state}`);
  return audioContext;
}

function parseDurationToSeconds(value) {
  if (!value) return null;
  const parts = value.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  let seconds = 0;
  for (const part of parts) {
    seconds = seconds * 60 + part;
  }
  return seconds;
}

function maybeUpdateProgressFromLog(message) {
  const timeMatch = message.match(/time=\s*([0-9:.]+)/);
  if (!timeMatch) return;
  const currentSeconds = parseDurationToSeconds(timeMatch[1]);
  if (!Number.isFinite(currentSeconds) || !lastKnownDuration) return;
  const ratio = Math.max(0, Math.min(1, currentSeconds / lastKnownDuration));
  const percent = 30 + ratio * 50;
  updateProcessing({
    stage: 'Extracting audio',
    detail: `FFmpeg processing: ${formatTime(currentSeconds)} / ${formatTime(lastKnownDuration)}`,
    percent,
    hint: 'This step converts the source track into a WAV for waveform analysis.',
  });
}

async function fetchWithTiming(url, label) {
  const startedAt = performance.now();
  pushPipelineDebug(`${label}:fetch:start`, url);
  const response = await fetch(url, { cache: 'default' });
  const headersReceivedAt = performance.now();
  pushPipelineDebug(`${label}:fetch:headers`, `status=${response.status} type=${response.type} ${(headersReceivedAt - startedAt).toFixed(0)}ms`);
  const buffer = await response.arrayBuffer();
  const endedAt = performance.now();
  const bytes = buffer.byteLength;
  const mb = (bytes / (1024 * 1024)).toFixed(2);
  pushPipelineDebug(`${label}:fetch:done`, `${mb}MB ${(endedAt - startedAt).toFixed(0)}ms`);
  return {
    buffer,
    mimeType: response.headers.get('content-type') || undefined,
    elapsedMs: endedAt - startedAt,
    bytes,
  };
}

async function ensureFFmpegLoaded() {
  pushPipelineDebug('ensureFFmpegLoaded:start', `loaded=${Boolean(ffmpeg?.loaded)} pending=${Boolean(ffmpegLoadPromise)}`);
  if (ffmpeg?.loaded) {
    pushPipelineDebug('ensureFFmpegLoaded:cached');
    return ffmpeg;
  }
  if (ffmpegLoadPromise) {
    pushPipelineDebug('ensureFFmpegLoaded:await-existing');
    return ffmpegLoadPromise;
  }

  ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ message }) => {
    if (!message) return;
    maybeUpdateProgressFromLog(message);
  });

  ffmpegLoadPromise = (async () => {
    updateProcessing({
      stage: 'Loading FFmpeg',
      detail: 'Downloading and initializing FFmpeg core for the first run.',
      percent: 6,
      hint: 'The first run is usually the slowest.',
    });

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    pushPipelineDebug('ffmpeg:env', `ua=${navigator.userAgent}`);
    if (connection) {
      pushPipelineDebug('ffmpeg:network', `effectiveType=${connection.effectiveType || 'n/a'} downlink=${connection.downlink || 'n/a'} rtt=${connection.rtt || 'n/a'} saveData=${connection.saveData || false}`);
    }

    const coreURL = new URL('./src/vendor/ffmpeg-core/ffmpeg-core.js', import.meta.url).href;
    const wasmURL = new URL('./src/vendor/ffmpeg-core/ffmpeg-core.wasm', import.meta.url).href;
    pushPipelineDebug('ensureFFmpegLoaded:core-url-ready');
    pushPipelineDebug('ensureFFmpegLoaded:wasm-url-ready');

    updateProcessing({ percent: 10, detail: 'Fetching FFmpeg JS core…' });
    const coreFetch = await fetchWithTiming(coreURL, 'ffmpeg-core.js');
    const blobCoreURL = URL.createObjectURL(new Blob([coreFetch.buffer], { type: coreFetch.mimeType || 'text/javascript' }));

    updateProcessing({ percent: 16, detail: 'Fetching FFmpeg WASM…' });
    const wasmFetch = await fetchWithTiming(wasmURL, 'ffmpeg-core.wasm');
    const blobWasmURL = URL.createObjectURL(new Blob([wasmFetch.buffer], { type: wasmFetch.mimeType || 'application/wasm' }));

    updateProcessing({ percent: 20, detail: 'FFmpeg assets fetched. Initializing WASM…' });
    const loadStartedAt = performance.now();
    pushPipelineDebug('ffmpeg.load:start');
    try {
      await ffmpeg.load({ coreURL: blobCoreURL, wasmURL: blobWasmURL });
    } finally {
      URL.revokeObjectURL(blobCoreURL);
      URL.revokeObjectURL(blobWasmURL);
    }
    pushPipelineDebug('ffmpeg.load:done', `${(performance.now() - loadStartedAt).toFixed(0)}ms`);
    pushPipelineDebug('ensureFFmpegLoaded:loaded');
    updateProcessing({ percent: 25, detail: 'FFmpeg is ready.' });
    return ffmpeg;
  })();

  try {
    return await ffmpegLoadPromise;
  } finally {
    ffmpegLoadPromise = null;
  }
}

async function extractAudioWithFFmpeg(file, jobId) {
  pushPipelineDebug('extractAudioWithFFmpeg:start', `file=${file.name} size=${file.size}`);
  const worker = await ensureFFmpegLoaded();
  if (jobId !== currentJobId) throw new Error('File changed. Previous task cancelled');

  const inputExt = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  const inputName = `input.${inputExt}`;
  const outputName = 'audio.wav';

  try {
    updateProcessing({
      stage: 'Reading video file',
      detail: 'Reading your local video file into memory…',
      percent: 26,
      hint: 'On phones, large videos can take a while before FFmpeg starts.',
    });

    pushPipelineDebug('extractAudioWithFFmpeg:fetchFile:start');
    const inputData = await fetchFile(file);
    pushPipelineDebug('extractAudioWithFFmpeg:fetchFile:done', `bytes=${inputData?.byteLength || inputData?.length || 0}`);
    if (jobId !== currentJobId) throw new Error('File changed. Previous task cancelled');

    updateProcessing({
      stage: 'Preparing audio extraction',
      detail: 'Copying the video into FFmpeg working memory…',
      percent: 32,
      hint: 'This step is local, but can be slow for large videos on mobile.',
    });

    pushPipelineDebug('extractAudioWithFFmpeg:writeFile:start', inputName);
    await worker.writeFile(inputName, inputData);
    pushPipelineDebug('extractAudioWithFFmpeg:writeFile:done', inputName);

    updateProcessing({
      stage: 'Extracting audio',
      detail: 'FFmpeg is extracting the audio track…',
      percent: 38,
      hint: 'Larger videos take longer here.',
    });

    pushPipelineDebug('extractAudioWithFFmpeg:exec:start');
    await worker.exec([
      '-i', inputName,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-sample_fmt', 's16',
      outputName,
    ]);
    pushPipelineDebug('extractAudioWithFFmpeg:exec:done');

    if (jobId !== currentJobId) throw new Error('File changed. Previous task cancelled');

    updateProcessing({
      stage: 'Reading extracted audio',
      detail: 'Audio extracted. Reading WAV data…',
      percent: 82,
      hint: 'The next step decodes audio and computes waveform peaks.',
    });

    pushPipelineDebug('extractAudioWithFFmpeg:readFile:start', outputName);
    const data = await worker.readFile(outputName);
    pushPipelineDebug('extractAudioWithFFmpeg:readFile:done', outputName);
    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data.buffer || data);
    return uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
  } finally {
    await Promise.allSettled([
      worker.deleteFile(inputName),
      worker.deleteFile(outputName),
    ]);
  }
}

function isAudioOnlyFile(file) {
  if (!file) return false;
  return Boolean(file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(file.name));
}

function shouldTryNativeDecode(file) {
  if (!file) return false;
  if (isAudioOnlyFile(file)) return true;
  return Boolean(file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name));
}

function computePeaksFromChannelData(channelData) {
  const peakCount = 4000;
  const blockSize = Math.floor(channelData.length / peakCount) || 1;
  const peaks = [];

  for (let i = 0; i < peakCount; i += 1) {
    const start = i * blockSize;
    const end = Math.min(channelData.length, start + blockSize);
    let max = 0;
    for (let j = start; j < end; j += 1) {
      const value = Math.abs(channelData[j]);
      if (value > max) max = value;
    }
    peaks.push(max);
  }

  return normalizePeaks(peaks);
}

function normalizePeaks(peaks) {
  const max = Math.max(...peaks, 0.0001);
  return peaks.map((value) => {
    const normalized = value / max;
    return Math.pow(normalized, 0.7);
  });
}

async function buildWaveformFromFile(file, jobId) {
  resetPipelineDebug();
  pushPipelineDebug('buildWaveformFromFile:start', `file=${file.name} type=${file.type || 'unknown'} size=${file.size}`);
  pushPipelineDebug('buildWaveformFromFile:before-startProcessing');
  startProcessing(
    'Preparing file',
    isAudioOnlyFile(file)
      ? 'Preparing real waveform extraction for audio…'
      : 'Preparing real waveform extraction for video…',
    'Everything runs locally in your browser. No file is uploaded.',
    2,
  );

  pushPipelineDebug('buildWaveformFromFile:after-startProcessing');

  let context = null;
  let audioBuffer = null;
  let audioSourceBuffer;
  const audioOnly = isAudioOnlyFile(file);
  pushPipelineDebug('buildWaveformFromFile:file-kind', audioOnly ? 'audio-only' : 'video');

  pushPipelineDebug('buildWaveformFromFile:before-audio-context');
  context = await ensureAudioContext();
  pushPipelineDebug('buildWaveformFromFile:after-audio-context', `state=${context.state}`);
  if (context.state === 'suspended') {
    pushPipelineDebug('buildWaveformFromFile:audio-context-still-suspended');
  }

  if (shouldTryNativeDecode(file)) {
    updateProcessing({
      stage: audioOnly ? 'Reading audio file' : 'Reading media file',
      detail: audioOnly
        ? 'Reading the audio file for native browser decoding…'
        : 'Trying native browser audio decode before loading FFmpeg…',
      percent: 24,
      hint: 'If this works, mobile loads much faster because FFmpeg is skipped.',
    });
    pushPipelineDebug('buildWaveformFromFile:native-arrayBuffer:start');
    audioSourceBuffer = await file.arrayBuffer();
    pushPipelineDebug('buildWaveformFromFile:native-arrayBuffer:done');

    try {
      updateProcessing({
        stage: 'Decoding audio',
        detail: audioOnly
          ? 'Decoding the audio file directly in the browser…'
          : 'Trying native browser decode for the video audio track…',
        percent: 52,
        hint: 'If native decode fails, the app will fall back to FFmpeg.',
      });
      pushPipelineDebug('buildWaveformFromFile:native-decode:start');
      audioBuffer = await context.decodeAudioData(audioSourceBuffer.slice(0));
      pushPipelineDebug('buildWaveformFromFile:native-decode:done', `channels=${audioBuffer.numberOfChannels} duration=${audioBuffer.duration.toFixed(2)}`);
    } catch (error) {
      pushPipelineDebug('buildWaveformFromFile:native-decode:failed', error?.message || String(error));
      audioBuffer = null;
    }
  }

  if (!audioBuffer && !audioOnly) {
    pushPipelineDebug('buildWaveformFromFile:ffmpeg-fallback:start');
    audioSourceBuffer = await extractAudioWithFFmpeg(file, jobId);
    if (jobId !== currentJobId) throw new Error('File changed. Previous task cancelled');

    updateProcessing({
      stage: 'Decoding audio',
      detail: 'Decoding the FFmpeg-extracted WAV in the browser…',
      percent: 88,
      hint: 'Waveform sampling starts after this step.',
    });
    pushPipelineDebug('buildWaveformFromFile:ffmpeg-decode:start');
    audioBuffer = await context.decodeAudioData(audioSourceBuffer.slice(0));
    pushPipelineDebug('buildWaveformFromFile:ffmpeg-decode:done', `channels=${audioBuffer.numberOfChannels} duration=${audioBuffer.duration.toFixed(2)}`);
  }

  if (!audioBuffer) {
    throw new Error('Unable to decode audio track with native path or FFmpeg fallback');
  }

  decodedAudioBuffer = audioBuffer;
  resetTranscribeResult();
  setTranscribeState('idle', 'Set an A-B loop first.', '', 0);
  if (jobId !== currentJobId) throw new Error('File changed. Previous task cancelled');

  updateProcessing({
    stage: 'Computing waveform',
    detail: 'Sampling audio amplitudes to build the interactive waveform…',
    percent: 94,
    hint: 'Almost done.',
  });

  pushPipelineDebug('buildWaveformFromFile:computePeaks:start');
  sourcePeaks = computePeaksFromChannelData(audioBuffer.getChannelData(0));
  pushPipelineDebug('buildWaveformFromFile:computePeaks:done', `peaks=${sourcePeaks.length}`);
  waveformPeaks = [];
  drawWaveform();
  setStatus('Real waveform generated');
  finishProcessing(true, 'Real waveform is ready');
  pushPipelineDebug('buildWaveformFromFile:done');
}

async function loadFile(file) {
  if (!file) return;

  pushPipelineDebug('loadFile:start', `file=${file.name} type=${file.type || 'unknown'} size=${file.size}`);
  const jobId = ++currentJobId;
  currentFile = file;
  syncMediaMode(file);
  clearLoop();
  setStatus('Loading file…');

  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }
  objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;
  video.classList.add('ready');
  emptyState.hidden = true;

  pushPipelineDebug('loadFile:before-resetCanvas');
  resetCanvas();
  pushPipelineDebug('loadFile:after-resetCanvas');
  seekBar.value = 0;
  currentTimeTextEl.textContent = '00:00';
  remainingTimeTextEl.textContent = '-00:00';
  lastTimelineTextSecond = -1;

  try {
    pushPipelineDebug('loadFile:before-buildWaveformFromFile');
    await buildWaveformFromFile(file, jobId);
    pushPipelineDebug('loadFile:after-buildWaveformFromFile');
  } catch (error) {
    console.error(error);
    pushPipelineDebug('loadFile:error', error?.message || String(error));
    if (jobId !== currentJobId) return;
    sourcePeaks = generatePlaceholderPeaks(1200);
    waveformPeaks = [];
    drawWaveform();
    setStatus(`Real audio extraction failed. Fallback waveform shown: ${error.message || 'unknown error'}`);
    finishProcessing(false, error.message || 'Real audio extraction failed');
  }
}

function stopShortAudioLoop() {
  if (shortLoopSourceNode) {
    try {
      shortLoopSourceNode.stop();
    } catch (error) {
      // ignore stop race
    }
    try {
      shortLoopSourceNode.disconnect();
    } catch (error) {
      // ignore disconnect race
    }
    shortLoopSourceNode = null;
  }
  if (shortLoopGainNode) {
    try {
      shortLoopGainNode.disconnect();
    } catch (error) {
      // ignore disconnect race
    }
    shortLoopGainNode = null;
  }
  shortLoopPlayback.active = false;
}

async function startShortAudioLoop() {
  if (!shouldUseShortAudioLoop()) return false;
  const context = await ensureAudioContext();
  if (context.state === 'suspended') {
    await context.resume();
  }

  stopShortAudioLoop();
  video.pause();
  forceSeekToLoopStart('short-loop-start');

  const source = context.createBufferSource();
  source.buffer = decodedAudioBuffer;
  source.loop = true;
  source.loopStart = loopState.start;
  source.loopEnd = loopState.end;

  const gainNode = context.createGain();
  gainNode.gain.value = 1;
  source.connect(gainNode);
  gainNode.connect(context.destination);

  const offset = Math.max(0, Math.min(loopState.start, decodedAudioBuffer.duration));
  source.start(0, offset);
  shortLoopSourceNode = source;
  shortLoopGainNode = gainNode;
  shortLoopPlayback = {
    active: true,
    start: loopState.start,
    end: loopState.end,
    startedAtContextTime: context.currentTime,
    offsetAtStart: offset,
  };
  syncEqFiltersToCurrentGains();
  source.onended = () => {
    if (shortLoopSourceNode === source) {
      stopShortAudioLoop();
      updatePlayPauseButton();
      updateTimeline(true);
    }
  };
  updatePlayPauseButton();
  setStatus(`Short audio loop ${formatTime(loopState.start)} → ${formatTime(loopState.end)}`);
  startPlaybackAnimation();
  return true;
}

function stopToStart() {
  if (!currentFile || !video.src) return;
  stopShortAudioLoop();
  video.pause();
  video.currentTime = 0;
  waveViewport.scrollLeft = 0;
  updateTimeline(true);
  updatePlayPauseButton();
  setStatus('Stopped');
}

function clearCurrentFile() {
  stopShortAudioLoop();
  stopPlaybackAnimation();
  decodedAudioBuffer = null;
  currentJobId += 1;
  currentTranscribeJobId += 1;
  currentFile = null;
  viewerCard.classList.remove('audio-mode');
  lastKnownDuration = 0;
  lastTimelineTextSecond = -1;
  clearLoop();
  waveViewport.scrollLeft = 0;
  setStatus('Waiting for a file');
  currentTimeTextEl.textContent = '00:00';
  remainingTimeTextEl.textContent = '-00:00';
  seekBar.value = 0;
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.classList.remove('ready');
  emptyState.hidden = false;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  processingState.active = false;
  resetTranscribeResult();
  setTranscribeState('idle', 'Set an A-B loop first.', '', 0);
  updateProcessingUi();
  resetCanvas();
  setBusyUi(false);
  updatePlayPauseButton();
}

function updateTimeline(forceText = false) {
  const duration = video.duration || decodedAudioBuffer?.duration || 0;
  const currentTime = shortLoopPlayback.active
    ? (shortLoopPlayback.start + (((audioContext?.currentTime || 0) - shortLoopPlayback.startedAtContextTime) % Math.max(0.001, shortLoopPlayback.end - shortLoopPlayback.start)))
    : (video.currentTime || 0);
  const currentWholeSecond = Math.floor(currentTime);

  if (forceText || currentWholeSecond !== lastTimelineTextSecond) {
    currentTimeTextEl.textContent = formatTime(currentTime);
    remainingTimeTextEl.textContent = `-${formatTime(Math.max(0, duration - currentTime))}`;
    lastTimelineTextSecond = currentWholeSecond;
  }

  if (!video.paused && duration > 0) {
    const progressDebugBucket = Math.floor(currentTime * 4) / 4;
    if (progressDebugBucket !== lastProgressDebugAt) {
      lastProgressDebugAt = progressDebugBucket;
      pushPipelineDebug('video:progress', `current=${currentTime.toFixed(3)} paused=${video.paused} loop=${isLoopActive()} preview=${waveformLongPressPreview.active}`);
    }
  }

  if (duration > 0) {
    const progress = currentTime / duration;
    seekBar.value = String(Math.round(progress * 1000));
    if (forceText || Math.abs(progress - lastDrawnProgress) > 0.0004) {
      drawWaveform(progress);
      lastDrawnProgress = progress;
    }
  }
}

function stopPlaybackAnimation() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function playbackAnimationLoop() {
  if (shortLoopPlayback.active) {
    updateTimeline();
    drawTranscriptionRoll();
    rafId = requestAnimationFrame(playbackAnimationLoop);
    return;
  }

  if (!video.paused && !video.ended) {
    enforceLoopPlayback();
    updateTimeline();
    drawTranscriptionRoll();
    rafId = requestAnimationFrame(playbackAnimationLoop);
  } else {
    rafId = null;
  }
}

function clearDebugLog() {
  pipelineDebugLines = [];
  pipelineDebugStartedAt = performance.now();
  updateDebugPanel();
}

function startPlaybackAnimation() {
  stopPlaybackAnimation();
  playbackAnimationLoop();
}

function forceSeekToLoopStart(reason = 'unknown') {
  if (!isLoopActive() || !video.duration || !Number.isFinite(video.duration)) return;
  video.currentTime = loopState.start;
  updateTimeline(true);
  pushPipelineDebug('ab:seek-to-a', `reason=${reason} at=${loopState.start.toFixed(3)}`);
}

function handleSeekByRatio(ratio) {
  if (!video.duration || !Number.isFinite(video.duration)) return;
  const clamped = Math.max(0, Math.min(1, ratio));
  video.currentTime = clamped * video.duration;
  updateTimeline(true);

  if (zoomLevel > 1) {
    const canvasCssWidth = parseFloat(waveCanvas.style.width || '0') || 0;
    const playheadCssX = clamped * canvasCssWidth;
    scrollWaveViewportToPlayhead(playheadCssX, 0.18);
  }
}

function getViewportPointerRatio(event) {
  if (!video.duration || !Number.isFinite(video.duration)) return 0;

  if (!(isMobileViewport() && zoomLevel > 1)) {
    return getCanvasRatioFromPointer(event);
  }

  const rect = waveViewport.getBoundingClientRect();
  const viewportRatio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const absoluteCssX = waveViewport.scrollLeft + viewportRatio * rect.width;
  const canvasCssWidth = parseFloat(waveCanvas.style.width || '0') || rect.width;
  return Math.max(0, Math.min(1, absoluteCssX / canvasCssWidth));
}

function handleSeekFromViewportPointer(event) {
  if (!video.duration || !Number.isFinite(video.duration)) return;

  const ratio = getViewportPointerRatio(event);
  handleSeekByRatio(ratio);
}

function clearWaveformLongPressTimer() {
  if (waveformLongPressTimer !== null) {
    pushPipelineDebug('waveform:longpress-timer:clear');
    clearTimeout(waveformLongPressTimer);
    waveformLongPressTimer = null;
  }
}

function stopWaveformPreviewLoopWatcher() {
  if (waveformPreviewLoopInterval !== null) {
    clearInterval(waveformPreviewLoopInterval);
    waveformPreviewLoopInterval = null;
    pushPipelineDebug('waveform:v2:preview:watcher:stop');
  }
}

function startWaveformPreviewLoopWatcher() {
  stopWaveformPreviewLoopWatcher();
  waveformPreviewLoopInterval = window.setInterval(() => {
    if (!waveformLongPressPreview.active || video.paused || video.ended) return;
    const epsilon = 0.045;
    if (video.currentTime >= waveformLongPressPreview.end - epsilon) {
      video.currentTime = waveformLongPressPreview.start;
    }
  }, 16);
  pushPipelineDebug('waveform:v2:preview:watcher:start');
}

function startWaveformLongPressPreview(event) {
  if (!video.duration || !Number.isFinite(video.duration)) {
    pushPipelineDebug('waveform:v2:preview:start:skipped', 'invalid duration');
    return;
  }
  const ratio = getViewportPointerRatio(event);
  const start = Math.max(0, Math.min(video.duration, ratio * video.duration));
  const end = Math.max(start, Math.min(video.duration, start + 1));
  const playToken = ++waveformLongPressPreviewPlayToken;

  pushPipelineDebug('waveform:v2:preview:start', `pointer=${event.pointerType || 'unknown'} ratio=${ratio.toFixed(4)} start=${start.toFixed(3)} end=${end.toFixed(3)} token=${playToken}`);
  waveformLongPressPreview = {
    active: true,
    start,
    end,
  };
  isWaveformLongPressPreviewActive = true;
  handleSeekByRatio(ratio);
  startWaveformPreviewLoopWatcher();

  const playResult = video.play();
  if (playResult && typeof playResult.then === 'function') {
    playResult.then(() => {
      if (playToken !== waveformLongPressPreviewPlayToken || !waveformLongPressPreview.active) {
        pushPipelineDebug('waveform:v2:preview:play:stale', `token=${playToken}`);
        return;
      }
      pushPipelineDebug('waveform:v2:preview:play:ok', `token=${playToken}`);
    }).catch((error) => {
      if (playToken !== waveformLongPressPreviewPlayToken) {
        pushPipelineDebug('waveform:v2:preview:play:ignored-error', `token=${playToken} ${error?.message || String(error)}`);
        return;
      }
      pushPipelineDebug('waveform:v2:preview:play:error', error?.message || String(error));
    });
  } else {
    pushPipelineDebug('waveform:v2:preview:play:sync-ok', `token=${playToken}`);
  }
  setStatus(`Preview loop: ${formatTime(start)} → ${formatTime(end)}`);
}

function stopWaveformLongPressPreview() {
  if (!waveformLongPressPreview.active) {
    pushPipelineDebug('waveform:v2:preview:stop:noop');
    isWaveformLongPressPreviewActive = false;
    stopWaveformPreviewLoopWatcher();
    return;
  }

  waveformLongPressPreviewPlayToken += 1;
  pushPipelineDebug('waveform:v2:preview:stop', `at=${video.currentTime.toFixed(3)} token=${waveformLongPressPreviewPlayToken}`);
  waveformLongPressPreview = {
    active: false,
    start: 0,
    end: 0,
  };
  isWaveformLongPressPreviewActive = false;
  stopWaveformPreviewLoopWatcher();
  video.pause();
  updateTimeline(true);
  setStatus(currentFile ? 'Paused' : 'Waiting for a file');
}

function resetWaveformPointerGesture() {
  if (waveformPointerGesture) {
    pushPipelineDebug('waveform:gesture:reset', `pointer=${waveformPointerGesture.pointerType} id=${waveformPointerGesture.pointerId} long=${waveformPointerGesture.longPressTriggered}`);
    try {
      waveViewport.releasePointerCapture(waveformPointerGesture.pointerId);
    } catch (error) {
      pushPipelineDebug('waveform:pointercapture:release:error', error?.message || String(error));
    }
  }
  waveformRangeSelect.active = false;
  waveformHandleDrag.active = false;
  waveformHandleDrag.handle = null;
  waveformHandleDrag.pendingHandle = null;
  isWaveViewportPanning = false;
  syncWaveViewportTouchAction();
  clearWaveformLongPressTimer();
  waveformPointerGesture = null;
  isPointerSeekingWaveform = false;
}

function shouldUseDeferredWaveformSeek(event) {
  return event.pointerType === 'touch';
}

function isMousePointer(event) {
  return event.pointerType === 'mouse';
}

function startWaveformPointerGesture(event) {
  clearWaveformLongPressTimer();
  isWaveViewportPanning = false;
  pushPipelineDebug('waveform:v2:gesture:start', `pointer=${event.pointerType} id=${event.pointerId} x=${event.clientX.toFixed(1)} y=${event.clientY.toFixed(1)}`);
  waveformPointerGesture = {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    longPressTriggered: false,
  };

  try {
    waveViewport.setPointerCapture(event.pointerId);
    pushPipelineDebug('waveform:v2:pointercapture:set', `id=${event.pointerId}`);
  } catch (error) {
    pushPipelineDebug('waveform:v2:pointercapture:set:error', error?.message || String(error));
  }

  if (event.pointerType !== 'touch' && event.pointerType !== 'mouse') {
    pushPipelineDebug('waveform:v2:longpress:disabled', `pointer=${event.pointerType}`);
    return;
  }

  waveformLongPressTimer = window.setTimeout(() => {
    if (!waveformPointerGesture || waveformPointerGesture.pointerId !== event.pointerId) {
      pushPipelineDebug('waveform:v2:longpress:timer:fired:stale', `id=${event.pointerId}`);
      return;
    }
    waveformPointerGesture.longPressTriggered = true;

    if ((event.pointerType === 'touch' || event.pointerType === 'mouse') && video.duration && Number.isFinite(video.duration)) {
      if (waveformHandleDrag.pendingHandle) {
        waveformHandleDrag.active = true;
        waveformHandleDrag.handle = waveformHandleDrag.pendingHandle;
        waveformHandleDrag.pendingHandle = null;
        isWaveViewportPanning = false;
        syncWaveViewportTouchAction();
        const activeRatio = getViewportPointerRatio({
          ...event,
          clientX: waveformPointerGesture.lastX,
          clientY: waveformPointerGesture.lastY,
        });
        const activeTime = activeRatio * video.duration;
        if (waveformHandleDrag.handle === 'A') {
          loopState.start = Math.max(0, Math.min(activeTime, loopState.end - 0.05));
        } else if (waveformHandleDrag.handle === 'B') {
          loopState.end = Math.min(video.duration, Math.max(activeTime, loopState.start + 0.05));
        }
        updateLoopButtons();
        drawWaveform(video.duration ? video.currentTime / video.duration : 0);
        pushPipelineDebug('waveform:v2:handle:start', `pointer=${event.pointerType} handle=${waveformHandleDrag.handle} at=${activeTime.toFixed(3)}`);
        updateViewportCursorVisibility({
          ...event,
          clientX: waveformPointerGesture.lastX,
          clientY: waveformPointerGesture.lastY,
        });
        setStatus(`Adjusting ${waveformHandleDrag.handle}: ${formatTime(loopState.start)} → ${formatTime(loopState.end)}`);
        return;
      }

      const anchorRatio = getViewportPointerRatio({
        ...event,
        clientX: waveformPointerGesture.lastX,
        clientY: waveformPointerGesture.lastY,
      });
      const anchorTime = anchorRatio * video.duration;
      loopState.enabledA = true;
      loopState.enabledB = true;
      loopState.start = anchorTime;
      loopState.end = Math.min(video.duration, anchorTime + 0.2);
      zoomLevel = 10;
      zoomSlider.value = '10';
      updateZoomLabel();
      updateViewportCursorVisibility();
      lastDrawnProgress = -1;
      video.currentTime = loopState.start;
      updateTimeline(true);
      pushPipelineDebug('waveform:v2:longpress-range', `pointer=${event.pointerType} start=${loopState.start.toFixed(3)} end=${loopState.end.toFixed(3)} zoom=10`);
      updateLoopButtons();
      drawWaveform(video.duration ? video.currentTime / video.duration : 0);
      setStatus(`A-B loop: ${formatTime(loopState.start)} → ${formatTime(loopState.end)}`);
      return;
    }
  }, 420);
  pushPipelineDebug('waveform:v2:longpress:timer:set', `delay=420 id=${event.pointerId}`);
}

function updateWaveformPointerGesture(event) {
  if (!waveformPointerGesture || waveformPointerGesture.pointerId !== event.pointerId) return;
  waveformPointerGesture.lastX = event.clientX;
  waveformPointerGesture.lastY = event.clientY;

  if (waveformHandleDrag.active && event.pointerType === 'mouse') {
    pushPipelineDebug('waveform:gesture:move:skip-mouse-handle-drag', `id=${event.pointerId} handle=${waveformHandleDrag.handle}`);
    return;
  }

  const deltaX = event.clientX - waveformPointerGesture.startX;
  const deltaY = event.clientY - waveformPointerGesture.startY;
  const movedFar = Math.hypot(deltaX, deltaY) > 12;
  pushPipelineDebug('waveform:gesture:move', `pointer=${event.pointerType} id=${event.pointerId} dx=${deltaX.toFixed(1)} dy=${deltaY.toFixed(1)} long=${waveformPointerGesture.longPressTriggered}`);

  if (event.pointerType === 'touch' && zoomLevel > 1 && Math.abs(deltaX) > 8 && !waveformHandleDrag.active && !waveformHandleDrag.pendingHandle) {
    isWaveViewportPanning = true;
  }

  if (movedFar && !waveformPointerGesture.longPressTriggered) {
    if (waveformHandleDrag.pendingHandle) {
      pushPipelineDebug('waveform:v2:handle:pending:cancel-by-move', `pointer=${event.pointerType} handle=${waveformHandleDrag.pendingHandle}`);
      waveformHandleDrag.pendingHandle = null;
    }
    if (event.pointerType === 'touch') {
      pushPipelineDebug('waveform:longpress:cancel-by-touch-move', `id=${event.pointerId}`);
      clearWaveformLongPressTimer();
    }
  }

  if (waveformRangeSelect.active && event.pointerType === 'mouse' && video.duration && Number.isFinite(video.duration)) {
    const currentRatio = getViewportPointerRatio(event);
    const startRatio = Math.min(waveformRangeSelect.anchorRatio, currentRatio);
    const endRatio = Math.max(waveformRangeSelect.anchorRatio, currentRatio);
    loopState.enabledA = true;
    loopState.enabledB = true;
    loopState.start = startRatio * video.duration;
    loopState.end = endRatio * video.duration;
    pushPipelineDebug('waveform:v2:range:update', `start=${loopState.start.toFixed(3)} end=${loopState.end.toFixed(3)} span=${(loopState.end - loopState.start).toFixed(3)}`);
    updateLoopButtons();
    drawWaveform(video.duration ? video.currentTime / video.duration : 0);
    setStatus(`Selecting A-B: ${formatTime(loopState.start)} → ${formatTime(loopState.end)}`);
  }

}

function finishWaveformHandleDrag(event) {
  if (!waveformHandleDrag.active) return false;
  pushPipelineDebug('waveform:v2:handle:end', `pointer=${event.pointerType} handle=${waveformHandleDrag.handle} start=${loopState.start.toFixed(3)} end=${loopState.end.toFixed(3)}`);
  waveformHandleDrag.active = false;
  waveformHandleDrag.handle = null;
  updateLoopButtons();
  drawWaveform(video.duration ? video.currentTime / video.duration : 0);
  updateViewportCursorVisibility(event);
  setStatus(`A-B loop: ${formatTime(loopState.start)} → ${formatTime(loopState.end)}`);
  return true;
}

function finishWaveformPointerGesture(event) {
  if (!waveformPointerGesture || waveformPointerGesture.pointerId !== event.pointerId) return;

  pushPipelineDebug('waveform:gesture:end', `pointer=${waveformPointerGesture.pointerType} id=${event.pointerId} long=${waveformPointerGesture.longPressTriggered} x=${event.clientX.toFixed(1)} y=${event.clientY.toFixed(1)}`);
  const triggeredLongPress = waveformPointerGesture.longPressTriggered;
  const pointerType = waveformPointerGesture.pointerType;

  if (waveformRangeSelect.active && pointerType === 'mouse') {
    waveformRangeSelect.active = false;
    pushPipelineDebug('waveform:v2:range:end', `start=${loopState.start.toFixed(3)} end=${loopState.end.toFixed(3)} active=${isLoopActive()}`);
    if (isLoopActive()) {
      forceSeekToLoopStart('range-end');
      setStatus(`A-B loop: ${formatTime(loopState.start)} → ${formatTime(loopState.end)}`);
    } else {
      clearLoop();
      drawWaveform(video.duration ? video.currentTime / video.duration : 0);
      setStatus('A-B loop cleared');
    }
    stopWaveformLongPressPreview();
    resetWaveformPointerGesture();
    return;
  }

  if (!triggeredLongPress) {
    pushPipelineDebug('waveform:seek:on-release', `pointer=${pointerType}`);
    handleSeekFromViewportPointer(event);
  }

  stopWaveformLongPressPreview();
  resetWaveformPointerGesture();
}

function enforceLoopPlayback() {
  if (waveformLongPressPreview.active) {
    const epsilon = Math.max(0.01, 1 / 60);
    if (video.currentTime < waveformLongPressPreview.start) {
      video.currentTime = waveformLongPressPreview.start;
    }

    if (video.currentTime >= waveformLongPressPreview.end - epsilon) {
      video.currentTime = waveformLongPressPreview.start;
    }
    return;
  }

  if (!isLoopActive()) return;

  const loopEpsilon = 0.03;
  if (video.currentTime < loopState.start - loopEpsilon) {
    pushPipelineDebug('ab:clamp-to-a', `current=${video.currentTime.toFixed(3)} start=${loopState.start.toFixed(3)}`);
    video.currentTime = loopState.start;
  }

  if (video.currentTime >= loopState.end - loopEpsilon) {
    pushPipelineDebug('ab:loop', `current=${video.currentTime.toFixed(3)} start=${loopState.start.toFixed(3)} end=${loopState.end.toFixed(3)}`);
    video.currentTime = loopState.start;
  }
}

function getCanvasRatioFromPointer(event) {
  const rect = waveCanvas.getBoundingClientRect();
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
}

function setLoopPointA() {
  if (!video.duration || !Number.isFinite(video.duration)) return;
  const current = video.currentTime;
  if (loopState.enabledB && current >= loopState.end) {
    setStatus('A must be earlier than B');
    return;
  }
  loopState.start = current;
  loopState.enabledA = true;
  updateLoopButtons();
  drawWaveform(video.currentTime / video.duration);
  setStatus(describeLoopState());
}

function setLoopPointB() {
  if (!video.duration || !Number.isFinite(video.duration)) return;
  const current = video.currentTime;
  if (loopState.enabledA && current <= loopState.start) {
    setStatus('B must be later than A');
    return;
  }
  loopState.end = current;
  loopState.enabledB = true;
  updateLoopButtons();
  drawWaveform(video.currentTime / video.duration);
  setStatus(describeLoopState());
}

async function togglePlayPause() {
  if (!currentFile || !video.src) {
    pushPipelineDebug('playback:toggle:ignored', 'no current file');
    return;
  }
  pushPipelineDebug('playback:toggle', `paused=${video.paused} ended=${video.ended} current=${video.currentTime.toFixed(3)} loop=${isLoopActive()} short=${shouldUseShortAudioLoop()}`);

  if (shortLoopPlayback.active) {
    stopShortAudioLoop();
    stopPlaybackAnimation();
    updatePlayPauseButton();
    setStatus('Paused');
    updateTimeline(true);
    return;
  }

  if (video.paused || video.ended) {
    if (shouldUseShortAudioLoop()) {
      await startShortAudioLoop();
      return;
    }
    if (isLoopActive() && (video.currentTime < loopState.start || video.currentTime >= loopState.end)) {
      forceSeekToLoopStart('toggle-play');
    }
    const playResult = video.play();
    if (playResult && typeof playResult.then === 'function') {
      playResult.then(() => {
        pushPipelineDebug('playback:toggle:play:ok');
      }).catch((error) => {
        pushPipelineDebug('playback:toggle:play:error', error?.message || String(error));
      });
    }
  } else {
    video.pause();
  }
  updatePlayPauseButton();
}

async function triggerOpenFilePicker({ warmupAudio = true } = {}) {
  if (processingState.active) return;

  if (warmupAudio) {
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
    } catch (error) {
      console.warn('AudioContext warmup failed:', error);
    }
  }

  videoFileInput.click();
}

openFileBtn.addEventListener('click', () => {
  triggerOpenFilePicker({ warmupAudio: true });
});

videoFileInput.addEventListener('change', (event) => {
  const [file] = event.target.files || [];
  if (file) loadFile(file);
  event.target.value = '';
});

function handleClearAction() {
  pipelineDebugLines = [];
  updateDebugPanel();
  clearCurrentFile();
}

clearBtn.addEventListener('click', handleClearAction);
mobileClearBtn.addEventListener('click', handleClearAction);
if (mobileAudioClearBtn) mobileAudioClearBtn.addEventListener('click', handleClearAction);
if (debugToggleBtn) debugToggleBtn.addEventListener('click', toggleDebugUi);
stopBtn.addEventListener('click', stopToStart);
playPauseBtn.addEventListener('click', togglePlayPause);
clearLoopBtn.addEventListener('click', () => {
  clearLoop();
  drawWaveform(video.duration ? video.currentTime / video.duration : 0);
  setStatus(describeLoopState());
});
if (eqPresets) {
  eqPresets.addEventListener('click', (event) => {
    const button = event.target.closest('[data-eq-preset]');
    if (!button) return;
    applyEqPreset(button.dataset.eqPreset);
  });
}

if (transcribeBtn) {
  transcribeBtn.addEventListener('click', runTranscription);
}

if (eqGraphCanvas) {
  eqGraphCanvas.addEventListener('pointerdown', (event) => {
    activeEqBandIndex = null;
    updateEqBandFromPointer(event);
    if (activeEqBandIndex != null) {
      eqGraphCanvas.setPointerCapture(event.pointerId);
    }
  });

  eqGraphCanvas.addEventListener('pointermove', (event) => {
    if (activeEqBandIndex == null) return;
    updateEqBandFromPointer(event);
  });

  const stopEqDrag = () => {
    activeEqBandIndex = null;
    drawEqGraph();
  };

  eqGraphCanvas.addEventListener('pointerup', stopEqDrag);
  eqGraphCanvas.addEventListener('pointercancel', stopEqDrag);
}

setABtn.addEventListener('click', setLoopPointA);
setBBtn.addEventListener('click', setLoopPointB);

zoomSlider.addEventListener('input', () => {
  zoomLevel = Number(zoomSlider.value);
  updateViewportCursorVisibility();
  updateZoomLabel();
  lastDrawnProgress = -1;
  drawWaveform(video.duration ? video.currentTime / video.duration : 0);

  if (video.duration > 0 && zoomLevel > 1) {
    const progress = (video.currentTime || 0) / video.duration;
    const canvasCssWidth = parseFloat(waveCanvas.style.width || '0') || 0;
    scrollWaveViewportToPlayhead(progress * canvasCssWidth, 0.18);
  }
});

speedSlider.addEventListener('input', () => {
  updatePlaybackRate(Number(speedSlider.value) / 10);
});

if (copyDebugBtn) {
  copyDebugBtn.addEventListener('click', async () => {
    const debugText = pipelineDebugLines.length ? pipelineDebugLines.join('\n') : 'debug panel ready';
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(debugText);
      } else {
        throw new Error('Clipboard API unavailable');
      }
      setStatus('Debug log copied');
    } catch (error) {
      pushPipelineDebug('debug:copy:error', error?.message || String(error));
      try {
        const textarea = document.createElement('textarea');
        textarea.value = debugText;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) {
          throw new Error('execCommand copy failed');
        }
        setStatus('Debug log copied');
      } catch (fallbackError) {
        pushPipelineDebug('debug:copy:fallback-error', fallbackError?.message || String(fallbackError));
        setStatus('Debug log copy failed');
      }
    }
  });
}

if (clearDebugBtn) {
  clearDebugBtn.addEventListener('click', () => {
    clearDebugLog();
    setStatus('Debug log cleared');
  });
}

shortcutBtn.addEventListener('click', () => {
  const willShow = shortcutPopover.hidden;
  shortcutPopover.hidden = !willShow;
});

window.addEventListener('click', (event) => {
  if (shortcutPopover.hidden) return;
  if (shortcutPopover.contains(event.target) || shortcutBtn.contains(event.target)) return;
  shortcutPopover.hidden = true;
});

video.addEventListener('loadedmetadata', () => {
  lastKnownDuration = video.duration || 0;
  lastTimelineTextSecond = -1;
  if (isLoopActive()) {
    forceSeekToLoopStart('loadedmetadata');
  } else {
    updateTimeline(true);
  }
});

video.addEventListener('timeupdate', () => {
  enforceLoopPlayback();
  updateTimeline(false);
});
video.addEventListener('play', () => {
  lastProgressDebugAt = -1;
  pushPipelineDebug('video:event:play', `current=${video.currentTime.toFixed(3)} loop=${isLoopActive()}`);
  if (isLoopActive() && (video.currentTime < loopState.start || video.currentTime >= loopState.end)) {
    forceSeekToLoopStart('video-play');
  }
  updatePlayPauseButton();
  setStatus(isLoopActive() ? `Looping ${formatTime(loopState.start)} → ${formatTime(loopState.end)}` : 'Playing');
  startPlaybackAnimation();
});
video.addEventListener('pause', () => {
  pushPipelineDebug('video:event:pause', `current=${video.currentTime.toFixed(3)}`);
  stopPlaybackAnimation();
  updatePlayPauseButton();
  setStatus(currentFile ? 'Paused' : 'Waiting for a file');
  updateTimeline(true);
});
video.addEventListener('ended', () => {
  stopPlaybackAnimation();
  updatePlayPauseButton();
  setStatus('Playback ended');
  updateTimeline(true);
});

seekBar.addEventListener('input', () => {
  handleSeekByRatio(Number(seekBar.value) / 1000);
});

waveViewport.addEventListener('pointerdown', (event) => {
  if (!video.duration || !Number.isFinite(video.duration)) {
    pushPipelineDebug('waveform:pointerdown:ignored', 'invalid duration');
    return;
  }

  let handle = null;
  if (isLoopActive()) {
    handle = getWaveformHandleHit(event, { allowNearest: true });
  } else {
    handle = getWaveformHandleHit(event);
  }
  if (handle) {
    if (event.pointerType === 'mouse') {
      clearWaveformLongPressTimer();
      waveformPointerGesture = null;
      waveformRangeSelect.active = false;
      waveformHandleDrag.active = true;
      waveformHandleDrag.handle = handle;
      waveformHandleDrag.pendingHandle = null;
      isWaveViewportPanning = false;
      syncWaveViewportTouchAction();
      try {
        waveViewport.setPointerCapture(event.pointerId);
      } catch (error) {
        pushPipelineDebug('waveform:v2:pointercapture:set:error', error?.message || String(error));
      }
      pushPipelineDebug('waveform:v2:handle:start-immediate', `pointer=${event.pointerType} handle=${handle}`);
      updateViewportCursorVisibility(event);
      setStatus(`Adjusting ${handle}: ${formatTime(loopState.start)} → ${formatTime(loopState.end)}`);
      return;
    }

    waveformHandleDrag.pendingHandle = handle;
    syncWaveViewportTouchAction();
    pushPipelineDebug('waveform:v2:handle:pending', `pointer=${event.pointerType} handle=${handle}`);
  } else {
    waveformHandleDrag.pendingHandle = null;
    syncWaveViewportTouchAction();
  }

  startWaveformPointerGesture(event);
});

waveViewport.addEventListener('pointermove', (event) => {
  updateViewportCursorVisibility(event);
  updateWaveformPointerGesture(event);

  if (waveformHandleDrag.active && video.duration && Number.isFinite(video.duration)) {
    isWaveViewportPanning = false;
    const ratio = getViewportPointerRatio(event);
    const minGap = 0.05;
    if (waveformHandleDrag.handle === 'A') {
      loopState.start = Math.max(0, Math.min(ratio * video.duration, loopState.end - minGap));
    } else if (waveformHandleDrag.handle === 'B') {
      loopState.end = Math.min(video.duration, Math.max(ratio * video.duration, loopState.start + minGap));
    }
    pushPipelineDebug('waveform:v2:handle:update', `pointer=${event.pointerType} handle=${waveformHandleDrag.handle} start=${loopState.start.toFixed(3)} end=${loopState.end.toFixed(3)}`);
    updateLoopButtons();
    drawWaveform(video.duration ? video.currentTime / video.duration : 0);
    setStatus(`Adjusting ${waveformHandleDrag.handle}: ${formatTime(loopState.start)} → ${formatTime(loopState.end)}`);
  }
});

waveViewport.addEventListener('wheel', (event) => {
  if (zoomLevel <= 1) return;
  const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (dominantDelta === 0) return;
  event.preventDefault();
  waveViewport.scrollLeft += dominantDelta;
});

waveViewport.addEventListener('touchstart', (event) => {
  if (waveformHandleDrag.pendingHandle || waveformHandleDrag.active) {
    event.preventDefault();
  }
}, { passive: false });

waveViewport.addEventListener('touchmove', (event) => {
  if (waveformHandleDrag.pendingHandle || waveformHandleDrag.active) {
    event.preventDefault();
  }
}, { passive: false });

waveViewport.addEventListener('contextmenu', (event) => {
  pushPipelineDebug('waveform:contextmenu', `preview=${isWaveformLongPressPreviewActive}`);
  if (!isWaveformLongPressPreviewActive) return;
  event.preventDefault();
});

window.addEventListener('pointerup', (event) => {
  pushPipelineDebug('window:pointerup', `pointer=${event.pointerType} id=${event.pointerId}`);
  if (finishWaveformHandleDrag(event)) {
    if (waveformPointerGesture && waveformPointerGesture.pointerId === event.pointerId) {
      stopWaveformLongPressPreview();
      resetWaveformPointerGesture();
    }
    return;
  }
  if (waveformPointerGesture && waveformPointerGesture.pointerId === event.pointerId) {
    finishWaveformPointerGesture(event);
    return;
  }
  isPointerSeekingWaveform = false;
});

window.addEventListener('pointercancel', (event) => {
  pushPipelineDebug('window:pointercancel', `pointer=${event.pointerType} id=${event.pointerId}`);
  if (waveformPointerGesture && waveformPointerGesture.pointerId === event.pointerId) {
    stopWaveformLongPressPreview();
    resetWaveformPointerGesture();
    return;
  }
  isPointerSeekingWaveform = false;
});

window.addEventListener('keydown', (event) => {
  const target = event.target;
  const isTypingTarget = target instanceof HTMLElement && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );

  if (isTypingTarget) return;

  if (event.code === 'Space') {
    event.preventDefault();
    togglePlayPause();
    return;
  }

  if (event.key === '[') {
    event.preventDefault();
    setLoopPointA();
    return;
  }

  if (event.key === ']') {
    event.preventDefault();
    setLoopPointB();
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    clearLoop();
    drawWaveform(video.duration ? video.currentTime / video.duration : 0);
    setStatus(describeLoopState());
    return;
  }

  if (event.key === '-' || event.key === '_') {
    event.preventDefault();
    stepPlaybackRate(-0.1);
    setStatus(`Speed ${playbackRate.toFixed(1)}×`);
    return;
  }

  if (event.key === '=' || event.key === '+') {
    event.preventDefault();
    stepPlaybackRate(0.1);
    setStatus(`Speed ${playbackRate.toFixed(1)}×`);
    return;
  }

  if (event.key === '0') {
    event.preventDefault();
    updatePlaybackRate(1.0);
    setStatus('Speed 1.0×');
  }
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (processingState.active) return;
    dropZone.classList.add('dragover');
  });
});

['dragleave', 'dragend', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragover');
  });
});

dropZone.addEventListener('drop', (event) => {
  if (processingState.active) return;
  const [file] = event.dataTransfer?.files || [];
  if (file) loadFile(file);
});

dropZone.addEventListener('click', (event) => {
  if (processingState.active) return;
  if (currentFile) return;
  if (event.target.closest('button, input, summary, a, video')) return;
  triggerOpenFilePicker({ warmupAudio: false });
});

window.addEventListener('resize', () => {
  updateViewportCursorVisibility();
  lastDrawnProgress = -1;
  drawWaveform(video.duration ? video.currentTime / video.duration : 0);
  drawTranscriptionRoll();
  updateDebugPanel();
});

if (transcribeCanvas) {
  transcribeCanvas.addEventListener('pointermove', async (event) => {
    const { index, note } = getTranscribeNoteAtEvent(event);
    transcribeHoverNoteIndex = index;
    const axisPitch = getPitchFromTranscribeYAxis(event);
    transcribeCanvas.style.cursor = note || axisPitch != null ? 'pointer' : 'default';

    if (activeTranscribePointerId === event.pointerId && (event.buttons & 1) === 1) {
      const targetPitch = note?.pitchMidi ?? axisPitch;
      const activePitch = transcribePitchPreviewNodes[0]?.pitchMidi ?? null;
      if (targetPitch != null && targetPitch !== activePitch) {
        await startSustainedTranscribedPitch(targetPitch);
        setStatus(`Pitch preview: ${formatNoteName(targetPitch)}`);
      }
    }

    drawTranscriptionRoll();
  });

  transcribeCanvas.addEventListener('pointerleave', () => {
    transcribeHoverNoteIndex = -1;
    transcribeCanvas.style.cursor = 'default';
    drawTranscriptionRoll();
  });

  transcribeCanvas.addEventListener('pointerdown', async (event) => {
    const { note } = getTranscribeNoteAtEvent(event);
    const axisPitch = getPitchFromTranscribeYAxis(event);
    const targetPitch = note?.pitchMidi ?? axisPitch;
    if (targetPitch == null) return;
    activeTranscribePointerId = event.pointerId;
    try {
      transcribeCanvas.setPointerCapture(event.pointerId);
    } catch (error) {}
    await startSustainedTranscribedPitch(targetPitch);
    setStatus(`Pitch preview: ${formatNoteName(targetPitch)}`);
  });

  const stopTranscribePointerPreview = (event) => {
    if (activeTranscribePointerId == null) return;
    if (event && event.pointerId !== activeTranscribePointerId) return;
    activeTranscribePointerId = null;
    stopTranscribePitchPreview();
  };

  transcribeCanvas.addEventListener('pointerup', stopTranscribePointerPreview);
  transcribeCanvas.addEventListener('pointercancel', stopTranscribePointerPreview);

  transcribeCanvas.addEventListener('wheel', (event) => {
    if (!transcribeResult?.notes?.length) return;
    event.preventDefault();
    const direction = Math.sign(event.deltaY) || 1;
    const step = event.shiftKey ? 12 : 3;
    const span = transcribeView.maxPitch - transcribeView.minPitch;
    let nextMin = transcribeView.minPitch + direction * step;
    let nextMax = nextMin + span;
    if (nextMin < 21) {
      nextMin = 21;
      nextMax = nextMin + span;
    }
    if (nextMax > 108) {
      nextMax = 108;
      nextMin = nextMax - span;
    }
    transcribeView.minPitch = nextMin;
    transcribeView.maxPitch = nextMax;
    drawTranscriptionRoll();
  }, { passive: false });
}
window.addEventListener('beforeunload', stopPlaybackAnimation);

updateProcessingUi();
updateLoopButtons();
updatePlaybackRate(1);
updatePlayPauseButton();
updateViewportCursorVisibility();
updateZoomLabel();
updateEqUi();
setTranscribeState('idle', 'Set an A-B loop first.', '', 0);
syncDebugUi();
drawWaveform();
drawTranscriptionRoll();
