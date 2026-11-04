"""Put "of organizations" back into the first sentence.
The 4 Oct 2026 track (commit 70948a2) has "McKinsey finds that 89 percent of organizations now use AI."; the 5 Oct patch
cut the two words and left a gap, and that cut carried into every later track. On 4 Nov 2026 Willem asked for the
subject back. Only sentence 1 is replaced: the original sentence is placed with its first word at FIRST_WORD, the
junction into the cut track lies in the silence before sentence 2, so cue 5 onward stays sample-identical.
Usage: restore_sentence1.py <original.wav (afconvert -f WAVE -d LEI16@48000 of commit 70948a2's mp4)>
Reads and rewrites narration.wav, cues.json and captions.vtt next to this file."""
import struct, array, json, re, sys, os
HERE = os.path.dirname(os.path.abspath(__file__)); RATE = 48000
FIRST_WORD = 1.05      # film time of the first word (was 1.395 with the shorter sentence)
THR = 120              # 16-bit level below which the track counts as silent
def load(p):
    d = open(p, "rb").read(); pos = 12; fmt = pcm = None
    while pos + 8 <= len(d):
        cid, sz = struct.unpack("<4sI", d[pos:pos+8]); body = d[pos+8:pos+8+sz]
        if cid == b"fmt ": fmt = struct.unpack("<HHIIHH", body[:16])
        if cid == b"data": pcm = body
        pos += 8 + sz + (sz & 1)
    assert fmt[2] == RATE, fmt; ch = fmt[1]; a = array.array("h"); a.frombytes(pcm[:len(pcm)//(2*ch)*2*ch])
    return array.array("h", [int((a[i] + a[i+1]) / 2) for i in range(0, len(a), 2)]) if ch == 2 else a
def save(p, mono):
    pcm = mono.tobytes()
    open(p, "wb").write(b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, RATE, RATE*2, 2, 16) + b"data" + struct.pack("<I", len(pcm)) + pcm)
def speech(a, t0, t1, gap=0.18, win=0.01):
    out = []; on = last = None; n = int(win*RATE)
    for i in range(int(t0*RATE), int(t1*RATE), n):
        w = a[i:i+n]; t = i / RATE
        if w and max(abs(x) for x in w) > THR:
            if on is None: on = t
            last = t + win
        elif on is not None and t - last >= gap: out.append((on, last)); on = None
    if on is not None: out.append((on, last))
    return out
orig = load(sys.argv[1]); cur = load(f"{HERE}/narration.wav")
s1 = speech(orig, 0, 9)                      # first sentence of the original: one run, ends before cue 1 (8.504 s)
start, end = s1[0][0], max(e for s, e in s1 if e < 8.5)
print("original sentence 1 speech %.3f..%.3f (%.2f s)" % (start, end, end - start))
assert 3.4 < start < 3.8 and 8.0 < end < 8.4, (start, end)
a0, a1 = int((start - 0.06) * RATE), int((end + 0.12) * RATE)   # keep a little room before the first word and after "AI."
piece = orig[a0:a1]
p0 = int((FIRST_WORD - 0.06) * RATE); p1 = p0 + len(piece); junction = p1 / RATE
nxt = speech(cur, 5.0, 7.0)[-1][0]           # first word of sentence 2 in the cut track (film time)
print("piece placed %.3f..%.3f, sentence 2 starts %.3f, pause %.2f s" % (p0 / RATE, junction, nxt, nxt - junction))
assert nxt - junction > 0.5, "pause before sentence 2 too short"
assert max(abs(x) for x in cur[p1 - 480:p1 + 480]) <= THR, "junction is not in silence"
new = array.array("h", bytes(2 * p0)) + piece + cur[p1:]
r = 240                                      # 5 ms ramps at both joins
for i in range(r):
    g = i / r; new[p0 + i] = int(new[p0 + i] * g); new[p1 - r + i] = int(new[p1 - r + i] * (1 - g) + cur[p1 - r + i] * g)
assert len(new) == len(cur)
save(f"{HERE}/narration.wav", new)
cues = json.load(open(f"{HERE}/cues.json"))
c0 = cues["cues"][0]; old = (c0["s"], c0["e"])
c0["s"] = round(FIRST_WORD - 0.045, 3); c0["e"] = round(FIRST_WORD + (end - start) + 0.3, 3)
c0["lines"] = ["McKinsey finds that 89 percent", "of organizations now use AI."]; c0["text"] = " ".join(c0["lines"])
cues["restored"] = "sentence 1 taken from the 4 Oct 2026 track (commit 70948a2) so 'of organizations' is spoken again; first word at %.2f s" % FIRST_WORD
json.dump(cues, open(f"{HERE}/cues.json", "w"), indent=1)
def ts(t): h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60; return "%02d:%02d:%06.3f" % (h, m, s)
vtt = open(f"{HERE}/captions.vtt", encoding="utf-8").read()
blocks = re.split(r"\n\s*\n", vtt.strip()); i = next(k for k, b in enumerate(blocks) if "-->" in b)
blocks[i] = "%s --> %s\n%s" % (ts(c0["s"]), ts(c0["e"]), "\n".join(c0["lines"]))
open(f"{HERE}/captions.vtt", "w", encoding="utf-8").write("\n\n".join(blocks) + "\n")
print("cue 0: %.3f-%.3f -> %.3f-%.3f  %s" % (old[0], old[1], c0["s"], c0["e"], c0["text"]))
print("new track speech 0-11 s:", [(round(s, 2), round(e, 2)) for s, e in speech(new, 0, 11)])
