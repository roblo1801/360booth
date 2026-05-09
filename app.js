const gallery = document.getElementById('gallery');
const log = document.getElementById('log');
const mode = document.getElementById('mode');
const overlayText = document.getElementById('overlayText');
const effect = document.getElementById('effect');
const themeColor = document.getElementById('themeColor');
const brandInput = document.getElementById('brandInput');
const brandName = document.getElementById('brandName');

const state = {
  queue: JSON.parse(localStorage.getItem('shareQueue') || '[]'),
  liveDisplay: false,
};

function pushLog(message) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()} — ${message}`;
  log.prepend(li);
}

function captureItem() {
  const item = document.createElement('article');
  item.className = 'item';

  const modeText = document.createElement('div');
  modeText.className = 'mode';
  modeText.textContent = `${mode.value.toUpperCase()} capture`;

  const fx = document.createElement('div');
  fx.textContent = `Effect: ${effect.value}`;

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.textContent = overlayText.value || 'No overlay';

  item.append(modeText, fx, overlay);
  gallery.prepend(item);
  pushLog(`${mode.value} captured from ${document.getElementById('device').value}`);
}

function persistQueue() {
  localStorage.setItem('shareQueue', JSON.stringify(state.queue));
}

document.getElementById('capture').addEventListener('click', captureItem);

document.getElementById('queueShare').addEventListener('click', () => {
  state.queue.push({ type: mode.value, createdAt: Date.now() });
  persistQueue();
  pushLog(`Queued for offline sharing (${state.queue.length} pending)`);
});

document.getElementById('flushShare').addEventListener('click', () => {
  const sent = state.queue.length;
  state.queue = [];
  persistQueue();
  pushLog(`Sent queued shares (${sent})`);
});

document.querySelectorAll('.share').forEach((button) => {
  button.addEventListener('click', () => {
    pushLog(`Shared latest media via ${button.dataset.channel}`);
  });
});

document.querySelectorAll('.cloud').forEach((button) => {
  button.addEventListener('click', () => {
    pushLog(`Uploaded full-quality media to ${button.dataset.provider}`);
  });
});

document.getElementById('print').addEventListener('click', () => {
  pushLog('Photo strip sent to print server');
});

document.getElementById('liveDisplay').addEventListener('click', () => {
  state.liveDisplay = !state.liveDisplay;
  gallery.classList.toggle('live', state.liveDisplay);
  pushLog(`Live display ${state.liveDisplay ? 'enabled' : 'disabled'}`);
});

themeColor.addEventListener('input', () => {
  document.documentElement.style.setProperty('--accent', themeColor.value);
});

brandInput.addEventListener('input', () => {
  brandName.textContent = brandInput.value || '360Booth';
});

if (state.queue.length) {
  pushLog(`Recovered ${state.queue.length} queued share items from offline cache`);
}
