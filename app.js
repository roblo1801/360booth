const getById = (id) => document.getElementById(id);

const state = {
  online: true,
  liveDisplay: false,
  queue: JSON.parse(localStorage.getItem('shareQueue') || '[]'),
  sentCount: Number(localStorage.getItem('sentCount') || 0),
  printCount: Number(localStorage.getItem('printCount') || 0),
  gallery: JSON.parse(localStorage.getItem('galleryItems') || '[]'),
  event: JSON.parse(localStorage.getItem('activeEvent') || '{}'),
};

// In-memory media store: item.id -> { type: 'image'|'video', url: string }
const mediaStore = {};

const syncChannel = 'BroadcastChannel' in window ? new BroadcastChannel('360booth-sync') : null;
let idCounter = 0;

// --- Camera state ---
let cameraStream = null;
let mediaRecorder = null;
let recordedChunks = [];

function generateId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  idCounter += 1;
  return `${Date.now()}-${idCounter}`;
}

function saveState() {
  localStorage.setItem('shareQueue', JSON.stringify(state.queue));
  localStorage.setItem('sentCount', String(state.sentCount));
  localStorage.setItem('printCount', String(state.printCount));
  localStorage.setItem('galleryItems', JSON.stringify(state.gallery));
  localStorage.setItem('activeEvent', JSON.stringify(state.event));
}

function notifyPeers(type, payload) {
  if (syncChannel) syncChannel.postMessage({ type, payload });
}

function log(message) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()} — ${message}`;
  getById('log').prepend(li);
}

function setStatus(message) {
  getById('captureStatus').textContent = message;
}

function updateCounters() {
  getById('queueCount').textContent = state.queue.length;
  getById('sentCount').textContent = state.sentCount;
  getById('printCount').textContent = state.printCount;
}

function updateOnlineBadge() {
  getById('onlineBadge').textContent = state.online ? 'Online' : 'Offline';
  getById('onlineBadge').className = `badge ${state.online ? 'online' : 'offline'}`;
  getById('toggleOnline').textContent = state.online ? 'Go Offline' : 'Go Online';
}

// --- Camera management ---
async function startCamera() {
  try {
    const constraints = {
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    };
    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = getById('cameraPreview');
    video.srcObject = cameraStream;
    await video.play();
    getById('cameraPlaceholder').hidden = true;
    video.hidden = false;
    getById('startCamera').disabled = true;
    getById('stopCamera').disabled = false;
    setStatus('Camera ready — choose a mode and capture');
    log('Camera started');
  } catch (err) {
    log(`Camera access denied: ${err.message}`);
    setStatus('Camera unavailable — captures will be logged as simulation');
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  const video = getById('cameraPreview');
  video.srcObject = null;
  video.hidden = true;
  getById('cameraPlaceholder').hidden = false;
  getById('startCamera').disabled = false;
  getById('stopCamera').disabled = true;
  log('Camera stopped');
}

// --- Visual effects ---
function buildFilter(effect, aiStyle) {
  const parts = [];
  if (effect === 'vivid') parts.push('saturate(2) contrast(1.2)');
  else if (effect === 'mono') parts.push('grayscale(1)');
  else if (effect === 'sparkle') parts.push('brightness(1.4) saturate(1.8)');
  else if (effect === 'glitch') parts.push('hue-rotate(90deg) contrast(1.4)');

  if (aiStyle === 'cinematic') parts.push('contrast(1.2) saturate(0.75) brightness(0.9)');
  else if (aiStyle === 'retro') parts.push('sepia(0.85) contrast(1.1)');
  else if (aiStyle === 'neon') parts.push('saturate(3) brightness(1.15) contrast(1.3)');
  else if (aiStyle === 'editorial') parts.push('grayscale(0.6) contrast(1.5)');

  return parts.join(' ') || 'none';
}

// --- Photo capture ---
async function capturePhotoFromCamera(effect, aiStyle, overlayText) {
  const video = getById('cameraPreview');
  if (!video.srcObject || video.readyState < 2) return null;

  const canvas = getById('captureCanvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');

  ctx.filter = buildFilter(effect, aiStyle);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';

  if (overlayText) {
    const barH = Math.round(canvas.height * 0.09);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, canvas.height - barH, canvas.width, barH);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(barH * 0.55)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(overlayText, canvas.width / 2, canvas.height - barH / 2);
  }

  return canvas.toDataURL('image/jpeg', 0.88);
}

// --- Video capture ---
function captureVideoFromCamera() {
  return new Promise((resolve) => {
    if (!cameraStream) { resolve(null); return; }
    recordedChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    mediaRecorder = new MediaRecorder(cameraStream, { mimeType });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      resolve(URL.createObjectURL(blob));
    };
    mediaRecorder.start();
    setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    }, 3000);
  });
}

// --- Gallery card ---
function buildItemCard(item) {
  const el = document.createElement('article');
  el.className = 'card-item';
  el.dataset.mode = item.mode;

  const media = mediaStore[item.id];
  let mediaHtml = '';
  if (media) {
    if (media.type === 'image') {
      mediaHtml = `<img src="${media.url}" class="card-thumb" alt="${item.mode} capture" />`;
    } else {
      mediaHtml = `<video src="${media.url}" class="card-thumb" loop muted autoplay playsinline aria-label="${item.mode} video capture"></video>`;
    }
  }

  el.innerHTML = `
    ${mediaHtml}
    <div class="title">${item.mode.toUpperCase()}</div>
    <div class="meta">${item.device} • ${item.effect} • ${item.template}</div>
    <div class="meta">AI: ${item.aiStyle} • BG: ${item.backgroundMode}</div>
    <div class="overlay">${item.overlay || 'No overlay'}</div>
    ${media ? '<button class="btn-dl">⬇ Download</button>' : ''}
  `;

  if (media) {
    el.querySelector('.btn-dl').addEventListener('click', () => downloadItem(item.id, item.mode));
  }

  return el;
}

function renderGallery() {
  const filter = getById('galleryFilter').value;
  const container = getById('gallery');
  container.innerHTML = '';

  state.gallery
    .filter((item) => filter === 'all' || item.mode === filter)
    .forEach((item) => container.append(buildItemCard(item)));

  container.classList.toggle('live', state.liveDisplay);
}

function countdown(seconds) {
  return new Promise((resolve) => {
    if (seconds <= 0) return resolve();
    let remaining = seconds;
    setStatus(`Capturing in ${remaining}...`);
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timer);
        resolve();
      } else {
        setStatus(`Capturing in ${remaining}...`);
      }
    }, 1000);
  });
}

function createCaptureItem() {
  return {
    id: generateId(),
    mode: getById('mode').value,
    device: getById('device').value,
    effect: getById('effect').value,
    aiStyle: getById('aiStyle').value,
    backgroundMode: getById('backgroundMode').value,
    template: getById('template').value,
    overlay: getById('overlayText').value,
    createdAt: Date.now(),
  };
}

function setCaptureButtons(enabled) {
  ['captureOne', 'captureBurst', 'retakeLast'].forEach((id) => {
    getById(id).disabled = !enabled;
  });
}

async function runCapture(iterations = 1) {
  const wait = Number(getById('countdown').value || 0);
  await countdown(wait);

  const mode = getById('mode').value;
  const effect = getById('effect').value;
  const aiStyle = getById('aiStyle').value;
  const overlayText = getById('overlayText').value;
  const isVideo = mode === 'video' || mode === 'slomo';

  setCaptureButtons(false);

  let sharedVideoUrl = null;
  if (isVideo && cameraStream) {
    setStatus('Recording… 3 seconds');
    sharedVideoUrl = await captureVideoFromCamera();
  }

  for (let i = 0; i < iterations; i += 1) {
    const item = createCaptureItem();

    if (cameraStream) {
      if (isVideo && sharedVideoUrl) {
        mediaStore[item.id] = { type: 'video', url: sharedVideoUrl };
      } else if (!isVideo) {
        const dataUrl = await capturePhotoFromCamera(effect, aiStyle, overlayText);
        if (dataUrl) mediaStore[item.id] = { type: 'image', url: dataUrl };
      }
    }

    state.gallery.unshift(item);
    log(`${item.mode} captured (${i + 1}/${iterations}) on ${item.device}`);
    notifyPeers('capture', item);
  }

  saveState();
  renderGallery();
  setStatus(`Captured ${iterations} item${iterations > 1 ? 's' : ''}`);
  setCaptureButtons(true);
}

function updateBranding() {
  getById('brandName').textContent = getById('brandInput').value || '360Booth Studio';
  document.documentElement.style.setProperty('--accent', getById('themeColor').value);
}

function saveEvent() {
  state.event = {
    name: getById('eventName').value,
    host: getById('eventHost').value,
    location: getById('eventLocation').value,
    date: getById('eventDate').value,
  };
  saveState();
  log(`Saved event: ${state.event.name || 'Untitled Event'}`);
  notifyPeers('event', state.event);
}

function loadEvent() {
  getById('eventName').value = state.event.name || '';
  getById('eventHost').value = state.event.host || '';
  getById('eventLocation').value = state.event.location || '';
  getById('eventDate').value = state.event.date || '';
  log(`Loaded event: ${state.event.name || 'Untitled Event'}`);
}

function clearEvent() {
  state.event = {};
  saveState();
  getById('eventName').value = '';
  getById('eventHost').value = '';
  getById('eventLocation').value = '';
  getById('eventDate').value = '';
  log('Cleared event data');
}

function queueShare() {
  if (!state.gallery.length) {
    log('No media to queue');
    return;
  }
  state.queue.push(state.gallery[0]);
  saveState();
  updateCounters();
  log(`Queued 1 item for share (${state.queue.length} pending)`);
}

function flushQueue() {
  if (!state.queue.length) {
    log('Share queue is empty');
    return;
  }
  if (!state.online) {
    log('Still offline. Queue retained.');
    return;
  }
  state.sentCount += state.queue.length;
  state.queue = [];
  saveState();
  updateCounters();
  log('Flushed queued shares to delivery channels');
}

// --- QR generation via free public API ---
function generateQr(text) {
  const encoded = encodeURIComponent(text);
  const box = getById('qrBox');
  const img = document.createElement('img');
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encoded}&margin=6`;
  img.alt = 'QR Code';
  img.width = 140;
  img.height = 140;
  img.onerror = () => fakeQr(text);
  box.replaceChildren(img);
}

function fakeQr(text) {
  const data = encodeURIComponent(text);
  getById('qrBox').innerHTML = `
    <svg width="140" height="140" viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" aria-label="QR">
      <rect width="140" height="140" fill="#fff" />
      <rect x="10" y="10" width="120" height="120" fill="#000" opacity=".07" />
      <text x="70" y="70" text-anchor="middle" font-size="9" fill="#111">QR</text>
      <text x="70" y="83" text-anchor="middle" font-size="6" fill="#111">${data.slice(0, 26)}</text>
    </svg>
  `;
}

// --- Download individual capture ---
function downloadItem(id, mode) {
  const media = mediaStore[id];
  if (!media) { log('No media file available for this item'); return; }
  const ext = media.type === 'video' ? 'webm' : 'jpg';
  const a = document.createElement('a');
  a.href = media.url;
  a.download = `360booth-${mode}-${id.slice(0, 8)}.${ext}`;
  a.click();
  log(`Downloaded ${mode} capture`);
}

// --- Sharing center ---
function share(channel) {
  const item = state.gallery[0];
  if (!item) {
    log('Capture media before sharing');
    return;
  }
  if (!state.online && channel !== 'Download') {
    state.queue.push(item);
    saveState();
    updateCounters();
    log(`Offline: queued share for ${channel}`);
    return;
  }

  const eventLabel = state.event.name ? `Event: ${state.event.name}` : '360Booth Capture';
  const shareText = `${eventLabel} | Mode: ${item.mode.toUpperCase()} | ${new Date(item.createdAt).toLocaleDateString()} — captured with 360Booth Studio`;

  if (channel === 'QR') {
    generateQr(shareText);
    log('QR code generated');
    return;
  }
  if (channel === 'Email') {
    window.open(
      `mailto:?subject=${encodeURIComponent(eventLabel)}&body=${encodeURIComponent(shareText)}`,
      '_self',
    );
  } else if (channel === 'SMS') {
    window.open(`sms:?body=${encodeURIComponent(shareText)}`, '_self');
  } else if (channel === 'WhatsApp') {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
  } else if (channel === 'Download') {
    downloadItem(item.id, item.mode);
    return;
  }

  state.sentCount += 1;
  saveState();
  updateCounters();
  log(`Shared latest capture via ${channel}`);
}

function upload(provider) {
  if (!state.gallery.length) {
    log('Nothing to upload');
    return;
  }
  log(`Uploaded full-quality capture to ${provider}`);
}

function printStrip() {
  if (!state.gallery.length) {
    log('Nothing to print');
    return;
  }
  state.printCount += 1;
  saveState();
  updateCounters();
  log('Photo strip sent to print server');
}

function toggleOnline() {
  state.online = !state.online;
  updateOnlineBadge();
  log(`Connectivity changed: ${state.online ? 'online' : 'offline'}`);
  if (state.online) flushQueue();
}

function toggleLiveDisplay() {
  state.liveDisplay = !state.liveDisplay;
  renderGallery();
  log(`Live display ${state.liveDisplay ? 'enabled' : 'disabled'}`);
}

function revokeMedia(id) {
  const media = mediaStore[id];
  if (!media) return;
  // Only revoke blob URL if no other gallery item shares the same URL
  const stillUsed = state.gallery.some((item) => item.id !== id && mediaStore[item.id]?.url === media.url);
  if (!stillUsed && media.url.startsWith('blob:')) URL.revokeObjectURL(media.url);
  delete mediaStore[id];
}

function retakeLast() {
  if (!state.gallery.length) {
    log('No capture available to retake');
    return;
  }
  const removed = state.gallery.shift();
  revokeMedia(removed.id);
  saveState();
  renderGallery();
  log(`Retake requested for ${removed.mode}`);
}

function exportGallery() {
  const blob = new Blob([JSON.stringify(state.gallery, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '360booth-gallery.json';
  a.click();
  URL.revokeObjectURL(url);
  log('Exported gallery JSON');
}

function clearGallery() {
  state.gallery.forEach((item) => revokeMedia(item.id));
  state.gallery = [];
  saveState();
  renderGallery();
  log('Cleared session gallery');
}

function bindEvents() {
  getById('startCamera').addEventListener('click', startCamera);
  getById('stopCamera').addEventListener('click', stopCamera);

  getById('captureOne').addEventListener('click', () => runCapture(1));
  getById('captureBurst').addEventListener('click', () => runCapture(3));
  getById('retakeLast').addEventListener('click', retakeLast);

  getById('brandInput').addEventListener('input', updateBranding);
  getById('themeColor').addEventListener('input', updateBranding);

  getById('saveEvent').addEventListener('click', saveEvent);
  getById('loadEvent').addEventListener('click', loadEvent);
  getById('clearEvent').addEventListener('click', clearEvent);

  getById('queueShare').addEventListener('click', queueShare);
  getById('flushShare').addEventListener('click', flushQueue);
  getById('print').addEventListener('click', printStrip);

  getById('toggleOnline').addEventListener('click', toggleOnline);
  getById('toggleLiveDisplay').addEventListener('click', toggleLiveDisplay);

  getById('galleryFilter').addEventListener('change', renderGallery);
  getById('exportGallery').addEventListener('click', exportGallery);
  getById('clearGallery').addEventListener('click', clearGallery);

  document.querySelectorAll('.share').forEach((btn) => {
    btn.addEventListener('click', () => share(btn.dataset.channel));
  });

  document.querySelectorAll('.cloud').forEach((btn) => {
    btn.addEventListener('click', () => upload(btn.dataset.provider));
  });
}

function initSync() {
  if (!syncChannel) return;
  syncChannel.onmessage = (event) => {
    const { type, payload } = event.data || {};
    if (type === 'capture' && payload?.id) {
      const exists = state.gallery.some((item) => item.id === payload.id);
      if (!exists) {
        state.gallery.unshift(payload);
        saveState();
        renderGallery();
        log(`Synced capture from linked device (${payload.mode})`);
      }
    }
    if (type === 'event' && payload) {
      state.event = payload;
      saveState();
      log('Synced event metadata from linked device');
    }
  };
}

function bootstrap() {
  bindEvents();
  initSync();
  loadEvent();
  updateBranding();
  updateOnlineBadge();
  updateCounters();
  renderGallery();
  if (state.queue.length) log(`Recovered ${state.queue.length} queued item(s) from offline cache`);
}

bootstrap();
