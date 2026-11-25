/* Health Fitness — direct watch connection (Web Bluetooth) + install as an app.
   ---------------------------------------------------------------------------
   What can connect directly, and what cannot — this is stated honestly in the
   app copy too:
   - CAN connect directly: a Bluetooth LE watch or band that exposes the
     standard Bluetooth Heart Rate Service (0x180D). Many chest straps,
     heart-rate bands and generic BLE watches do. This page talks to it
     directly over Web Bluetooth, with no account and no server.
   - CANNOT connect directly from a web page: Apple Watch, Fitbit and Garmin
     watches. They use proprietary apps (Apple Health, Fitbit app, Garmin
     Connect) and do not expose a direct web connection. For those, use the
     phone health-app instructions on the Connect Band page instead.
   - Web Bluetooth only works in Chrome (Android and desktop) and Edge, over
     HTTPS. It does not work in Safari on iPhone. If it is not supported, the
     page says so instead of failing silently.
   No fake data: live heart rate is only shown when a real device sends it.
   ------------------------------------------------------------------------- */
(function () {
  'use strict';

  var HEART_RATE_SERVICE = 0x180D;
  var HEART_RATE_MEASUREMENT = 0x2A37;
  var BATTERY_SERVICE = 0x180F;
  var BATTERY_LEVEL = 0x2A19;
  var DEVICE_INFO_SERVICE = 0x180A;
  var MANUFACTURER_NAME = 0x2A29;
  var MODEL_NUMBER = 0x2A24;

  var device = null;
  var server = null;
  var hrCharacteristic = null;
  var lastSavedHr = null;
  var lastSavedAt = 0;
  var installPromptEvent = null;

  function $(id) { return document.getElementById(id); }
  function setText(id, text) { var el = $(id); if (el) el.textContent = text; }
  function show(id, visible) { var el = $(id); if (el) el.hidden = !visible; }

  function setStatus(text, ok) {
    var el = $('watchStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'msg ' + (ok ? 'ok' : 'err');
  }
  function setConnectedUI(connected, name) {
    setText('watchDeviceName', connected ? (name || 'Connected watch') : 'No watch connected');
    show('watchConnectBtn', !connected);
    show('watchDisconnectBtn', connected);
    show('watchLive', connected);
    if (!connected) {
      setText('watchLiveHr', '—');
      setText('watchBattery', '—');
      setText('watchModel', '—');
    }
  }

  function parseHeartRate(value) {
    // Bluetooth Heart Rate Measurement (0x2A37): byte 0 is flags.
    // Bit 0 = 0: heart rate is a uint8 at byte 1. Bit 0 = 1: uint16 LE at bytes 1-2.
    var flags = value.getUint8(0);
    var hr;
    if (flags & 0x01) {
      hr = value.getUint16(1, true);
    } else {
      hr = value.getUint8(1);
    }
    return hr;
  }

  function onHeartRate(event) {
    var hr = parseHeartRate(event.target.value);
    if (!hr || hr < 30 || hr > 220) return;
    setText('watchLiveHr', String(hr));
    // Live reading on the dashboard too (transient until it is saved).
    var stat = $('statHr');
    if (stat) stat.textContent = String(hr);
    // Auto-log to today, throttled: at most once every 10 seconds, and only
    // when the value changed. Saves into today's reading via the app's own
    // storage (app.js), so dashboard, chart and history update.
    var now = Date.now();
    if (window.HealthFitness && typeof window.HealthFitness.logLiveHeartRate === 'function') {
      if (hr !== lastSavedHr && now - lastSavedAt >= 10000) {
        if (window.HealthFitness.logLiveHeartRate(hr)) {
          lastSavedHr = hr;
          lastSavedAt = now;
          setText('watchSavedNote', 'Live heart rate saved to today: ' + hr + ' bpm at ' + new Date().toLocaleTimeString() + '.');
        }
      }
    }
  }

  function readTextCharacteristic(service, uuid) {
    return service.getCharacteristic(uuid).then(function (ch) {
      return ch.readValue();
    }).then(function (value) {
      var bytes = new Uint8Array(value.buffer);
      var text = '';
      for (var i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
      return text.trim();
    }).catch(function () { return ''; });
  }

  function onDisconnected() {
    device = null; server = null; hrCharacteristic = null;
    setConnectedUI(false);
    setStatus('Watch disconnected.', false);
  }

  function connectWatch() {
    if (!('bluetooth' in navigator)) {
      setStatus('Web Bluetooth is not supported in this browser. Use Chrome on Android or on a computer to connect a watch directly. On iPhone, use the Apple Health steps on this page instead.', false);
      return;
    }
    setStatus('Searching for nearby Bluetooth watches and bands — choose yours in the list…', true);
    navigator.bluetooth.requestDevice({
      filters: [{ services: [HEART_RATE_SERVICE] }],
      optionalServices: [BATTERY_SERVICE, DEVICE_INFO_SERVICE]
    }).then(function (dev) {
      device = dev;
      device.addEventListener('gattserverdisconnected', onDisconnected);
      setText('watchDeviceName', device.name || 'Bluetooth watch');
      setStatus('Connecting to ' + (device.name || 'watch') + '…', true);
      return device.gatt.connect();
    }).then(function (gattServer) {
      server = gattServer;
      return server.getPrimaryService(HEART_RATE_SERVICE);
    }).then(function (service) {
      return service.getCharacteristic(HEART_RATE_MEASUREMENT);
    }).then(function (characteristic) {
      hrCharacteristic = characteristic;
      return hrCharacteristic.startNotifications().then(function () {
        hrCharacteristic.addEventListener('characteristicvaluechanged', onHeartRate);
      });
    }).then(function () {
      setConnectedUI(true, device.name);
      setStatus('Connected to ' + (device.name || 'watch') + '. Live heart rate will appear below.', true);
      // Battery + model, best effort — not every watch exposes these.
      if (!server) return;
      return server.getPrimaryService(BATTERY_SERVICE).then(function (service) {
        return service.getCharacteristic(BATTERY_LEVEL);
      }).then(function (ch) { return ch.readValue(); })
        .then(function (value) { setText('watchBattery', value.getUint8(0) + '%'); })
        .catch(function () { setText('watchBattery', 'not shared by this watch'); });
    }).then(function () {
      if (!server) return;
      return server.getPrimaryService(DEVICE_INFO_SERVICE).then(function (service) {
        return Promise.all([
          readTextCharacteristic(service, MANUFACTURER_NAME),
          readTextCharacteristic(service, MODEL_NUMBER)
        ]);
      }).then(function (parts) {
        var info = parts.filter(function (p) { return p; }).join(' ');
        if (info) setText('watchModel', info);
      }).catch(function () { /* device info is optional */ });
    }).catch(function (err) {
      if (err && err.name === 'NotFoundError') {
        setStatus('No watch was chosen. Tap "Connect Watch" again and pick your watch from the list.', false);
      } else {
        setStatus('Could not connect: ' + (err && err.message ? err.message : 'connection failed') + '. Make sure the watch is on, nearby, and not already connected to another app.', false);
      }
      if (device && device.gatt && device.gatt.connected) { try { device.gatt.disconnect(); } catch (e) {} }
      device = null; server = null; hrCharacteristic = null;
      setConnectedUI(false);
    });
  }

  function disconnectWatch() {
    if (hrCharacteristic) {
      try { hrCharacteristic.stopNotifications(); } catch (e) {}
      hrCharacteristic = null;
    }
    if (device && device.gatt && device.gatt.connected) {
      try { device.gatt.disconnect(); } catch (e) {}
    }
    onDisconnected();
  }

  function saveLiveHeartRate() {
    var text = ($('watchLiveHr') || {}).textContent || '';
    var hr = parseInt(text, 10);
    if (!hr || hr < 30 || hr > 220) {
      setStatus('No live heart rate to save yet — connect a watch and wait for a reading.', false);
      return;
    }
    if (window.HealthFitness && typeof window.HealthFitness.logLiveHeartRate === 'function') {
      if (window.HealthFitness.logLiveHeartRate(hr)) {
        lastSavedHr = hr; lastSavedAt = Date.now();
        setText('watchSavedNote', 'Heart rate saved to today: ' + hr + ' bpm.');
        setStatus('Saved ' + hr + ' bpm to today.', true);
      }
    }
  }

  /* ---- Install as a standalone app (PWA) ---- */
  function initInstall() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      installPromptEvent = e;
      show('installBtn', true);
      show('installNote', true);
    });
    window.addEventListener('appinstalled', function () {
      installPromptEvent = null;
      show('installBtn', false);
      setText('installNote', 'Installed — the app now opens on its own, full screen, and works offline.');
    });
    var btn = $('installBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        if (!installPromptEvent) return;
        installPromptEvent.prompt();
        installPromptEvent.userChoice.then(function () { installPromptEvent = null; show('installBtn', false); });
      });
    }
    // Already running as an installed app?
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      setText('installNote', 'Running as an installed app — full screen, on your device, works offline.');
      show('installNote', true);
    }
  }

  function initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {
        // Offline support is a bonus; the app still works without it.
      });
    });
  }

  function initBluetoothUI() {
    var connectBtn = $('watchConnectBtn');
    if (connectBtn) connectBtn.addEventListener('click', connectWatch);
    var disconnectBtn = $('watchDisconnectBtn');
    if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectWatch);
    var saveBtn = $('watchSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveLiveHeartRate);

    if (!('bluetooth' in navigator)) {
      setStatus('Direct watch connection is not supported in this browser. It works in Chrome on Android or on a computer (over HTTPS). On iPhone Safari, use the Apple Health steps on this page instead — Safari does not allow web pages to connect to Bluetooth watches.', false);
      if (connectBtn) connectBtn.disabled = true;
    } else if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      setStatus('Direct watch connection needs a secure (HTTPS) page. This site is on HTTPS when opened from its live link.', false);
    }
  }

  initBluetoothUI();
  initInstall();
  initServiceWorker();
})();
