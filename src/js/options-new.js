// options-new.js
// Requires: common.js (Browser/Util) → common-gui-loader.js (L/jquery in shim, no jQM)
// No jQuery Mobile, no sGlide, no common-gui.js side-effects.

(function() {
'use strict';

var Browser       = require('/src/js/common/browser.js');
var PlanarLaplace = require('/src/js/common/laplace.js');
var L             = require('leaflet');
try { require('pelias-leaflet-plugin'); }    catch(e) {}
try { require('leaflet.locatecontrol'); }    catch(e) {}

Browser.init('options');

var geocoderKey = '5b3ce3597851110001cf6248dc55f0492abe4923aa33f4ca1722acb8';
var geocoderUrl = 'https://api.openrouteservice.org/geocode';

// ── State ─────────────────────────────────────────────────────────────────────
var levelMap, fixedPosMap;
var epsilon;
var activeLevel  = 'medium';
var inited       = {};
var currentPos   = { latitude: 48.86014106672441, longitude: 2.3569107055664062 };

// ── DOM helpers ───────────────────────────────────────────────────────────────
var el  = function(id) { return document.getElementById(id); };
var qs  = function(s)  { return document.querySelector(s); };
var qsa = function(s)  { return document.querySelectorAll(s); };

// ── Toast ─────────────────────────────────────────────────────────────────────
var toastTimer;
function toast(msg) {
  var t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 2200);
}

// ── Page routing ──────────────────────────────────────────────────────────────
var pageTitles = { options: 'Options', levels: 'Privacy Levels', fixedPos: 'Fixed Location' };

function showPage(id) {
  qsa('.page').forEach(function(p) {
    p.classList.toggle('active', p.id === 'pg-' + id);
  });
  qsa('.nav-item[data-page]').forEach(function(b) {
    b.classList.toggle('active', b.dataset.page === id);
  });
  el('page-title').textContent = pageTitles[id] || id;
  initPage(id);
}

qsa('.nav-item[data-page]').forEach(function(btn) {
  btn.addEventListener('click', function() { showPage(this.dataset.page); });
});

// ── Lazy page init ────────────────────────────────────────────────────────────
function initPage(id) {
  if (id === 'options') {
    if (inited.options) return;
    inited.options = true;
    initOptionsPage();
  } else if (id === 'levels') {
    if (!inited.levels) { inited.levels = true; initLevelsPage(); }
    else invalidateMap(levelMap);
  } else if (id === 'fixedPos') {
    if (!inited.fixedPos) { inited.fixedPos = true; initFixedPosPage(); }
    else invalidateMap(fixedPosMap);
  }
}

function invalidateMap(map) {
  if (!map) return;
  [60, 200, 500].forEach(function(d) {
    setTimeout(function() { try { map.invalidateSize(); } catch(e) {} }, d);
  });
}

// ── OPTIONS PAGE ──────────────────────────────────────────────────────────────
async function initOptionsPage() {
  var st = await Browser.storage.get();
  el('defaultLevel').value      = st.defaultLevel   || 'medium';
  el('paused').checked          = !!st.paused;
  el('hideIcon').checked        = !!st.hideIcon;
  el('updateAccuracy').checked  = !!st.updateAccuracy;

  if (!Browser.capabilities.permanentIcon()) {
    el('row-hide-icon').style.display = 'flex';
  }

  ['defaultLevel','paused','hideIcon','updateAccuracy'].forEach(function(id) {
    el(id).addEventListener('change', saveOptions);
  });
}

async function saveOptions() {
  var st = await Browser.storage.get();
  st.defaultLevel = el('defaultLevel').value;
  st.paused       = el('paused').checked;
  st.hideIcon     = el('hideIcon').checked;

  var newUpdateAccuracy = el('updateAccuracy').checked;
  if (st.updateAccuracy !== newUpdateAccuracy) {
    for (var lvl in st.cachedPos) {
      var eps = st.epsilon / st.levels[lvl].radius;
      var acc = Math.round((new PlanarLaplace()).alphaDeltaAccuracy(eps, .9));
      st.cachedPos[lvl].position.coords.accuracy += (newUpdateAccuracy ? 1 : -1) * acc;
    }
    st.updateAccuracy = newUpdateAccuracy;
  }

  await Browser.storage.set(st);
  Browser.gui.refreshAllIcons();
  toast('Saved');
}

// ── LEVELS PAGE ───────────────────────────────────────────────────────────────
async function initLevelsPage() {
  var st = await Browser.storage.get();
  epsilon = st.epsilon;

  qsa('.level-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      qsa('.level-tab').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeLevel = btn.dataset.level;
      if (levelMap) levelMap.closePopup();
      showLevelInfo();
    });
  });

  el('setRadius').addEventListener('input', function() {
    updateRadius(parseInt(this.value), false);
  });
  el('setRadius').addEventListener('change', saveLevel);

  el('setCacheTime').addEventListener('input', function() {
    updateCache(parseInt(this.value));
  });
  el('setCacheTime').addEventListener('change', saveLevel);

  initLevelMap();
  showLevelInfo();
}

async function showLevelInfo() {
  var st     = await Browser.storage.get();
  var radius = st.levels[activeLevel].radius;
  var ct_raw = st.levels[activeLevel].cacheTime;
  var ct     = ct_raw <= 59 ? ct_raw : 59 + Math.floor(ct_raw / 59);

  el('setRadius').value    = radius;
  el('setCacheTime').value = ct;
  updateRadius(radius, true);
  updateCache(ct);
}

function updateRadius(radius, fit) {
  if (!epsilon || !levelMap) return;
  var acc = Math.round((new PlanarLaplace()).alphaDeltaAccuracy(epsilon / radius, .95));
  el('radius').textContent   = radius;
  el('accuracy').textContent = acc;

  moveCircles();
  levelMap.protection.setRadius(radius);
  levelMap.accuracy.setRadius(acc);

  var firstView = !inited.radiusSet;
  inited.radiusSet = true;
  if (fit) levelMap.fitBounds(levelMap.accuracy.getBounds(), { animate: !firstView });
  if (firstView) showMapPopup(levelMap);
}

function updateCache(ct) {
  var h = ct - 59;
  el('cacheTime').textContent =
    ct === 0   ? "Don't cache" :
    ct  <  60  ? ct + ' minute' + (ct > 1 ? 's' : '') :
                 h  + ' hour'   + (h  > 1 ? 's' : '');
}

async function saveLevel() {
  var st        = await Browser.storage.get();
  var radius    = parseInt(el('setRadius').value);
  var ct        = parseInt(el('setCacheTime').value);
  var cacheTime = ct <= 59 ? ct : 60 * (ct - 59);

  if (st.levels[activeLevel].radius !== radius) delete st.cachedPos[activeLevel];
  st.levels[activeLevel] = { radius: radius, cacheTime: cacheTime };
  await Browser.storage.set(st);
  updateRadius(radius, true);
  toast('Saved');
}

function initLevelMap() {
  var latlng = [currentPos.latitude, currentPos.longitude];

  levelMap = L.map('levelMap', { zoomControl: true })
    .addLayer(L.tileLayer(Browser.gui.mapTiles().url, Browser.gui.mapTiles().info))
    .setView(latlng, 13)
    .on('dragstart', function() { levelMap.closePopup(); })
    .on('click', function(e) {
      if (levelMap.popup && levelMap.popup._isOpen) { levelMap.closePopup(); return; }
      currentPos = { latitude: e.latlng.lat, longitude: e.latlng.lng };
      moveCircles();
    });

  levelMap.marker = L.marker(latlng, { draggable: true })
    .addTo(levelMap)
    .on('click', function() { showMapPopup(levelMap); })
    .on('drag', function(e) {
      currentPos = { latitude: e.latlng.lat, longitude: e.latlng.lng };
      moveCircles();
    });

  levelMap.accuracy   = L.circle(latlng, { radius: 1500, color: null, fillColor: '#4f8ef7', fillOpacity: 0.3, interactive: false }).addTo(levelMap);
  levelMap.protection = L.circle(latlng, { radius: 500,  color: null, fillColor: '#e55353', fillOpacity: 0.35, interactive: false }).addTo(levelMap);

  levelMap.popup = L.popup({ autoPan: false, closeOnClick: false, maxWidth: 300 })
    .setContent(
      '<div style="font-size:13px;line-height:1.6">' +
      '<p><span style="color:#e55353">■</span> Protection radius &nbsp;' +
      '<span style="color:#4f8ef7">■</span> Reported accuracy</p>' +
      '<p>Drag the marker or click the map to move.</p>' +
      '<p><a href="#" id="lgCurrentPos" style="color:#4f8ef7;text-decoration:none">📍 Use my current location</a></p>' +
      '</div>'
    );

  levelMap.on('popupopen', function() {
    var a = document.getElementById('lgCurrentPos');
    if (a) a.onclick = function(e2) { e2.preventDefault(); showCurrentPosition(); };
  });

  try {
    var MyLocate = L.Control.Locate.extend({ start: showCurrentPosition });
    new MyLocate({ drawCircle: false, icon: 'leaflet-control-locate-location-arrow' }).addTo(levelMap);
  } catch(e) {}

  try {
    L.control.geocoder(geocoderKey, { url: geocoderUrl, markers: false, autocomplete: false })
      .on('highlight', function(e) { currentPos = { latitude: e.latlng.lat, longitude: e.latlng.lng }; moveCircles(); })
      .on('select',    function(e) { currentPos = { latitude: e.latlng.lat, longitude: e.latlng.lng }; moveCircles(); })
      .addTo(levelMap);
  } catch(e) {}

  invalidateMap(levelMap);
}

function moveCircles() {
  var ll = [currentPos.latitude, currentPos.longitude];
  levelMap.marker.setLatLng(ll);
  levelMap.protection.setLatLng(ll);
  levelMap.accuracy.setLatLng(ll);
}

function showCurrentPosition() {
  navigator.geolocation.getCurrentPosition(function(pos) {
    levelMap.closePopup();
    currentPos = pos.coords;
    showLevelInfo();
  }, function(err) { Browser.log('cannot get location', err); });
}

// ── FIXED POS PAGE ────────────────────────────────────────────────────────────
async function initFixedPosPage() {
  var st     = await Browser.storage.get();
  var latlng = [st.fixedPos.latitude, st.fixedPos.longitude];

  el('fixedPosNoAPI').checked = !!st.fixedPosNoAPI;
  el('fixedPosNoAPI').addEventListener('change', saveFixedPosNoAPI);

  fixedPosMap = L.map('fixedPosMap', { zoomControl: true })
    .addLayer(L.tileLayer(Browser.gui.mapTiles().url, Browser.gui.mapTiles().info))
    .setView(latlng, 14)
    .on('dragstart', function() { fixedPosMap.closePopup(); })
    .on('click', function(e) {
      if (fixedPosMap.popup && fixedPosMap.popup._isOpen) { fixedPosMap.closePopup(); return; }
      saveFixedPos(e.latlng);
    });

  fixedPosMap.marker = L.marker(latlng, { draggable: true })
    .addTo(fixedPosMap)
    .on('click',   function()  { showMapPopup(fixedPosMap); })
    .on('dragend', function(e) { saveFixedPos(e.target._latlng); });

  fixedPosMap.popup = L.popup({ autoPan: false, closeOnClick: false, maxWidth: 300 })
    .setContent(
      '<div style="font-size:13px;line-height:1.6">' +
      '<p>This location is reported when the level is set to <b>Fixed location</b>.</p>' +
      '<p>Click the map or drag the marker to change it.</p>' +
      '</div>'
    );

  showMapPopup(fixedPosMap);

  try { L.control.locate({ drawCircle: false, follow: false }).addTo(fixedPosMap); } catch(e) {}

  try {
    L.control.geocoder(geocoderKey, { url: geocoderUrl, markers: false, autocomplete: false })
      .on('results', function(e) {
        var m = e.params.text.match(/^([-+]?[0-9]+\.[0-9]+)\s*,?\s*([-+]?[0-9]+\.[0-9]+)$/);
        if (!m) return;
        var ll = L.latLng(parseFloat(m[1]), parseFloat(m[2]));
        saveFixedPos(ll);
        fixedPosMap.setView(ll, 14);
        try { this.collapse(); } catch(e2) {}
      }).addTo(fixedPosMap);
  } catch(e) {}

  invalidateMap(fixedPosMap);
}

async function saveFixedPos(latlng) {
  var st = await Browser.storage.get();
  var w  = latlng.wrap();
  st.fixedPos = { latitude: w.lat, longitude: w.lng };
  fixedPosMap.marker.setLatLng(latlng);
  await Browser.storage.set(st);
  toast('Fixed location saved');
}

async function saveFixedPosNoAPI() {
  var st = await Browser.storage.get();
  st.fixedPosNoAPI = el('fixedPosNoAPI').checked;
  await Browser.storage.set(st);
  toast('Saved');
}

// ── Map popup helper ──────────────────────────────────────────────────────────
function showMapPopup(map) {
  var w     = map._container.offsetWidth;
  var h     = map._container.offsetHeight;
  var small = w < 500 || h < 450;
  var latlng;
  if (small) {
    var b  = map.getBounds();
    latlng = b.getCenter();
    latlng.lat = b.getSouth();
  } else {
    var pt = map.latLngToLayerPoint(map.marker._latlng);
    pt.y  -= 30;
    latlng = map.layerPointToLatLng(pt);
  }
  map.popup.setLatLng(latlng).openOn(map);
  var tip = document.querySelector('.leaflet-popup-tip-container');
  if (tip) tip.style.visibility = small ? 'hidden' : 'visible';
}

// ── Sidebar buttons ───────────────────────────────────────────────────────────
el('btn-report').addEventListener('click', function() {
  window.open('https://github.com/chatziko/location-guard/issues', '_blank');
});

el('btn-delete-cache').addEventListener('click', async function() {
  if (!window.confirm('Delete the fake location cache?')) return;
  var st = await Browser.storage.get();
  st.cachedPos = {};
  await Browser.storage.set(st);
  toast('Cache cleared');
});

el('btn-restore').addEventListener('click', async function() {
  if (!window.confirm('Restore all default options?')) return;
  await Browser.storage.clear();
  await Browser.gui.refreshAllIcons();
  location.reload();
});

// ── Start ─────────────────────────────────────────────────────────────────────
showPage('options');

}());
