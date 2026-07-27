(() => {
  "use strict";

  const SERIES_COLORS = [
    "var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)",
    "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)",
  ];

  const state = {
    sessionId: null,
    variables: [],
    activeVar: null,
    activeTab: "describe",
  };

  const el = (id) => document.getElementById(id);
  const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n) ? "—" : Number(n).toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: 0 }));
  const fmtP = (p) => (p < 0.001 ? "< 0.001" : fmt(p, 3));

  // ---------- Theme ----------
  function initTheme() {
    const saved = localStorage.getItem("pretest-theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    updateThemeIcon();
  }
  function updateThemeIcon() {
    const current = document.documentElement.getAttribute("data-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = current ? current === "dark" : prefersDark;
    el("themeIcon").innerHTML = isDark ? "&#9788;" : "&#9789;";
  }
  el("themeToggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = current ? current === "dark" : prefersDark;
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("pretest-theme", next);
    updateThemeIcon();
  });
  initTheme();

  // ---------- Tooltip ----------
  const tooltipEl = el("tooltip");
  function showTooltip(evt, text) {
    tooltipEl.textContent = text;
    tooltipEl.hidden = false;
    tooltipEl.style.left = evt.clientX + "px";
    tooltipEl.style.top = (evt.clientY - 10) + "px";
  }
  function moveTooltip(evt) {
    tooltipEl.style.left = evt.clientX + "px";
    tooltipEl.style.top = (evt.clientY - 10) + "px";
  }
  function hideTooltip() { tooltipEl.hidden = true; }

  // ---------- Upload ----------
  const dropzone = el("dropzone");
  const fileInput = el("fileInput");
  const uploadStatus = el("uploadStatus");

  ["dragenter", "dragover"].forEach((evtName) =>
    dropzone.addEventListener(evtName, (e) => { e.preventDefault(); dropzone.classList.add("is-dragover"); })
  );
  ["dragleave", "drop"].forEach((evtName) =>
    dropzone.addEventListener(evtName, (e) => { e.preventDefault(); dropzone.classList.remove("is-dragover"); })
  );
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) handleUpload(fileInput.files[0]);
  });

  function setUploadStatus(message, type) {
    uploadStatus.hidden = !message;
    uploadStatus.textContent = message || "";
    uploadStatus.className = "upload-status" + (type ? ` is-${type}` : "");
  }

  async function handleUpload(file) {
    const validExt = /\.(xlsx|xls|dta|sav)$/i.test(file.name);
    if (!validExt) {
      setUploadStatus("Formato no soportado. Usa .xlsx, .xls, .dta o .sav.", "error");
      return;
    }
    setUploadStatus("Procesando archivo…", "loading");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al procesar el archivo.");
      setUploadStatus("", null);
      onDatasetLoaded(data);
    } catch (err) {
      setUploadStatus(err.message, "error");
    }
  }

  function onDatasetLoaded(data) {
    state.sessionId = data.session_id;
    state.variables = data.variables;
    state.activeVar = null;

    el("fileMeta").textContent = `${data.filename} · ${data.n_rows.toLocaleString("es-ES")} filas · ${data.n_cols} variables`;
    el("resetBtn").hidden = false;
    el("uploadScreen").hidden = true;
    el("appScreen").hidden = false;

    renderVarList("");
    populateCrossSelects();
    el("describeEmpty").hidden = false;
    el("describeContent").hidden = true;
    el("crosstabEmpty").hidden = false;
    el("crosstabContent").hidden = true;
  }

  el("resetBtn").addEventListener("click", async () => {
    if (state.sessionId) {
      fetch(`/api/session/${state.sessionId}`, { method: "DELETE" }).catch(() => {});
    }
    state.sessionId = null;
    state.variables = [];
    state.activeVar = null;
    fileInput.value = "";
    el("fileMeta").textContent = "Sube un archivo para empezar";
    el("resetBtn").hidden = true;
    el("appScreen").hidden = true;
    el("uploadScreen").hidden = false;
    setUploadStatus("", null);
  });

  // ---------- Sidebar / variable list ----------
  el("varSearch").addEventListener("input", (e) => renderVarList(e.target.value));

  function renderVarList(filterText) {
    const list = el("varList");
    const filtered = state.variables.filter((v) =>
      v.name.toLowerCase().includes(filterText.trim().toLowerCase())
    );
    list.innerHTML = "";
    filtered.forEach((v) => {
      const item = document.createElement("div");
      item.className = "var-item" + (state.activeVar === v.name ? " is-active" : "");
      item.innerHTML = `
        <div style="min-width:0">
          <div class="var-item__name">${escapeHtml(v.name)}</div>
          <div class="var-item__meta">${v.n_unique} valores · ${v.n_missing} perdidos</div>
        </div>
        <span class="badge badge--${v.role}">${v.role === "numeric" ? "num" : "cat"}</span>
      `;
      item.addEventListener("click", () => selectVariable(v.name));
      list.appendChild(item);
    });
  }

  async function selectVariable(name) {
    state.activeVar = name;
    renderVarList(el("varSearch").value);
    el("describeEmpty").hidden = true;
    const content = el("describeContent");
    content.hidden = false;
    content.innerHTML = `<div class="empty-state">Cargando…</div>`;

    try {
      const res = await fetch(`/api/variable/${state.sessionId}/${encodeURIComponent(name)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al cargar la variable.");
      renderDescribe(name, data);
    } catch (err) {
      content.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderDescribe(name, data) {
    const content = el("describeContent");
    if (data.role === "numeric") {
      const s = data.stats;
      content.innerHTML = `
        <div class="card">
          <h3>${escapeHtml(name)} <span class="badge badge--numeric">numérica</span></h3>
          <div class="stat-grid">
            ${statTile("N", s.n)}
            ${statTile("Perdidos", s.missing)}
            ${statTile("Media", fmt(s.mean))}
            ${statTile("Desv. típica", fmt(s.sd))}
            ${statTile("Mínimo", fmt(s.min))}
            ${statTile("P25", fmt(s.p25))}
            ${statTile("Mediana", fmt(s.median))}
            ${statTile("P75", fmt(s.p75))}
            ${statTile("Máximo", fmt(s.max))}
          </div>
        </div>
        <div class="card">
          <h3>Distribución (histograma)</h3>
          <div id="histChart" class="chart"></div>
        </div>
      `;
      renderHistogram(el("histChart"), data.histogram);
    } else {
      const s = data.stats;
      content.innerHTML = `
        <div class="card">
          <h3>${escapeHtml(name)} <span class="badge badge--categorical">categórica</span></h3>
          <div class="stat-grid">
            ${statTile("N", s.n)}
            ${statTile("Perdidos", s.missing)}
            ${statTile("Categorías", s.n_unique)}
          </div>
        </div>
        <div class="card">
          <h3>Frecuencias</h3>
          <div id="freqChart" class="chart chart--horizontal"></div>
          <table style="margin-top:20px">
            <thead><tr><th>Categoría</th><th>N</th><th>%</th></tr></thead>
            <tbody>
              ${data.frequencies.map((f) => `<tr><td>${escapeHtml(f.label)}</td><td>${f.count}</td><td>${fmt(f.pct, 1)}%</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      `;
      renderFrequencyChart(el("freqChart"), data.frequencies);
    }
  }

  function statTile(label, value) {
    return `<div class="stat-tile"><span class="stat-tile__label">${label}</span><span class="stat-tile__value">${value}</span></div>`;
  }

  function renderHistogram(container, hist) {
    if (!hist.counts.length) { container.innerHTML = `<div class="empty-state">Sin datos suficientes.</div>`; return; }
    const max = Math.max(...hist.counts, 1);
    container.innerHTML = "";
    hist.counts.forEach((count, i) => {
      const lo = hist.bin_edges[i];
      const hi = hist.bin_edges[i + 1];
      const col = document.createElement("div");
      col.className = "bar-col";
      const heightPct = (count / max) * 100;
      col.innerHTML = `
        <div class="bar-col__shape" style="height:${heightPct}%"></div>
        <span class="bar-col__label">${fmt(lo, 1)}–${fmt(hi, 1)}</span>
      `;
      const shape = col.querySelector(".bar-col__shape");
      shape.addEventListener("mouseenter", (e) => showTooltip(e, `${count} casos`));
      shape.addEventListener("mousemove", moveTooltip);
      shape.addEventListener("mouseleave", hideTooltip);
      container.appendChild(col);
    });
  }

  function renderFrequencyChart(container, frequencies) {
    if (!frequencies.length) { container.innerHTML = `<div class="empty-state">Sin datos.</div>`; return; }
    const max = Math.max(...frequencies.map((f) => f.count), 1);
    const top = frequencies.slice(0, 15);
    container.innerHTML = "";
    top.forEach((f) => {
      const row = document.createElement("div");
      row.className = "hbar-row";
      const widthPct = (f.count / max) * 100;
      row.innerHTML = `
        <span class="hbar-row__label" title="${escapeHtml(f.label)}">${escapeHtml(f.label)}</span>
        <div class="hbar-row__track"><div class="hbar-row__fill" style="width:${widthPct}%"></div></div>
        <span class="hbar-row__value">${f.count} (${fmt(f.pct, 1)}%)</span>
      `;
      const fill = row.querySelector(".hbar-row__fill");
      fill.addEventListener("mouseenter", (e) => showTooltip(e, `${escapeHtml(f.label)}: ${f.count} (${fmt(f.pct, 1)}%)`));
      fill.addEventListener("mousemove", moveTooltip);
      fill.addEventListener("mouseleave", hideTooltip);
      container.appendChild(row);
    });
    if (frequencies.length > 15) {
      const note = document.createElement("div");
      note.className = "text-secondary";
      note.style.fontSize = "12px";
      note.style.marginTop = "8px";
      note.textContent = `Mostrando las 15 categorías más frecuentes de ${frequencies.length}.`;
      container.appendChild(note);
    }
  }

  // ---------- Tabs ----------
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("is-active"));
      tab.classList.add("is-active");
      el(tab.dataset.tab === "describe" ? "tabDescribe" : "tabCrosstab").classList.add("is-active");
    });
  });

  // ---------- Crosstab ----------
  function populateCrossSelects() {
    const categorical = state.variables.filter((v) => v.role === "categorical");
    const options = categorical.map((v) => `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)}</option>`).join("");
    el("crossVar1").innerHTML = options;
    el("crossVar2").innerHTML = options;
    if (categorical.length > 1) el("crossVar2").selectedIndex = 1;
  }

  el("crossBtn").addEventListener("click", async () => {
    const var1 = el("crossVar1").value;
    const var2 = el("crossVar2").value;
    if (!var1 || !var2) return;
    if (var1 === var2) {
      renderCrosstabError("Elige dos variables distintas.");
      return;
    }
    const content = el("crosstabContent");
    el("crosstabEmpty").hidden = true;
    content.hidden = false;
    content.innerHTML = `<div class="empty-state">Calculando…</div>`;
    try {
      const res = await fetch(`/api/crosstab/${state.sessionId}?var1=${encodeURIComponent(var1)}&var2=${encodeURIComponent(var2)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al calcular la tabla cruzada.");
      renderCrosstab(data);
    } catch (err) {
      renderCrosstabError(err.message);
    }
  });

  function renderCrosstabError(message) {
    const content = el("crosstabContent");
    el("crosstabEmpty").hidden = true;
    content.hidden = false;
    content.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function renderCrosstab(data) {
    const content = el("crosstabContent");
    const chi2 = data.chi2;
    const verdictClass = chi2.significant_at_05 ? "chi2-verdict--sig" : "chi2-verdict--nonsig";
    const verdictText = chi2.significant_at_05
      ? "Asociación significativa (p < 0.05)"
      : "Sin evidencia de asociación (p ≥ 0.05)";

    let tableRows = "";
    data.row_labels.forEach((rowLabel, i) => {
      const cells = data.table[i].map((v) => `<td>${v}</td>`).join("");
      tableRows += `<tr><td>${escapeHtml(rowLabel)}</td>${cells}<td>${data.row_totals[i]}</td></tr>`;
    });
    const colTotalsCells = data.col_totals.map((v) => `<td>${v}</td>`).join("");

    content.innerHTML = `
      <div class="card">
        <h3>Tabla de contingencia: ${escapeHtml(data.var1)} × ${escapeHtml(data.var2)}</h3>
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr><th></th>${data.col_labels.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}<th>Total</th></tr>
            </thead>
            <tbody>${tableRows}</tbody>
            <tfoot>
              <tr><td>Total</td>${colTotalsCells}<td>${data.total}</td></tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div class="card">
        <h3>Test de chi-cuadrado</h3>
        <div class="chi2-panel">
          <span class="chi2-verdict ${verdictClass}">${verdictText}</span>
          <div class="stat-grid" style="flex:1">
            ${statTile("χ²", fmt(chi2.statistic))}
            ${statTile("gl", chi2.dof)}
            ${statTile("p-valor", fmtP(chi2.p_value))}
            ${statTile("V de Cramér", fmt(data.cramers_v, 3))}
          </div>
        </div>
        ${data.low_expected_warning ? `<p class="warning-note">Algunas celdas tienen una frecuencia esperada &lt; 5: el test de chi-cuadrado puede no ser fiable con esta tabla.</p>` : ""}
      </div>
      <div class="card">
        <h3>Gráfico de barras agrupadas</h3>
        <div id="crossChart"></div>
      </div>
    `;
    renderGroupedChart(el("crossChart"), data);
  }

  function renderGroupedChart(container, data) {
    const MAX_SERIES = 8;
    let colLabels = data.col_labels;
    let table = data.table;

    if (colLabels.length > MAX_SERIES) {
      const kept = MAX_SERIES - 1;
      const newTable = table.map((row) => {
        const keptVals = row.slice(0, kept);
        const otherSum = row.slice(kept).reduce((a, b) => a + b, 0);
        return [...keptVals, otherSum];
      });
      colLabels = [...colLabels.slice(0, kept), "Otros"];
      table = newTable;
    }

    const max = Math.max(...table.flat(), 1);
    const wrap = document.createElement("div");
    wrap.className = "grouped-chart-wrap";
    const chart = document.createElement("div");
    chart.className = "grouped-chart";

    data.row_labels.forEach((rowLabel, i) => {
      const group = document.createElement("div");
      group.className = "grouped-chart__group";
      table[i].forEach((value, j) => {
        const bar = document.createElement("div");
        bar.className = "grouped-chart__bar";
        bar.style.height = `${(value / max) * 100}%`;
        bar.style.background = SERIES_COLORS[j % SERIES_COLORS.length];
        bar.addEventListener("mouseenter", (e) => showTooltip(e, `${escapeHtml(rowLabel)} · ${escapeHtml(colLabels[j])}: ${value}`));
        bar.addEventListener("mousemove", moveTooltip);
        bar.addEventListener("mouseleave", hideTooltip);
        group.appendChild(bar);
      });
      chart.appendChild(group);
    });

    const labels = document.createElement("div");
    labels.className = "grouped-chart-labels";
    data.row_labels.forEach((rowLabel) => {
      const span = document.createElement("span");
      span.textContent = rowLabel;
      span.title = rowLabel;
      labels.appendChild(span);
    });

    const legend = document.createElement("div");
    legend.className = "legend";
    colLabels.forEach((label, j) => {
      const item = document.createElement("span");
      item.className = "legend__item";
      item.innerHTML = `<span class="legend__swatch" style="background:${SERIES_COLORS[j % SERIES_COLORS.length]}"></span>${escapeHtml(label)}`;
      legend.appendChild(item);
    });

    wrap.appendChild(chart);
    wrap.appendChild(labels);
    container.innerHTML = "";
    container.appendChild(wrap);
    container.appendChild(legend);
  }

  // ---------- Utils ----------
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
