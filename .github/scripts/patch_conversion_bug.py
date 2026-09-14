from pathlib import Path

path = Path("server.js")
source = path.read_text(encoding="utf-8")
old = "        '/api/loans/repay',\n        '/api/convert'"
if old not in source:
    raise SystemExit("conversion sensitive-route entry not found")
source = source.replace(old, "        '/api/loans/repay'", 1)
path.write_text(source, encoding="utf-8")
print("server.js patched")
