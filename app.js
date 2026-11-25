/* Health Fitness — local-only tracker.
   Storage: localStorage only, key "health-fitness-data-v1".
   No backend, no external API calls, no live band sync.
   Starts empty: no sample readings, workouts or saved goals. */
(function () {
  'use strict';

  var STORAGE_KEY = 'health-fitness-data-v1';
  var DEFAULT_STEPS_GOAL = 10000;
  var DEFAULT_WORKOUTS_GOAL = 3;
  var RING_CIRC = 326.7;

  var METRICS = {
    steps: { label: 'Steps', unit: '' },
    sleep_hours: { label: 'Sleep (hours)', unit: 'h' },
    calories: { label: 'Calories (kcal)', unit: 'kcal' },
    heart_rate: { label: 'Heart rate (bpm)', unit: 'bpm' },
    weight_kg: { label: 'Weight (kg)', unit: 'kg' }
  };
  var currentMetric = 'steps';

  function $(id) { return document.getElementById(id); }
  function todayLocal() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function parseNum(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function fmt(v, digits) {
    if (v === null || v === undefined || v === '') return '—';
    return Number(v).toLocaleString('en-IN', { maximumFractionDigits: digits === undefined ? 0 : digits });
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function addDays(dateStr, n) {
    var d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function weekStart(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    var day = d.getDay(); // 0 Sun .. 6 Sat; Monday start
    var diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function emptyState() {
    return {
      readings: [],
      workouts: [],
      goals: { steps: DEFAULT_STEPS_GOAL, workouts: DEFAULT_WORKOUTS_GOAL, targetWeight: null },
      goalsSaved: false
    };
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return emptyState();
      return {
        readings: Array.isArray(data.readings) ? data.readings : [],
        workouts: Array.isArray(data.workouts) ? data.workouts : [],
        goals: data.goals && typeof data.goals === 'object'
          ? { steps: data.goals.steps || DEFAULT_STEPS_GOAL, workouts: data.goals.workouts || DEFAULT_WORKOUTS_GOAL, targetWeight: data.goals.targetWeight == null ? null : data.goals.targetWeight }
          : { steps: DEFAULT_STEPS_GOAL, workouts: DEFAULT_WORKOUTS_GOAL, targetWeight: null },
        goalsSaved: !!data.goalsSaved
      };
    } catch (e) { return emptyState(); }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked: keep in-memory state */ }
  }

  var state = load();

  function goals() { return state.goals; }
  function goalLabel(value, unit, isDefault) {
    return fmt(value) + (unit ? ' ' + unit : '') + (isDefault ? ' (default)' : '');
  }
  function readingFor(date) {
    for (var i = 0; i < state.readings.length; i++) {
      if (state.readings[i].date === date) return state.readings[i];
    }
    return null;
  }
  function sortedReadings() {
    return state.readings.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  function sortedWorkouts() {
    return state.workouts.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }

  function renderDashboard() {
    var date = $('dashDate').value || todayLocal();
    var r = readingFor(date);
    var g = goals();
    var steps = r && r.steps != null ? r.steps : null;
    var pct = steps != null && g.steps > 0 ? Math.min(100, Math.round(steps / g.steps * 100)) : 0;

    $('dashEmpty').style.display = r ? 'none' : 'block';
    $('stepsBig').textContent = steps != null ? fmt(steps) : '—';
    $('stepsPct').textContent = pct + '%';
    $('stepsBar').style.width = pct + '%';
    $('stepsRing').style.strokeDashoffset = String(RING_CIRC * (1 - pct / 100));
    $('stepsGoalLabel').textContent = goalLabel(g.steps, 'steps', !state.goalsSaved);
    $('stepsLeft').textContent = steps != null ? fmt(Math.max(0, g.steps - steps)) : '—';
    $('statHr').textContent = r ? fmt(r.heart_rate) : '—';
    $('statSleep').textContent = r ? fmt(r.sleep_hours, 1) : '—';
    $('statCal').textContent = r ? fmt(r.calories) : '—';
    $('statDist').textContent = r ? fmt(r.distance_km, 2) : '—';
    $('statWeight').textContent = r ? fmt(r.weight_kg, 1) : '—';

    var start = weekStart(todayLocal());
    var end = addDays(start, 6);
    var count = state.workouts.filter(function (w) { return w.date >= start && w.date <= end; }).length;
    $('statWorkouts').textContent = count + ' / ' + fmt(g.workouts);
  }

  function renderWorkouts() {
    var g = goals();
    var start = weekStart(todayLocal());
    var end = addDays(start, 6);
    var week = state.workouts.filter(function (w) { return w.date >= start && w.date <= end; });
    var minutes = week.reduce(function (s, w) { return s + (w.duration || 0); }, 0);
    $('weekCount').textContent = String(week.length);
    $('weekGoalLabel').textContent = fmt(g.workouts) + (state.goalsSaved ? '' : ' (default)');
    $('weekMinutes').textContent = String(minutes);

    var list = $('workoutList');
    list.innerHTML = '';
    sortedWorkouts().forEach(function (w) {
      var li = document.createElement('li');
      var span = document.createElement('span');
      span.textContent = w.date + ' — ' + w.type + ' · ' + w.duration + ' min';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-small';
      btn.textContent = 'Delete';
      btn.setAttribute('data-id', w.id);
      btn.addEventListener('click', function () {
        state.workouts = state.workouts.filter(function (x) { return x.id !== w.id; });
        save(); renderAll();
      });
      li.appendChild(span); li.appendChild(btn); list.appendChild(li);
    });
  }

  function renderHistory() {
    var body = $('historyBody');
    body.innerHTML = '';
    sortedReadings().forEach(function (r) {
      var tr = document.createElement('tr');
      var cells = [r.date, fmt(r.steps), fmt(r.heart_rate), fmt(r.sleep_hours, 1), fmt(r.calories), fmt(r.distance_km, 2), fmt(r.weight_kg, 1)];
      cells.forEach(function (c) {
        var td = document.createElement('td');
        td.textContent = c;
        tr.appendChild(td);
      });
      var td = document.createElement('td');
      var edit = document.createElement('button');
      edit.type = 'button'; edit.className = 'btn-small'; edit.textContent = 'Edit';
      edit.addEventListener('click', function () { startEditReading(r); });
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'btn-small'; del.textContent = 'Delete';
      del.addEventListener('click', function () {
        state.readings = state.readings.filter(function (x) { return x.id !== r.id; });
        save(); renderAll();
      });
      td.appendChild(edit); td.appendChild(del); tr.appendChild(td);
      body.appendChild(tr);
    });
    $('historyEmpty').style.display = state.readings.length ? 'none' : 'block';

    var hw = $('historyWorkouts');
    hw.innerHTML = '';
    sortedWorkouts().forEach(function (w) {
      var li = document.createElement('li');
      var span = document.createElement('span');
      span.textContent = w.date + ' — ' + w.type + ' · ' + w.duration + ' min';
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn-small'; btn.textContent = 'Delete';
      btn.addEventListener('click', function () {
        state.workouts = state.workouts.filter(function (x) { return x.id !== w.id; });
        save(); renderAll();
      });
      li.appendChild(span); li.appendChild(btn); hw.appendChild(li);
    });
    $('historyWorkoutsEmpty').style.display = state.workouts.length ? 'none' : 'block';
  }

  function renderSummary() {
    var today = todayLocal();
    var last7 = [];
    for (var i = 6; i >= 0; i--) {
      var r = readingFor(addDays(today, -i));
      if (r) last7.push(r);
    }
    function avg(field) {
      var vals = last7.map(function (r) { return r[field]; }).filter(function (v) { return v != null; });
      if (!vals.length) return '—';
      var mean = vals.reduce(function (s, v) { return s + v; }, 0) / vals.length;
      return fmt(mean, field === 'sleep_hours' ? 1 : 0);
    }
    $('avgSteps').textContent = avg('steps');
    $('avgSleep').textContent = avg('sleep_hours');
    $('daysLogged').textContent = String(state.readings.length);

    // Streak: consecutive logged days ending today, or yesterday if today is not logged yet.
    var streak = 0;
    var cursor = readingFor(today) ? today : addDays(today, -1);
    while (readingFor(cursor)) { streak++; cursor = addDays(cursor, -1); }
    $('streak').textContent = streak + (streak === 1 ? ' day' : ' days');
  }

  function renderChart() {
    var canvas = $('chart');
    var note = $('chartNote');
    var today = todayLocal();
    var days = [];
    for (var i = 13; i >= 0; i--) days.push(addDays(today, -i));
    var values = days.map(function (d) {
      var r = readingFor(d);
      return r ? r[currentMetric] : null;
    });
    var present = values.filter(function (v) { return v != null; });
    note.textContent = present.length
      ? METRICS[currentMetric].label + ' — last 14 days (' + present.length + ' day(s) logged).'
      : 'No data for this metric yet. Log a reading and the chart will fill in.';

    if (!canvas || typeof canvas.getContext !== 'function') return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fbfcf7'; ctx.fillRect(0, 0, W, H);
    if (!present.length) {
      ctx.fillStyle = '#5c665e'; ctx.font = '16px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('No data yet — log a reading to see your progress.', W / 2, H / 2);
      return;
    }
    var max = Math.max.apply(null, present);
    var min = currentMetric === 'weight_kg' ? Math.min.apply(null, present) : 0;
    if (max === min) max = min + 1;
    var padL = 48, padB = 28, padT = 14, padR = 12;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    // gridlines + y labels
    ctx.strokeStyle = '#dde3d6'; ctx.fillStyle = '#5c665e'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'right';
    for (var g = 0; g <= 4; g++) {
      var y = padT + plotH * g / 4;
      var val = max - (max - min) * g / 4;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillText(fmt(val, currentMetric === 'weight_kg' || currentMetric === 'sleep_hours' ? 1 : 0), padL - 6, y + 4);
    }
    var slot = plotW / days.length;
    ctx.textAlign = 'center';
    if (currentMetric === 'weight_kg') {
      ctx.strokeStyle = '#101613'; ctx.lineWidth = 3; ctx.beginPath();
      var started = false;
      days.forEach(function (d, idx) {
        var v = values[idx];
        if (v == null) return;
        var x = padL + slot * idx + slot / 2;
        var y = padT + plotH * (1 - (v - min) / (max - min));
        if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
      });
      ctx.stroke();
      days.forEach(function (d, idx) {
        var v = values[idx];
        if (v == null) return;
        var x = padL + slot * idx + slot / 2;
        var y = padT + plotH * (1 - (v - min) / (max - min));
        ctx.fillStyle = '#b8f135'; ctx.strokeStyle = '#101613'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
    } else {
      days.forEach(function (d, idx) {
        var v = values[idx];
        if (v == null) return;
        var h = plotH * (v - min) / (max - min);
        var x = padL + slot * idx + slot * 0.15;
        var y = padT + plotH - h;
        ctx.fillStyle = '#b8f135'; ctx.strokeStyle = '#101613'; ctx.lineWidth = 1.5;
        ctx.fillRect(x, y, slot * 0.7, h);
        ctx.strokeRect(x, y, slot * 0.7, h);
      });
    }
    ctx.fillStyle = '#5c665e'; ctx.font = '11px system-ui, sans-serif';
    days.forEach(function (d, idx) {
      if (idx % 2) return;
      ctx.fillText(d.slice(5), padL + slot * idx + slot / 2, H - 8);
    });
  }

  function renderGoals() {
    var g = goals();
    $('gSteps').value = g.steps;
    $('gWorkouts').value = g.workouts;
    $('gWeight').value = g.targetWeight == null ? '' : g.targetWeight;
    $('goalSavedNote').textContent = state.goalsSaved
      ? 'Your goals are saved on this device.'
      : 'Showing defaults (10,000 steps, 3 workouts/week) — not saved yet.';
  }

  function renderAll() {
    renderDashboard(); renderWorkouts(); renderHistory(); renderSummary(); renderChart(); renderGoals();
  }

  function startEditReading(r) {
    $('readingId').value = r.id;
    $('rDate').value = r.date;
    $('rSteps').value = r.steps == null ? '' : r.steps;
    $('rHr').value = r.heart_rate == null ? '' : r.heart_rate;
    $('rSleep').value = r.sleep_hours == null ? '' : r.sleep_hours;
    $('rCal').value = r.calories == null ? '' : r.calories;
    $('rDist').value = r.distance_km == null ? '' : r.distance_km;
    $('rWeight').value = r.weight_kg == null ? '' : r.weight_kg;
    $('readingSubmit').textContent = 'Update reading';
    $('readingCancel').hidden = false;
    $('readingMsg').textContent = 'Editing reading for ' + r.date + '.';
    $('readingMsg').className = 'msg';
    document.getElementById('log').scrollIntoView();
    $('rDate').focus();
  }
  function resetReadingForm() {
    $('readingForm').reset();
    $('readingId').value = '';
    $('rDate').value = todayLocal();
    $('readingSubmit').textContent = 'Save reading';
    $('readingCancel').hidden = true;
  }
  function setMsg(el, text, ok) {
    el.textContent = text;
    el.className = 'msg ' + (ok ? 'ok' : 'err');
  }

  function upsertReading(rec) {
    var existing = readingFor(rec.date);
    if (existing) {
      existing.steps = rec.steps; existing.heart_rate = rec.heart_rate;
      existing.sleep_hours = rec.sleep_hours; existing.calories = rec.calories;
      existing.distance_km = rec.distance_km; existing.weight_kg = rec.weight_kg;
      return 'updated';
    }
    rec.id = newId();
    state.readings.push(rec);
    return 'added';
  }

  function init() {
    var today = todayLocal();
    $('dashDate').value = today;
    $('rDate').value = today;
    $('wDate').value = today;

    $('dashDate').addEventListener('change', renderDashboard);

    $('readingForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var date = $('rDate').value;
      if (!date) { setMsg($('readingMsg'), 'Please choose a date.', false); return; }
      var rec = {
        date: date,
        steps: parseNum($('rSteps').value),
        heart_rate: parseNum($('rHr').value),
        sleep_hours: parseNum($('rSleep').value),
        calories: parseNum($('rCal').value),
        distance_km: parseNum($('rDist').value),
        weight_kg: parseNum($('rWeight').value)
      };
      var editingId = $('readingId').value;
      if (editingId) {
        var target = null;
        state.readings.forEach(function (x) { if (x.id === editingId) target = x; });
        if (target) {
          // If the date changed, keep the same record but move it (unless that date already exists).
          if (target.date !== date && readingFor(date)) {
            setMsg($('readingMsg'), 'A reading for ' + date + ' already exists. Delete it first, or pick another date.', false);
            return;
          }
          target.date = rec.date; target.steps = rec.steps; target.heart_rate = rec.heart_rate;
          target.sleep_hours = rec.sleep_hours; target.calories = rec.calories;
          target.distance_km = rec.distance_km; target.weight_kg = rec.weight_kg;
          save(); renderAll(); resetReadingForm();
          setMsg($('readingMsg'), 'Reading updated for ' + date + '.', true);
          return;
        }
      }
      var result = upsertReading(rec);
      save(); renderAll(); resetReadingForm();
      setMsg($('readingMsg'), result === 'updated' ? 'Reading updated for ' + date + '.' : 'Reading saved for ' + date + '.', true);
    });

    $('readingCancel').addEventListener('click', function () {
      resetReadingForm();
      $('readingMsg').textContent = '';
    });

    $('workoutForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var duration = parseNum($('wDuration').value);
      var date = $('wDate').value;
      if (!date || duration == null || duration <= 0) {
        setMsg($('workoutMsg'), 'Please enter a valid date and duration.', false);
        return;
      }
      state.workouts.push({ id: newId(), type: $('wType').value, duration: duration, date: date });
      save(); renderAll();
      $('workoutForm').reset();
      $('wDate').value = todayLocal();
      setMsg($('workoutMsg'), 'Workout added.', true);
    });

    document.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
        currentMetric = chip.getAttribute('data-metric');
        renderChart();
      });
    });

    $('goalForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var steps = parseNum($('gSteps').value);
      var workouts = parseNum($('gWorkouts').value);
      if (steps == null || steps <= 0 || workouts == null || workouts < 0) {
        setMsg($('goalMsg'), 'Please enter a valid steps goal and workouts goal.', false);
        return;
      }
      state.goals = { steps: steps, workouts: workouts, targetWeight: parseNum($('gWeight').value) };
      state.goalsSaved = true;
      save(); renderAll();
      setMsg($('goalMsg'), 'Goals saved.', true);
    });

    $('clearAll').addEventListener('click', function () {
      if (!window.confirm('Delete all readings, workouts and saved goals on this device?')) return;
      state = emptyState();
      save(); renderAll(); resetReadingForm();
    });

    $('csvFile').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var text = String(reader.result || '');
        var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
        var added = 0, updated = 0, skipped = 0;
        lines.forEach(function (line) {
          var parts = line.split(',').map(function (p) { return p.trim(); });
          if (parts[0] && parts[0].toLowerCase() === 'date') return; // header row
          if (!/^\d{4}-\d{2}-\d{2}$/.test(parts[0] || '')) { skipped++; return; }
          var rec = {
            date: parts[0],
            steps: parseNum(parts[1]),
            heart_rate: parseNum(parts[2]),
            sleep_hours: parseNum(parts[3]),
            calories: parseNum(parts[4]),
            distance_km: parseNum(parts[5]),
            weight_kg: parseNum(parts[6])
          };
          var result = upsertReading(rec);
          if (result === 'added') added++; else updated++;
        });
        save(); renderAll();
        setMsg($('csvMsg'), 'Imported ' + added + ' new, updated ' + updated + ', skipped ' + skipped + ' row(s).', true);
        e.target.value = '';
      };
      reader.onerror = function () { setMsg($('csvMsg'), 'Could not read that file. Please try a .csv file.', false); };
      reader.readAsText(file);
    });

    renderAll();
  }

  /* Public hook for watch.js (direct Bluetooth connection): save a live
     heart-rate reading into today's reading without wiping the other
     fields. No fake data — watch.js only calls this with a real value
     received from a connected watch. */
  window.HealthFitness = {
    logLiveHeartRate: function (hr) {
      hr = Math.round(Number(hr));
      if (!hr || hr < 30 || hr > 220) return false;
      var date = todayLocal();
      var existing = readingFor(date);
      if (existing) {
        existing.heart_rate = hr;
      } else {
        upsertReading({ date: date, steps: null, heart_rate: hr, sleep_hours: null, calories: null, distance_km: null, weight_kg: null });
      }
      save(); renderAll();
      return true;
    }
  };

  init();
})();
