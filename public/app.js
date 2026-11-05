// Admin console. The token lives only in sessionStorage (this tab), is sent only
// to this server's /api/admin/ endpoints, and is removed on sign-out.
const TOKEN_KEY = 'prg32-admin-token';
const REFRESH_MS = 10000;
// The most the events API returns; the chart says "at least" when it is reached.
const EVENT_LIMIT = 5000;
const $ = (selector) => document.querySelector(selector);
const login = $('#login');
const loginForm = $('#login-form');
const dashboard = $('#dashboard');
const tokenInput = $('#token');
const tokenError = $('#token-error');
const announcer = $('#announcer');
const pauseButton = $('#admin-pause');
const filterInput = $('#device-filter');
const eraseDialog = $('#erase-dialog');
const numbers = new Intl.NumberFormat();
const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'medium',
});
const SVG = 'http://www.w3.org/2000/svg';

const storage = {
  get: () => {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  },
  set: (value) => {
    try {
      sessionStorage.setItem(TOKEN_KEY, value);
    } catch {
      // Storage blocked: the session lasts for this page view only.
    }
  },
  clear: () => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nothing stored.
    }
  },
};

let token = storage.get();
let paused = false;
let timer = null;
let devices = [];

const announce = (message) => {
  // Clearing first makes a repeated message announce again.
  announcer.textContent = '';
  setTimeout(() => (announcer.textContent = message), 50);
};

class AuthError extends Error {}

const api = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    cache: 'no-store',
    headers: { authorization: `Bearer ${token}` },
  });
  if (response.status === 401) throw new AuthError('The admin token was not accepted.');
  if (!response.ok) throw new Error(`The server answered ${response.status}.`);
  return response;
};

const text = (tag, value, className) => {
  const node = document.createElement(tag);
  node.textContent = value ?? '';
  if (className) node.className = className;
  return node;
};

const time = (iso) => {
  const node = document.createElement('time');
  if (!iso) return text('span', '—');
  node.dateTime = iso;
  node.textContent = dateTime.format(new Date(iso));
  return node;
};

const row = (cells) => {
  const tr = document.createElement('tr');
  for (const cell of cells) {
    const td = document.createElement('td');
    td.append(cell);
    tr.append(td);
  }
  return tr;
};

// Re-rendering replaces the action buttons, so keep keyboard focus where it was.
const preserveFocus = (update) => {
  const key = document.activeElement?.dataset?.focusKey;
  update();
  if (key) document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`)?.focus();
};

const renderCards = (stats) => {
  const cards = [
    ['Players connected', stats.connections],
    ['Active rooms', stats.rooms],
    ['Known devices', stats.known_devices],
    ['Retained events', stats.retained_events],
    ['Retention', `${stats.retention_days} days`],
  ];
  $('#cards').replaceChildren(
    ...cards.map(([label, value]) => {
      const item = text('div', '', 'metric');
      item.append(
        text('dt', label),
        text('dd', typeof value === 'number' ? numbers.format(value) : value),
      );
      return item;
    }),
  );
  $('#privacy-warning').hidden = stats.privacy_notice_ready !== false;
};

const renderChart = (events) => {
  const bins = Array(60).fill(0);
  const now = Date.now();
  for (const event of events) {
    const age = Math.floor((now - Date.parse(event.timestamp)) / 60000);
    if (age >= 0 && age < 60) bins[59 - age]++;
  }
  const max = Math.max(1, ...bins);
  const total = bins.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(...bins);
  const chart = $('#chart');
  const width = 600 / 60;
  const bars = [];
  const baseline = document.createElementNS(SVG, 'line');
  baseline.setAttribute('class', 'chart-axis');
  for (const [name, value] of Object.entries({ x1: 0, x2: 600, y1: 150, y2: 150 }))
    baseline.setAttribute(name, value);
  bins.forEach((value, index) => {
    if (!value) return;
    const height = (value / max) * 140;
    const bar = document.createElementNS(SVG, 'rect');
    bar.setAttribute('class', 'chart-bar');
    bar.setAttribute('x', String(index * width + 1));
    bar.setAttribute('y', String(150 - height));
    bar.setAttribute('width', String(width - 2));
    bar.setAttribute('height', String(height));
    bars.push(bar);
  });
  chart.replaceChildren(baseline, ...bars);
  $('#chart-summary').textContent = total
    ? `${events.length >= EVENT_LIMIT ? 'At least ' : ''}${numbers.format(total)} events in the last 60 minutes; busiest minute had ${numbers.format(peak)}. Oldest minute on the left, newest on the right.`
    : 'No events in the last 60 minutes.';
  const rows = [];
  for (let index = 59; index >= 0; index--) {
    if (!bins[index]) continue;
    const minute = new Date(now - (59 - index) * 60000);
    rows.push(
      row([
        text(
          'span',
          minute.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ),
        text('span', numbers.format(bins[index])),
      ]),
    );
  }
  if (!rows.length) rows.push(row([text('span', 'No events'), text('span', '0')]));
  $('#chart-table').replaceChildren(...rows);
};

const actionButton = (label, deviceId, action, className = 'secondary') => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `button small ${className}`;
  button.dataset.device = deviceId;
  button.dataset.action = action;
  // Block and Unblock are the same control, so focus survives the toggle.
  button.dataset.focusKey = `${action === 'unblock' ? 'block' : action}:${deviceId}`;
  button.append(label, text('span', ` device ${deviceId}`, 'visually-hidden'));
  return button;
};

const renderDevices = () => {
  const query = filterInput.value.trim().toLowerCase();
  const visible = devices.filter((device) =>
    device.device_id.toLowerCase().includes(query),
  );
  preserveFocus(() => {
    const rows = visible.map((device) => {
      const actions = text('div', '', 'action-cell');
      actions.append(
        actionButton('Export', device.device_id, 'export'),
        actionButton(
          device.blocked ? 'Unblock' : 'Block',
          device.device_id,
          device.blocked ? 'unblock' : 'block',
        ),
        actionButton('Erase', device.device_id, 'erase', 'danger'),
      );
      return row([
        text('code', device.device_id),
        text('span', device.platform),
        time(device.first_seen),
        time(device.last_seen),
        text('span', numbers.format(device.connections)),
        text(
          'span',
          device.blocked ? 'Blocked' : 'Allowed',
          `badge ${device.blocked ? 'blocked' : 'allowed'}`,
        ),
        actions,
      ]);
    });
    if (!rows.length) {
      const empty = text(
        'td',
        query ? 'No device matches this ID.' : 'No devices yet.',
        'empty',
      );
      empty.colSpan = 7;
      const tr = document.createElement('tr');
      tr.append(empty);
      rows.push(tr);
    }
    $('#devices').replaceChildren(...rows);
  });
  $('#device-count').textContent = query
    ? `${visible.length} of ${devices.length} devices match.`
    : `${devices.length} devices.`;
};

const renderEvents = (events) => {
  const rows = events
    .slice(-100)
    .reverse()
    .map((event) =>
      row([
        time(event.timestamp),
        text('span', event.type),
        text('span', event.platform ?? '—'),
        text('span', event.room ?? '—'),
        text('span', event.bytes === undefined ? '—' : numbers.format(event.bytes)),
      ]),
    );
  if (!rows.length) {
    const empty = text('td', 'No events retained.', 'empty');
    empty.colSpan = 5;
    const tr = document.createElement('tr');
    tr.append(empty);
    rows.push(tr);
  }
  $('#events').replaceChildren(...rows);
};

const render = async () => {
  const [stats, events, deviceList] = await Promise.all([
    api('/api/admin/stats').then((response) => response.json()),
    api(`/api/admin/events?limit=${EVENT_LIMIT}`).then((response) => response.json()),
    api('/api/admin/devices').then((response) => response.json()),
  ]);
  devices = deviceList;
  renderCards(stats);
  renderChart(events);
  renderDevices();
  renderEvents(events);
  $('#dashboard-updated').textContent =
    `${paused ? 'Paused' : 'Updated'} ${new Date().toLocaleTimeString()}`;
};

const signOut = (message) => {
  clearInterval(timer);
  token = '';
  storage.clear();
  devices = [];
  dashboard.hidden = true;
  login.hidden = false;
  tokenInput.value = '';
  if (message) showLoginError(message);
  tokenInput.focus();
};

const showLoginError = (message) => {
  tokenError.textContent = message;
  tokenInput.setAttribute('aria-invalid', message ? 'true' : 'false');
};

const refreshSafely = async () => {
  try {
    await render();
  } catch (error) {
    if (error instanceof AuthError) signOut('Your session ended. Sign in again.');
    else $('#dashboard-updated').textContent = `Update failed: ${error.message}`;
  }
};

const openDashboard = async () => {
  await render();
  storage.set(token);
  login.hidden = true;
  dashboard.hidden = false;
  clearInterval(timer);
  timer = setInterval(() => {
    if (!paused && !document.hidden && !eraseDialog.open) refreshSafely();
  }, REFRESH_MS);
};

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!tokenInput.value) {
    showLoginError('Enter the admin token.');
    tokenInput.focus();
    return;
  }
  showLoginError('');
  token = tokenInput.value;
  try {
    await openDashboard();
    tokenInput.value = '';
    $('#main').focus();
    announce('Signed in. Dashboard loaded.');
  } catch (error) {
    token = '';
    showLoginError(error.message);
    tokenInput.focus();
    tokenInput.select();
  }
});

$('#toggle-token').addEventListener('click', (event) => {
  const show = tokenInput.type === 'password';
  tokenInput.type = show ? 'text' : 'password';
  event.currentTarget.setAttribute('aria-pressed', String(show));
  tokenInput.focus();
});

$('#sign-out').addEventListener('click', () => {
  signOut();
  announce('Signed out. The token was removed from this browser.');
});
$('#refresh').addEventListener('click', async () => {
  await refreshSafely();
  announce('Dashboard refreshed.');
});
pauseButton.addEventListener('click', () => {
  paused = !paused;
  pauseButton.textContent = paused ? 'Resume live updates' : 'Pause live updates';
  announce(paused ? 'Live updates paused.' : 'Live updates resumed.');
  if (!paused) refreshSafely();
});
filterInput.addEventListener('input', renderDevices);

const download = async (path, filename) => {
  const response = await api(path);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(await response.blob());
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

const confirmErase = (deviceId) =>
  new Promise((resolve) => {
    $('#erase-device').textContent = deviceId;
    eraseDialog.returnValue = '';
    eraseDialog.addEventListener(
      'close',
      () => resolve(eraseDialog.returnValue === 'erase'),
      {
        once: true,
      },
    );
    eraseDialog.showModal();
  });

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action], button[data-export]');
  if (!button) return;
  try {
    if (button.dataset.export) {
      const format = button.dataset.export;
      await download(`/api/admin/export?format=${format}`, `prg32-telemetry.${format}`);
      announce(`Telemetry exported as ${format.toUpperCase()}.`);
      return;
    }
    const { device, action } = button.dataset;
    const path = `/api/admin/devices/${encodeURIComponent(device)}`;
    if (action === 'export') {
      await download(`${path}/export`, `prg32-device-${device}.json`);
      announce(`Data for device ${device} exported.`);
    } else if (action === 'erase') {
      if (!(await confirmErase(device))) {
        button.focus();
        return;
      }
      await api(path, { method: 'DELETE' });
      await render();
      filterInput.focus();
      announce(`Device ${device} and its events were erased.`);
    } else {
      await api(`${path}/${action}`, { method: 'POST' });
      await render();
      announce(`Device ${device} ${action === 'block' ? 'blocked' : 'unblocked'}.`);
    }
  } catch (error) {
    if (error instanceof AuthError) signOut('Your session ended. Sign in again.');
    else announce(`Action failed: ${error.message}`);
  }
});

if (token)
  openDashboard().catch(() => {
    token = '';
    storage.clear();
  });
