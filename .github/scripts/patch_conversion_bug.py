from pathlib import Path
import re

path = Path("server.js")
source = path.read_text(encoding="utf-8")

match = re.search(r"const\s+sensitiveRoutes\s*=\s*\[(.*?)\];", source, flags=re.S)
if not match:
    raise SystemExit("sensitiveRoutes array not found")
block = match.group(1)
updated, count = re.subn(r"\n\s*['\"]\/api\/convert['\"],?", "", block, count=1)
if count != 1:
    raise SystemExit("conversion sensitive-route entry not found")
source = source[:match.start(1)] + updated + source[match.end(1):]
path.write_text(source, encoding="utf-8")
print("server.js patched")
