/* Buildex interactions. No React, Tailwind, or build step required. */
'use strict';
const onWeb = location.protocol === 'https:' || location.protocol === 'http:';
const API = '/api';
const text = (tag, value, className) => { const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el; };
async function request(path, options = {}) {
  if (!onWeb) throw new Error('Open the hosted website to send requests. This local HTML preview is not connected to a server.');
  const response = await fetch(API + path, options);
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The server could not process this request. Please try again.');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Please try again shortly.');
  return result;
}
const form = document.querySelector('[data-inquiry]');
if (form) {
  form.querySelector('[type="submit"]').disabled = false;
  const service = form.elements.namedItem('service');
  const selected = new URLSearchParams(location.search).get('service');
  if (selected && [...service.options].some(o => o.value === selected)) service.value = selected;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]');
    const error = form.querySelector('[role=alert]');
    const original = submit.textContent;
    submit.disabled = true; submit.textContent = 'Sending…'; error.hidden = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      await request('/inquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, kind: form.dataset.inquiry }) });
      const success = text('div', '', 'success'); success.setAttribute('role', 'status');
      success.append(text('h2', 'Thank you for reaching out.'), text('p', 'Thank you for contacting Buildex Construction LLC. We received your request and will contact you soon.'));
      const home = text('a', 'Back to home ↗', 'text-link'); home.href = 'index.html'; success.append(home);
      form.replaceWith(success); success.tabIndex = -1; success.focus();
    } catch (e) { error.textContent = e.message; error.hidden = false; }
    finally { submit.disabled = false; submit.textContent = original; }
  });

}
const contact = document.querySelector('.contact-details');
if (contact && onWeb) request('/settings').then(settings => {
  const values = [settings.phone, settings.email, settings.hours];
  [...contact.children].slice(0, 3).forEach((row, i) => {
    if (!values[i]) return;
    const span = row.querySelector('span'); const label = span.querySelector('small');
    if (i === 0) { const extra = span.querySelector('.additional-phones'); const link = text('a', values[i]); link.href = 'tel:' + values[i].replace(/[^+\d]/g, ''); span.replaceChildren(label, link); if (extra) span.append(extra); } else span.replaceChildren(label, document.createTextNode(values[i]));
  });
  const sample = !settings.email || settings.email.endsWith('example.com') || !settings.phone || settings.phone.includes('555-0148');
  const notice = document.querySelector('.sample-notice'); if (notice) notice.hidden = !sample;
  if (settings.phone && !settings.phone.includes('555-0148')) {
    const actions = contact.nextElementSibling;
    const phone = settings.phone.replace(/[^+\d]/g, '');
    actions.replaceChildren();
    for (const [scheme, label] of [['tel', 'Call us'], ['sms', 'Text us']]) { const a = text('a', label, 'button'); a.href = `${scheme}:${phone}`; actions.append(a); }
  }
}).catch(() => {});
const results = document.querySelector('#project-results');
if (results) {
  let projects = [], filter = 'All', failed = false;
  const dialog = document.querySelector('#project-dialog');
  const close = dialog.querySelector('.dialog-close'); close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
  function image(project, photo) { const img = document.createElement('img'); img.src = `${API}/media?key=${encodeURIComponent(photo.key)}`; img.alt = `${project.name} — ${photo.label}`; img.loading = 'lazy'; return img; }
  function open(project) {
    document.querySelector('#project-title').textContent = project.name;
    document.querySelector('#project-description').textContent = `${project.category}${project.location ? ' · ' + project.location : ''}. ${project.description}`;
    const photos = dialog.querySelector('.project-photos'); photos.replaceChildren();
    project.photos.forEach(photo => { const figure = document.createElement('figure'); figure.append(image(project, photo), text('figcaption', photo.label)); photos.append(figure); });
    dialog.showModal();
  }
  function render() {
    results.replaceChildren();
    const visible = projects.filter(p => filter === 'All' || p.category === filter);
    if (!visible.length) {
      const empty = text('div', '', 'gallery-empty');
      empty.append(text('h3', failed ? 'Our project gallery is being prepared.' : filter === 'All' ? 'Our work, coming into focus.' : `More ${filter.toLowerCase()} projects coming soon.`), text('p', 'We’re gathering photos of our completed work. Have a project in mind? Let’s talk about what we can create for you.'));
      const a = text('a', 'Tell us about your project ↗', 'text-link'); a.href = 'estimate.html'; empty.append(a); results.append(empty); return;
    }
    const grid = text('div', '', 'preview-cards');
    visible.forEach(project => { const button = text('button', '', 'photo-card project-card'); button.type = 'button';
      if (project.photos[0]) { const box = text('div', '', 'card-image'); box.append(image(project, project.photos[0])); button.append(box); }
      button.append(text('span', project.category + (project.location ? ' / ' + project.location : ''), 'eyebrow'), text('h3', project.name + ' ↗'), text('p', project.description)); button.addEventListener('click', () => open(project)); grid.append(button);
    }); results.append(grid);
  }
  document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.category;
    document.querySelectorAll('[data-category]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); render();
  }));
  request('/projects').then(data => { if (!Array.isArray(data)) throw new Error(); projects = data.map(p => ({...p, photos: (p.photos || []).filter(f => /^projects\/[a-z0-9-]+\.(jpg|png|webp)$/.test(f.key))})); }).catch(() => { failed = true; }).finally(render);
}
// Warm local document links after the current page has finished loading.
if (onWeb) window.addEventListener('load', () => {
  const urls = new Set([...document.querySelectorAll('nav a')].map(a => a.href).filter(url => new URL(url).origin === location.origin && url !== location.href));
  urls.forEach(href => { const hint = document.createElement('link'); hint.rel = 'prefetch'; hint.href = href; document.head.append(hint); });
});

// Accessible mobile navigation; ordinary links remain available without JavaScript.
const navigation = document.querySelector('.nav');
const menuButton = document.querySelector('.navigation-toggle');
if (navigation && menuButton) {
  document.documentElement.classList.add('menu-ready');
  const setMenu = open => { navigation.classList.toggle('menu-open', open); menuButton.setAttribute('aria-expanded', String(open)); menuButton.querySelector('.menu-icon').textContent = open ? '×' : '☰'; };
  menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && navigation.classList.contains('menu-open')) { setMenu(false); menuButton.focus(); } });
  document.addEventListener('click', event => { if (!navigation.contains(event.target)) setMenu(false); });
  navigation.querySelectorAll('nav a').forEach(link => { link.addEventListener('click', () => setMenu(false)); const page = location.pathname.split('/').pop() || 'index.html'; if (link.getAttribute('href') === (page.includes('.') ? page : page + '.html')) link.setAttribute('aria-current', 'page'); });
  matchMedia('(min-width: 901px)').addEventListener('change', () => setMenu(false));
}
// Lightweight one-time reveals; native scrolling and no animation dependencies.
(() => {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  if (!('IntersectionObserver' in window)) return;
  const candidates = [...document.querySelectorAll('.section-heading, .service-card, .floor-card, .preview-cards > .photo-card, .three-col > div, .about > div, .cta .wrap, .contact-details > div')];
  let observer;
  function showAll() {
    observer?.disconnect();
    candidates.forEach(el => el.classList.remove('reveal-pending'));
    document.documentElement.classList.remove('motion-ready');
  }
  function setup() {
    showAll();
    if (preference.matches) return;
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove('reveal-pending');
        observer.unobserve(entry.target);
      });
    }, {threshold: 0.08});
    candidates.forEach(el => {
      // Leave the initial viewport immediately readable; animate later content only.
      if (el.getBoundingClientRect().top < innerHeight) return;
      el.classList.add('scroll-reveal', 'reveal-pending');
      observer.observe(el);
    });
    document.documentElement.classList.add('motion-ready');
  }
  document.addEventListener('focusin', event => {
    const reveal = event.target.closest('.reveal-pending');
    if (reveal) { reveal.classList.remove('reveal-pending'); observer?.unobserve(reveal); }
  });
  preference.addEventListener('change', setup);
  setup();
})();
// Count once on entry, accelerating toward the final customer milestone.
(() => {
  const counter = document.querySelector('[data-customer-count]');
  if (!counter || !('IntersectionObserver' in window)) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, started = false;
  const finish = () => { cancelAnimationFrame(frame); counter.textContent = '500+'; };
  const observer = new IntersectionObserver(entries => {
    if (started || !entries.some(entry => entry.isIntersecting)) return;
    started = true; observer.disconnect();
    if (reduced.matches) return finish();
    const start = performance.now(), duration = 1800;
    const tick = now => {
      const progress = Math.min(1, (now - start) / duration);
      counter.textContent = progress === 1 ? '500+' : String(Math.min(499, 1 + Math.floor(499 * progress ** 2.6)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }, {threshold: .65});
  observer.observe(counter);
  reduced.addEventListener('change', () => { if (reduced.matches) { observer.disconnect(); finish(); } });
})();
// Hero writing sequence: preserve semantic text, line breaks, and final layout.
(() => {
  const hero = document.querySelector('.hero-content');
  if (!hero || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const targets = [hero.querySelector('h1'), hero.querySelector(':scope > p')].filter(Boolean);
  let delay = 180;
  targets.forEach((target, index) => {
    target.classList.add('hero-writing');
    const accessible = document.createElement('span');
    accessible.className = 'sr-only';
    accessible.textContent = target.textContent.replace(/\s+/g, ' ').trim();
    const visual = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    while (target.firstChild) visual.append(target.firstChild);
    target.append(accessible, visual);
    const walker = document.createTreeWalker(visual, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const fragment = document.createDocumentFragment();
      // Keep each word intact so responsive line wrapping stays natural.
      node.textContent.split(/(\s+)/).forEach(word => {
        if (/^\s*$/.test(word)) { fragment.append(document.createTextNode(word)); return; }
        const group = document.createElement('span'); group.className = 'writing-word';
        for (const character of word) {
          const letter = document.createElement('span'); letter.className = 'writing-letter';
          letter.textContent = character; letter.style.setProperty('--writing-delay', delay + 'ms');
          group.append(letter); delay += index === 0 ? 43 : 20;
        }
        fragment.append(group);
      });
      node.replaceWith(fragment);
    });
    delay += 160;
  });
})();
