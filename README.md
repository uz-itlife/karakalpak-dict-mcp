# karakalpak-dict-mcp

Karakalpak-Russian dictionary MCP server — 60K+ words.

Sources: Baskakov 1958, Turaev 2010, sozlik.db, dilmash sentence examples.

## Install

```bash
# Claude Code
claude mcp add karakalpak-dict -- npx karakalpak-dict-mcp

# Claude Desktop — add to claude_desktop_config.json:
{
  "mcpServers": {
    "karakalpak-dict": {
      "command": "npx",
      "args": ["karakalpak-dict-mcp"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `translate_kk_to_ru` | Karakalpak → Russian |
| `translate_ru_to_kk` | Russian → Karakalpak |
| `transliterate` | Cyrillic ↔ Latin |

## Requirements

Node.js >= 22
