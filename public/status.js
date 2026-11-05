// Public status page: aggregate counts only, no identifiers. Updates every five
// seconds and can be paused (WCAG 2.2.2). Values change silently; only a change
// of availability is announced, so screen readers are not flooded.
const state = document.querySelector('#service-state');
const status = document.querySelector('#public-stats-status');
const pause = document.querySelector('#pause-updates');
const numbers = new Intl.NumberFormat();
let paused = false;
let lastAvailability = null;

const setAvailability = (available) => {
  state.dataset.state = available ? 'online' : 'offline';
  state.textContent = available ? 'Online' : 'Unavailable';
  if (lastAvailability !== null && lastAvailability !== available)
    document.querySelector('#status-announcer').textContent = available
      ? 'The multiplayer service is online again.'
      : 'The multiplayer service is unavailable.';
  lastAvailability = available;
};

const refresh = async () => {
  try {
    const response = await fetch('/api/stats', { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    const stats = await response.json();
    document.querySelector('#stat-connections').textContent = numbers.format(
      stats.connections,
    );
    document.querySelector('#stat-rooms').textContent = numbers.format(stats.rooms);
    const time = new Date(stats.generated_at).toLocaleTimeString();
    status.textContent = paused ? `Paused at ${time}` : `Updated ${time}`;
    setAvailability(true);
  } catch {
    status.textContent = 'Live statistics are temporarily unavailable.';
    setAvailability(false);
  }
};

pause.addEventListener('click', () => {
  paused = !paused;
  pause.textContent = paused ? 'Resume live updates' : 'Pause live updates';
  if (!paused) refresh();
  else status.textContent = status.textContent.replace(/^Updated/, 'Paused at');
});

refresh();
setInterval(() => {
  if (!paused && !document.hidden) refresh();
}, 5000);
