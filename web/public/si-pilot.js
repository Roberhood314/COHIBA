(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const packages = new Set(['Integration pilot', 'Scope review', 'Maintenance']);
  document.querySelectorAll('[data-package]').forEach(link => {
    link.addEventListener('click', () => {
      if (packages.has(link.dataset.package)) $('package').value = link.dataset.package;
    });
  });
  $('pilotForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!$('pilotForm').reportValidity()) return;
    const service = $('package').value;
    if (!packages.has(service)) return;
    const field = id => $(id).value.trim().replace(/[\r\n]+/g, ' ');
    if (!field('project') || !field('stack') || !field('effect')) {
      $('status').textContent = 'Enter a project, stack and action description.';
      return;
    }
    const brief = '# COHIBA SI service inquiry\n\n' +
      'Service: ' + service + '\nPublic project: ' + field('project') +
      '\nStack: ' + field('stack') + '\nProtected action: ' + field('effect') +
      '\nPreferred timeframe: ' + (field('timing') || 'To discuss') +
      '\n\nPlease review technical fit and propose a written scope and quote.\n' +
      'I understand SI is experimental/pre-audit, and production rollout is separate.\n' +
      'This is an inquiry, not a purchase or authorization to charge.\n' +
      'Please confirm a private channel before requesting non-public details.';
    $('brief').textContent = brief;
    const url = new URL('https://github.com/Roberhood314/COHIBA/issues/new');
    url.searchParams.set('title', '[SI PILOT] ' + service + ': ' + field('project').slice(0, 80));
    url.searchParams.set('body', brief);
    url.searchParams.set('template', '');
    $('issueLink').href = url.toString();
    $('result').classList.remove('hidden');
    $('status').textContent = 'Brief prepared locally. Review it, then submit on GitHub.';
  });
  $('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('brief').textContent);
      $('status').textContent = 'Copied. No request has been sent.';
    } catch {
      $('status').textContent = 'Clipboard unavailable. Select and copy the brief above.';
    }
  });
})();
