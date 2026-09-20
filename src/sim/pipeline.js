/**
 * The agent graph. Pure data — this is the shape a real orchestrator would
 * hand back when you asked it to describe a run.
 *
 *   ingest ─► parse ─┬─► enrich ───┐
 *                    │             ├─► index ─► report
 *                    └─► validate ─┘
 *
 * A diamond rather than a chain: it exercises fan-out and fan-in, makes the
 * layout something to compute rather than hand-place, and gives `index` a real
 * join condition (both upstreams must complete before it may start).
 */

export const AGENTS = [
  {
    id: 'ingest',
    name: 'ingest-agent',
    action: 'Fetching source documents',
    duration: [1400, 2200],
  },
  {
    id: 'parse',
    name: 'parser-agent',
    action: 'Extracting structured fields',
    duration: [1600, 2600],
  },
  {
    id: 'enrich',
    name: 'enrichment-agent',
    action: 'Resolving external entities',
    duration: [2200, 3600],
    // The flakiest step in a real pipeline is always the one calling out to
    // somebody else's API, so that is where the failure path belongs.
    failureRate: 0.35,
  },
  {
    id: 'validate',
    name: 'validator-agent',
    action: 'Checking schema constraints',
    duration: [1200, 2000],
    failureRate: 0.12,
  },
  {
    id: 'index',
    name: 'index-agent',
    action: 'Writing vector embeddings',
    duration: [1800, 2800],
  },
  {
    id: 'report',
    name: 'report-agent',
    action: 'Composing run summary',
    duration: [1200, 1800],
  },
]

export const EDGES = [
  { from: 'ingest', to: 'parse' },
  { from: 'parse', to: 'enrich' },
  { from: 'parse', to: 'validate' },
  { from: 'enrich', to: 'index' },
  { from: 'validate', to: 'index' },
  { from: 'index', to: 'report' },
]

/** Error text sampled when an agent fails, so the log reads plausibly. */
export const FAILURE_REASONS = [
  'upstream timeout after 30s',
  'rate limit exceeded (429)',
  'schema mismatch on field `entity_id`',
  'connection reset by peer',
  'token budget exhausted',
]

export const edgeId = (from, to) => `${from}->${to}`

export function upstreamOf(agentId) {
  return EDGES.filter((edge) => edge.to === agentId).map((edge) => edge.from)
}

export function downstreamOf(agentId) {
  return EDGES.filter((edge) => edge.from === agentId).map((edge) => edge.to)
}
