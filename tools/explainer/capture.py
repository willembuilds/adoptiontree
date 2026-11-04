"""Render frames with headless Chrome. test: capture.py test t1,t2,...  full: capture.py full <fps> <from> <to>"""
import sys, os, subprocess, math
from PIL import Image
S = os.path.dirname(os.path.abspath(__file__)); CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
def shoot(query, n, out):
    """One headless Chrome run per batch; a hung Chrome is killed after 600 s and the batch retried (seen once: a worker sat 7 h on one batch)."""
    for attempt in range(4):
        if os.path.exists(out): os.remove(out)
        try:
            subprocess.run([CH, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", f"--window-size=1920,{n*1080}", "--virtual-time-budget=3000", f"--screenshot={out}", f"file://{S}/film.html?{query}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False, timeout=600)
        except subprocess.TimeoutExpired:
            print("timeout, retry", query, attempt + 1, flush=True); continue
        if os.path.exists(out): return
    print("FAILED", query); sys.exit(1)
mode = sys.argv[1]
if mode == "test":
    times = sys.argv[2].split(","); os.makedirs(f"{S}/test", exist_ok=True); shoot("times=" + ",".join(times), len(times), f"{S}/test/sheet-raw.png")
    im = Image.open(f"{S}/test/sheet-raw.png")
    for i, t in enumerate(times): im.crop((0, i*1080, 1920, (i+1)*1080)).save(f"{S}/test/t{t}.png")
    print("test frames:", times, "raw", im.size)
else:
    fps, a, b = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]); os.makedirs(f"{S}/frames", exist_ok=True); N = 14
    for start in range(a, b, N):
        n = min(N, b - start); raw = f"{S}/frames/_batch_{a}.png"; shoot(f"from={start}&n={n}", n, raw)
        im = Image.open(raw)
        if im.size != (1920, n*1080): print("SIZE MISMATCH", start, im.size); sys.exit(1)
        for i in range(n): im.crop((0, i*1080, 1920, (i+1)*1080)).convert("RGB").save(f"{S}/frames/f{start+i:05d}.png", compress_level=1)
        if (start - a) % (N*10) == 0: print("frames", start, "/", b, flush=True)
    print("done", a, b)
