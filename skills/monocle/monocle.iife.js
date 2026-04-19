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
  var BUDGE_FALLBACK_SRC = "https://skills-pearl.vercel.app/budge.iife.js";
  var BUDGE_CONFIG_ID = "__monocle_budge_config";
  var BUDGE_SCRIPT_ID = "__monocle_budge_script";

  function resolveBudgeSrc() {
    var cfg = readConfig();
    if (cfg.budgeSrc) return cfg.budgeSrc;
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src;
      if (src && /monocle\.iife\.js(\?.*)?$/.test(src)) {
        return src.replace(/monocle\.iife\.js(\?.*)?$/, "budge.iife.js");
      }
    }
    return BUDGE_FALLBACK_SRC;
  }

  var hoverState = { row: null, el: null };

  function ensureBudgeLoaded() {
    if (document.getElementById(BUDGE_SCRIPT_ID)) return;
    var src = resolveBudgeSrc();
    if (document.querySelector('script[src="' + src + '"]')) return;
    var s = document.createElement("script");
    s.id = BUDGE_SCRIPT_ID;
    s.src = src;
    s.async = false;
    document.head.appendChild(s);
  }

  function clearBudgeTarget() {
    var prev = document.querySelector("[data-budge-target]");
    if (prev) prev.removeAttribute("data-budge-target");
  }

  function buildSlidesFor(el) {
    var cs = getComputedStyle(el);
    function px(name) {
      var v = parseFloat(cs.getPropertyValue(name));
      return isNaN(v) ? 0 : Math.round(v);
    }
    return [
      { label: "padding", property: "padding", min: 0, max: 96,
        value: px("padding-top"), original: px("padding-top"), unit: "px", scale: null },
      { label: "border-radius", property: "border-radius", min: 0, max: 64,
        value: px("border-top-left-radius"), original: px("border-top-left-radius"), unit: "px", scale: null },
      { label: "gap", property: "gap", min: 0, max: 96,
        value: px("gap"), original: px("gap"), unit: "px", scale: null },
      { label: "font-size", property: "font-size", min: 8, max: 96,
        value: px("font-size"), original: px("font-size"), unit: "px", scale: null },
    ];
  }

  function openBudgeFor(el) {
    if (!el) return;
    if (
      document.activeElement &&
      document.activeElement !== document.body &&
      document.activeElement.blur
    ) {
      try {
        document.activeElement.blur();
      } catch (err) {}
    }
    clearHover();
    clearBudgeTarget();
    el.setAttribute("data-budge-target", "");
    var slides = buildSlidesFor(el);
    var payload = JSON.stringify({ slides: slides, autoFocus: true });
    var cfg = document.getElementById(BUDGE_CONFIG_ID);
    if (!cfg) {
      cfg = document.createElement("div");
      cfg.id = BUDGE_CONFIG_ID;
      cfg.hidden = true;
      document.body.appendChild(cfg);
      cfg.setAttribute("data-budge", payload);
      showBudgeRing();
      return;
    }
    cfg.removeAttribute("data-budge");
    setTimeout(function () {
      cfg.setAttribute("data-budge", payload);
      showBudgeRing();
    }, 0);
  }

  function closeBudge() {
    var cfg = document.getElementById(BUDGE_CONFIG_ID);
    if (cfg) cfg.remove();
    clearBudgeTarget();
    clearBudgeIdleTimer();
    var ring = document.getElementById("__monocle_ring");
    if (ring) ring.setAttribute("data-show", "0");
  }

  function isCollapsed() {
    var panel = document.getElementById("__monocle_panel");
    return !!(panel && panel.getAttribute("data-collapsed") === "1");
  }

  function setCollapsed(collapsed) {
    var panel = document.getElementById("__monocle_panel");
    if (!panel) return;
    panel.setAttribute("data-collapsed", collapsed ? "1" : "0");
    document.documentElement.setAttribute(
      "data-monocle-collapsed",
      collapsed ? "1" : "0",
    );
    if (collapsed) {
      clearHover();
      clearBudgeIdleTimer();
      var ring = document.getElementById("__monocle_ring");
      if (ring) ring.setAttribute("data-show", "0");
    } else if (document.getElementById(BUDGE_CONFIG_ID)) {
      showBudgeRing();
    }
  }

  var budgeIdleTimer = null;
  var BUDGE_IDLE_MS = 400;

  function clearBudgeIdleTimer() {
    if (budgeIdleTimer) {
      clearTimeout(budgeIdleTimer);
      budgeIdleTimer = null;
    }
  }

  function showBudgeRing() {
    var targetEl = document.querySelector("[data-budge-target]");
    if (!targetEl) return;
    var ring = document.getElementById("__monocle_ring") || createRing();
    positionRing(ring, targetEl);
  }

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
      "  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;",
      "  font-size: 12px; line-height: 16px; -webkit-font-smoothing: antialiased;",
      "  -moz-osx-font-smoothing: grayscale; font-synthesis: none; color: rgba(255,255,255,0.9); }",
      "#__monocle_panel { display: flex; flex-direction: column; width: 240px; height: 334px;",
      "  background: #2A2A2A; border-radius: 14px; overflow: hidden;",
      "  box-shadow: 0 1px 2px rgba(0,0,0,0.1), 0 10px 30px rgba(0,0,0,0.3); }",
      "#__monocle_panel[data-collapsed='1'] { height: auto; }",
      "#__monocle_panel[data-collapsed='1'] #__monocle_pages,",
      "#__monocle_panel[data-collapsed='1'] .__monocle_sep,",
      "#__monocle_panel[data-collapsed='1'] #__monocle_list { display: none; }",
      "#__monocle_head { display: flex; align-items: center; gap: 4px; padding: 8px 10px;",
      "  user-select: none; cursor: pointer; flex-shrink: 0; }",
      "#__monocle_head_icon { position: relative; display: flex; align-items: center;",
      "  justify-content: center; flex-shrink: 0; width: 28px; height: 28px;",
      "  border-radius: 5px; margin: -4px; }",
      "#__monocle_head_name { display: flex; align-items: center; height: 24px;",
      "  border-radius: 2px; padding: 0 6px; overflow: hidden; color: rgba(255,255,255,0.9);",
      "  font-weight: 500; font-size: 13px; line-height: 16px; text-align: center;",
      "  white-space: nowrap; text-overflow: ellipsis; flex: 1; min-width: 0; }",
      "#__monocle_pages { display: flex; flex-direction: column; flex-shrink: 0; }",
      "#__monocle_pages_head { display: flex; align-items: center; height: 24px;",
      "  justify-content: space-between; margin: 8px 0 2px 0; padding-right: 12px; flex-shrink: 0; }",
      ".__monocle_pages_label_wrap { display: flex; align-items: center; height: 100%; padding-right: 4px; }",
      ".__monocle_pages_chev { display: flex; align-items: center; justify-content: center;",
      "  flex-shrink: 0; height: 100%; width: 20px; }",
      ".__monocle_pages_label { color: rgba(255,255,255,0.9); font-weight: 500;",
      "  font-size: 12px; line-height: 16px; }",
      ".__monocle_plus { display: flex; align-items: center; justify-content: center;",
      "  position: relative; flex-shrink: 0; border-radius: 5px; margin: -4px; width: 24px; height: 24px; }",
      "#__monocle_pages_list { max-height: 156px; padding-bottom: 6px; overflow: hidden; }",
      ".__monocle_row { display: flex; align-items: center; flex-shrink: 0; height: 28px;",
      "  min-width: 100%; width: -moz-fit-content; width: fit-content; word-break: keep-all;",
      "  cursor: default; }",
      ".__monocle_row:hover, .__monocle_row[data-active='1'] { background: rgba(255,255,255,0.05); }",
      ".__monocle_indent { display: flex; align-items: center; justify-content: center;",
      "  flex-shrink: 0; height: 100%; width: 20px; }",
      ".__monocle_frame_icon { display: flex; align-items: center; justify-content: center;",
      "  opacity: 0.6; flex-shrink: 0; width: 12px; height: 12px; position: relative; }",
      ".__monocle_row_name { align-self: stretch; flex-grow: 1; margin-left: 8px;",
      "  align-content: center; color: rgba(255,255,255,0.9); font-size: 12px; line-height: 16px;",
      "  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }",
      ".__monocle_row_trail { display: flex; align-items: center; justify-content: flex-end;",
      "  width: 45px; flex-shrink: 0; padding-right: 10px; gap: 4px; }",
      ".__monocle_page_check { display: flex; align-items: center; justify-content: center;",
      "  margin-right: 12px; width: 16px; flex-shrink: 0; }",
      "#__monocle_list { flex: 1; min-height: 0; overflow: auto; padding: 6px 0;",
      "  position: relative; }",
      ".__monocle_sep { height: 1px; background: rgba(255,255,255,0.06); margin: 0; flex-shrink: 0; }",
      ".__monocle_paper_btn { display: none; background: none; border: 0; padding: 2px 6px;",
      "  cursor: pointer; color: rgba(255,255,255,0.65); border-radius: 3px; font-size: 11px;",
      "  font-family: inherit; }",
      ".__monocle_paper_btn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.9); }",
      ".__monocle_row:hover .__monocle_paper_btn { display: inline-block; }",
      ".__monocle_empty { padding: 12px 16px; color: rgba(255,255,255,0.5); font-size: 12px; }",
      "#__monocle_ring { position: fixed; pointer-events: none; z-index: 2147483646;",
      "  border: 2px solid rgba(0,120,255,0.85); border-radius: 4px;",
      "  box-shadow: 0 0 0 4px rgba(0,120,255,0.15); transition: all 80ms ease-out;",
      "  opacity: 0; }",
      "#__monocle_ring[data-show='1'] { opacity: 1; }",
      "html[data-monocle-collapsed='1'] [data-isolet='budge-widget'] { display: none !important; }",
      "html[data-monocle-collapsed='1'] #__monocle_ring { display: none !important; }",
    ].join("\n");
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  var ICON_MONOCLE =
    '<svg width="13" height="13" viewBox="0 0 13 13" fill="rgba(255,255,255,0.5)" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M2 0V2H8V8H2V2H0V13H8V8H13V0H2Z"/></svg>';
  var ICON_CHEVRON =
    '<svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="1" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M1 2.5L4 5.5L7 2.5"/></svg>';
  var ICON_PLUS =
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M5 0V10M0 5H10"/></svg>';
  var ICON_PAGE =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12.5 5.5L9.5 2.5H4.5C3.948 2.5 3.5 2.948 3.5 3.5V12.5C3.5 13.052 3.948 13.5 4.5 13.5H11.5C12.052 13.5 12.5 13.052 12.5 12.5V5.5Z" fill="rgba(255,255,255,0.11)"/>' +
    '<path d="M12.5 5.5L9.5 2.5M12.5 5.5V12.5C12.5 13.052 12.052 13.5 11.5 13.5H4.5C3.948 13.5 3.5 13.052 3.5 12.5V3.5C3.5 2.948 3.948 2.5 4.5 2.5H9.5M12.5 5.5H9.5V2.5" stroke="rgba(255,255,255,0.9)"/></svg>';
  var ICON_CHECK =
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M1.75 5.75L4.516 8.25L8.75 1.75"/></svg>';
  var ICON_FRAME =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="3" y="3" width="10" height="10" fill="rgba(255,255,255,0.11)"/>' +
    '<path d="M4 9L4 12H7V13H4H3V12V9H4Z" fill="rgba(255,255,255,0.9)"/>' +
    '<path d="M7 3H4H3V4V7H4L4 4H7V3Z" fill="rgba(255,255,255,0.9)"/>' +
    '<path d="M9 3H12H13V4V7H12V4H9V3Z" fill="rgba(255,255,255,0.9)"/>' +
    '<path d="M12 9V12H9V13H12H13V12V9H12Z" fill="rgba(255,255,255,0.9)"/></svg>';

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
    var startCollapsed =
      config.open === false ||
      document.documentElement.getAttribute("data-monocle-collapsed") === "1";
    if (startCollapsed) panel.setAttribute("data-collapsed", "1");
    document.documentElement.setAttribute(
      "data-monocle-collapsed",
      startCollapsed ? "1" : "0",
    );

    var head = document.createElement("div");
    head.id = "__monocle_head";
    var headIcon = document.createElement("div");
    headIcon.id = "__monocle_head_icon";
    headIcon.innerHTML = ICON_MONOCLE;
    var headName = document.createElement("div");
    headName.id = "__monocle_head_name";
    headName.textContent = config.title || "monocle";
    head.appendChild(headIcon);
    head.appendChild(headName);
    head.addEventListener("click", function () {
      setCollapsed(panel.getAttribute("data-collapsed") !== "1");
    });
    panel.appendChild(head);

    var pages = document.createElement("div");
    pages.id = "__monocle_pages";

    var pagesHead = document.createElement("div");
    pagesHead.id = "__monocle_pages_head";
    var pagesLabelWrap = document.createElement("div");
    pagesLabelWrap.className = "__monocle_pages_label_wrap";
    var pagesChev = document.createElement("div");
    pagesChev.className = "__monocle_pages_chev";
    pagesChev.innerHTML = ICON_CHEVRON;
    var pagesLabel = document.createElement("div");
    pagesLabel.className = "__monocle_pages_label";
    pagesLabel.textContent = "Pages";
    pagesLabelWrap.appendChild(pagesChev);
    pagesLabelWrap.appendChild(pagesLabel);
    var plus = document.createElement("div");
    plus.className = "__monocle_plus";
    plus.innerHTML = ICON_PLUS;
    pagesHead.appendChild(pagesLabelWrap);
    pagesHead.appendChild(plus);
    pages.appendChild(pagesHead);

    var pagesList = document.createElement("div");
    pagesList.id = "__monocle_pages_list";
    var pageRow = document.createElement("div");
    pageRow.className = "__monocle_row";
    var pageIndent = document.createElement("div");
    pageIndent.className = "__monocle_indent";
    var pageIcon = document.createElement("div");
    pageIcon.className = "__monocle_frame_icon";
    pageIcon.innerHTML = ICON_PAGE;
    var pageName = document.createElement("div");
    pageName.className = "__monocle_row_name";
    pageName.textContent = "Page 1";
    var pageCheck = document.createElement("div");
    pageCheck.className = "__monocle_page_check";
    pageCheck.innerHTML = ICON_CHECK;
    pageRow.appendChild(pageIndent);
    pageRow.appendChild(pageIcon);
    pageRow.appendChild(pageName);
    pageRow.appendChild(pageCheck);
    pagesList.appendChild(pageRow);
    pages.appendChild(pagesList);
    panel.appendChild(pages);

    var sep = document.createElement("div");
    sep.className = "__monocle_sep";
    panel.appendChild(sep);

    var list = document.createElement("div");
    list.id = "__monocle_list";

    var template = config.link || DEFAULT_LINK;

    nodes.forEach(function (n) {
      var row = document.createElement("div");
      row.className = "__monocle_row";
      row.setAttribute("data-node", n.node);

      var indent = document.createElement("div");
      indent.className = "__monocle_indent";
      row.appendChild(indent);

      var frameIcon = document.createElement("div");
      frameIcon.className = "__monocle_frame_icon";
      frameIcon.innerHTML = ICON_FRAME;
      row.appendChild(frameIcon);

      var name = document.createElement("div");
      name.className = "__monocle_row_name";
      name.textContent = n.name;
      row.appendChild(name);

      var trail = document.createElement("div");
      trail.className = "__monocle_row_trail";
      var openBtn = document.createElement("button");
      openBtn.className = "__monocle_paper_btn";
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
      trail.appendChild(openBtn);
      row.appendChild(trail);

      row.addEventListener("click", function () {
        n.el.scrollIntoView({ behavior: "smooth", block: "center" });
        openBudgeFor(n.el);
      });

      list.appendChild(row);
    });

    if (nodes.length === 0) {
      var empty = document.createElement("div");
      empty.className = "__monocle_empty";
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
    ensureBudgeLoaded();
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
      if (document.getElementById(BUDGE_CONFIG_ID)) {
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

    document.addEventListener("keydown", function (e) {
      if (document.getElementById(BUDGE_CONFIG_ID)) {
        var r = document.getElementById("__monocle_ring");
        if (r) r.setAttribute("data-show", "0");
        clearBudgeIdleTimer();
        budgeIdleTimer = setTimeout(function () {
          if (document.getElementById(BUDGE_CONFIG_ID)) showBudgeRing();
        }, BUDGE_IDLE_MS);
      }
      if (
        (e.key === "Escape" || e.key === "Enter") &&
        document.getElementById(BUDGE_CONFIG_ID)
      ) {
        closeBudge();
        return;
      }
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.altKey) return;
      if (e.key !== "M" && e.key !== "m") return;
      var panel = document.getElementById("__monocle_panel");
      if (!panel) return;
      e.preventDefault();
      setCollapsed(panel.getAttribute("data-collapsed") !== "1");
    });

    document.addEventListener(
      "click",
      function (e) {
        var panel = document.getElementById("__monocle_panel");
        if (!panel || panel.getAttribute("data-collapsed") === "1") return;
        var target = e.target;
        if (!target || target.nodeType !== 1) return;
        if (target.closest("#" + ROOT_ID)) return;
        if (target.closest('[data-isolet="budge-widget"]')) return;
        var paperEl = target.closest("[data-paper-node]");
        if (paperEl) {
          e.preventDefault();
          e.stopPropagation();
          openBudgeFor(paperEl);
          return;
        }
        if (document.getElementById(BUDGE_CONFIG_ID)) {
          closeBudge();
        }
      },
      true,
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
