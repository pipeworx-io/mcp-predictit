interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * PredictIt MCP.
 *
 * Real-money US political prediction market (predictit.org). Keyless public
 * market-data API: ~250 markets, mostly US politics (elections, control of
 * Congress, nominations, primaries). Contract prices are 0–1 dollars and read
 * directly as implied probabilities (a contract at 0.62 ≈ 62% implied). A
 * distinct real-money venue complementing the Polymarket/Kalshi packs.
 *
 * NOTE: predictit.org sits behind Cloudflare. It works from a normal IP but may
 * be blocked from a CF Worker egress (a known class of issue). safeFetch
 * degrades gracefully — non-JSON / Cloudflare-challenge / non-200 responses
 * yield a clean error instead of throwing raw HTML.
 */


const BASE = 'https://www.predictit.org/api/marketdata';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

interface RawContract {
  id: number;
  dateEnd: string;
  name: string;
  shortName: string;
  status: string;
  lastTradePrice: number;
  bestBuyYesCost: number;
  bestBuyNoCost: number;
  bestSellYesCost: number;
  bestSellNoCost: number;
  lastClosePrice: number;
  displayOrder: number;
}

interface RawMarket {
  id: number;
  name: string;
  shortName: string;
  url: string;
  contracts: RawContract[];
}

const tools: McpToolExport['tools'] = [
  {
    name: 'list_markets',
    description:
      'List active PredictIt prediction markets (real-money, US-politics-focused: elections, control of Congress, nominations, primaries; ~250 markets total). Contract prices are implied probabilities (0–100%). Keyless. Returns compact markets with up to 8 contracts each.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max markets to return (default 25, max 60).',
        },
        open_only: {
          type: 'boolean',
          description:
            'Keep only markets that have at least one Open contract (default true).',
        },
      },
    },
  },
  {
    name: 'get_market',
    description:
      "Get one PredictIt market by id with ALL of its contracts. Contract prices are implied probabilities (0–100%). Keyless. Example id: 7589 (2026 Republican House seats). Use list_markets or search_markets to find ids.",
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'A PredictIt market id, e.g. 7589 or 8155 (Senate control 2026).',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'search_markets',
    description:
      'Search PredictIt markets by name (client-side over all ~250 markets; PredictIt has no search endpoint). US-politics-focused. Contract prices are implied probabilities (0–100%). Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Case-insensitive substring, e.g. "Senate", "Trump", "2026".',
        },
        limit: {
          type: 'number',
          description: 'Max markets to return (default 15, max 30).',
        },
      },
      required: ['query'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'list_markets':
        return listMarkets(args);
      case 'get_market':
        return getMarket(args);
      case 'search_markets':
        return searchMarkets(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function safeFetch(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error('PredictIt unreachable (possible Cloudflare block from this host)');
  }
  const trimmed = body.trimStart();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    // Cloudflare challenge / HTML error page instead of JSON.
    throw new Error('PredictIt unreachable (possible Cloudflare block from this host)');
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('PredictIt unreachable (possible Cloudflare block from this host)');
  }
}

function round1(n: number): number {
  return Math.round((Number(n) || 0) * 1000) / 10;
}

function mapMarket(raw: RawMarket, opts: { full: boolean }): unknown {
  const contracts = Array.isArray(raw.contracts) ? raw.contracts : [];

  if (opts.full) {
    const mapped = contracts
      .slice()
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((c) => ({
        id: c.id,
        name: c.name,
        short_name: c.shortName,
        implied_probability_pct: round1(c.lastTradePrice),
        last_trade_price: c.lastTradePrice,
        yes_buy: c.bestBuyYesCost,
        no_buy: c.bestBuyNoCost,
        yes_sell: c.bestSellYesCost,
        no_sell: c.bestSellNoCost,
        last_close: c.lastClosePrice,
        status: c.status,
        date_end: c.dateEnd,
      }));
    return {
      market_id: raw.id,
      name: raw.name,
      url: raw.url,
      contract_count: mapped.length,
      contracts: mapped,
    };
  }

  const capped = contracts.slice(0, 8).map((c) => ({
    id: c.id,
    name: c.shortName ?? c.name,
    implied_probability_pct: round1(c.lastTradePrice),
    yes_cost: c.bestBuyYesCost,
    no_cost: c.bestBuyNoCost,
    status: c.status,
    date_end: c.dateEnd,
  }));
  const out: Record<string, unknown> = {
    id: raw.id,
    name: raw.name,
    short_name: raw.shortName,
    url: raw.url,
    contract_count: contracts.length,
    contracts: capped,
  };
  if (contracts.length > 8) out.note = `showing 8 of ${contracts.length} contracts`;
  return out;
}

function hasOpenContract(m: RawMarket): boolean {
  return Array.isArray(m.contracts) && m.contracts.some((c) => c.status === 'Open');
}

async function listMarkets(args: Record<string, unknown>): Promise<unknown> {
  const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 60);
  const openOnly = args.open_only === undefined ? true : Boolean(args.open_only);

  const data = (await safeFetch('/all/')) as { markets?: RawMarket[] };
  let markets = Array.isArray(data.markets) ? data.markets : [];
  if (openOnly) markets = markets.filter(hasOpenContract);

  const sliced = markets.slice(0, limit).map((m) => mapMarket(m, { full: false }));
  return { count: sliced.length, markets: sliced };
}

async function getMarket(args: Record<string, unknown>): Promise<unknown> {
  const id = Number(args.id);
  if (!Number.isFinite(id) || id <= 0) return { error: 'provide a numeric PredictIt market id', id: args.id ?? null };

  const raw = (await safeFetch(`/markets/${id}`)) as RawMarket | null;
  if (!raw || typeof raw.id !== 'number') return { error: 'market not found', id };
  return mapMarket(raw, { full: true });
}

async function searchMarkets(args: Record<string, unknown>): Promise<unknown> {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) return { error: 'provide a query', query: args.query ?? null };
  const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 30);
  const q = query.toLowerCase();

  const data = (await safeFetch('/all/')) as { markets?: RawMarket[] };
  const markets = Array.isArray(data.markets) ? data.markets : [];
  const hits = markets.filter(
    (m) =>
      (m.name ?? '').toLowerCase().includes(q) ||
      (Array.isArray(m.contracts) &&
        m.contracts.some((c) => (c.name ?? '').toLowerCase().includes(q))),
  );

  const sliced = hits.slice(0, limit).map((m) => mapMarket(m, { full: false }));
  return { query, count: sliced.length, markets: sliced };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
