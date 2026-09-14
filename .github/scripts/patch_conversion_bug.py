from pathlib import Path

path = Path("server.js")
source = path.read_text(encoding="utf-8")
target = "'/api/convert'"
pos = source.find(target)
if pos < 0:
    raise SystemExit("conversion route entry not found")
line_start = source.rfind("\n", 0, pos) + 1
line_end = source.find("\n", pos)
if line_end < 0:
    line_end = len(source)
line = source[line_start:line_end]
if "sensitive" not in source[max(0, line_start - 1200):line_start].lower():
    raise SystemExit("first conversion occurrence was not in the sensitive route section")
source = source[:line_start] + source[line_end + (1 if line_end < len(source) else 0):]
path.write_text(source, encoding="utf-8")
print(f"removed sensitive route line: {line.strip()}")
