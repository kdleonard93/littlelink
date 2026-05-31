/*
* Digital Dopamine — interactive neural background + theme toggle
* Vanilla JS, no dependencies. Respects prefers-reduced-motion.
*/
(function () {
  "use strict";

  /* ── Theme toggle ──────────────────────────────────────────────────── */
  var root = document.documentElement;
  var STORAGE_KEY = "dd-theme";

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  // Resolve the theme currently shown (light | dark), accounting for "auto".
  function resolvedTheme() {
    if (root.classList.contains("theme-dark")) return "dark";
    if (root.classList.contains("theme-light")) return "light";
    return systemPrefersDark() ? "dark" : "light";
  }

  function applyTheme(theme) {
    root.classList.remove("theme-auto", "theme-light", "theme-dark");
    root.classList.add("theme-" + theme);
  }

  // Restore a saved explicit choice; otherwise leave the markup's theme-auto.
  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") applyTheme(saved);
  } catch (e) { /* storage may be blocked */ }

  var toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = resolvedTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
      if (window.__ddNeural) window.__ddNeural.refreshColors();
    });
  }

  /* ── Entrance animations ───────────────────────────────────────────── */
  // Add on next frame so initial styles paint first (clean fade-in).
  requestAnimationFrame(function () { document.body.classList.add("dd-ready"); });

  /* ── Neural network canvas ─────────────────────────────────────────── */
  var canvas = document.getElementById("neural");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var W = 0, H = 0, dpr = 1;
  var nodes = [];
  var mouse = { x: -9999, y: -9999, active: false };
  var LINK_DIST = 140;      // px: max distance to draw a connecting line
  var MOUSE_DIST = 190;     // px: cursor influence radius
  var rafId = null;

  // Palette endpoints (cyan → magenta), tuned per theme for contrast.
  var colors = { a: [34, 211, 238], b: [217, 70, 239], lineAlpha: 1, dot: 1 };

  function refreshColors() {
    var dark = resolvedTheme() === "dark";
    colors.a = [34, 211, 238];     // cyan
    colors.b = [217, 70, 239];     // magenta
    colors.lineAlpha = dark ? 1 : 0.55;
    colors.dot = dark ? 1 : 0.7;
  }

  function lerpColor(t) {
    return [
      Math.round(colors.a[0] + (colors.b[0] - colors.a[0]) * t),
      Math.round(colors.a[1] + (colors.b[1] - colors.a[1]) * t),
      Math.round(colors.a[2] + (colors.b[2] - colors.a[2]) * t)
    ];
  }

  function nodeCount() {
    // Scale with area, capped for performance on large/small screens.
    var target = Math.round((W * H) / 16000);
    return Math.max(28, Math.min(110, target));
  }

  function makeNodes() {
    var n = nodeCount();
    nodes = [];
    for (var i = 0; i < n; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.6 + 1.2,
        t: Math.random() // color position along the gradient
      });
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    makeNodes();
  }

  function step() {
    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < nodes.length; i++) {
      var p = nodes[i];
      p.x += p.vx;
      p.y += p.vy;

      // Wrap softly around the edges.
      if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;

      // Gentle cursor attraction for a "reaching" feel.
      if (mouse.active) {
        var mdx = mouse.x - p.x, mdy = mouse.y - p.y;
        var md = Math.sqrt(mdx * mdx + mdy * mdy);
        if (md < MOUSE_DIST && md > 0.01) {
          var pull = (1 - md / MOUSE_DIST) * 0.4;
          p.x += (mdx / md) * pull;
          p.y += (mdy / md) * pull;
        }
      }
    }

    // Connections between nearby nodes.
    for (var a = 0; a < nodes.length; a++) {
      var n1 = nodes[a];
      for (var b = a + 1; b < nodes.length; b++) {
        var n2 = nodes[b];
        var dx = n1.x - n2.x, dy = n1.y - n2.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LINK_DIST) {
          var alpha = (1 - dist / LINK_DIST) * 0.5 * colors.lineAlpha;
          var c = lerpColor((n1.t + n2.t) / 2);
          ctx.strokeStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + alpha + ")";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(n1.x, n1.y);
          ctx.lineTo(n2.x, n2.y);
          ctx.stroke();
        }
      }

      // Brighter links to the cursor.
      if (mouse.active) {
        var ddx = n1.x - mouse.x, ddy = n1.y - mouse.y;
        var dm = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dm < MOUSE_DIST) {
          var ma = (1 - dm / MOUSE_DIST) * 0.7 * colors.lineAlpha;
          var mc = lerpColor(n1.t);
          ctx.strokeStyle = "rgba(" + mc[0] + "," + mc[1] + "," + mc[2] + "," + ma + ")";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(n1.x, n1.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }
    }

    // Nodes on top, with a soft glow.
    for (var k = 0; k < nodes.length; k++) {
      var nn = nodes[k];
      var col = lerpColor(nn.t);
      var rgb = col[0] + "," + col[1] + "," + col[2];
      ctx.beginPath();
      ctx.arc(nn.x, nn.y, nn.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + rgb + "," + colors.dot + ")";
      ctx.shadowColor = "rgba(" + rgb + ",0.9)";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function loop() {
    step();
    rafId = requestAnimationFrame(loop);
  }

  function start() { if (rafId == null) loop(); }
  function stop() { if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; } }

  // Track cursor (and touch) for interactivity.
  window.addEventListener("pointermove", function (e) {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
  }, { passive: true });
  window.addEventListener("pointerleave", function () { mouse.active = false; });
  window.addEventListener("blur", function () { mouse.active = false; });

  // Resize (debounced).
  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  // Pause the loop when the tab is hidden to save battery.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else if (!reduceMotion) start();
  });

  // Expose a hook so the theme toggle can re-tint the canvas.
  window.__ddNeural = { refreshColors: refreshColors };

  refreshColors();
  resize();
  if (reduceMotion) {
    step(); // render a single static frame
  } else {
    start();
  }
})();
