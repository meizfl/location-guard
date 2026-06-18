// popup-new.js — vanilla JS, no jQuery Mobile
// Relies on require() exposed globally by common.js (browserify shim)

const Browser = require('/src/js/common/browser.js');
const Util    = require('/src/js/common/util.js');

Browser.init('popup');

// ── helpers ───────────────────────────────────────────────────────────────────
function qs(sel)  { return document.querySelector(sel); }
function qsa(sel) { return document.querySelectorAll(sel); }

// ── state ─────────────────────────────────────────────────────────────────────
var currentUrl = null;

// ── init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', drawUI);

async function drawUI() {
  var res = window.location.href.match(/tabId=(\d+)/);
  var tabId = res ? parseInt(res[1]) : null;

  const [callUrl, st] = await Promise.all([
    Browser.gui.getCallUrl(tabId),
    Browser.storage.get()
  ]);
  currentUrl = callUrl;

  // ── header subtitle & dot ──
  var dot = qs('#status-dot');
  if (st.paused) {
    qs('#subtitle').textContent = 'Paused';
    dot.className = 'paused';
  } else if (!callUrl) {
    qs('#subtitle').textContent = 'Ready';
  } else {
    var domain = Util.extractDomain(callUrl);
    var level  = st.domainLevel[domain] || st.defaultLevel;
    qs('#subtitle').textContent = levelLabel(level);
    dot.className = level === 'real' ? 'real' : level === 'fixed' ? 'fixed' : '';
  }

  // ── level quick-bar ──
  if (callUrl && !st.paused) {
    var domain = Util.extractDomain(callUrl);
    var level  = st.domainLevel[domain] || st.defaultLevel;
    qs('#level-domain').textContent = domain;
    qs('#flyout-domain').textContent = domain;
    setActiveLevel(level);
  } else {
    qs('#level-section').classList.add('hidden');
  }

  // ── pause button ──
  var badge = qs('#pause-badge');
  if (st.paused) {
    qs('#pause-label').textContent = 'Resume Location Guard';
    qs('#pause-btn').classList.add('paused-btn');
    badge.textContent = 'PAUSED';
    badge.style.background = 'var(--yellow)';
    badge.style.color = '#1a1200';
  }

  // ── hide icon (page-action only, not browser-action) ──
  if (callUrl && !st.paused && !Browser.capabilities.permanentIcon())
    qs('#hideIcon-btn').style.display = 'flex';

  // ── size popup ──
  sizePopup();

  // ── events ──
  qsa('.level-btn').forEach(function(b)        { b.addEventListener('click', onQuickLevel); });
  qsa('.flyout-level-btn').forEach(function(b) { b.addEventListener('click', onFlyoutLevel); });
  qs('#flyout-back').addEventListener('click',  closeFlyout);
  qs('#pause-btn').addEventListener('click',    onPause);
  qs('#hideIcon-btn').addEventListener('click', onHideIcon);
  qs('#options-btn').addEventListener('click',  function() { openPage('options.html'); });
  qs('#faq-btn').addEventListener('click',      function() { openPage('faq.html#general'); });
}

// ── helpers ───────────────────────────────────────────────────────────────────
function levelLabel(l) {
  return { fixed: 'Fixed location', high: 'High privacy', medium: 'Medium privacy',
           low: 'Low privacy', real: 'Real location' }[l] || l;
}

function sizePopup() {
  var h = qs('#main').offsetHeight;
  document.body.style.width  = '280px';
  document.body.style.height = h + 'px';
}

function setActiveLevel(level) {
  qsa('.level-btn, .flyout-level-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.level === level);
  });
}

async function applyLevel(level) {
  if (!currentUrl) return;
  var st     = await Browser.storage.get();
  var domain = Util.extractDomain(currentUrl);
  if (level === st.defaultLevel) delete st.domainLevel[domain];
  else st.domainLevel[domain] = level;
  await Browser.storage.set(st);
  await Browser.gui.refreshAllIcons();
}

function updateHeader(level) {
  qs('#subtitle').textContent = levelLabel(level);
  var dot = qs('#status-dot');
  dot.className = level === 'real' ? 'real' : level === 'fixed' ? 'fixed' : '';
}

// ── quick-bar ─────────────────────────────────────────────────────────────────
async function onQuickLevel() {
  var level = this.dataset.level;
  setActiveLevel(level);
  updateHeader(level);
  await applyLevel(level);
}

// ── flyout ────────────────────────────────────────────────────────────────────
function closeFlyout() {
  qs('#level-flyout').classList.remove('open');
  sizePopup();
}

async function onFlyoutLevel() {
  var level = this.dataset.level;
  setActiveLevel(level);
  updateHeader(level);
  await applyLevel(level);
  setTimeout(function() { closeFlyout(); Browser.gui.closePopup(); }, 180);
}

// ── actions ───────────────────────────────────────────────────────────────────
async function onPause() {
  var st = await Browser.storage.get();
  st.paused = !st.paused;
  await Browser.storage.set(st);
  await Browser.gui.refreshAllIcons();
  Browser.gui.closePopup();
}

async function onHideIcon() {
  var st = await Browser.storage.get();
  st.hideIcon = true;
  await Browser.storage.set(st);
  await Browser.gui.refreshAllIcons();
  Browser.gui.closePopup();
}

function openPage(page) {
  if (Browser.capabilities.popupAsTab()) {
    window.location.href = page;
  } else {
    Browser.gui.showPage(page);
    Browser.gui.closePopup();
  }
}
