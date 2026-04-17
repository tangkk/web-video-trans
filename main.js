import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const video = document.getElementById('video');
const viewerCard = document.querySelector('.viewer-card');
const videoFileInput = document.getElementById('videoFile');
const dropZone = document.getElementById('dropZone');
const emptyState = document.getElementById('emptyState');
const statusTextEl = document.getElementById('statusText');
const waveViewport = document.getElementById('waveViewport');
const waveCanvas = document.getElementById('waveCanvas');
const zoomSlider = document.getElementById('zoomSlider');
const seekBar = document.getElementById('seekBar');
const playPauseBtn = document.getElementById('playPauseBtn');
const currentTimeTextEl = document.getElementById('currentTimeText');
const remainingTimeTextEl = document.getElementById('remainingTimeText');
const clearBtn = document.getElementById('clearBtn');
const stopBtn = document.getElementById('stopBtn');
const regenBtn = document.getElementById('regenBtn');
const setABtn = document.getElementById('setABtn');
const setBBtn = document.getElementById('setBBtn');
const clearLoopBtn = document.getElementById('clearLoopBtn');
const processingPanel = document.getElementById('processingPanel');
const processingStageEl = document.getElementById('processingStage');
const processingDetailEl = document.getElementById('processingDetail');
const processingPercentEl = document.getElementById('processingPercent');
const progressFillEl = document.getElementById('progressFill');
const processingHintEl = document.getElementById('processingHint');

const ctx = waveCanvas.getContext('2d');

let objectUrl = null;
let audioContext = null;
let waveformPeaks = [];
let currentFile = null;
let currentJobId = 0;
let lastDrawnProgress = -1;
let ffmpeg = null;
let ffmpegLoadPromise = null;
let lastKnownDuration = 0;
let rafId = null;
let lastTimelineTextSecond = -1;
let zoomLevel = 1;
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

function updatePlayPauseButton() {
  playPauseBtn.textContent = video.paused || video.ended ? 'Play' : 'Pause';
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
  clearBtn.disabled = busy;
  stopBtn.disabled = busy || !currentFile;
  regenBtn.disabled = busy || !currentFile;
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

function drawWaveform(progress = video.duration ? video.currentTime / video.duration : 0) {
  progress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  resizeCanvasForDisplay();

  const width = waveCanvas.width;
  const height = waveCanvas.height;
  const mid = height / 2;
  const peaks = waveformPeaks.length ? waveformPeaks : generatePlaceholderPeaks();
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
  ctx.fillStyle = 'rgba(0,0,0,0.92)';
  ctx.fillRect(playheadX, 0, Math.max(2, width * 0.0018), height);

  keepPlayheadInView(playheadX);
}

function keepPlayheadInView(playheadX) {
  const viewportWidth = waveViewport.clientWidth;
  if (!viewportWidth) return;

  const left = waveViewport.scrollLeft;
  const right = left + viewportWidth;
  const margin = Math.max(48, viewportWidth * 0.18);

  if (playheadX < left + margin) {
    waveViewport.scrollLeft = Math.max(0, playheadX - margin);
  } else if (playheadX > right - margin) {
    waveViewport.scrollLeft = Math.max(0, playheadX - viewportWidth + margin);
  }
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
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
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
  if (ffmpeg?.loaded) return ffmpeg;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

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

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
    const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
    updateProcessing({ percent: 12, detail: 'FFmpeg JS core loaded. Fetching WASM…' });
    const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
    updateProcessing({ percent: 20, detail: 'FFmpeg WASM fetched. Initializing…' });
    await ffmpeg.load({ coreURL, wasmURL });
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
  const worker = await ensureFFmpegLoaded();
  if (jobId !== currentJobId) throw new Error('File changed. Previous task cancelled');

  const inputExt = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  const inputName = `input.${inputExt}`;
  const outputName = 'audio.wav';

  try {
    updateProcessing({
      stage: 'Preparing audio extraction',
      detail: 'Writing your local file into the FFmpeg virtual file system…',
      percent: 28,
      hint: 'Your file stays local in the browser.',
    });

    await worker.writeFile(inputName, await fetchFile(file));

    updateProcessing({
      stage: 'Extracting audio',
      detail: 'FFmpeg is running. Please wait…',
      percent: 30,
      hint: 'Larger videos take longer here.',
    });

    await worker.exec([
      '-i', inputName,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-sample_fmt', 's16',
      outputName,
    ]);

    if (jobId !== currentJobId) throw new Error('File changed. Previous task cancelled');

    updateProcessing({
      stage: 'Reading extracted audio',
      detail: 'Audio extracted. Reading WAV data…',
      percent: 82,
      hint: 'The next step decodes audio and computes waveform peaks.',
    });

    const data = await worker.readFile(outputName);
    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data.buffer || data);
    return uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
  } finally {
    await Promise.allSettled([
      worker.deleteFile(inputName),
      worker.deleteFile(outputName),
    ]);
  }
}

function computePeaksFromChannelData(channelData) {
  const peakCount = Math.min(6000, Math.max(600, Math.floor(getTimelineWidth() * 1.2)));
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
  startProcessing(
    'Preparing file',
    'Preparing real waveform extraction…',
    'Everything runs locally in your browser. No file is uploaded.',
    2,
  );

  const wavBuffer = await extractAudioWithFFmpeg(file, jobId);
  if (jobId !== currentJobId) throw new Error('File changed. Previous task cancelled');

  updateProcessing({
    stage: 'Decoding audio',
    detail: 'Decoding the extracted WAV in the browser…',
    percent: 88,
    hint: 'Waveform sampling starts after this step.',
  });

  const context = await ensureAudioContext();
  const audioBuffer = await context.decodeAudioData(wavBuffer);
  if (jobId !== currentJobId) throw new Error('File changed. Previous task cancelled');

  updateProcessing({
    stage: 'Computing waveform',
    detail: 'Sampling audio amplitudes to build the interactive waveform…',
    percent: 94,
    hint: 'Almost done.',
  });

  const peaks = computePeaksFromChannelData(audioBuffer.getChannelData(0));
  waveformPeaks = peaks;
  drawWaveform();
  setStatus('Real waveform generated');
  finishProcessing(true, 'Real waveform is ready');
}

async function loadFile(file) {
  if (!file) return;

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

  resetCanvas();
  seekBar.value = 0;
  currentTimeTextEl.textContent = '00:00';
  remainingTimeTextEl.textContent = '-00:00';
  lastTimelineTextSecond = -1;

  try {
    await buildWaveformFromFile(file, jobId);
  } catch (error) {
    console.error(error);
    if (jobId !== currentJobId) return;
    waveformPeaks = generatePlaceholderPeaks();
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

videoFileInput.addEventListener('change', (event) => {
  const [file] = event.target.files || [];
  if (file) loadFile(file);
});

clearBtn.addEventListener('click', clearCurrentFile);
stopBtn.addEventListener('click', stopToStart);
playPauseBtn.addEventListener('click', togglePlayPause);
clearLoopBtn.addEventListener('click', () => {
  clearLoop();
  drawWaveform(video.duration ? video.currentTime / video.duration : 0);
  setStatus(describeLoopState());
});
setABtn.addEventListener('click', setLoopPointA);
setBBtn.addEventListener('click', setLoopPointB);

zoomSlider.addEventListener('input', () => {
  zoomLevel = Number(zoomSlider.value);
  lastDrawnProgress = -1;
  waveformPeaks = waveformPeaks.length ? waveformPeaks : generatePlaceholderPeaks();
  drawWaveform(video.duration ? video.currentTime / video.duration : 0);
});

regenBtn.addEventListener('click', async () => {
  if (!currentFile || processingState.active) return;
  const jobId = ++currentJobId;
  try {
    await buildWaveformFromFile(currentFile, jobId);
  } catch (error) {
    console.error(error);
    if (jobId !== currentJobId) return;
    setStatus(`Regeneration failed: ${error.message || 'unknown error'}`);
    finishProcessing(false, error.message || 'Regeneration failed');
  }
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

waveCanvas.addEventListener('pointerdown', (event) => {
  if (!video.duration || !Number.isFinite(video.duration)) return;
  waveCanvas.style.cursor = 'pointer';
  handleSeekByRatio(getCanvasRatioFromPointer(event));
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

window.addEventListener('resize', () => {
  lastDrawnProgress = -1;
  drawWaveform(video.duration ? video.currentTime / video.duration : 0);
});
window.addEventListener('beforeunload', stopPlaybackAnimation);

updateProcessingUi();
updateLoopButtons();
updatePlayPauseButton();
drawWaveform();
