const $ = (id) => document.getElementById(id);

const state = {
  online: true,
  liveDisplay: false,
  queue: JSON.parse(localStorage.getItem('shareQueue') || '[]'),
  sentCount: Number(localStorage.getItem('sentCount') || 0),
  printCount: Number(localStorage.getItem('printCount') || 0),
  gallery: JSON.parse(localStorage.getItem('galleryItems') || '[]'),
  event: JSON.parse(localStorage.getItem('activeEvent') || '{}'),
};

const syncChannel = 'BroadcastChannel' in window ? new BroadcastChannel('360booth-sync') : null;

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
  $('log').prepend(li);
}

function setStatus(message) {
  $('captureStatus').textContent = message;
}

function updateCounters() {
  $('queueCount').textContent = state.queue.length;
  $('sentCount').textContent = state.sentCount;
  $('printCount').textContent = state.printCount;
}

function updateOnlineBadge() {
  $('onlineBadge').textContent = state.online ? 'Online' : 'Offline';
  $('onlineBadge').className = `badge ${state.online ? 'online' : 'offline'}`;
  $('toggleOnline').textContent = state.online ? 'Go Offline' : 'Go Online';
}

function buildItemCard(item) {
  const el = document.createElement('article');
  el.className = 'card-item';
  el.dataset.mode = item.mode;
  el.innerHTML = `
    <div class="title">${item.mode.toUpperCase()}</div>
    <div class="meta">${item.device} • ${item.effect} • ${item.template}</div>
    <div class="meta">AI: ${item.aiStyle} • BG: ${item.backgroundMode}</div>
    <div class="overlay">${item.overlay || 'No overlay'}</div>
  `;
  return el;
}

function renderGallery() {
  const filter = $('galleryFilter').value;
  const container = $('gallery');
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
    id: crypto.randomUUID(),
    mode: $('mode').value,
    device: $('device').value,
    effect: $('effect').value,
    aiStyle: $('aiStyle').value,
    backgroundMode: $('backgroundMode').value,
    template: $('template').value,
    overlay: $('overlayText').value,
    createdAt: Date.now(),
  };
}

async function runCapture(iterations = 1) {
  const wait = Number($('countdown').value || 0);
  await countdown(wait);

  for (let i = 0; i < iterations; i += 1) {
    const item = createCaptureItem();
    state.gallery.unshift(item);
    log(`${item.mode} captured (${i + 1}/${iterations}) on ${item.device}`);
    notifyPeers('capture', item);
  }

  saveState();
  renderGallery();
  setStatus(`Captured ${iterations} item${iterations > 1 ? 's' : ''}`);
}

function updateBranding() {
  $('brandName').textContent = $('brandInput').value || '360Booth Studio';
  document.documentElement.style.setProperty('--accent', $('themeColor').value);
}

function saveEvent() {
  state.event = {
    name: $('eventName').value,
    host: $('eventHost').value,
    location: $('eventLocation').value,
    date: $('eventDate').value,
  };
  saveState();
  log(`Saved event: ${state.event.name || 'Untitled Event'}`);
  notifyPeers('event', state.event);
}

function loadEvent() {
  $('eventName').value = state.event.name || '';
  $('eventHost').value = state.event.host || '';
  $('eventLocation').value = state.event.location || '';
  $('eventDate').value = state.event.date || '';
  log(`Loaded event: ${state.event.name || 'Untitled Event'}`);
}

function clearEvent() {
  state.event = {};
  saveState();
  $('eventName').value = '';
  $('eventHost').value = '';
  $('eventLocation').value = '';
  $('eventDate').value = '';
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

function fakeQr(text) {
  const data = encodeURIComponent(text);
  $('qrBox').innerHTML = `
    <svg width="140" height="140" viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" aria-label="QR">
      <rect width="140" height="140" fill="#fff" />
      <rect x="10" y="10" width="120" height="120" fill="#000" opacity=".07" />
      <text x="70" y="70" text-anchor="middle" font-size="9" fill="#111">QR</text>
      <text x="70" y="83" text-anchor="middle" font-size="6" fill="#111">${data.slice(0, 26)}</text>
    </svg>
  `;
}

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
  if (channel === 'QR') {
    fakeQr(`${item.id}-${item.mode}-${Date.now()}`);
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

function retakeLast() {
  if (!state.gallery.length) {
    log('No capture available to retake');
    return;
  }
  const removed = state.gallery.shift();
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
  state.gallery = [];
  saveState();
  renderGallery();
  log('Cleared session gallery');
}

function bindEvents() {
  $('captureOne').addEventListener('click', () => runCapture(1));
  $('captureBurst').addEventListener('click', () => runCapture(3));
  $('retakeLast').addEventListener('click', retakeLast);

  $('brandInput').addEventListener('input', updateBranding);
  $('themeColor').addEventListener('input', updateBranding);

  $('saveEvent').addEventListener('click', saveEvent);
  $('loadEvent').addEventListener('click', loadEvent);
  $('clearEvent').addEventListener('click', clearEvent);

  $('queueShare').addEventListener('click', queueShare);
  $('flushShare').addEventListener('click', flushQueue);
  $('print').addEventListener('click', printStrip);

  $('toggleOnline').addEventListener('click', toggleOnline);
  $('toggleLiveDisplay').addEventListener('click', toggleLiveDisplay);

  $('galleryFilter').addEventListener('change', renderGallery);
  $('exportGallery').addEventListener('click', exportGallery);
  $('clearGallery').addEventListener('click', clearGallery);

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
