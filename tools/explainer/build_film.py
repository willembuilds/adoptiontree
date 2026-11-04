"""Write film.html: one 1920x1080 stage per requested time, every scene a pure function of time.
Rule for copy: every sentence on screen is a sentence the voice says, shown from the moment it is spoken
(cue times from cues.json). Everything else on screen is a short label or a figure, never a paraphrase."""
import re, json, os
S = os.path.dirname(os.path.abspath(__file__))
index = open(f"{S}/site/index.html", encoding="utf-8").read()
def block(html, opener):
    """the element that starts with `opener`, with balanced <div> nesting (regexes left tags unclosed before)"""
    i = html.index(opener); depth = 0; j = i
    for m in re.finditer(r"<div\b|</div>", html[i:]):
        depth += 1 if m.group(0) == "<div" else -1
        if depth == 0: j = i + m.end(); break
    return html[i:j]
tree = re.search(r'<svg class="tree__svg tree__svg--desktop".*?</svg>', index, re.S).group(0)
tree = re.sub(r' (role|tabindex|aria-label)="[^"]*"', '', tree).replace('<svg class="tree__svg tree__svg--desktop"', '<svg class="tree__svg tree__svg--desktop" width="1040" style="display:block"')
wave = (block(index, '<div class="wave__strip"') + block(index, '<div class="wave__chart"')).replace(' is-selected', '').replace('class="wr-gate is-current"', 'class="wr-gate"')
steps = block(index, '<div class="handover__steps"').replace(' is-selected', '')
visual = block(index, '<div class="handover__visual"')
visual = visual[:visual.index('<div class="hv-block hv-questions">')] + '</div>'
cues = json.load(open(f"{S}/cues.json"))
C = {c["i"]: {"s": c["s"], "e": c["e"]} for c in cues["cues"]}
CSS = r"""
*,*::before,*::after{transition:none!important;animation:none!important}
html{font-size:22px;background:#0C0D12}
body{margin:0;width:1920px;overflow:hidden;background:#000;color:var(--bone);font-family:var(--font-sans);-webkit-font-smoothing:antialiased;position:relative}
.stage{position:absolute;left:0;width:1920px;height:1080px;overflow:hidden;background:var(--ink)}
.scene{position:absolute;inset:0;box-sizing:border-box;padding:104px 120px 120px;overflow:hidden}
.black{position:absolute;inset:0;background:#000}
.dots{position:absolute;left:0;right:0;top:0;height:620px;background-image:radial-gradient(rgba(244,242,237,.085) 1.9px,transparent 2.1px);background-size:58px 58px;-webkit-mask-image:linear-gradient(180deg,#000 25%,transparent 100%);pointer-events:none}
.kick{font-family:var(--font-mono);font-size:21px;letter-spacing:.17em;text-transform:uppercase;color:var(--orange);margin:0 0 30px;position:relative}
.kick b{font-weight:500;color:var(--grey);margin-left:1.1em}
h1{font-size:82px;font-weight:600;letter-spacing:-.03em;line-height:1.06;margin:0;max-width:1560px;position:relative}
h1 .accent{color:var(--orange)}
h1 sup{font-size:.4em;vertical-align:top;line-height:1;position:relative;top:.25em}
.s1 h1 span{display:block}
.hwrap{position:relative}.hwrap h1{position:absolute;top:0;left:0;right:0}
.s1w{min-height:200px}.s1 .vc{position:absolute;left:120px;right:120px;top:50%;transform:translateY(-56%)}.s2 h1{font-size:64px}.s4 h1{font-size:64px;max-width:1500px}.s4w{min-height:150px}.s5 h1{font-size:66px}.s5w{min-height:240px}
.sub{font-size:33px;line-height:1.5;color:var(--grey);max-width:1060px;margin:34px 0 0;position:relative}
.sub strong{color:var(--bone);font-weight:500}
.mark{position:absolute;right:120px;bottom:70px;font-family:var(--font-mono);font-size:19px;letter-spacing:.2em;text-transform:uppercase;color:var(--grey-2);margin:0}
.mark i{display:inline-block;width:13px;height:13px;background:var(--orange);margin-right:14px}
.src{position:absolute;left:120px;bottom:70px;font-family:var(--font-mono);font-size:19px;letter-spacing:.06em;color:var(--grey-2);margin:0}
.cols{display:grid;grid-template-columns:1fr 1.25fr;gap:72px;align-items:center;height:100%;position:relative}
.ten{display:flex;align-items:center;gap:16px;margin:0 0 50px;position:relative}
.ten i{width:60px;height:60px;background:var(--orange)}
.ten i.off{background:transparent;border:1.5px solid var(--grey-2);box-sizing:border-box}
.pct{font-size:88px;font-weight:800;letter-spacing:-.03em;line-height:1;color:var(--orange);margin-left:34px;position:relative}
.list{list-style:none;margin:40px 0 0;padding:0;display:grid;gap:22px;font-size:31px;line-height:1.35;color:var(--grey)}
.list b{font-weight:600;color:var(--bone)}
.list li{padding-left:34px;border-left:3px solid var(--orange)}
.tree__svg .t-flabel{font-size:16.5px!important}.tree__svg .t-uclabel{font-size:19px!important}.tree__svg .tz{font-size:15px!important}.tree__svg .t-oflabel{font-size:17px!important}
.lane::before{transform:scaleX(var(--lp,0))!important}.lane::after,.lane__name{opacity:var(--lo,0)!important}
.wave__strip,.handover__steps{position:relative!important;top:auto!important}
.wr-gate{opacity:1!important}
.wave{margin-top:54px}
.handover{margin-top:48px}
.two{display:grid;grid-template-columns:.78fr 1.22fr;gap:64px;margin-top:40px;align-items:start}
.two>.handover{grid-area:auto!important;grid-column:2;grid-row:1}
.handover__visual{border:1px solid var(--line-strong);border-left:1px solid var(--line-strong)!important;padding:36px 40px!important}
.wm{font-size:196px;font-weight:900;letter-spacing:-.03em;line-height:.93;text-transform:uppercase;margin:36px 0 26px;position:relative}
.wm sup{font-size:.28em;vertical-align:top;line-height:1;position:relative;top:.38em;font-weight:700}
.wm-label{font-family:var(--font-mono);font-size:24px;letter-spacing:.42em;text-transform:uppercase;color:var(--grey);margin:0 0 54px}
.tag{font-size:58px;font-weight:600;letter-spacing:-.02em;line-height:1.15;margin:0}
.cta{font-size:40px;color:var(--orange);font-weight:500;margin:22px 0 0}
.fig{position:relative}
.rt.lit rect{fill:rgba(255,92,31,.15)!important;stroke:#FF5C1F!important}
.rt.lit text{fill:#F4F2ED!important}
"""
mark = '<p class="mark"><i></i>The Adoption Tree® Model</p>'
gap_svg = """<svg class="fig" viewBox="0 0 1200 640" width="1000" fill="none" xmlns="http://www.w3.org/2000/svg">
<style>.gl{stroke:#FF5C1F;stroke-width:3;stroke-linecap:round}.gd{stroke:rgba(244,242,237,.28);stroke-width:2;stroke-dasharray:7 9}.box rect{fill:#0C0D12;stroke:rgba(244,242,237,.28);stroke-width:1.5}.box text{font-family:Archivo,sans-serif;font-size:24px;font-weight:600;fill:#8A8F9E;text-anchor:middle}.box.on rect{stroke:#FF5C1F;stroke-width:2.2;fill:rgba(255,92,31,.16)}.box.on text{fill:#FF5C1F}.off text{fill:#6C7280;font-size:30px}.of rect{fill:#10121A;stroke:#FF5C1F;stroke-width:2}.of text{font-family:Archivo,sans-serif;font-size:26px;font-weight:600;fill:#F4F2ED;text-anchor:middle}</style>
<ellipse id="g-glow" cx="195" cy="150" rx="260" ry="150" fill="rgba(255,92,31,.035)"/>
<path id="g-tr" class="gl" d="M600,470 L600,380"/><path id="g-b1" class="gl" d="M600,380 C600,300 195,310 195,200"/>
<path class="gd" d="M600,380 C600,300 465,310 465,200"/><path class="gd" d="M600,380 C600,300 735,310 735,200"/><path class="gd" d="M600,380 C600,300 1005,310 1005,200"/>
<g id="g-box1" class="box on"><rect x="70" y="128" width="250" height="72" rx="10"/><text x="195" y="174">Use case 01 · live</text></g>
<g class="box off"><rect x="340" y="128" width="250" height="72" rx="10"/><text x="465" y="176">?</text></g>
<g class="box off"><rect x="610" y="128" width="250" height="72" rx="10"/><text x="735" y="176">?</text></g>
<g class="box off"><rect x="880" y="128" width="250" height="72" rx="10"/><text x="1005" y="176">?</text></g>
<g id="g-of" class="of"><rect x="440" y="470" width="320" height="76" rx="10"/><text x="600" y="518">Adoption Office</text></g>
<line x1="40" y1="600" x2="1160" y2="600" stroke="rgba(244,242,237,0.22)"/>
</svg>"""
stay_svg = """<svg class="fig" viewBox="0 0 1200 1020" width="980" fill="none" xmlns="http://www.w3.org/2000/svg">
<style>.gl{stroke:#FF5C1F;stroke-width:3;stroke-linecap:round}.gg{stroke:rgba(244,242,237,.35);stroke-width:2}.gd{stroke:#FF5C1F;stroke-width:2.5;stroke-dasharray:8 10;stroke-linecap:round}.box rect{fill:#0C0D12;stroke:rgba(244,242,237,.28);stroke-width:1.5}.box text{font-family:Archivo,sans-serif;font-size:24px;font-weight:600;fill:#8A8F9E;text-anchor:middle}.box.on rect{stroke:#FF5C1F;stroke-width:2.2;fill:rgba(255,92,31,.16)}.box.on text{fill:#FF5C1F}.box.next rect{stroke:#FF5C1F;stroke-dasharray:6 7}.box.next text{fill:#F4F2ED}.pill rect{fill:rgba(255,92,31,.14);stroke:#FF5C1F;stroke-width:1.5}.pill text{font-family:'IBM Plex Mono',monospace;font-size:20px;letter-spacing:.08em;text-transform:uppercase;fill:#F4F2ED;text-anchor:middle}.rt rect{fill:#0C0D12;stroke:rgba(244,242,237,.28);stroke-width:1.5}.rt text{font-family:Archivo,sans-serif;font-size:21px;font-weight:500;fill:#A2A7B4;text-anchor:middle}.zn{font-family:'IBM Plex Mono',monospace;font-size:19px;letter-spacing:.14em;text-transform:uppercase;fill:#FF5C1F}.zg{font-family:'IBM Plex Mono',monospace;font-size:19px;letter-spacing:.14em;text-transform:uppercase;fill:#8A8F9E}.pf-l{font-family:'IBM Plex Mono',monospace;font-size:22px;letter-spacing:.1em;text-transform:uppercase;fill:#A2A7B4}.pf-bar{fill:#FF5C1F}.pf-t{font-family:Archivo,sans-serif;font-size:36px;font-weight:600;fill:#F4F2ED}.pf-k{font-family:'IBM Plex Mono',monospace;font-size:21px;letter-spacing:.14em;text-transform:uppercase;fill:#FF5C1F}</style>
<g id="s-top" transform="translate(60 0) scale(.9)">
<path id="s-b1" class="gl" d="M600,350 L600,280 C600,210 330,220 330,120"/>
<path id="s-b2" class="gd" d="M600,280 C600,210 870,220 870,120"/>
<g id="s-uc1" class="box on"><rect x="200" y="50" width="260" height="70" rx="10"/><text x="330" y="95">Use case 01 · live</text></g>
<g id="s-uc2" class="box next"><rect x="740" y="50" width="260" height="70" rx="10"/><text x="870" y="95">Use case 02</text></g>
<text id="s-lbl" x="870" y="160" class="zn" text-anchor="middle">starts further ahead</text>
<line id="s-ground" x1="40" y1="500" x2="1160" y2="500" class="gg"/>
<text x="40" y="486" class="zg">Frontstage</text><text x="40" y="530" class="zg">Backstage</text>
<path id="s-tr" class="gl" d="M600,420 L600,560"/>
<g class="pill"><rect x="470" y="372" width="260" height="46" rx="23"/><text x="600" y="402">approved data</text></g>
<g class="pill"><rect x="470" y="430" width="260" height="46" rx="23"/><text x="600" y="460">a tested control</text></g>
<g class="pill"><rect x="470" y="488" width="260" height="46" rx="23"/><text x="600" y="518">trained people</text></g>
<path class="gl rp" d="M600,560 C600,600 330,590 330,640"/><path class="gl rp" d="M600,560 L600,640"/><path class="gl rp" d="M600,560 C600,600 870,590 870,640"/>
<g class="rt"><rect x="195" y="640" width="270" height="62" rx="10"/><text x="330" y="679">Data &amp; knowledge</text></g>
<g class="rt"><rect x="465" y="640" width="270" height="62" rx="10"/><text x="600" y="679">Responsible AI &amp; controls</text></g>
<g class="rt"><rect x="735" y="640" width="270" height="62" rx="10"/><text x="870" y="679">Workforce &amp; coaching</text></g>
<path id="s-ret" d="M1005,671 C1140,671 1140,85 1012,85" stroke="#FF5C1F" stroke-width="2.5" stroke-linecap="round"/>
<polygon id="s-ah" points="1012,77 1000,85 1012,93" fill="#FF5C1F"/>
<rect id="s-dash" x="170" y="616" width="860" height="110" rx="10" stroke="rgba(255,92,31,0.45)" stroke-dasharray="5 6"/>
<text id="s-roots" x="600" y="778" class="zn" text-anchor="middle">Roots · the foundation that stays</text>
</g>
<line id="pf-line" x1="40" y1="748" x2="1160" y2="748" class="gg"/>
<text id="pf-k" x="40" y="790" class="pf-k">Portfolio effect · design expectation</text>
<g id="pf-1"><text x="40" y="838" class="pf-l">Wave 1</text><rect class="pf-bar" data-w="560" x="200" y="820" width="560" height="26" rx="3" opacity=".45"/><text x="780" y="838" class="pf-l">24 weeks · first use case</text></g>
<g id="pf-2"><text x="40" y="890" class="pf-l">Wave 2</text><rect class="pf-bar" data-w="410" x="200" y="872" width="410" height="26" rx="3" opacity=".72"/><text x="630" y="890" class="pf-l">faster · more reliable · lower cost</text></g>
<g id="pf-3"><text x="40" y="942" class="pf-l">Wave 3</text><rect class="pf-bar" data-w="300" x="200" y="924" width="300" height="26" rx="3"/><text x="520" y="942" class="pf-l">starts further ahead again</text></g>
<text id="pf-c" x="40" y="1004" class="pf-t">Project by project, the organization transforms.</text>
</svg>"""
scenes = [
 f"""<div class="dots"></div><p class="kick">An operating model for enterprise AI adoption</p>
<div class="vc"><div class="ten"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i class="off"></i><span class="pct">89%</span></div>
<div class="hwrap s1w"><h1 class="hA">McKinsey finds that 89 percent<br>of organizations now use AI.</h1><h1 class="hB"><span class="l2">Using AI has become common.</span><span class="l3 accent">Repeating it has not.</span></h1></div></div>
<p class="src">McKinsey, The State of AI 2026</p>{mark}""",
 f"""<div class="dots"></div><div class="cols"><div><p class="kick">01<b>The gap</b></p>
<h1>The Adoption Tree<sup>®</sup> Model is an operating model for that gap.</h1>
<p class="sub">It takes an organization <strong>from one working AI use case to the ability to repeat it.</strong></p>
</div><div>{gap_svg}</div></div>{mark}""",
 f"""<div class="cols" style="grid-template-columns:.85fr 1.3fr"><div><p class="kick">02<b>The model in one view</b></p>
<h1>Read it as a tree.</h1>
<ul class="list"><li><b>The branches</b> are the use cases people see and use.</li><li><b>The roots</b> are six blocks of capability the organization keeps.</li><li>And <b>the trunk</b> is the Adoption Office: a small, jointly staffed team, temporary by design.</li></ul>
</div><div class="fig">{tree}</div></div>{mark}""",
 f"""<p class="kick">03<b>The adoption wave</b></p>
<div class="hwrap s4w"><h1 class="hA">The office takes each use case through six gates,<br>from mandate to transfer.</h1><h1 class="hB">A reference wave takes <span class="accent">twenty-four weeks</span><br>of working time.</h1></div>
<div class="wave is-played" data-step="0">{wave}</div>
<p class="sub subA" style="margin-top:40px;max-width:1500px">Each gate is a decision with a named owner and minimum evidence.</p>
<p class="sub subB" style="margin-top:12px;max-width:1500px">In a regulated enterprise, plan nine to twelve months elapsed.</p>{mark}""",
 f"""<div class="cols" style="grid-template-columns:.95fr 1.2fr"><div><p class="kick">05<b>What stays</b></p>
<div class="hwrap s5w"><h1 class="hA">What sets the model apart happens after go-live.</h1><h1 class="hB">Every live use case leaves something behind:</h1></div>
<p class="sub subA"><strong>approved data, a tested control, trained people.</strong></p>
<p class="sub subB" style="margin-top:18px">That flows back into the roots, so the next use case starts further ahead.</p>
<p class="sub subC" style="margin-top:18px">The foundation enables the use case. The use case makes the foundation stronger.</p>
</div><div>{stay_svg}</div></div>{mark}""",
 f"""<p class="kick">04<b>The capability that stays</b></p>
<h1>The office is built to leave.</h1>
<div class="handover" data-stage="0">{steps}</div>
<div class="two"><p class="sub subA" style="margin-top:14px">Dependency is designed to decline. <strong class="coach">Trained Adoption Coaches stay.</strong></p>
<div class="handover" data-stage="0" style="margin:0;border:0">{visual}</div></div>{mark}""",
 f"""<div class="dots"></div><p class="kick">An operating model for enterprise AI adoption</p>
<p class="wm">The Adoption<br>Tree<sup>®</sup></p><p class="wm-label">Model</p>
<p class="tag">Build AI capability that stays.</p><p class="cta">Get the whitepaper at adoptiontree.ai</p>
<p class="src">Version 1.1 · adoptiontree.ai</p>{mark}""",
]
JS = r"""
const MARK=@@MARK@@; const C=@@C@@; const TOTAL=@@TOTAL@@; const FPS=30; const XF=0.5;
const c01=x=>Math.max(0,Math.min(1,x)); const eo=p=>1-Math.pow(1-p,3); const pr=(t,t0,d)=>eo(c01((t-t0)/d));
function up(el,p,dy){ if(!el)return; if(dy===undefined)dy=26; el.style.setProperty('opacity',p,'important'); el.style.setProperty('transform',`translateY(${(1-p)*dy}px)`,'important'); }
function sh(el,p){ if(!el)return; el.style.setProperty('opacity',p,'important'); }
function draw(path,p){ if(!path)return; const L=path.getTotalLength(); path.style.setProperty('stroke-dasharray',`${L} ${L}`,'important'); path.style.setProperty('stroke-dashoffset',`${L*(1-p)}`,'important'); path.style.setProperty('opacity',p>0?1:0,'important'); }
function swap(elA,elB,tin,tout){ return (t)=>{ const pa=pr(t,tin,0.7), pao=1-pr(t,tout-0.45,0.4); up(elA,Math.min(pa,pao)); up(elB,pr(t,tout-0.05,0.7)); }; }
const A2=C[6].s-0.35, A3=C[8].s-0.35, A4=C[13].s-0.35, A5=C[17].s-0.35, A6=C[22].s-0.35, A7=C[24].s-0.35;
const W=[[0,A2],[A2,A3],[A3,A4],[A4,A5],[A5,A6],[A6,A7],[A7,TOTAL]];
function s1(el,t){ up(el.querySelector('.kick'),pr(t,0.25,0.6)); el.querySelectorAll('.ten i').forEach((sq,i)=>{const p=pr(t,C[0].s+1.15+i*0.18,0.35); sq.style.setProperty('opacity',p,'important'); sq.style.setProperty('transform',`scale(${0.6+0.4*p})`,'important');});
 up(el.querySelector('.pct'),pr(t,C[0].s+1.45,0.6),0);
 swap(el.querySelector('.hA'),el.querySelector('.l2'),C[0].s-0.15,C[5].s)(t); up(el.querySelector('.l3'),pr(t,C[5].s+2.15,0.7)); up(el.querySelector('.src'),pr(t,C[0].s+1.6,0.8)); }
function s2(el,t){ const a=A2; up(el.querySelector('.kick'),pr(t,a+0.1,0.6)); up(el.querySelector('h1'),pr(t,C[6].s-0.1,0.7));
 draw(el.querySelector('#g-tr'),pr(t,a+0.3,0.7)); sh(el.querySelector('#g-of'),pr(t,a+0.4,0.6)); draw(el.querySelector('#g-b1'),pr(t,a+0.7,1.1)); sh(el.querySelector('#g-box1'),pr(t,a+1.5,0.5)); sh(el.querySelector('#g-glow'),pr(t,a+1.5,0.8));
 el.querySelectorAll('.gd').forEach((p,i)=>sh(p,pr(t,C[7].s+0.4+i*0.18,0.6))); el.querySelectorAll('.box.off').forEach((b,i)=>sh(b,pr(t,C[7].s+0.7+i*0.18,0.5)));
 up(el.querySelector('.sub'),pr(t,C[7].s,0.7)); }
function s3(el,t){ const a=A3; up(el.querySelector('.kick'),pr(t,a+0.1,0.6)); up(el.querySelector('h1'),pr(t,C[8].s-0.1,0.7)); const svg=el.querySelector('.tree__svg');
 draw(svg.querySelector('.t-trunk-up'),pr(t,a+0.4,0.7)); draw(svg.querySelector('.t-trunk-down'),pr(t,a+0.4,0.7)); sh(svg.querySelector('.t-ground'),pr(t,a+0.7,0.6)); svg.querySelectorAll('.t-zone:not(.tz--orange)').forEach(z=>sh(z,pr(t,a+0.8,0.6)));
 svg.querySelectorAll('.t-branch').forEach((p,i)=>draw(p,pr(t,C[9].s+i*0.18,1.0))); svg.querySelectorAll('.t-ucbox').forEach((b,i)=>sh(b,pr(t,C[9].s+0.8+i*0.18,0.5))); sh(svg.querySelector('.tz--orange:not(.t-zone--roots)'),pr(t,C[9].s+1.6,0.5));
 svg.querySelectorAll('.t-root').forEach((p,i)=>draw(p,pr(t,C[10].s+i*0.15,0.8))); svg.querySelectorAll('.t-fbox1').forEach((b,i)=>sh(b,pr(t,C[10].s+0.8+i*0.15,0.5))); svg.querySelectorAll('.t-conn').forEach((p,i)=>draw(p,pr(t,C[10].s+1.1+i*0.15,0.5))); svg.querySelectorAll('.t-fbox2').forEach((b,i)=>sh(b,pr(t,C[10].s+1.6+i*0.15,0.5))); sh(svg.querySelector('.t-dash'),pr(t,C[10].s+2.3,0.6)); sh(svg.querySelector('.t-zone--roots'),pr(t,C[10].s+2.5,0.5));
 const off=svg.querySelector('.t-office'); sh(off,pr(t,a+0.6,0.6)); const q=c01((t-C[11].s)/0.9); off.style.setProperty('transform-box','fill-box'); off.style.setProperty('transform-origin','center'); off.style.setProperty('transform',`scale(${1+0.07*Math.sin(Math.PI*q)})`,'important');
 const li=el.querySelectorAll('.list li'); up(li[0],pr(t,C[9].s,0.6)); up(li[1],pr(t,C[10].s,0.6)); up(li[2],pr(t,C[11].s,0.6)); }
function s4(el,t){ const a=A4; up(el.querySelector('.kick'),pr(t,a+0.1,0.6)); swap(el.querySelector('.hA'),el.querySelector('.hB'),C[13].s-0.1,C[15].s)(t); const wv=el.querySelector('.wave'); up(wv,pr(t,a+0.5,0.6),18);
 const t13=C[13].s+0.4; const k = t<t13 ? 0 : Math.min(6, Math.floor((t-t13)/0.62)); wv.setAttribute('data-step',k);
 wv.querySelectorAll('.ws-tab').forEach((tab,i)=>tab.classList.toggle('is-selected',i===k)); wv.querySelectorAll('.wr-gate').forEach(g=>{const at=+g.getAttribute('data-step'); g.classList.toggle('is-passed',at<k); g.classList.toggle('is-current',at===k);});
 wv.querySelectorAll('.wr-rule').forEach((r,i)=>sh(r,pr(t,C[14].s+0.5+i*0.5,0.4))); up(el.querySelector('.subA'),pr(t,C[14].s,0.6));
 wv.querySelectorAll('.lane').forEach((l,i)=>{const p=pr(t,C[15].s+0.2+i*0.3,1.0); l.style.setProperty('--lp',p); l.style.setProperty('--lo',p>0?1:0);});
 up(el.querySelector('.subB'),pr(t,C[16].s,0.6)); }
function s5(el,t){ const a=A5; up(el.querySelector('.kick'),pr(t,a+0.1,0.6)); swap(el.querySelector('.hA'),el.querySelector('.hB'),C[17].s-0.1,C[18].s)(t);
 draw(el.querySelector('#s-b1'),pr(t,a+0.4,1.0)); sh(el.querySelector('#s-uc1'),pr(t,a+1.2,0.5)); draw(el.querySelector('#s-tr'),pr(t,a+1.4,0.6)); el.querySelectorAll('.rp').forEach((p,i)=>draw(p,pr(t,a+1.8+i*0.1,0.6))); el.querySelectorAll('.rt').forEach((b,i)=>sh(b,pr(t,a+2.2+i*0.12,0.5))); sh(el.querySelector('#s-dash'),pr(t,a+2.4,0.5)); sh(el.querySelector('#s-ground'),pr(t,a+0.6,0.5)); el.querySelectorAll('.zg').forEach(z=>sh(z,pr(t,a+0.7,0.5))); sh(el.querySelector('#s-roots'),pr(t,a+2.6,0.5));
 el.querySelectorAll('.pill').forEach((p,i)=>{const q=pr(t,C[19].s+0.1+i*1.0,0.5); p.style.setProperty('opacity',q,'important'); p.style.setProperty('transform',`translateY(${(1-q)*-34}px)`,'important');});
 el.querySelectorAll('.rt').forEach((b,i)=>b.classList.toggle('lit', t>=C[20].s+0.3+i*0.25));
 draw(el.querySelector('#s-ret'),pr(t,C[20].s+1.4,1.3)); sh(el.querySelector('#s-ah'),pr(t,C[20].s+2.6,0.2)); sh(el.querySelector('#s-uc2'),pr(t,C[20].s+2.7,0.5)); sh(el.querySelector('#s-b2'),pr(t,C[20].s+2.9,0.5)); sh(el.querySelector('#s-lbl'),pr(t,C[20].s+3.0,0.5));
 sh(el.querySelector('#pf-line'),pr(t,C[20].s+3.3,0.5)); sh(el.querySelector('#pf-k'),pr(t,C[20].s+3.4,0.5));
 [1,2,3].forEach(i=>{const g=el.querySelector('#pf-'+i); const q=pr(t,C[21].s+0.1+(i-1)*0.6,0.6); sh(g,q>0?1:0); const r=g.querySelector('rect'); r.setAttribute('width',(+r.getAttribute('data-w'))*q); g.querySelectorAll('text').forEach((x,j)=>sh(x,j===0?(q>0?1:0):pr(t,C[21].s+0.5+(i-1)*0.6,0.4)));});
 up(el.querySelector('#pf-c'),pr(t,C[21].s+2.3,0.6),0);
 up(el.querySelector('.subA'),pr(t,C[19].s,0.6)); up(el.querySelector('.subB'),pr(t,C[20].s,0.6)); up(el.querySelector('.subC'),pr(t,C[21].s,0.6)); }
function s6(el,t){ const a=A6; up(el.querySelector('.kick'),pr(t,a+0.1,0.6)); up(el.querySelector('h1'),pr(t,C[22].s-0.1,0.7)); const hv=el.querySelectorAll('.handover'); up(hv[0],pr(t,a+0.4,0.5),18); up(hv[1],pr(t,a+0.7,0.5),18);
 const t0=a+0.9, step=0.85; let stage=0; hv[0].querySelectorAll('.hs-tab').forEach((tab,i)=>{const on=t>=t0+i*step; if(on) stage=i; tab.classList.toggle('is-done', on && i<3); tab.classList.toggle('is-selected', on && i===3);});
 hv[0].querySelector('.handover__rail i').style.setProperty('transform',`scaleX(${c01((t-t0)/(3*step))})`,'important'); hv.forEach(h=>h.setAttribute('data-stage',stage));
 const q=pr(t,C[22].s+2.1,2.2); hv[1].querySelector('.hv-row--office .hv-meter i').style.setProperty('width',`${100*(1-q)}%`,'important'); hv[1].querySelector('.hv-row--people .hv-meter i').style.setProperty('width',`${16+84*q}%`,'important');
 up(el.querySelector('.subA'),pr(t,C[22].s+2.1,0.6)); up(el.querySelector('.coach'),pr(t,C[23].s,0.5),0); }
function s7(el,t){ const a=A7; up(el.querySelector('.kick'),pr(t,a+0.1,0.6)); const wm=el.querySelector('.wm'); const p=pr(t,a+0.2,0.9); wm.style.setProperty('opacity',p,'important'); wm.style.setProperty('transform',`translateY(${(1-p)*30}px) scale(${0.985+0.015*p})`,'important'); up(el.querySelector('.wm-label'),pr(t,a+0.9,0.6)); up(el.querySelector('.tag'),pr(t,C[24].s+1.65,0.6)); up(el.querySelector('.cta'),pr(t,C[25].s,0.6)); up(el.querySelector('.src'),pr(t,a+1.4,0.6)); }
const SC=[s1,s2,s3,s4,s5,s6,s7];
function renderStage(st,t){
  W.forEach((w,k)=>{ const a=w[0], b=w[1]; if (t < a-XF || t >= b) return; let op=1; if (k>0 && t<a) op=(t-(a-XF))/XF; if (t>b-XF) op=(b-t)/XF; if (k===0 && t<0.5) op=t/0.5;
    const el=document.createElement('div'); el.className='scene s'+(k+1); el.innerHTML=MARK[k]; st.appendChild(el); SC[k](el,t); el.style.opacity=c01(op); });
  if (t > TOTAL-0.8) { const blk=document.createElement('div'); blk.className='black'; blk.style.opacity=c01((t-(TOTAL-0.8))/0.8); st.appendChild(blk); } }
const Q=new URLSearchParams(location.search); let times=[];
if (Q.get('times')) times=Q.get('times').split(',').map(Number); else { const from=+(Q.get('from')||0), n=+(Q.get('n')||1); for(let i=0;i<n;i++) times.push((from+i)/FPS); }
document.body.style.height=(times.length*1080)+'px';
times.forEach((t,i)=>{ const st=document.createElement('div'); st.className='stage'; st.style.top=(i*1080)+'px'; document.body.appendChild(st); renderStage(st,t); });
""".replace("@@MARK@@", json.dumps(scenes)).replace("@@C@@", json.dumps(C)).replace("@@TOTAL@@", str(cues["total"]))
PAGE = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Explainer v2 film</title>
<link rel="stylesheet" href="site/css/fonts.css"><link rel="stylesheet" href="site/css/style.css?v=wave1"><style>{CSS}</style></head><body><script>{JS}</script></body></html>"""
open(f"{S}/film.html", "w", encoding="utf-8").write(PAGE)
print("film.html written; total", cues["total"], "s; scene starts", [round(x,2) for x in (C[6]["s"]-0.35, C[8]["s"]-0.35, C[13]["s"]-0.35, C[17]["s"]-0.35, C[22]["s"]-0.35, C[24]["s"]-0.35)])
