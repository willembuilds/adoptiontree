/* Adoption Tree™ Model interactions */
(function () {
  "use strict";
  document.documentElement.classList.replace("no-js", "js");

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (location.search.indexOf("qa") !== -1) prefersReduced = true;

  /* ---------- nav scroll state ---------- */
  var nav = document.getElementById("nav");
  var onScroll = function () {
    nav.classList.toggle("is-scrolled", window.scrollY > 24);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- mobile menu ---------- */
  var burger = document.getElementById("burger");
  var links = document.getElementById("navLinks");
  burger.addEventListener("click", function () {
    var open = burger.classList.toggle("is-open");
    links.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
  links.addEventListener("click", function (e) {
    if (e.target.tagName === "A") {
      burger.classList.remove("is-open");
      links.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
      burger.setAttribute("aria-label", "Open menu");
    }
  });

  /* ---------- reveal on scroll ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !prefersReduced) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---------- stat counters ---------- */
  var counters = document.querySelectorAll(".stat__num");
  var animateCount = function (el) {
    var target = parseInt(el.getAttribute("data-count"), 10);
    var duration = 1400;
    var start = null;
    var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
    var tick = function (ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      el.textContent = Math.round(ease(p) * target);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if ("IntersectionObserver" in window && !prefersReduced) {
    var cio = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            cio.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach(function (el) { cio.observe(el); });
  } else {
    counters.forEach(function (el) {
      el.textContent = el.getAttribute("data-count");
    });
  }

  /* ---------- flywheel: spin-up, orbiting comet, live step ---------- */
  var flyStage = document.getElementById("flywheelStage");
  if (flyStage) {
    var FW_STEPS = 6;
    var stepEls = {};
    flyStage.querySelectorAll("[data-step]").forEach(function (el) {
      var k = el.getAttribute("data-step");
      (stepEls[k] = stepEls[k] || []).push(el);
    });
    var setLiveStep = function (idx) {
      Object.keys(stepEls).forEach(function (k) {
        var on = parseInt(k, 10) === idx;
        stepEls[k].forEach(function (el) { el.classList.toggle("is-live", on); });
      });
    };

    if (prefersReduced) {
      flyStage.classList.add("is-spun");
      setLiveStep(0);
    } else {
      if ("IntersectionObserver" in window) {
        var fio = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              flyStage.classList.add("is-spun");
              fio.disconnect();
            }
          });
        }, { threshold: 0.35 });
        fio.observe(flyStage);
      } else {
        flyStage.classList.add("is-spun");
      }
      var comets = flyStage.querySelectorAll(".fw-comet");
      if (comets.length) {
        var cometStart = null;
        var lastStep = -1;
        var orbit = function (ts) {
          if (cometStart === null) cometStart = ts;
          var angle = (((ts - cometStart) / 22000) * 360) % 360;
          comets.forEach(function (cm) {
            cm.setAttribute("transform",
              "rotate(" + angle + " " + cm.getAttribute("data-cx") + " " + cm.getAttribute("data-cy") + ")");
          });
          // the segment under the comet is the live one
          if (flyStage.classList.contains("is-spun")) {
            var idx = Math.floor(angle / (360 / FW_STEPS)) % FW_STEPS;
            if (idx !== lastStep) {
              setLiveStep(idx);
              lastStep = idx;
            }
          }
          requestAnimationFrame(orbit);
        };
        requestAnimationFrame(orbit);
      }
    }
  }

  /* ---------- office blueprint: draw on scroll ---------- */
  var officeStage = document.getElementById("officeStage");
  if (officeStage) {
    officeStage.querySelectorAll(".draw").forEach(function (p) {
      p.setAttribute("pathLength", "1");
    });
    if (prefersReduced) {
      officeStage.classList.add("is-drawn");
    } else if ("IntersectionObserver" in window) {
      var oio = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            officeStage.classList.add("is-drawn");
            oio.disconnect();
          }
        });
      }, { threshold: 0.3 });
      oio.observe(officeStage);
    } else {
      officeStage.classList.add("is-drawn");
    }
  }

  /* ---------- scroll progress bar ---------- */
  var progressBar = document.getElementById("progressBar");
  if (progressBar) {
    var progressTick = false;
    var updateProgress = function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var frac = max > 0 ? window.scrollY / max : 0;
      progressBar.style.transform = "scaleX(" + Math.min(Math.max(frac, 0), 1) + ")";
      progressTick = false;
    };
    window.addEventListener("scroll", function () {
      if (!progressTick) {
        progressTick = true;
        requestAnimationFrame(updateProgress);
      }
    }, { passive: true });
    updateProgress();
  }

  /* ---------- adoption tree: grow on scroll ---------- */
  var treeStage = document.getElementById("treeStage");
  if (treeStage) {
    treeStage.querySelectorAll(".tree__svg .draw").forEach(function (p) {
      p.setAttribute("pathLength", "1");
    });
    if (prefersReduced) {
      treeStage.classList.add("is-grown");
    } else if ("IntersectionObserver" in window) {
      var tio = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            treeStage.classList.add("is-grown");
            grownAt = Date.now();
            tio.disconnect();
            setTimeout(treeDemo, 3000);
            setTimeout(startSap, 3700);
          }
        });
      }, { threshold: 0.35 });
      tio.observe(treeStage);
    } else {
      treeStage.classList.add("is-grown");
      setTimeout(startSap, 0);
    }
  }

  /* ---------- adoption tree: sap pulse (harvest feeds the roots) ---------- */
  var sapBusy = false;
  var sapPulseFrom = null;
  var sapStarted = new WeakSet();

  function visibleTreeSvg() {
    if (!treeStage) return null;
    var svgs = treeStage.querySelectorAll(".tree__svg");
    for (var i = 0; i < svgs.length; i++) {
      if (svgs[i].getClientRects().length) return svgs[i];
    }
    return null;
  }

  function startSap() {
    if (prefersReduced) return;
    var svg = visibleTreeSvg();
    if (!svg || sapStarted.has(svg)) return;
    sapStarted.add(svg);
    var sap = svg.querySelector(".t-sap");
    var spine = svg.querySelector(".t-spine");
    var branches = svg.querySelectorAll(".t-branch");
    var roots = svg.querySelectorAll(".t-root");
    if (!sap || !spine || !branches.length || !roots.length) return;

    function animateAlong(path, from, to, duration, done) {
      var total = path.getTotalLength();
      var t0 = null;
      function frame(ts) {
        if (!t0) t0 = ts;
        var p = Math.min((ts - t0) / duration, 1);
        var eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        var pt = path.getPointAtLength(total * (from + (to - from) * eased));
        sap.setAttribute("cx", pt.x);
        sap.setAttribute("cy", pt.y);
        if (p < 1) requestAnimationFrame(frame);
        else if (done) done();
      }
      requestAnimationFrame(frame);
    }

    function finish() {
      sap.setAttribute("opacity", "0");
      sapBusy = false;
    }

    function sink(col, level) {
      // the harvest sinks level by level through the root connectors
      var conn = svg.querySelector('.t-conn[data-col="' + col + '"][data-level="' + level + '"]');
      if (conn && Math.random() < 0.6) {
        animateAlong(conn, 0, 1, 320, function () { sink(col, level + 1); });
      } else {
        finish();
      }
    }

    function pulse(branchIdx) {
      sapBusy = true;
      var branch = branches[branchIdx % branches.length];
      var r = Math.floor(Math.random() * roots.length);
      sap.setAttribute("opacity", "0.95");
      // use case -> convergence (walk the branch backwards)
      animateAlong(branch, 1, 0, 850, function () {
        // convergence -> fan origin, straight through the office
        animateAlong(spine, 0, 1, 450, function () {
          // fan origin -> foundation row 1, then sink deeper
          animateAlong(roots[r], 0, 1, 650, function () { sink(r, 1); });
        });
      });
    }
    sapPulseFrom = pulse;

    (function loop() {
      if (!document.hidden && !sapBusy && !flowSvg && Date.now() - lastTreeInteraction > 8000 && visibleTreeSvg() === svg) {
        pulse(Math.floor(Math.random() * branches.length));
      }
      setTimeout(loop, 4200);
    })();
  }

  /* ---------- adoption tree: hover, tap or focus a use case to see what it feeds back into the roots ---------- */
  // Illustrative: each use case leaves three things in the foundation. Indices follow the six foundation boxes
  // in document order: 0 mandate, 1 data, 2 architecture, 3 responsible AI, 4 workforce, 5 measurement.
  var TREE_FEEDS = [
    [[1, "An approved, documented data source"], [3, "A control pattern the next release reuses"], [5, "A baseline and a first measured result"]],
    [[0, "Decision rights tested at a real gate"], [2, "A reusable integration with the core system"], [4, "Trained users and an internal coach"]],
    [[1, "Cleaned data the next team does not rebuild"], [4, "A changed workflow people actually use"], [5, "Time saved turned into capacity, on record"]],
    [[0, "A domain owner who runs the next wave"], [2, "A pattern the next use case starts from"], [3, "A documented review and release route"]]
  ];
  var SVG_NS = "http://www.w3.org/2000/svg";
  var treeReadout = document.getElementById("treeReadout");
  var flowTimers = [];
  var fadeTimer = null;
  var flowSvg = null;
  var flowBranch = -1;
  var flowEndsAt = 0;
  var grownAt = 0;
  var lastTreeInteraction = 0;

  function later(ms, fn) { flowTimers.push(setTimeout(fn, ms)); }
  function cancelFade() { clearTimeout(fadeTimer); fadeTimer = null; }
  function scheduleFade(ms) {
    cancelFade();
    if (flowSvg) fadeTimer = setTimeout(fadeFlow, Math.max(flowEndsAt - Date.now(), 0) + ms);
  }

  function showReadout(branch, feeds, fboxes) {
    if (!treeReadout) return [];
    var hint = treeReadout.querySelector(".tree__readout-hint");
    var body = treeReadout.querySelector(".tree__readout-body");
    var list = treeReadout.querySelector(".tree__readout-list");
    treeReadout.classList.remove("is-fading");
    if (branch === null) { body.hidden = true; hint.hidden = false; return []; }
    treeReadout.querySelector(".tree__readout-label").textContent = "Use case 0" + (branch + 1) + " feeds back \u00b7 example";
    list.textContent = "";
    var items = feeds.map(function (f) {
      var li = document.createElement("li");
      var name = document.createElement("strong");
      name.textContent = fboxes[f.idx].textContent.trim();
      li.appendChild(name);
      li.appendChild(document.createTextNode(f.text));
      list.appendChild(li);
      return li;
    });
    hint.hidden = true;
    body.hidden = false;
    return items;
  }

  function clearFlow() {
    flowTimers.forEach(clearTimeout);
    flowTimers = [];
    cancelFade();
    if (flowSvg) {
      flowSvg.classList.remove("is-flowing", "is-fading");
      flowSvg.querySelectorAll(".t-flowlayer").forEach(function (n) { n.remove(); });
      flowSvg.querySelectorAll(".is-source, .is-lit, .is-pulsing").forEach(function (n) { n.classList.remove("is-source", "is-lit", "is-pulsing"); });
    }
    flowSvg = null;
    flowBranch = -1;
  }

  function fadeFlow() {
    var svg = flowSvg;
    if (!svg) return;
    flowTimers.forEach(clearTimeout);
    flowTimers = [];
    svg.classList.add("is-fading");
    svg.classList.remove("is-flowing");
    svg.querySelectorAll(".is-source, .is-lit, .is-pulsing").forEach(function (n) { n.classList.remove("is-source", "is-lit", "is-pulsing"); });
    if (treeReadout) treeReadout.classList.add("is-fading");
    fadeTimer = setTimeout(function () { clearFlow(); showReadout(null); }, 550);
  }

  // A glowing line that runs along an existing tree path, forwards or from its end back to its start.
  function flowLine(layer, path, reverse, delay, duration) {
    if (!path) return;
    ["t-flow t-flow--halo", "t-flow"].forEach(function (cls) {
      var line = document.createElementNS(SVG_NS, "path");
      line.setAttribute("d", path.getAttribute("d"));
      line.setAttribute("pathLength", "1");
      line.setAttribute("class", cls + (reverse ? " t-flow--rev" : ""));
      line.style.animationDelay = delay + "ms";
      line.style.animationDuration = Math.max(duration, 1) + "ms";
      layer.appendChild(line);
    });
  }

  function ring(layer, box, delay) {
    var rect = box && box.querySelector("rect");
    if (!rect) return;
    var r = document.createElementNS(SVG_NS, "rect");
    ["x", "y", "width", "height", "rx"].forEach(function (a) { r.setAttribute(a, rect.getAttribute(a)); });
    r.setAttribute("class", "t-ring");
    r.style.animationDelay = delay + "ms";
    layer.appendChild(r);
  }

  function playFlow(svg, branch) {
    if (!svg || !treeStage || !treeStage.classList.contains("is-grown")) return;
    clearFlow();
    var wait = prefersReduced ? 0 : Math.max(0, grownAt + 2900 - Date.now());
    if (wait > 0) { later(wait, function () { playFlow(svg, branch); }); return; }
    var k = prefersReduced ? 0 : 1;
    var fboxes = svg.querySelectorAll(".t-fbox");
    var source = svg.querySelectorAll(".t-ucbox")[branch];
    var office = svg.querySelector(".t-office");
    var cols = svg.querySelectorAll(".t-root").length;
    var sap = svg.querySelector(".t-sap");
    if (!source || !cols || fboxes.length < 6) return;
    if (sap) sap.setAttribute("opacity", "0");
    flowSvg = svg;
    flowBranch = branch;

    var layer = document.createElementNS(SVG_NS, "g");
    layer.setAttribute("class", "t-flowlayer");
    layer.setAttribute("aria-hidden", "true");
    svg.insertBefore(layer, svg.querySelector(".t-ucbox"));
    svg.classList.add("is-flowing");
    source.classList.add("is-source");

    // use case -> trunk -> Adoption Office -> fan -> each root it feeds, level by level
    var t = 0;
    flowLine(layer, svg.querySelectorAll(".t-branch")[branch], true, t, 650 * k); t += 650 * k;
    flowLine(layer, svg.querySelector(".t-trunk-up"), true, t, 220 * k); t += 220 * k;
    later(t, function () { if (office) office.classList.add("is-pulsing"); });
    flowLine(layer, svg.querySelector(".t-trunk-down"), false, t, 260 * k); t += 260 * k;

    var feeds = TREE_FEEDS[branch].map(function (f) {
      return { idx: f[0], text: f[1], col: f[0] % cols, row: Math.floor(f[0] / cols) + 1 };
    }).sort(function (a, b) { return a.row - b.row || a.col - b.col; });
    var items = showReadout(branch, feeds, fboxes);
    var end = t;
    feeds.forEach(function (f, n) {
      var at = t;
      flowLine(layer, svg.querySelector('.t-root[data-col="' + f.col + '"]'), false, at, 480 * k); at += 480 * k;
      for (var level = 1; level < f.row; level++) {
        flowLine(layer, svg.querySelector('.t-conn[data-col="' + f.col + '"][data-level="' + level + '"]'), false, at, 260 * k);
        at += 260 * k;
      }
      if (k) ring(layer, fboxes[f.idx], at);
      later(at, function () {
        fboxes[f.idx].classList.add("is-lit");
        if (items[n]) items[n].classList.add("is-in");
      });
      end = Math.max(end, at);
    });
    flowEndsAt = Date.now() + end + 400;
  }

  function treeDemo() {
    if (lastTreeInteraction || flowSvg) return;
    var svg = visibleTreeSvg();
    if (!svg) return;
    playFlow(svg, 0);
    scheduleFade(2600);
  }

  if (treeStage) {
    var lastPointer = "mouse";
    treeStage.addEventListener("pointerdown", function (event) { lastPointer = event.pointerType || "mouse"; }, { passive: true });
    treeStage.querySelectorAll(".tree__svg").forEach(function (svg) {
      svg.querySelectorAll(".t-ucbox").forEach(function (g) {
        var idx = parseInt(g.getAttribute("data-branch"), 10);
        var show = function (restart) {
          lastTreeInteraction = Date.now();
          cancelFade();
          if (!restart && flowSvg === svg && flowBranch === idx && !svg.classList.contains("is-fading")) return;
          playFlow(svg, idx);
        };
        g.addEventListener("mouseenter", function () { show(false); });
        g.addEventListener("mouseleave", function () { scheduleFade(1600); });
        g.addEventListener("focus", function () { show(false); });
        g.addEventListener("blur", function () { scheduleFade(800); });
        g.addEventListener("click", function () {
          show(false);
          if (lastPointer !== "mouse") scheduleFade(4000);
        });
        g.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); show(true); }
        });
      });
    });
  }

  window.addEventListener("resize", function () {
    if (treeStage && treeStage.classList.contains("is-grown")) startSap();
  }, { passive: true });
  /* ---------- strike-through on scroll ---------- */
  var strikes = document.querySelectorAll(".strike");
  if (strikes.length && "IntersectionObserver" in window) {
    var kio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-struck");
          kio.unobserve(entry.target);
        }
      });
    }, { threshold: 0.75 });
    strikes.forEach(function (el) { kio.observe(el); });
  } else {
    strikes.forEach(function (el) { el.classList.add("is-struck"); });
  }

  /* ---------- ghost numeral parallax ---------- */
  var ghostSections = document.querySelectorAll(".section[data-num]");
  if (ghostSections.length && !prefersReduced) {
    var ghostTick = false;
    var updateGhosts = function () {
      var vh = window.innerHeight;
      ghostSections.forEach(function (sec) {
        var r = sec.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        var p = Math.min(Math.max(1 - (r.top + r.height) / (vh + r.height), 0), 1);
        sec.style.setProperty("--ghost-shift", (-44 * p).toFixed(1) + "px");
      });
      ghostTick = false;
    };
    window.addEventListener("scroll", function () {
      if (!ghostTick) {
        ghostTick = true;
        requestAnimationFrame(updateGhosts);
      }
    }, { passive: true });
    updateGhosts();
  }


  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && burger.classList.contains("is-open")) {
      burger.click(); burger.focus();
    }
  });

  /* Decision gates: click, arrow keys, Home and End. */
  var tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  function selectGate(tab) {
    tabs.forEach(function (item) {
      var selected = item === tab;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
    });
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () { selectGate(tab); });
    tab.addEventListener("keydown", function (event) {
      var next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); selectGate(tabs[next]); tabs[next].focus(); }
    });
  });

  /* White paper funnel: attribution capture, work-email policy, consent, emailed access. */
  var form = document.getElementById("whitepaperForm");
  var status = document.getElementById("form-status");
  var success = document.getElementById("download-success");
  var emailInput = document.getElementById("email");
  var ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var WORK_EMAIL_MESSAGE = "Please use your work email address to access the full whitepaper.";
  var policyPromise = null;

  // Campaign source is read from the address bar of this page at load; nothing is stored in the browser.
  function captureAttribution() {
    var params = new URLSearchParams(location.search);
    var fresh = {};
    ATTRIBUTION_KEYS.forEach(function (k) { var v = params.get(k); if (v) fresh[k] = v.slice(0, 200); });
    fresh.referrer = (document.referrer || "").slice(0, 500);
    var utmOnly = new URLSearchParams();
    ATTRIBUTION_KEYS.forEach(function (k) { if (fresh[k]) utmOnly.set(k, fresh[k]); });
    fresh.landing_url = (location.origin + location.pathname + (utmOnly.toString() ? "?" + utmOnly.toString() : "")).slice(0, 500);
    return fresh;
  }
  function showStatus(message, isError) { if (!status) return; status.classList.toggle("is-error", !!isError); status.textContent = message; }
  function showSuccess() { form.hidden = true; success.hidden = false; success.focus(); }
  function loadPolicy() {
    if (!policyPromise) {
      var timeout = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined;
      policyPromise = fetch(form.action.replace(/\/$/, "") + "/policy", { credentials: "omit", signal: timeout })
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
        .then(function (policy) { if (!policy) policyPromise = null; return policy; });
    }
    return policyPromise;
  }
  function blockedDomain(policy, email) {
    if (!policy) return false;
    var domain = (email.split("@")[1] || "").toLowerCase();
    if (!domain) return false;
    return (policy.free || []).concat(policy.disposable || []).some(function (d) {
      d = d.toLowerCase();
      return domain === d || domain.slice(-(d.length + 1)) === "." + d;
    });
  }

  if (form) {
    var attribution = captureAttribution();
    ATTRIBUTION_KEYS.concat(["referrer", "landing_url"]).forEach(function (k) {
      var el = form.querySelector('input[name="' + k + '"]');
      if (el && attribution[k]) el.value = attribution[k];
    });
    var returned = new URLSearchParams(location.search);
    if (returned.get("sent") === "1") showSuccess();
    else if (returned.get("access") === "expired") showStatus("That access link has expired. Use the form above to request a new one.", true);
    else if (returned.get("access") === "unavailable") showStatus("The download is temporarily unavailable. Please try again shortly.", true);
    else if (returned.get("unsubscribed") === "1") showStatus("You are unsubscribed. We will not contact you further.", false);
    else if (returned.get("unsubscribed") === "0") showStatus("That unsubscribe link is not valid. Email willem@adoptiontree.ai and we will remove you.", true);
    else if (returned.get("unsubscribed") === "unavailable") showStatus("We could not process the unsubscribe right now. Please try again later, or email willem@adoptiontree.ai.", true);

    emailInput.addEventListener("focus", function () { loadPolicy(); }, { once: true });
    emailInput.addEventListener("input", function () { emailInput.setCustomValidity(""); });
    emailInput.addEventListener("blur", function () {
      loadPolicy().then(function (policy) {
        if (emailInput.value && blockedDomain(policy, emailInput.value.trim())) {
          emailInput.setCustomValidity(WORK_EMAIL_MESSAGE);
          showStatus(WORK_EMAIL_MESSAGE, true);
        }
      });
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var policy = await loadPolicy();
      emailInput.setCustomValidity(blockedDomain(policy, emailInput.value.trim()) ? WORK_EMAIL_MESSAGE : "");
      if (!form.reportValidity()) {
        if (emailInput.validationMessage === WORK_EMAIL_MESSAGE) showStatus(WORK_EMAIL_MESSAGE, true);
        return;
      }
      var submit = form.querySelector('[type="submit"]');
      if (form.dataset.busy) return;
      form.dataset.busy = "1";
      submit.setAttribute("aria-busy", "true");
      submit.textContent = "Sending your access…";
      showStatus("", false);
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, 20000);
      try {
        var data = Object.fromEntries(new FormData(form));
        data.consent = document.getElementById("consent").checked;
        var response = await fetch(form.action, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(data),
          signal: controller.signal
        });
        var result;
        try { result = await response.json(); } catch (_) {
          throw new Error("Access is unavailable right now. Please try again in a moment.");
        }
        if (!response.ok) throw new Error(result.error || "Please try again in a moment.");
        showSuccess();
      } catch (error) {
        var message = error.name === "AbortError" ? "That took too long. Please try again." : (response ? error.message : "Access is unavailable right now. Please try again in a moment.");
        showStatus(message, true);
        var field = response && response.status === 400 ? (/first name/i.test(error.message) ? document.getElementById("first_name") : emailInput) : submit;
        if (field) field.focus();
      } finally {
        clearTimeout(timeout);
        delete form.dataset.busy;
        submit.removeAttribute("aria-busy");
        submit.innerHTML = 'Get the whitepaper <span aria-hidden="true">→</span>';
      }
    });
    var again = document.getElementById("request-again");
    if (again) again.addEventListener("click", function () {
      success.hidden = true; form.hidden = false; showStatus("", false);
      document.getElementById("first_name").focus();
    });
  }

  /* ---------- active nav link ---------- */
  var sections = document.querySelectorAll("section[id]");
  var navAnchors = document.querySelectorAll(".nav__links a");
  if ("IntersectionObserver" in window) {
    var sio = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var id = entry.target.id;
            navAnchors.forEach(function (a) {
              a.classList.toggle("is-active", a.getAttribute("href") === "#" + id);
            });
          }
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    sections.forEach(function (s) { sio.observe(s); });
  }
})();
