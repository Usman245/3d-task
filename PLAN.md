# PLAN.md — Agent Activity Visualization

## 1. The brief, as a checklist

Taken literally from the brief. Everything here must be true at submission.

| # | Requirement | Where it lives |
|---|---|---|
| R1 | 4–6 agent nodes in Three.js, laid out as a graph or grid | `scene/nodes.js`, `sim/layout.js` |
| R2 | Nodes animate `pending → running → completed / failed`, distinct visual per state | `scene/nodes.js` |
| R3 | Edge animation on handoff — A completes, triggers B | `scene/edges.js` |
| R4 | HTML/Tailwind panel: live log with agent name, action, status, timestamp | `ui/log.js`, `ui/roster.js` |
| R5 | Dark, dense, technical. Infra dashboard — not a toy | `style.css` tokens, all of `ui/` |
| R6 | Single page, mock/looping data, no backend | `sim/simulation.js` |
| R7 | Scope: a few focused hours, judged on thinking and execution | this file |

R7 is a real constraint, not a footnote. An over-built submission fails it.

## 2. Central decision

The reviewer is judging thinking. The clearest way to show it is a seam:

> **A simulation that knows nothing about rendering, and two independent views
> that subscribe to it.**

```
                  ┌──────────────┐
                  │   src/sim/   │   pure state machine
                  │  no THREE    │   emits plain events
                  │  no DOM      │
                  └──────┬───────┘
                         │ events
              ┌──────────┴──────────┐
              ▼                     ▼
      ┌──────────────┐      ┌──────────────┐
      │  src/scene/  │      │   src/ui/    │
      │  Three.js    │      │  Tailwind    │
      └──────────────┘      └──────────────┘
```

Why it is worth the extra file or two:

- The log panel and the 3D scene cannot disagree — they read one event stream.
- "Mock data, no backend" becomes an *implementation detail of one folder*
  rather than something smeared across the render loop.
- It is honest about what a real version would be: the sim is the websocket.

The cost is one indirection. Accepted.

## 3. The pipeline

Six agents (top of the 4–6 range — enough for a fan-out and a fan-in, which is
what makes a *graph* rather than a chain):

```
  ingest ──► parse ──┬──► enrich ───┐
                     │              ├──► index ──► report
                     └──► validate ─┘
```

| id | name | action text |
|---|---|---|
| `ingest` | Ingest Agent | Fetching source documents |
| `parse` | Parser Agent | Extracting structured fields |
| `enrich` | Enrichment Agent | Resolving external entities |
| `validate` | Validator Agent | Checking schema constraints |
| `index` | Index Agent | Writing vector embeddings |
| `report` | Report Agent | Composing run summary |

A diamond, not a line. It exercises the handoff animation on six edges, forces
the layout to be computed rather than hand-placed, and gives `index` a real
join condition — it may only start when *both* upstreams have completed.

## 4. State model

`pending → running → completed | failed`, exactly as briefed.

Failure handling: a failed agent retries once (`failed → pending → running`).
This earns the `failed` state a place in the loop without dead-ending the
pipeline, and is what an actual agent runner does. A second failure blocks
downstream agents, which the panel reports.

Visual treatment per state — one colour token, used by scene and panel alike:

| state | colour | scene treatment | panel treatment |
|---|---|---|---|
| pending | slate, dim | dark card, dim outline | dim dot, muted row |
| running | amber | beam travelling the card border | animated dot, live timer |
| completed | green | steady lit border | solid dot, final duration |
| failed | red | sharp flash, then steady | solid dot, error text |

## 5. Handoff animation

When an agent completes, a pulse travels the edge to each downstream agent. The
downstream agent flips to `running` **when the pulse lands**, not when the
upstream completes.

This is a deliberate choice: the animation is not decorating the state change,
it *is* the state change's timeline. Cause and effect read correctly on screen,
which is the whole point of R3.

Mechanically: the sim owns transit as a timed phase (`handoff` events carry a
duration); the scene animates within that window. The sim remains renderer-free.

## 6. Build order

- [x] **P0 — Tokens.** State colours as `@theme` tokens in `style.css`, exported
      to JS so materials and Tailwind classes share one source of truth.
- [x] **P1 — Sim.** `pipeline.js` (graph data), `simulation.js` (scheduler,
      emitter), `layout.js` (DAG → x/y). Pure. Verifiable by logging events.
- [x] **P2 — UI panel.** Roster + live log, driven by sim events. Gets R4/R5
      done while the scene is still empty, so the dense look is settled early.
- [x] **P3 — Scene.** Nodes, state materials, projected HTML labels, grid floor.
- [x] **P4 — Edges.** Static lines, then the travelling handoff pulse.
- [x] **P5 — Polish.** Bloom, `prefers-reduced-motion`, pause/restart control,
      run header with elapsed timer, README write-up of decisions.

P2 before P3 is intentional — the panel is half the brief and is usually what
gets rushed when the 3D work runs long.

## 7. Out of scope — deliberately

Listed so the omissions read as decisions rather than gaps:

- No backend, no websocket, no persistence. The brief rules it out.
- No framework and no state library. Three subscribers do not need React.
- No orbit/zoom camera control. A fixed, considered camera angle suits a
  dashboard; a draggable one invites the viewer to break the composition.
- No agent detail drill-down, no filtering, no timeline scrubber. All plausible
  next features; none are asked for, and each would cost more than it shows.
- No test suite. There is real value in the sim being testable — that is the
  argument for the seam — but writing tests is not what this brief is grading.

## 8. Definition of done

- `npm run build` passes clean.
- Every row in §1 demonstrably true in the running page.
- A full pipeline run loops indefinitely, including at least one failure path.
- Panel and scene never disagree about an agent's state.
- Readable with `prefers-reduced-motion: reduce`.
- README states the decisions in §2, §4 and §5 in a few short paragraphs.


## 9. Revisions after the first visual pass

The build was reviewed in the browser and three things changed. Recording them
because the reasoning is the interesting part, not the diff.

**Nodes became cards.** The first pass drew hexagonal prisms. Against a real
orchestration canvas they read as abstract solids — decorative rather than
diagrammatic. Rounded cards carrying a glyph are the vocabulary the domain
already uses, so the diagram explains itself before anyone reads a label.

**The progress ring became a travelling beam.** A ring sweeping to show exact
percentage was precise but dated, and the card already had a border doing
nothing. A bright segment running that border is the current idiom for
indeterminate work, and exact progress was already in the panel, twice — the
live timer and the run bar. The ring was duplicating information to justify
itself.

**The line grid became a dot grid.** Ruled lines draw boxes, and boxes behind a
diagram of boxes compete with the nodes. Dots give the same measured-workspace
cue and the same depth without ever forming a shape. Tone was raised a step so
the canvas reads as a surface rather than a void, and the card borders were
lightened so the agents sit clearly on top of it.

Two rendering bugs were found the same way, by looking rather than by
reasoning — both are noted in the code where they were fixed:

- `renderer.setSize(w, h, false)` skips the canvas CSS size, so on this machine
  (`devicePixelRatio` 1.25) the scene rendered oversized and clipped, and the
  projected HTML labels drifted from their nodes by exactly that ratio.
- `ExtrudeGeometry`'s bevel pushes the front face beyond `depth / 2`, so icons
  and borders placed at `depth / 2` were buried inside the card.
