# TANITA // BC-545N — Body Composition Log

A distinctive, single-page web app for tracking measurements from a
**Tanita BC-545N** body composition monitor. Log a reading after each
session and the console comes alive with live deltas, a segmental muscle
map, and trend charts across every metric.

No server, no account, no tracking — **all data lives in your browser**
(`localStorage`), with one-click JSON **export / import** for backups and
moving between devices.

## Metrics tracked

| Group | Fields |
|-------|--------|
| Core composition | Weight (kg), BMI, Body Fat (%), Body Water (%), Muscle Mass (kg), Bone Mass (kg) |
| Metabolic & rating | Energy / BMR (kcal/day), Metabolic Age (yr), Fitness Level (1–10), Visceral Fat (1–10) |
| Segmental muscle mass (kg) | Right Arm, Left Arm, Trunk, Right Leg, Left Leg |

## Features

- **Latest readout** with change vs. your previous reading.
- **Segmental muscle map** — a stylised body figure colour-coded by muscle
  mass per region, plus a ranked legend with per-region deltas.
- **Trend tiles** — every metric with a sparkline and a colour-coded delta
  (green = a healthy move, red = the wrong direction, neutral otherwise).
- **Focus chart** — hand-built interactive SVG line chart with hover
  tooltips, a draw-on animation, and 30d / 90d / 1y / All ranges.
- **Log table** — every session, edit or delete any entry.
- **Export / Import** JSON, plus a one-click **sample dataset** to explore.

## Design

Dark "lab instrument" aesthetic — charcoal surfaces, warm amber + electric
teal accents, *Bricolage Grotesque* display type over *IBM Plex Mono*
readouts. Everything is hand-built (no charting library) so the visuals are
fully bespoke.

## Run it

It's a static site — just open `index.html` in a browser. To serve locally:

```bash
npx http-server . -o      # or: python3 -m http.server
```

### Deploy free on GitHub Pages

Enable **Settings → Pages → Build and deployment → Source → "Deploy from a
branch"**, choose branch `main` and folder `/ (root)`, then **Save**. GitHub
publishes the site automatically on every push — no build step, no workflow.
The live URL appears at the top of that Pages settings page.

## How your data works

- Stored under the key `tanita.bc545n.entries.v1` in your browser only.
- Use **Export** regularly to keep a JSON backup; **Import** merges by date
  (re-importing the same day updates that entry rather than duplicating it).
- **Erase everything** clears all readings from this browser.

## Files

- `index.html` — markup
- `styles.css` — theme & layout
- `app.js` — storage, rendering, charts, body map
