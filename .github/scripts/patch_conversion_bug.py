from pathlib import Path

source = Path("server.js").read_text(encoding="utf-8")
for needle in ["sensitiveRoutes", "loans/repay", "api/convert", "/api/convert", "CONVERT ENDPOINT"]:
    positions = []
    start = 0
    while True:
        pos = source.find(needle, start)
        if pos < 0:
            break
        positions.append(pos)
        start = pos + 1
    print(f"NEEDLE {needle!r}: {positions[:20]} total={len(positions)}")
    for pos in positions[:5]:
        print("---", needle, pos, "---")
        print(source[max(0, pos-250):pos+350].replace("\n", "\\n"))
