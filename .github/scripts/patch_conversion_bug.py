from pathlib import Path

path = Path("server.js")
source = path.read_text(encoding="utf-8")
endpoint = "app.post('/api/convert', protect, async (req, res) => {"
if endpoint not in source:
    marker = "// CONVERT ENDPOINT - Execute crypto conversion using Map balances"
    marker_pos = source.find(marker)
    if marker_pos < 0:
        raise SystemExit("conversion endpoint marker not found")
    try_pos = source.find("  try {", marker_pos)
    if try_pos < 0:
        raise SystemExit("conversion endpoint try block not found")
    source = source[:try_pos] + endpoint + "\n" + source[try_pos:]
    print("restored convert endpoint declaration")

sensitive_pos = source.find("sensitiveRoutes")
if sensitive_pos < 0:
    raise SystemExit("sensitiveRoutes section not found")
target = "'/api/convert'"
pos = source.rfind(target, 0, sensitive_pos)
if pos < 0:
    raise SystemExit("conversion sensitive-route entry not found before sensitiveRoutes")
line_start = source.rfind("\n", 0, pos) + 1
line_end = source.find("\n", pos)
if line_end < 0:
    line_end = len(source)
line = source[line_start:line_end]
if "app.post" in line:
    raise SystemExit("refusing to remove the convert endpoint declaration")
source = source[:line_start] + source[line_end + (1 if line_end < len(source) else 0):]
path.write_text(source, encoding="utf-8")
print(f"removed sensitive route line: {line.strip()}")
