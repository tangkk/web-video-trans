import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const video = document.getElementById('video');
const viewerCard = document.querySelector('.viewer-card');
const videoFileInput = document.getElementById('videoFile');
const dropZone = document.getElementById('dropZone');
const emptyState = document.getElementById('emptyState');
const mobileClearBtn = document.getElementById('mobileClearBtn');
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
const eqPanel = document.getElementById('eqPanel');
const eqPresetBadge = document.getElementById('eqPresetBadge');
const eqPresets = document.getElementById('eqPresets');
const eqGraphCanvas = document.getElementById('eqGraphCanvas');

const ctx = waveCanvas.getContext('2d');
const eqGraphCtx = eqGraphCanvas.getContext('2d');

let objectUrl = null;
let audioContext = null;
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
let lastPlayheadX = 0;
let lastPlayheadCssX = 0;
let pipelineDebugLines = [];
let pipelineDebugStartedAt = 0;
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
}

async function applyEqPreset(presetKey) {
  if (!EQ_PRESETS[presetKey]) return;
  currentEqPreset = presetKey;
  currentEqGains = [...EQ_PRESETS[presetKey].gains];
  updateEqUi();
  await syncEqFiltersToCurrentGains();
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

function updateDebugPanel() {}

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
  const paused = video.paused || video.ended;
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

function updateLoopButtons() {
  setABtn.classList.toggle('is-active', loopState.enabledA);
  setBBtn.classList.toggle('is-active', loopState.enabledB);
  clearLoopBtn.disabled = !loopState.enabledA && !loopState.enabledB;
}

function setBusyUi(busy) {
  videoFileInput.disabled = busy;
  openFileBtn.disabled = busy;
  clearBtn.disabled = busy;
  mobileClearBtn.disabled = busy || !currentFile;
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

function updateViewportCursorVisibility() {
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

    const coreURL = new URL('./src/vendor/ffmpeg-core/ffmpeg-core.js', import.meta.url).href;
    pushPipelineDebug('ensureFFmpegLoaded:core-url-ready');
    updateProcessing({ percent: 12, detail: 'FFmpeg JS core loaded. Preparing WASM…' });
    const wasmURL = new URL('./src/vendor/ffmpeg-core/ffmpeg-core.wasm', import.meta.url).href;
    pushPipelineDebug('ensureFFmpegLoaded:wasm-url-ready');
    updateProcessing({ percent: 20, detail: 'FFmpeg WASM located locally. Initializing…' });
    await ffmpeg.load({ coreURL, wasmURL });
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
  let audioSourceBuffer;
  const audioOnly = isAudioOnlyFile(file);
  pushPipelineDebug('buildWaveformFromFile:file-kind', audioOnly ? 'audio-only' : 'video');

  if (audioOnly) {
    updateProcessing({
      stage: 'Reading audio file',
      detail: 'Audio file detected. Skipping FFmpeg extraction and decoding directly in the browser…',
      percent: 28,
      hint: 'This is faster on phones for MP3/M4A/WAV and similar audio files.',
    });

    pushPipelineDebug('buildWaveformFromFile:audio-file-arrayBuffer:start');
    audioSourceBuffer = await file.arrayBuffer();
    pushPipelineDebug('buildWaveformFromFile:audio-file-arrayBuffer:done');
  } else {
    pushPipelineDebug('buildWaveformFromFile:video-path');
    audioSourceBuffer = await extractAudioWithFFmpeg(file, jobId);
    if (jobId !== currentJobId) throw new Error('File changed. Previous task cancelled');
  }

  updateProcessing({
    stage: 'Decoding audio',
    detail: isAudioOnlyFile(file)
      ? 'Decoding the audio file in the browser…'
      : 'Decoding the extracted WAV in the browser…',
    percent: 88,
    hint: 'Waveform sampling starts after this step.',
  });

  pushPipelineDebug('buildWaveformFromFile:before-audio-context');
  context = await ensureAudioContext();
  pushPipelineDebug('buildWaveformFromFile:after-audio-context', `state=${context.state}`);
  if (context.state === 'suspended') {
    pushPipelineDebug('buildWaveformFromFile:audio-context-still-suspended');
  }

  pushPipelineDebug('buildWaveformFromFile:decodeAudioData:start');
  const audioBuffer = await context.decodeAudioData(audioSourceBuffer.slice(0));
  pushPipelineDebug('buildWaveformFromFile:decodeAudioData:done', `channels=${audioBuffer.numberOfChannels} duration=${audioBuffer.duration.toFixed(2)}`);
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

function stopToStart() {
  if (!currentFile || !video.src) return;
  video.pause();
  video.currentTime = 0;
  waveViewport.scrollLeft = 0;
  updateTimeline(true);
  updatePlayPauseButton();
  setStatus('Stopped');
}

function clearCurrentFile() {
  stopPlaybackAnimation();
  currentJobId += 1;
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
  updateProcessingUi();
  resetCanvas();
  setBusyUi(false);
  updatePlayPauseButton();
}

function updateTimeline(forceText = false) {
  const duration = video.duration || 0;
  const currentTime = video.currentTime || 0;
  const currentWholeSecond = Math.floor(currentTime);

  if (forceText || currentWholeSecond !== lastTimelineTextSecond) {
    currentTimeTextEl.textContent = formatTime(currentTime);
    remainingTimeTextEl.textContent = `-${formatTime(Math.max(0, duration - currentTime))}`;
    lastTimelineTextSecond = currentWholeSecond;
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
  if (!video.paused && !video.ended) {
    enforceLoopPlayback();
    updateTimeline();
    rafId = requestAnimationFrame(playbackAnimationLoop);
  } else {
    rafId = null;
  }
}

function startPlaybackAnimation() {
  stopPlaybackAnimation();
  playbackAnimationLoop();
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

function handleSeekFromViewportPointer(event) {
  if (!video.duration || !Number.isFinite(video.duration)) return;

  if (!(isMobileViewport() && zoomLevel > 1)) {
    handleSeekByRatio(getCanvasRatioFromPointer(event));
    return;
  }

  const rect = waveViewport.getBoundingClientRect();
  const viewportRatio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const absoluteCssX = waveViewport.scrollLeft + viewportRatio * rect.width;
  const canvasCssWidth = parseFloat(waveCanvas.style.width || '0') || rect.width;
  const absoluteRatio = Math.max(0, Math.min(1, absoluteCssX / canvasCssWidth));

  video.currentTime = absoluteRatio * video.duration;
  updateTimeline(true);
  scrollWaveViewportToPlayhead(absoluteCssX, 0.18);
}

function enforceLoopPlayback() {
  if (!isLoopActive()) return;

  if (video.currentTime < loopState.start) {
    video.currentTime = loopState.start;
  }

  if (video.currentTime >= loopState.end) {
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

function togglePlayPause() {
  if (!currentFile || !video.src) return;
  if (video.paused || video.ended) {
    if (isLoopActive() && (video.currentTime < loopState.start || video.currentTime >= loopState.end)) {
      video.currentTime = loopState.start;
    }
    video.play();
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
  updateTimeline(true);
});

video.addEventListener('timeupdate', () => {
  enforceLoopPlayback();
  updateTimeline(false);
});
video.addEventListener('play', () => {
  if (isLoopActive() && (video.currentTime < loopState.start || video.currentTime >= loopState.end)) {
    video.currentTime = loopState.start;
  }
  updatePlayPauseButton();
  setStatus(isLoopActive() ? `Looping ${formatTime(loopState.start)} → ${formatTime(loopState.end)}` : 'Playing');
  startPlaybackAnimation();
});
video.addEventListener('pause', () => {
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
  if (!video.duration || !Number.isFinite(video.duration)) return;
  waveCanvas.style.cursor = 'pointer';
  isPointerSeekingWaveform = true;
  handleSeekFromViewportPointer(event);
});

window.addEventListener('pointerup', () => {
  isPointerSeekingWaveform = false;
});

window.addEventListener('pointercancel', () => {
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
  updateDebugPanel();
});
window.addEventListener('beforeunload', stopPlaybackAnimation);

updateProcessingUi();
updateLoopButtons();
updatePlaybackRate(1);
updatePlayPauseButton();
updateViewportCursorVisibility();
updateZoomLabel();
updateEqUi();
drawWaveform();
