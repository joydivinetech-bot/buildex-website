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
const results = document.querySelector('#project-results');
if (results) {
  let previewProjects=null,render=()=>{};
  document.addEventListener('buildex-projects-preview',event=>{
    if(!document.body.dataset.adminPreview)return;
    previewProjects=event.detail;render();
  });
  void (async()=>{
    const [{projectCard,loadProjectStyles},{albumViewer}]=await Promise.all([import('./project-cards.js'),import('./album-ui.js')]);
    await loadProjectStyles();
    let projects=[],filter='All',failed=false;
    const dialog=document.querySelector('#project-dialog'),viewer=albumViewer(dialog,{prefix:'project'});
    const albums=()=>{
      const privatePreview=!!document.body.dataset.adminPreview;
      return (privatePreview?(previewProjects||[]):projects).map(project=>({
        id:project.id,title:project.name,category:project.category,description:project.description,
        photos:(project.photos||[]).filter(photo=>privatePreview||/^projects\/[a-z0-9-]+\.(jpg|png|webp)$/.test(photo.key)).map(photo=>({src:privatePreview?photo.src:API+'/media?key='+encodeURIComponent(photo.key)}))
      })).filter(project=>project.photos.length);
    };
    render=()=>{
      const items=albums(),visible=items.filter(project=>filter==='All'||project.category===filter);
      results.replaceChildren();
      if(!visible.length){
        const empty=text('div','','gallery-empty');
        empty.append(text('h3',failed?'Our project gallery is being prepared.':filter==='All'?'Our work, coming into focus.':'More '+filter.toLowerCase()+' projects coming soon.'),text('p','Our completed projects will appear here. Have a project in mind? Let’s talk about what we can create for you.'));
        const link=text('a','Tell us about your project ↗','text-link');link.href='estimate.html';empty.append(link);results.append(empty);
      }else{
        const grid=text('div','','service-grid project-list');visible.forEach((project,index)=>grid.append(projectCard(project,index,viewer)));results.append(grid);
      }
      if(dialog.open){const selected=items.find(project=>project.id===viewer.id);if(selected)viewer.update(selected);else dialog.close();}
    };
    document.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>{
      filter=button.dataset.category;document.querySelectorAll('[data-category]').forEach(other=>{other.classList.toggle('active',other===button);other.setAttribute('aria-pressed',String(other===button));});render();
    }));
    if(document.body.dataset.adminPreview){render();return;}
    try{const data=await request('/projects');if(!Array.isArray(data))throw Error();projects=data;}
    catch{failed=true;}
    render();
  })().catch(()=>{
    results.replaceChildren(text('p','The project gallery could not load. Please refresh the page or contact us.'));
  });
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
// Smooth, low-frequency hero slideshow; pause when the page is not visible.
(() => {
  const slides=[...document.querySelectorAll('.hero-slide')],reduced=matchMedia('(prefers-reduced-motion: reduce)');
  if(slides.length<2)return;
  let current=Math.max(0,slides.findIndex(slide=>slide.classList.contains('is-active'))),timer;
  slides.forEach(slide=>slide.loading='eager');
  const advance=()=>{
    // Keep the visible image until another photo has actually loaded.
    for(let offset=1;offset<slides.length;offset++){
      const next=(current+offset)%slides.length;
      if(!slides[next].complete||!slides[next].naturalWidth)continue;
      slides[current].classList.remove('is-active');current=next;slides[current].classList.add('is-active');break;
    }
  };
  const start=()=>{clearInterval(timer);if(!reduced.matches&&!document.hidden)timer=setInterval(advance,6500);};
  // Do not wait for unrelated images or analytics to finish loading.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  reduced.addEventListener('change',start);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInterval(timer);else start();});
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

// Services use the published collection, with private local previews in Studio.
if(onWeb)import('./services-ui.js').catch(()=>{});
