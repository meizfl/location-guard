// demo-new.js — rewrites demo.html UI, reuses demo.js logic via require() shim
(function() {
'use strict';

var Browser = require('/src/js/common/browser.js');
var L       = require('leaflet');
try { require('leaflet.locatecontrol'); } catch(e) {}

Browser.inDemo = true;   // tells content.js we're in demo mode

var demoMap, showPressed, geoDone;
var currentStep = 0;

// ── DOM helpers ───────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

// ── Steps definition ──────────────────────────────────────────────────────────
var steps = [
  {
    title: 'Welcome to Location Guard',
    body:  '<p>Location Guard was successfully installed.</p><p>This demo illustrates its use. Follow the steps to see it in action.</p>',
    nextLabel: 'Start →',
    canNext: function() { return true; }
  },
  {
    title: 'Request your location',
    body:  '<p>Click the <b>📍 Show my location</b> button on the map to ask the browser for your location.</p>',
    nextLabel: 'Next →',
    canNext: function() { return showPressed; }
  },
  {
    title: 'Allow access',
    body:  '<p>The browser is asking for permission to disclose your location.</p><p>Click <b>Allow</b> in the browser dialog to continue.</p>',
    nextLabel: 'Next →',
    canNext: function() { return geoDone; }
  },
  {
    title: 'Result',
    body:  '<p id="step4-text">Waiting for location…</p><p>Click the extension icon in the toolbar to try different privacy levels.</p>',
    nextLabel: 'Close',
    canNext: function() { return true; },
    isLast: true
  }
];

// ── Tour card ─────────────────────────────────────────────────────────────────
function renderCard() {
  var step = steps[currentStep];
  el('tour-title').textContent = step.title;
  el('tour-body').innerHTML    = step.body;
  el('tour-next').textContent  = step.nextLabel;

  // dots
  var dots = el('tour-dots');
  dots.innerHTML = '';
  steps.forEach(function(_, i) {
    var d = document.createElement('span');
    d.className = 'dot' + (i === currentStep ? ' active' : '');
    dots.appendChild(d);
  });

  updateNextBtn();
}

function updateNextBtn() {
  var canGo = steps[currentStep].canNext();
  el('tour-next').disabled = !canGo;
  el('tour-next').style.opacity = canGo ? '1' : '0.4';
}

// Poll canNext while on steps that wait for user action
var pollTimer;
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(function() {
    if (steps[currentStep].canNext()) {
      updateNextBtn();
      clearInterval(pollTimer);
    }
  }, 300);
}

el('tour-next').addEventListener('click', function() {
  if (!steps[currentStep].canNext()) return;
  if (steps[currentStep].isLast) {
    el('tour-card').style.display = 'none';
    return;
  }
  currentStep++;
  renderCard();
  startPolling();
});

el('tour-close').addEventListener('click', function() {
  el('tour-card').style.display = 'none';
});

// ── Map setup ─────────────────────────────────────────────────────────────────
demoMap = L.map('demoMap')
  .addLayer(L.tileLayer(Browser.gui.mapTiles().url, Browser.gui.mapTiles().info))
  .setView([20, 10], 2)
  .on('click', function() { el('tour-card').style.display = 'none'; });

// Locate button — overridden to use our handler
try {
  var MyLocate = L.Control.Locate.extend({ start: showCurrentPosition });
  new MyLocate({ drawCircle: false, icon: 'leaflet-control-locate-location-arrow' }).addTo(demoMap);
} catch(e) {
  // fallback button if locatecontrol not available
  var locBtn = L.Control.extend({
    onAdd: function() {
      var btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control demo-locate-btn');
      btn.innerHTML = '📍';
      btn.title = 'Show my location';
      btn.style.cssText = 'font-size:18px;padding:4px 8px;cursor:pointer;background:var(--bg2);color:var(--text);border:1px solid var(--border2);border-radius:4px';
      L.DomEvent.on(btn, 'click', L.DomEvent.stopPropagation)
                .on(btn, 'click', L.DomEvent.preventDefault)
                .on(btn, 'click', showCurrentPosition);
      return btn;
    }
  });
  new locBtn({ position: 'topleft' }).addTo(demoMap);
}

// ── Geolocation ───────────────────────────────────────────────────────────────
function showCurrentPosition() {
  showPressed = true;
  updateNextBtn();
  if (currentStep < 2) { currentStep = 2; renderCard(); startPolling(); }

  navigator.geolocation.getCurrentPosition(drawPosition, function(err) {
    geoDone = true;
    updateNextBtn();
    alert('Error retrieving location:\n' + err.message);
  });
}

async function drawPosition(pos) {
  var latlng = [pos.coords.latitude, pos.coords.longitude];
  var acc    = pos.coords.accuracy;

  if (!demoMap.marker) {
    demoMap.marker = L.marker(latlng).addTo(demoMap);
    demoMap.accuracy = L.circle(latlng, {
      radius: acc, color: '#136AEC', fillColor: '#136AEC',
      fillOpacity: 0.15, weight: 2, opacity: 0.5
    }).addTo(demoMap);
  }

  demoMap.marker.setLatLng(latlng);
  demoMap.accuracy.setLatLng(latlng).setRadius(acc);
  demoMap.fitBounds(demoMap.accuracy.getBounds());

  geoDone = true;

  if (currentStep < 3) {
    var st    = await Browser.storage.get();
    var level = st.paused ? 'real' : (st.domainLevel['demo-page'] || st.defaultLevel);
    var desc  =
      level === 'fixed' ? 'Location Guard replaced it with your configured <b>fixed location</b>.' :
      level === 'real'  ? 'Location Guard <b>did not modify</b> it (protection is paused).' :
                          'Location Guard added <b>"noise"</b> to it — the reported location is not very accurate.';

    el('step4-text').innerHTML = 'This is the location disclosed to websites. ' + desc;
    currentStep = 3;
    renderCard();
    startPolling();
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
renderCard();
startPolling();

}());
