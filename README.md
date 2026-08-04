# mcp-predictit

PredictIt MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `list_markets` | List active PredictIt prediction markets (real-money, US-politics-focused: elections, control of Congress, nominations, primaries; ~250 markets total). Contract prices are implied probabilities (0–100%). Keyless. Returns compact markets with up to 8 contracts each. |
| `get_market` | Get one PredictIt market by id with ALL of its contracts. Contract prices are implied probabilities (0–100%). Keyless. Example id: 7589 (2026 Republican House seats). Use list_markets or search_markets to find ids. |
| `search_markets` | Search PredictIt markets by name (client-side over all ~250 markets; PredictIt has no search endpoint). US-politics-focused. Contract prices are implied probabilities (0–100%). Keyless. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "predictit": {
      "url": "https://gateway.pipeworx.io/predictit/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Predictit data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
