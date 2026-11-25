# Health Fitness

A single-page health fitness tracker.

It records health-band readings and workouts, shows a daily dashboard and 14-day progress charts, and stores everything in the browser. There is no account, no server and no live band sync.

## How to run it

Option 1 — open the file directly:

1. Unzip the project folder (if it is a zip).
2. Double-click `index.html`. It opens in any modern browser.

Option 2 — serve the folder (recommended if a browser blocks local files):

```bash
cd health-fitness-project
python3 -m http.server 8000
```

Then open <http://localhost:8000> in the browser.

No installation, build step or internet connection is needed.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The whole page: dashboard, log-a-day form, workouts, progress chart, history, Connect Band section and goals. |
| `styles.css` | All styling for `index.html` — warm dashboard design: one hero steps ring, colour-coded stat tiles, mobile-first with big tap targets. |
| `app.js` | All logic. Reads and writes `localStorage` only (key: `health-fitness-data-v1`). No backend and no external API calls. |
| `README.md` | This file. |

## Features

- **Dashboard for today:** steps (big number, goal ring and progress bar), heart rate, sleep, calories, distance, weight, and workouts this week. Pick a different date to see that day.
- **Log a day's band readings:** date, steps, heart rate (bpm), sleep hours, calories, distance (km), weight (kg). Add, edit and delete. One reading per date — saving the same date again updates it.
- **Log workouts:** type (Run / Walk / Gym / Cycling / Yoga / Other), duration in minutes, date. Add and delete. Weekly count and total minutes are shown against the weekly goal.
- **Goals:** daily steps goal, weekly workouts goal and target weight. Editable and saved. The dashboard and weekly count update when goals change.
- **Progress:** 14-day chart (plain canvas, no external libraries) switchable between steps, sleep, calories, heart rate and weight. Weight is shown as a line; the others as bars. Also shows 7-day average steps, 7-day average sleep, logging streak and total days logged.
- **History:** full list of readings and workouts, newest first, with edit/delete for readings and delete for workouts.
- **Connect Band:** steps to connect a band through Apple Health (iPhone) or Health Connect (Android), plus manual entry and CSV import. CSV columns in order: `date,steps,heart_rate,sleep_hours,calories,distance_km,weight_kg`. Example: `2026-11-24,8500,72,7.5,2100,6.2,68.5`. Importing a date that already exists updates that day.

## Important — no live band sync

**No band is connected yet, and this website does not pull data from any band automatically.** Readings are entered from the health band or its app, or imported from a CSV file. The data shown is only what has been entered on this device.

## Data and privacy

- Everything is stored only in this browser, in `localStorage` under the key `health-fitness-data-v1`.
- The project starts empty — there are no sample readings, workouts or saved goals. The goals shown at first (10,000 steps a day, 3 workouts a week) are editable defaults, clearly labelled as defaults, not recorded data.
- Use "Delete all my data" on the Goals section to clear readings, workouts and saved goals on this device.
- Clearing browser data, or opening the page in a different browser or device, starts empty again.
