const login = document.querySelector('#login');
const dashboard = document.querySelector('#dashboard');
const tokenInput = document.querySelector('#token');
let token = sessionStorage.getItem('prg32-admin-token') || '';
const renderPublicStats = async () => {
  const response = await fetch('/api/stats', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  const stats = await response.json();
  document.querySelector('#public-cards').innerHTML = [
    ['Connections', stats.connections],
    ['Rooms', stats.rooms],
  ]
    .map(
      ([key, value]) =>
        `<div class="card"><span>${key}</span><strong>${value}</strong></div>`,
    )
    .join('');
  document.querySelector('#public-stats-status').textContent =
    `Updated ${new Date(stats.generated_at).toLocaleTimeString()}`;
};
const api = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    throw new Error(
      response.status === 401 ? 'Invalid token' : `Request failed: ${response.status}`,
    );
  return response;
};
const escape = (value) => {
  const node = document.createElement('span');
  node.textContent = value ?? '';
  return node.innerHTML;
};
const render = async () => {
  const [stats, events, devices] = await Promise.all([
    (await api('/api/admin/stats')).json(),
    (await api('/api/admin/events?limit=500')).json(),
    (await api('/api/admin/devices')).json(),
  ]);
  document.querySelector('#cards').innerHTML = [
    ['Connections', stats.connections],
    ['Rooms', stats.rooms],
    ['Known devices', stats.known_devices],
    ['Retained events', stats.retained_events],
  ]
    .map(([k, v]) => `<div class="card"><span>${k}</span><strong>${v}</strong></div>`)
    .join('');
  document.querySelector('#events').innerHTML = events
    .slice(-100)
    .reverse()
    .map(
      (e) =>
        `<tr><td>${escape(e.timestamp)}</td><td>${escape(e.type)}</td><td>${escape(e.platform)}</td><td>${escape(e.room)}</td><td>${escape(e.bytes)}</td></tr>`,
    )
    .join('');
  document.querySelector('#devices').innerHTML = devices
    .map(
      (d) =>
        `<tr><td>${escape(d.device_id)}</td><td>${escape(d.platform)}</td><td>${escape(d.last_seen)}</td><td>${d.connections}</td><td><button data-device="${d.device_id}" data-action="${d.blocked ? 'unblock' : 'block'}">${d.blocked ? 'Unblock' : 'Block'}</button> <button data-device="${d.device_id}" data-action="erase">Erase</button></td></tr>`,
    )
    .join('');
  draw(events);
};
const draw = (events) => {
  const canvas = document.querySelector('#chart'),
    ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bins = Array(60).fill(0),
    now = Date.now();
  for (const e of events) {
    const age = Math.floor((now - Date.parse(e.timestamp)) / 60000);
    if (age >= 0 && age < 60) bins[59 - age]++;
  }
  const max = Math.max(1, ...bins);
  ctx.fillStyle = '#66d9a6';
  bins.forEach((v, i) =>
    ctx.fillRect(
      i * 15,
      canvas.height - (v / max) * (canvas.height - 20),
      11,
      (v / max) * (canvas.height - 20),
    ),
  );
};
document.querySelector('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  token = tokenInput.value;
  try {
    await render();
    sessionStorage.setItem('prg32-admin-token', token);
    login.hidden = true;
    dashboard.hidden = false;
  } catch (error) {
    alert(error.message);
  }
});
document.addEventListener('click', async (e) => {
  const action = e.target.dataset.action;
  if (action) {
    if (action === 'erase' && !confirm('Erase this device and its retained events?'))
      return;
    await api(
      `/api/admin/devices/${e.target.dataset.device}${action === 'erase' ? '' : `/${action}`}`,
      { method: action === 'erase' ? 'DELETE' : 'POST' },
    );
    await render();
  }
  if (e.target.dataset.export) {
    const response = await api(`/api/admin/export?format=${e.target.dataset.export}`);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(await response.blob());
    link.download = `prg32-telemetry.${e.target.dataset.export}`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
});
if (token) {
  tokenInput.value = token;
  render()
    .then(() => {
      login.hidden = true;
      dashboard.hidden = false;
    })
    .catch(() => sessionStorage.removeItem('prg32-admin-token'));
}
renderPublicStats().catch(() => {
  document.querySelector('#public-stats-status').textContent =
    'Live statistics are temporarily unavailable.';
});
setInterval(() => {
  renderPublicStats().catch(() => {});
  if (!dashboard.hidden) render().catch(() => {});
}, 2000);
