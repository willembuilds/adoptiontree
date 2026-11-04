"""Cut cues 1-4 out of the version 1 narration, keep the voice as it is, bring the first word forward,
write mono WAV + cue table (cues.json) + captions.vtt. Usage: audio_cut.py <scratch dir holding audio.wav>"""
import struct, array, json, re, sys, os
S = sys.argv[1]; HERE = os.path.dirname(os.path.abspath(__file__)); RATE = 48000
LEAD_IN = 1.4   # seconds of picture before the first word
TAIL = 1.9      # seconds of picture after the last word
THR = 120       # 16-bit sample level below which the track counts as silent
d = open(f"{S}/audio.wav", "rb").read(); pos = 12; fmt = pcm = None
while pos + 8 <= len(d):
    cid, sz = struct.unpack("<4sI", d[pos:pos+8]); body = d[pos+8:pos+8+sz]
    if cid == b"fmt ": fmt = struct.unpack("<HHIIHH", body[:16])
    if cid == b"data": pcm = body
    pos += 8 + sz + (sz & 1)
ch = fmt[1]; a = array.array("h"); a.frombytes(pcm[:len(pcm)//(2*ch)*2*ch])
mono = array.array("h", [int((a[i] + a[i+1]) / 2) for i in range(0, len(a), 2)]) if ch == 2 else a
# captions of the version 1 film (26 cues) are the cue source; line breaks are kept for the new captions
vtt = open(f"{HERE}/captions-v1.vtt", encoding="utf-8").read()
def ts(s): h, m, sec = s.split(":"); return int(h)*3600 + int(m)*60 + float(sec)
cues = []
for block in re.split(r"\n\s*\n", vtt.strip()):
    lines = block.strip().split("\n")
    if "-->" not in lines[0]: continue
    a_, b_ = lines[0].split("-->"); cues.append({"s": ts(a_.strip()), "e": ts(b_.split()[0].strip()), "lines": [l.strip() for l in lines[1:]], "text": " ".join(l.strip() for l in lines[1:])})
def quiet_runs(t_from, t_to, min_ms=60):
    i0, i1 = int(t_from*RATE), int(t_to*RATE); runs=[]; i=i0
    while i < i1:
        if abs(mono[i]) < THR:
            j=i
            while j < i1 and abs(mono[j]) < THR: j+=1
            if (j-i) >= RATE*min_ms/1000: runs.append((i/RATE, j/RATE))
            i=j
        else: i+=1
    return runs
r01 = quiet_runs(7.0, 9.0); r45 = quiet_runs(19.6, 21.4)
# the pause right before each cue = the last quiet run that ends before the caption start + 0.25 s
on1 = max(b for a,b in r01 if b <= cues[1]["s"] + 0.25)
on5 = max(b for a,b in r45 if b <= cues[5]["s"] + 0.25)
lead = 0.06
cut_a, cut_b = on1 - lead, on5 - lead
OFF = cut_b - cut_a
print(f"onset cue1 {on1:.3f}s, onset cue5 {on5:.3f}s, cut [{cut_a:.3f}, {cut_b:.3f}) = {OFF:.3f}s removed")
# first word of the track
on0 = 0
while abs(mono[on0]) < THR: on0 += 1
HEAD = max(0.0, on0 / RATE - LEAD_IN)
print(f"first word at {on0/RATE:.3f}s, trimming {HEAD:.3f}s of leading silence")
ih, ia, ib = int(HEAD * RATE), int(cut_a * RATE), int(cut_b * RATE)
out = mono[ih:ia] + mono[ib:]
last_on = len(out) - 1
while last_on > 0 and abs(out[last_on]) < THR: last_on -= 1
end = last_on + int(TAIL * RATE)
out = out[:end] + array.array("h", [0] * max(0, end - len(out)))
total = len(out) / RATE
pcm = out.tobytes()
with open(f"{HERE}/narration.wav", "wb") as f:
    f.write(b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, RATE, RATE*2, 2, 16) + b"data" + struct.pack("<I", len(pcm)) + pcm)
def shift(c, by, i): return dict(c, s=round(c["s"] - by, 3), e=round(c["e"] - by, 3), i=i)
new = [shift(cues[0], HEAD, 0)] + [shift(c, OFF + HEAD, i) for i, c in enumerate(cues) if i >= 5]
json.dump({"offset": round(OFF, 3), "head": round(HEAD, 3), "total": round(total, 3), "cues": new}, open(f"{HERE}/cues.json", "w"), indent=1)
def fmt_ts(t): h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60; return f"{h:02d}:{m:02d}:{s:06.3f}"
with open(f"{HERE}/captions.vtt", "w", encoding="utf-8") as f:
    f.write("WEBVTT\n\n" + "\n\n".join(f"{fmt_ts(c['s'])} --> {fmt_ts(c['e'])}\n" + "\n".join(c["lines"]) for c in new) + "\n")
print(f"narration: {total:.2f} s, {len(new)} cues; last word ends {last_on/RATE:.2f}s; captions.vtt written")
for c in new: print(f"  cue {c['i']:02d} {c['s']:6.2f}-{c['e']:6.2f}  {c['text']}")
