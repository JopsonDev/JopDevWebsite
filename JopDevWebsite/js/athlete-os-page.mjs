export function initAthleteOsPage() {
  const page = document.querySelector('[data-athlete-os-page]');
  if (!page) return;

  const appUrl = page.dataset.appUrl;
  const installButton = page.querySelector('[data-install-athlete]');
  const installHelp = page.querySelector('[data-install-help]');
  const isAndroid = /Android/i.test(navigator.userAgent);

  if (isAndroid) {
    installButton.firstChild.textContent = 'Install on Android ';
    installHelp.textContent = 'Athlete OS will open and show the browser installation action when supported.';
  }

  installButton.addEventListener('click', () => {
    window.location.assign(`${appUrl}?install=1`);
  });
}
