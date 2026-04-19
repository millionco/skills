/**
 * monocle — layer inspector for pages assembled from Paper-exported components.
 *
 * Scans the DOM for elements carrying `data-paper-node="<nodeId>"` and renders
 * a floating panel that lets you hover/hide/deep-link back to the Paper frame
 * each node came from.
 *
 * Config (optional): place a hidden element in the DOM with JSON config:
 *   <div data-monocle='{"fileId":"01KN3QGZ...","open":true}' hidden></div>
 *
 * Fields:
 *   fileId   — Paper file ID used to build deep links. If missing, tries
 *              element-level `data-paper-file` first, then falls back to a
 *              copy-node-id prompt.
 *   open     — start with the panel open (default: true).
 *   link     — custom deep-link template. Defaults to
 *              "https://app.paper.design/file/{file}?node={node}".
 *
 * No config element is required — monocle will run with an empty config.
 */
(function () {
  if (typeof document === "undefined") return;
  if (window.__monocle_loaded) return;
  window.__monocle_loaded = true;

  var ROOT_ID = "__monocle_root";
  var STYLE_ID = "__monocle_style";
  var HIDDEN_ATTR = "data-monocle-hidden";
  var DEFAULT_LINK = "https://app.paper.design/file/{file}?node={node}";

  var hoverState = { row: null, el: null };

  function setHover(row, el) {
    if (hoverState.row === row && hoverState.el === el) return;
    if (hoverState.row && hoverState.row !== row) {
      hoverState.row.removeAttribute("data-active");
    }
    hoverState.row = row;
    hoverState.el = el;
    if (row) row.setAttribute("data-active", "1");
    var ring = document.getElementById("__monocle_ring") || createRing();
    positionRing(ring, el);
  }

  function clearHover() {
    var ring = document.getElementById("__monocle_ring");
    if (ring) ring.setAttribute("data-show", "0");
    if (hoverState.row && hoverState.row.isConnected) {
      hoverState.row.removeAttribute("data-active");
    }
    hoverState.row = null;
    hoverState.el = null;
  }

  function readConfig() {
    var el = document.querySelector("[data-monocle]");
    if (!el) return {};
    try {
      return JSON.parse(el.getAttribute("data-monocle") || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function collectNodes() {
    var list = document.querySelectorAll("[data-paper-node]");
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.closest("#" + ROOT_ID)) continue;
      out.push({
        el: el,
        node: el.getAttribute("data-paper-node") || "",
        file: el.getAttribute("data-paper-file") || "",
        name:
          el.getAttribute("data-paper-name") ||
          el.getAttribute("aria-label") ||
          el.id ||
          el.tagName.toLowerCase(),
      });
    }
    return out;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      "#__monocle_root, #__monocle_root * { box-sizing: border-box; }",
      "#__monocle_root { position: fixed; bottom: 16px; left: 16px; z-index: 2147483647;",
      "  font: 500 12px/16px ui-sans-serif, system-ui, sans-serif; color: #1a1a1a; }",
      "#__monocle_panel { background: rgba(255,255,255,0.98); backdrop-filter: blur(8px);",
      "  border: 1px solid rgba(0,0,0,0.08); border-radius: 10px; min-width: 240px;",
      "  max-width: 320px; max-height: 60vh; overflow: hidden; display: flex;",
      "  flex-direction: column; box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08); }",
      "#__monocle_head { display: flex; align-items: center; gap: 8px; padding: 8px 10px;",
      "  border-bottom: 1px solid rgba(0,0,0,0.06); user-select: none; cursor: pointer; }",
      "#__monocle_head:hover { background: rgba(0,0,0,0.03); }",
      "#__monocle_head strong { font-weight: 600; letter-spacing: 0.02em; }",
      "#__monocle_count { color: #888; font-weight: 500; }",
      "#__monocle_toggle { margin-left: auto; background: none; border: 0; padding: 4px;",
      "  cursor: pointer; color: #555; border-radius: 4px; }",
      "#__monocle_toggle:hover { background: rgba(0,0,0,0.05); }",
      "#__monocle_list { overflow: auto; padding: 4px; }",
      ".__monocle_row { display: flex; align-items: center; gap: 6px; padding: 6px 6px;",
      "  border-radius: 6px; cursor: default; }",
      ".__monocle_row:hover, .__monocle_row[data-active='1'] { background: rgba(0,120,255,0.08); }",
      ".__monocle_name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;",
      "  white-space: nowrap; }",
      ".__monocle_id { color: #888; font-variant-numeric: tabular-nums; font-size: 11px; }",
      ".__monocle_btn { background: none; border: 0; padding: 3px 5px; cursor: pointer;",
      "  color: #555; border-radius: 4px; font-size: 11px; }",
      ".__monocle_btn:hover { background: rgba(0,0,0,0.08); color: #111; }",
      "[" + HIDDEN_ATTR + "] { display: none !important; }",
      "#__monocle_ring { position: fixed; pointer-events: none; z-index: 2147483646;",
      "  border: 2px solid rgba(0,120,255,0.85); border-radius: 4px;",
      "  box-shadow: 0 0 0 4px rgba(0,120,255,0.15); transition: all 80ms ease-out;",
      "  opacity: 0; }",
      "#__monocle_ring[data-show='1'] { opacity: 1; }",
      "#__monocle_panel[data-collapsed='1'] #__monocle_list { display: none; }",
    ].join("\n");
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function createRing() {
    var ring = document.getElementById("__monocle_ring");
    if (ring) return ring;
    ring = document.createElement("div");
    ring.id = "__monocle_ring";
    document.body.appendChild(ring);
    return ring;
  }

  function positionRing(ring, el) {
    if (!el || !el.getBoundingClientRect) {
      ring.setAttribute("data-show", "0");
      return;
    }
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      ring.setAttribute("data-show", "0");
      return;
    }
    ring.style.top = r.top + "px";
    ring.style.left = r.left + "px";
    ring.style.width = r.width + "px";
    ring.style.height = r.height + "px";
    ring.setAttribute("data-show", "1");
  }

  function deepLink(template, fileId, nodeId) {
    if (!nodeId) return null;
    if (!fileId) return null;
    return template.replace("{file}", encodeURIComponent(fileId)).replace("{node}", encodeURIComponent(nodeId));
  }

  function render(config) {
    var root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    root.innerHTML = "";

    var nodes = collectNodes();

    var panel = document.createElement("div");
    panel.id = "__monocle_panel";
    if (config.open === false) panel.setAttribute("data-collapsed", "1");

    var head = document.createElement("div");
    head.id = "__monocle_head";
    head.innerHTML =
      "<strong>monocle</strong><span id='__monocle_count'>" + nodes.length + "</span>";

    var toggle = document.createElement("span");
    toggle.id = "__monocle_toggle";
    toggle.textContent = panel.getAttribute("data-collapsed") === "1" ? "+" : "–";
    head.appendChild(toggle);
    head.addEventListener("click", function () {
      var collapsed = panel.getAttribute("data-collapsed") === "1";
      panel.setAttribute("data-collapsed", collapsed ? "0" : "1");
      toggle.textContent = collapsed ? "–" : "+";
      if (!collapsed) clearHover();
    });
    panel.appendChild(head);

    var list = document.createElement("div");
    list.id = "__monocle_list";

    var template = config.link || DEFAULT_LINK;

    nodes.forEach(function (n) {
      var row = document.createElement("div");
      row.className = "__monocle_row";
      row.setAttribute("data-node", n.node);

      var name = document.createElement("span");
      name.className = "__monocle_name";
      name.textContent = n.name;
      row.appendChild(name);

      var idSpan = document.createElement("span");
      idSpan.className = "__monocle_id";
      idSpan.textContent = n.node;
      row.appendChild(idSpan);

      var syncBtn = document.createElement("button");
      syncBtn.className = "__monocle_btn";
      syncBtn.textContent = "sync";
      syncBtn.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      row.appendChild(syncBtn);

      var openBtn = document.createElement("button");
      openBtn.className = "__monocle_btn";
      openBtn.title = "Open in Paper";
      openBtn.textContent = "paper";
      openBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var url = deepLink(template, n.file || config.fileId, n.node);
        if (url) {
          window.open(url, "_blank", "noopener");
          return;
        }
        if (navigator.clipboard && n.node) {
          navigator.clipboard.writeText(n.node);
          openBtn.textContent = "copied";
          setTimeout(function () {
            openBtn.textContent = "paper";
          }, 900);
        }
      });
      row.appendChild(openBtn);

      row.addEventListener("click", function () {
        n.el.scrollIntoView({ behavior: "smooth", block: "center" });
      });

      list.appendChild(row);
    });

    if (nodes.length === 0) {
      var empty = document.createElement("div");
      empty.className = "__monocle_row";
      empty.style.color = "#888";
      empty.textContent = "no [data-paper-node] elements found";
      list.appendChild(empty);
    }

    panel.appendChild(list);
    root.appendChild(panel);
  }

  function sync() {
    injectStyle();
    render(readConfig());
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      sync();
    });
  }

  function init() {
    sync();
    var observer = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "attributes" && m.attributeName === HIDDEN_ATTR) continue;
        if (
          m.target &&
          m.target.id === "__monocle_ring"
        )
          continue;
        if (m.target && m.target.closest && m.target.closest("#" + ROOT_ID)) continue;
        schedule();
        return;
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-paper-node", "data-paper-file", "data-paper-name", "data-monocle"],
    });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener(
      "scroll",
      function () {
        var ring = document.getElementById("__monocle_ring");
        if (ring && ring.getAttribute("data-show") === "1") ring.setAttribute("data-show", "0");
      },
      { passive: true, capture: true },
    );

    document.addEventListener("mouseover", function (e) {
      var panel = document.getElementById("__monocle_panel");
      if (!panel) return;
      if (panel.getAttribute("data-collapsed") === "1") {
        clearHover();
        return;
      }
      var target = e.target;
      if (!target || target.nodeType !== 1) return;
      var row = target.closest(".__monocle_row");
      if (row) {
        var nodeId = row.getAttribute("data-node");
        if (!nodeId) return;
        var el = document.querySelector(
          "[data-paper-node=\"" + CSS.escape(nodeId) + "\"]",
        );
        if (el) setHover(row, el);
        return;
      }
      if (target.closest("#" + ROOT_ID) || target.id === "__monocle_ring") return;
      var paperEl = target.closest("[data-paper-node]");
      if (paperEl) {
        var id = paperEl.getAttribute("data-paper-node");
        var matchingRow = document.querySelector(
          ".__monocle_row[data-node=\"" + CSS.escape(id) + "\"]",
        );
        setHover(matchingRow, paperEl);
        return;
      }
      clearHover();
    });

    document.addEventListener("mouseout", function (e) {
      if (!e.relatedTarget) clearHover();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
