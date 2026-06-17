// MV3 Service Worker entry point
// Replaces the MV2 background scripts: [common.js, main.js]

// common.js defines Browser via require(), but in the service worker context
// we need it as a standalone script. We import both files in order.
importScripts('common.js', 'main.js');
