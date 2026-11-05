// Day/Night appearance, as in the other PRG32 tools. With no choice made the page
// follows the system setting and stores nothing. Only an explicit choice is kept
// (localStorage key "prg32-theme"), because the visitor asked for it to persist.
(() => {
  const KEY = 'prg32-theme';
  const read = () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  };
  const system = () => matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = () => (read() ? read() === 'dark' : system());
  const apply = () => {
    document.documentElement.dataset.theme = isDark() ? 'dark' : 'light';
    const button = document.getElementById('theme-toggle');
    if (button) button.setAttribute('aria-pressed', String(isDark()));
  };
  apply();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      try {
        if (next === (system() ? 'dark' : 'light')) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, next);
      } catch {
        // Storage blocked: the choice lasts for this page view only.
        document.documentElement.dataset.theme = next;
        return;
      }
      apply();
    });
  });
})();
