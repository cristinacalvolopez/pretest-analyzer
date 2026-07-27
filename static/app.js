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
    activeVarData: null,
    mrsets: [],
    activeMrset: null,
    varListMode: localStorage.getItem("pretest-varlist-mode") || "name",
    crosstabData: null,
    crosstabMode: "count",
    regressionType: "linear",
  };

  const el = (id) => document.getElementById(id);
  const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n) ? "—" : Number(n).toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: 0 }));
  const fmtP = (p) => (p < 0.001 ? "< 0.001" : fmt(p, 3));

  function varHeadingHtml(name, label) {
    if (label && label !== name) {
      return `${escapeHtml(label)} <span class="var-technical-name">(${escapeHtml(name)})</span>`;
    }
    return escapeHtml(name);
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Ha ocurrido un error.");
    return data;
  }

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

  // ---------- Modal ----------
  const modalOverlay = el("modalOverlay");
  const modalBody = el("modalBody");

  function openModal(html) {
    modalBody.innerHTML = html;
    modalOverlay.hidden = false;
    modalBody.querySelectorAll(".modal-close").forEach((b) => b.addEventListener("click", closeModal));
  }
  function closeModal() {
    modalOverlay.hidden = true;
    modalBody.innerHTML = "";
  }
  modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modalOverlay.hidden) closeModal(); });

  function showModalError(message) {
    const errEl = el("modalError");
    if (errEl) { errEl.hidden = false; errEl.textContent = message; }
  }

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
    state.activeVarData = null;
    state.mrsets = [];
    state.activeMrset = null;

    el("fileMeta").textContent = `${data.filename} · ${data.n_rows.toLocaleString("es-ES")} filas · ${data.n_cols} variables`;
    el("resetBtn").hidden = false;
    el("uploadScreen").hidden = true;
    el("appScreen").hidden = false;

    renderVarList("");
    populateCrossSelects();
    renderMrsetList();
    populateRegressionDependent();

    el("describeEmpty").hidden = false;
    el("describeContent").hidden = true;
    el("crosstabEmpty").hidden = false;
    el("crosstabContent").hidden = true;
    el("mrsetEmpty").hidden = false;
    el("mrsetContent").hidden = true;
    el("regressionEmpty").hidden = false;
    el("regressionContent").hidden = true;
  }

  el("resetBtn").addEventListener("click", async () => {
    if (state.sessionId) {
      fetch(`/api/session/${state.sessionId}`, { method: "DELETE" }).catch(() => {});
    }
    state.sessionId = null;
    state.variables = [];
    state.activeVar = null;
    state.activeVarData = null;
    state.mrsets = [];
    state.activeMrset = null;
    fileInput.value = "";
    el("fileMeta").textContent = "Sube un archivo para empezar";
    el("resetBtn").hidden = true;
    el("appScreen").hidden = true;
    el("uploadScreen").hidden = false;
    setUploadStatus("", null);
  });

  // ---------- Sidebar / variable list ----------
  el("varSearch").addEventListener("input", (e) => renderVarList(e.target.value));

  el("varListModeToggle").querySelectorAll(".segmented__btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.mode === state.varListMode);
    btn.addEventListener("click", () => {
      state.varListMode = btn.dataset.mode;
      localStorage.setItem("pretest-varlist-mode", state.varListMode);
      el("varListModeToggle").querySelectorAll(".segmented__btn").forEach((b) => b.classList.toggle("is-active", b === btn));
      renderVarList(el("varSearch").value);
    });
  });

  function renderVarList(filterText) {
    const list = el("varList");
    const q = filterText.trim().toLowerCase();
    const filtered = state.variables.filter((v) =>
      v.name.toLowerCase().includes(q) || (v.label || "").toLowerCase().includes(q)
    );
    const byLabel = state.varListMode === "label";
    const sorted = [...filtered].sort((a, b) => {
      const av = (byLabel ? (a.label || a.name) : a.name).toLowerCase();
      const bv = (byLabel ? (b.label || b.name) : b.name).toLowerCase();
      return av.localeCompare(bv, "es");
    });
    list.innerHTML = "";
    sorted.forEach((v) => {
      const primary = byLabel ? (v.label || v.name) : v.name;
      const secondary = v.label && v.label !== v.name ? (byLabel ? v.name : v.label) : null;
      const item = document.createElement("div");
      item.className = "var-item" + (state.activeVar === v.name ? " is-active" : "");
      item.innerHTML = `
        <div style="min-width:0">
          <div class="var-item__name" title="${escapeHtml(primary)}">${escapeHtml(primary)}</div>
          <div class="var-item__meta">${secondary ? `${escapeHtml(secondary)} · ` : ""}${v.n_unique} valores · ${v.n_missing} perdidos</div>
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
      state.activeVarData = data;
      renderDescribe(name, data);
    } catch (err) {
      content.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderDescribe(name, data) {
    const content = el("describeContent");
    const actions = `
      <div class="var-actions">
        <button class="btn btn--ghost btn--sm" data-action="rename">Renombrar</button>
        ${data.role === "categorical" ? '<button class="btn btn--ghost btn--sm" data-action="relabel">Editar etiquetas</button>' : ""}
        <button class="btn btn--ghost btn--sm" data-action="recode">Recodificar</button>
      </div>
    `;

    if (data.role === "numeric") {
      const s = data.stats;
      content.innerHTML = `
        <div class="card">
          <div class="var-card-header">
            <h3>${varHeadingHtml(name, data.label)} <span class="badge badge--numeric">numérica</span></h3>
            ${actions}
          </div>
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
          <div class="var-card-header">
            <h3>${varHeadingHtml(name, data.label)} <span class="badge badge--categorical">categórica</span></h3>
            ${actions}
          </div>
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

    content.querySelector('[data-action="rename"]').addEventListener("click", () => openRenameModal(name));
    content.querySelector('[data-action="recode"]').addEventListener("click", () => openRecodeModal(name, data));
    const relabelBtn = content.querySelector('[data-action="relabel"]');
    if (relabelBtn) relabelBtn.addEventListener("click", () => openRelabelModal(name, data));
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
    let top = frequencies;
    if (frequencies.length > 15) {
      const topLabels = new Set(
        [...frequencies].sort((a, b) => b.count - a.count).slice(0, 15).map((f) => f.label)
      );
      top = frequencies.filter((f) => topLabels.has(f.label));
    }
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
      note.textContent = `Mostrando las 15 categorías con más casos de ${frequencies.length} (en su orden habitual).`;
      container.appendChild(note);
    }
  }

  // ---------- Rename / relabel / recode modals ----------
  function openRenameModal(name) {
    openModal(`
      <div class="modal-header"><h3>Renombrar variable</h3><button class="modal-close" aria-label="Cerrar">&times;</button></div>
      <div class="modal-body">
        <label class="field"><span>Nuevo nombre</span><input id="renameInput" type="text" value="${escapeHtml(name)}"></label>
        <div id="modalError" class="modal-error" hidden></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn--ghost modal-close">Cancelar</button>
        <button id="renameSubmit" class="btn btn--primary">Guardar</button>
      </div>
    `);
    const input = el("renameInput");
    input.focus();
    input.select();

    el("renameSubmit").addEventListener("click", async () => {
      const newName = input.value.trim();
      if (!newName) return showModalError("El nombre no puede estar vacío.");
      try {
        const data = await postJson(`/api/variables/${state.sessionId}/${encodeURIComponent(name)}/rename`, { new_name: newName });
        state.variables = data.variables;
        state.activeVar = data.new_name;
        closeModal();
        renderVarList(el("varSearch").value);
        populateCrossSelects();
        populateRegressionDependent();
        selectVariable(data.new_name);
      } catch (err) {
        showModalError(err.message);
      }
    });
  }

  function openRelabelModal(name, data) {
    const rows = data.frequencies.map((f) => `
      <div class="form-row">
        <span class="form-row__label" title="${escapeHtml(f.label)}">${escapeHtml(f.label)}</span>
        <input type="text" class="relabel-input" data-old="${escapeHtml(f.label)}" value="${escapeHtml(f.label)}">
      </div>
    `).join("");

    openModal(`
      <div class="modal-header"><h3>Editar etiquetas — ${escapeHtml(name)}</h3><button class="modal-close" aria-label="Cerrar">&times;</button></div>
      <div class="modal-body">
        <p class="modal-hint">Cambia el texto de una o varias categorías. Si escribes la misma etiqueta en varias filas, se agrupan en una sola.</p>
        ${rows}
        <div id="modalError" class="modal-error" hidden></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn--ghost modal-close">Cancelar</button>
        <button id="relabelSubmit" class="btn btn--primary">Guardar</button>
      </div>
    `);

    el("relabelSubmit").addEventListener("click", async () => {
      const mapping = {};
      modalBody.querySelectorAll(".relabel-input").forEach((input) => {
        const oldLabel = input.dataset.old;
        const newLabel = input.value.trim();
        if (newLabel && newLabel !== oldLabel) mapping[oldLabel] = newLabel;
      });
      if (!Object.keys(mapping).length) { closeModal(); return; }
      try {
        const resData = await postJson(`/api/variables/${state.sessionId}/${encodeURIComponent(name)}/relabel`, { mapping });
        state.variables = resData.variables;
        state.activeVarData = resData.detail;
        closeModal();
        renderVarList(el("varSearch").value);
        populateCrossSelects();
        populateRegressionDependent();
        renderDescribe(name, resData.detail);
      } catch (err) {
        showModalError(err.message);
      }
    });
  }

  function openRecodeModal(name, data) {
    const role = data.role;
    let bodyHtml;

    if (role === "numeric") {
      bodyHtml = `
        <label class="field"><span>Nombre de la nueva variable</span><input id="recodeNewVar" type="text" value="${escapeHtml(name)}_rec"></label>
        <p class="modal-hint" style="margin-top:14px">Define rangos (mín–máx) y una etiqueta para cada uno. Se evalúan en orden; deja un límite vacío para "sin tope".</p>
        <div id="recodeRules" class="recode-rules"></div>
        <button id="addRuleBtn" class="btn btn--ghost btn--sm" type="button">+ Añadir rango</button>
        <label class="field" style="margin-top:14px"><span>Etiqueta para valores fuera de los rangos (opcional)</span><input id="recodeOther" type="text" placeholder="p. ej. Otros"></label>
      `;
    } else {
      const rows = data.frequencies.map((f) => `
        <div class="form-row">
          <span class="form-row__label" title="${escapeHtml(f.label)}">${escapeHtml(f.label)} <span class="text-secondary" style="font-size:11px">(${f.count})</span></span>
          <input type="text" class="recode-cat-input" data-value="${escapeHtml(f.label)}" value="${escapeHtml(f.label)}">
        </div>
      `).join("");
      bodyHtml = `
        <label class="field"><span>Nombre de la nueva variable</span><input id="recodeNewVar" type="text" value="${escapeHtml(name)}_rec"></label>
        <p class="modal-hint" style="margin-top:14px">Escribe la misma etiqueta en varias categorías para agruparlas en una nueva.</p>
        ${rows}
      `;
    }

    openModal(`
      <div class="modal-header"><h3>Recodificar — ${escapeHtml(name)}</h3><button class="modal-close" aria-label="Cerrar">&times;</button></div>
      <div class="modal-body">${bodyHtml}<div id="modalError" class="modal-error" hidden></div></div>
      <div class="modal-footer">
        <button class="btn btn--ghost modal-close">Cancelar</button>
        <button id="recodeSubmit" class="btn btn--primary">Crear variable</button>
      </div>
    `);

    if (role === "numeric") {
      const rulesContainer = el("recodeRules");

      function addRuleRow(minVal, maxVal, label) {
        const row = document.createElement("div");
        row.className = "recode-rule-row";
        row.innerHTML = `
          <input type="number" class="rule-min" placeholder="Mín." value="${minVal ?? ""}">
          <span class="text-secondary">–</span>
          <input type="number" class="rule-max" placeholder="Máx." value="${maxVal ?? ""}">
          <input type="text" class="rule-label" placeholder="Etiqueta" value="${escapeHtml(label ?? "")}">
          <button type="button" class="btn btn--icon btn--sm remove-rule" aria-label="Eliminar rango">&times;</button>
        `;
        row.querySelector(".remove-rule").addEventListener("click", () => row.remove());
        rulesContainer.appendChild(row);
      }
      addRuleRow();
      addRuleRow();
      el("addRuleBtn").addEventListener("click", () => addRuleRow());

      el("recodeSubmit").addEventListener("click", async () => {
        const newVar = el("recodeNewVar").value.trim();
        const otherLabel = el("recodeOther").value.trim() || null;
        const rules = [];
        let error = null;

        rulesContainer.querySelectorAll(".recode-rule-row").forEach((row) => {
          const minStr = row.querySelector(".rule-min").value;
          const maxStr = row.querySelector(".rule-max").value;
          const label = row.querySelector(".rule-label").value.trim();
          if (!label) { error = "Cada rango necesita una etiqueta."; return; }
          rules.push({ min: minStr === "" ? null : Number(minStr), max: maxStr === "" ? null : Number(maxStr), label });
        });

        if (error) return showModalError(error);
        if (!rules.length) return showModalError("Añade al menos un rango.");
        if (!newVar) return showModalError("Indica un nombre para la nueva variable.");

        try {
          const resData = await postJson(`/api/recode/${state.sessionId}/numeric`, {
            source_var: name, new_var: newVar, rules, other_label: otherLabel,
          });
          state.variables = resData.variables;
          closeModal();
          renderVarList(el("varSearch").value);
          populateCrossSelects();
          populateRegressionDependent();
          selectVariable(resData.new_var);
        } catch (err) {
          showModalError(err.message);
        }
      });
    } else {
      el("recodeSubmit").addEventListener("click", async () => {
        const newVar = el("recodeNewVar").value.trim();
        if (!newVar) return showModalError("Indica un nombre para la nueva variable.");

        const groups = {};
        modalBody.querySelectorAll(".recode-cat-input").forEach((input) => {
          const originalValue = input.dataset.value;
          const label = input.value.trim() || originalValue;
          if (!groups[label]) groups[label] = [];
          groups[label].push(originalValue);
        });
        const rules = Object.entries(groups).map(([label, values]) => ({ label, values }));

        try {
          const resData = await postJson(`/api/recode/${state.sessionId}/categorical`, {
            source_var: name, new_var: newVar, rules, other_label: null,
          });
          state.variables = resData.variables;
          closeModal();
          renderVarList(el("varSearch").value);
          populateCrossSelects();
          populateRegressionDependent();
          selectVariable(resData.new_var);
        } catch (err) {
          showModalError(err.message);
        }
      });
    }
  }

  // ---------- Tabs ----------
  const TAB_PANELS = { describe: "tabDescribe", crosstab: "tabCrosstab", mrset: "tabMrset", regression: "tabRegression" };
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("is-active"));
      tab.classList.add("is-active");
      el(TAB_PANELS[tab.dataset.tab]).classList.add("is-active");
    });
  });

  // ---------- Crosstab ----------
  function populateCrossSelects() {
    const categorical = state.variables.filter((v) => v.role === "categorical");
    const options = categorical.map((v) => `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)}</option>`).join("");
    const prevVar1 = el("crossVar1").value;
    const prevVar2 = el("crossVar2").value;
    el("crossVar1").innerHTML = options;
    el("crossVar2").innerHTML = options;
    if (categorical.some((v) => v.name === prevVar1)) el("crossVar1").value = prevVar1;
    if (categorical.some((v) => v.name === prevVar2)) el("crossVar2").value = prevVar2;
    else if (categorical.length > 1) el("crossVar2").selectedIndex = 1;
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
    state.crosstabData = data;
    const content = el("crosstabContent");
    const chi2 = data.chi2;
    const verdictClass = chi2.significant_at_05 ? "chi2-verdict--sig" : "chi2-verdict--nonsig";
    const verdictText = chi2.significant_at_05
      ? "Asociación significativa (p < 0.05)"
      : "Sin evidencia de asociación (p ≥ 0.05)";

    content.innerHTML = `
      <div class="card">
        <div class="crosstab-table-header">
          <h3>Tabla de contingencia: ${varHeadingHtml(data.var1, data.var1_label)} × ${varHeadingHtml(data.var2, data.var2_label)}</h3>
          <div class="segmented" id="crosstabModeToggle" role="group" aria-label="Frecuencia o porcentaje">
            <button type="button" class="segmented__btn" data-mode="count">Frecuencia</button>
            <button type="button" class="segmented__btn" data-mode="colpct">% columna</button>
          </div>
        </div>
        <div id="crosstabTableWrap" style="overflow-x:auto"></div>
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

    const toggle = el("crosstabModeToggle");
    toggle.querySelectorAll(".segmented__btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.mode === state.crosstabMode);
      btn.addEventListener("click", () => {
        state.crosstabMode = btn.dataset.mode;
        toggle.querySelectorAll(".segmented__btn").forEach((b) => b.classList.toggle("is-active", b === btn));
        renderCrosstabTable();
      });
    });
    renderCrosstabTable();
    renderGroupedChart(el("crossChart"), data);
  }

  function renderCrosstabTable() {
    const data = state.crosstabData;
    const wrap = el("crosstabTableWrap");
    const isPct = state.crosstabMode === "colpct";

    let tableRows = "";
    data.row_labels.forEach((rowLabel, i) => {
      const cells = data.table[i]
        .map((v, j) => (isPct ? `<td>${fmt(data.col_pct[i][j], 1)}%</td>` : `<td>${v}</td>`))
        .join("");
      tableRows += `<tr><td>${escapeHtml(rowLabel)}</td>${cells}<td>${data.row_totals[i]}</td></tr>`;
    });
    const colTotalsCells = data.col_totals.map((v) => (isPct ? `<td>100,0%</td>` : `<td>${v}</td>`)).join("");

    wrap.innerHTML = `
      <table>
        <thead>
          <tr><th></th>${data.col_labels.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}<th>Total</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
        <tfoot>
          <tr><td>Total</td>${colTotalsCells}<td>${data.total}</td></tr>
        </tfoot>
      </table>
      ${isPct ? `<p class="modal-hint" style="margin-top:10px">Porcentaje sobre el total de cada columna (variable independiente). La columna "Total" sigue mostrando el recuento (N).</p>` : ""}
    `;
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

  // ---------- Multiple response sets ----------
  el("createMrsetBtn").addEventListener("click", openCreateMrsetModal);

  function renderMrsetList() {
    const list = el("mrsetList");
    if (!state.mrsets.length) {
      list.innerHTML = `<div class="empty-state" style="padding:20px 0;font-size:13px">Aún no hay conjuntos.</div>`;
      return;
    }
    list.innerHTML = "";
    state.mrsets.forEach((m) => {
      const item = document.createElement("div");
      item.className = "var-item" + (state.activeMrset === m.name ? " is-active" : "");
      item.innerHTML = `
        <div style="min-width:0">
          <div class="var-item__name">${escapeHtml(m.label || m.name)}</div>
          <div class="var-item__meta">${m.variables.length} variables · ${m.type === "dichotomy" ? "dicotomías" : "categorías"}</div>
        </div>
        <button class="btn btn--icon btn--sm mrset-delete" aria-label="Eliminar conjunto" title="Eliminar">&times;</button>
      `;
      item.addEventListener("click", (e) => {
        if (e.target.closest(".mrset-delete")) return;
        selectMrset(m.name);
      });
      item.querySelector(".mrset-delete").addEventListener("click", async (e) => {
        e.stopPropagation();
        await fetch(`/api/mrsets/${state.sessionId}/${encodeURIComponent(m.name)}`, { method: "DELETE" });
        state.mrsets = state.mrsets.filter((x) => x.name !== m.name);
        if (state.activeMrset === m.name) {
          state.activeMrset = null;
          el("mrsetEmpty").hidden = false;
          el("mrsetContent").hidden = true;
        }
        renderMrsetList();
      });
      list.appendChild(item);
    });
  }

  async function selectMrset(name) {
    state.activeMrset = name;
    renderMrsetList();
    el("mrsetEmpty").hidden = true;
    const content = el("mrsetContent");
    content.hidden = false;
    content.innerHTML = `<div class="empty-state">Cargando…</div>`;
    try {
      const res = await fetch(`/api/mrsets/${state.sessionId}/${encodeURIComponent(name)}/summary`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al calcular el resumen.");
      renderMrsetSummary(name, data);
    } catch (err) {
      content.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderMrsetSummary(name, data) {
    const content = el("mrsetContent");
    const mrset = state.mrsets.find((m) => m.name === name);
    content.innerHTML = `
      <div class="card">
        <h3>${escapeHtml(mrset ? (mrset.label || mrset.name) : name)}</h3>
        <div class="stat-grid">
          ${statTile("Respuestas", data.n_responses)}
          ${statTile("Casos", data.n_cases)}
          ${statTile("Categorías", data.categories.length)}
        </div>
      </div>
      <div class="card">
        <h3>Frecuencias</h3>
        <div id="mrsetChart" class="chart chart--horizontal"></div>
        <table style="margin-top:20px">
          <thead><tr><th>Categoría</th><th>N</th><th>% respuestas</th><th>% casos</th></tr></thead>
          <tbody>
            ${data.categories.map((c) => `<tr><td>${escapeHtml(c.label)}</td><td>${c.count}</td><td>${fmt(c.pct_responses, 1)}%</td><td>${fmt(c.pct_cases, 1)}%</td></tr>`).join("")}
          </tbody>
        </table>
        <p class="modal-hint" style="margin-top:14px">% de respuestas: sobre el total de selecciones. % de casos: sobre los encuestados que respondieron al menos una opción del conjunto.</p>
      </div>
    `;
    renderMrsetChart(el("mrsetChart"), data.categories);
  }

  function renderMrsetChart(container, categories) {
    if (!categories.length) { container.innerHTML = `<div class="empty-state">Sin datos.</div>`; return; }
    const max = Math.max(...categories.map((c) => c.count), 1);
    container.innerHTML = "";
    categories.forEach((c) => {
      const row = document.createElement("div");
      row.className = "hbar-row";
      const widthPct = (c.count / max) * 100;
      row.innerHTML = `
        <span class="hbar-row__label" title="${escapeHtml(c.label)}">${escapeHtml(c.label)}</span>
        <div class="hbar-row__track"><div class="hbar-row__fill" style="width:${widthPct}%;background:var(--series-3)"></div></div>
        <span class="hbar-row__value">${c.count} (${fmt(c.pct_cases, 1)}%)</span>
      `;
      const fill = row.querySelector(".hbar-row__fill");
      fill.addEventListener("mouseenter", (e) => showTooltip(e, `${escapeHtml(c.label)}: ${c.count} · ${fmt(c.pct_responses, 1)}% respuestas · ${fmt(c.pct_cases, 1)}% casos`));
      fill.addEventListener("mousemove", moveTooltip);
      fill.addEventListener("mouseleave", hideTooltip);
      container.appendChild(row);
    });
  }

  function openCreateMrsetModal() {
    const varChecklist = state.variables.map((v) => `
      <label class="checklist-item">
        <input type="checkbox" class="mrset-var-checkbox" value="${escapeHtml(v.name)}">
        <span>${escapeHtml(v.name)}</span>
        <span class="badge badge--${v.role}">${v.role === "numeric" ? "num" : "cat"}</span>
      </label>
    `).join("");

    openModal(`
      <div class="modal-header"><h3>Crear conjunto de respuesta múltiple</h3><button class="modal-close" aria-label="Cerrar">&times;</button></div>
      <div class="modal-body">
        <label class="field"><span>Nombre (identificador)</span><input id="mrsetName" type="text" placeholder="p. ej. medios"></label>
        <label class="field" style="margin-top:12px"><span>Etiqueta descriptiva (opcional)</span><input id="mrsetLabel" type="text" placeholder="p. ej. Medios consultados"></label>
        <div class="field" style="margin-top:12px">
          <span>Tipo de conjunto</span>
          <div class="radio-row">
            <label><input type="radio" name="mrsetType" value="dichotomy" checked> Dicotomías — cada variable es sí/no (p. ej. varias casillas independientes)</label>
            <label><input type="radio" name="mrsetType" value="category"> Categorías — varias variables comparten el mismo dominio (p. ej. 1ª y 2ª opción)</label>
          </div>
        </div>
        <div id="mrsetDichotomyValue" class="field" style="margin-top:12px">
          <span>Valor que indica "seleccionado"</span>
          <input id="mrsetDichValue" type="text" value="1">
        </div>
        <div class="field" style="margin-top:12px">
          <span>Variables incluidas (mínimo 2)</span>
          <div class="checklist">${varChecklist}</div>
        </div>
        <div id="modalError" class="modal-error" hidden></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn--ghost modal-close">Cancelar</button>
        <button id="mrsetSubmit" class="btn btn--primary">Crear</button>
      </div>
    `);

    modalBody.querySelectorAll('input[name="mrsetType"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        el("mrsetDichotomyValue").hidden = radio.value === "category";
      });
    });

    el("mrsetSubmit").addEventListener("click", async () => {
      const name = el("mrsetName").value.trim();
      const label = el("mrsetLabel").value.trim();
      const type = modalBody.querySelector('input[name="mrsetType"]:checked').value;
      const selected = Array.from(modalBody.querySelectorAll(".mrset-var-checkbox:checked")).map((c) => c.value);

      if (!name) return showModalError("Indica un nombre para el conjunto.");
      if (selected.length < 2) return showModalError("Selecciona al menos 2 variables.");

      const payload = { name, label, type, variables: selected };
      if (type === "dichotomy") {
        payload.dichotomy_value = el("mrsetDichValue").value.trim();
        const variableLabels = {};
        selected.forEach((v) => { variableLabels[v] = v; });
        payload.variable_labels = variableLabels;
      }

      try {
        const data = await postJson(`/api/mrsets/${state.sessionId}`, payload);
        state.mrsets = data.mrsets;
        closeModal();
        renderMrsetList();
        selectMrset(name);
      } catch (err) {
        showModalError(err.message);
      }
    });
  }

  // ---------- Regression ----------
  el("regressionTypeToggle").querySelectorAll(".segmented__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.regressionType = btn.dataset.type;
      el("regressionTypeToggle").querySelectorAll(".segmented__btn").forEach((b) => b.classList.toggle("is-active", b === btn));
      populateRegressionDependent();
    });
  });

  el("regDependent").addEventListener("change", renderRegressionIndependents);

  function populateRegressionDependent() {
    const select = el("regDependent");
    const eligible = state.regressionType === "linear"
      ? state.variables.filter((v) => v.role === "numeric")
      : state.variables.filter((v) => v.role === "categorical" && v.n_unique === 2);
    const prev = select.value;
    select.innerHTML = eligible.length
      ? eligible.map((v) => `<option value="${escapeHtml(v.name)}">${escapeHtml(varLabelText(v))}</option>`).join("")
      : `<option value="">— ninguna variable elegible —</option>`;
    if (eligible.some((v) => v.name === prev)) select.value = prev;
    renderRegressionIndependents();
  }

  function varLabelText(v) {
    return v.label && v.label !== v.name ? `${v.label} (${v.name})` : v.name;
  }

  function renderRegressionIndependents() {
    const dep = el("regDependent").value;
    const container = el("regIndependents");
    const previouslyChecked = new Set(
      Array.from(container.querySelectorAll(".reg-var-checkbox:checked")).map((c) => c.value)
    );
    const eligible = state.variables.filter((v) => v.name !== dep);

    if (!eligible.length) {
      container.innerHTML = `<div class="text-secondary" style="font-size:12.5px;padding:6px 4px">No hay variables disponibles.</div>`;
      return;
    }

    container.innerHTML = eligible.map((v) => `
      <div class="checklist-item-wrap">
        <label class="checklist-item">
          <input type="checkbox" class="reg-var-checkbox" value="${escapeHtml(v.name)}" ${previouslyChecked.has(v.name) ? "checked" : ""}>
          <span>${escapeHtml(varLabelText(v))}</span>
          <span class="badge badge--${v.role}">${v.role === "numeric" ? "num" : "cat"}</span>
        </label>
        ${v.role === "categorical" ? `<select class="reg-ref-select" data-var="${escapeHtml(v.name)}" hidden></select>` : ""}
      </div>
    `).join("");

    container.querySelectorAll(".reg-var-checkbox").forEach((cb) => {
      cb.addEventListener("change", () => onRegressionVarToggle(cb));
      if (cb.checked) onRegressionVarToggle(cb);
    });
  }

  async function onRegressionVarToggle(checkbox) {
    const varName = checkbox.value;
    const wrap = checkbox.closest(".checklist-item-wrap");
    const refSelect = wrap.querySelector(".reg-ref-select");
    if (!refSelect) return;

    if (!checkbox.checked) {
      refSelect.hidden = true;
      refSelect.innerHTML = "";
      return;
    }

    refSelect.hidden = false;
    refSelect.innerHTML = `<option>Cargando categorías…</option>`;
    try {
      const res = await fetch(`/api/variable/${state.sessionId}/${encodeURIComponent(varName)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al cargar categorías.");
      refSelect.innerHTML = data.frequencies
        .map((f, i) => `<option value="${escapeHtml(f.label)}">${escapeHtml(f.label)}${i === 0 ? " — referencia por defecto" : ""}</option>`)
        .join("");
    } catch (err) {
      refSelect.innerHTML = `<option value="">Error al cargar categorías</option>`;
    }
  }

  el("regSubmit").addEventListener("click", async () => {
    const dependent = el("regDependent").value;
    if (!dependent) return renderRegressionError("Elige una variable dependiente.");
    const independents = Array.from(el("regIndependents").querySelectorAll(".reg-var-checkbox:checked")).map((c) => c.value);
    if (!independents.length) return renderRegressionError("Selecciona al menos una variable independiente.");

    const references = {};
    el("regIndependents").querySelectorAll(".reg-ref-select").forEach((sel) => {
      if (!sel.hidden && sel.value) references[sel.dataset.var] = sel.value;
    });

    const content = el("regressionContent");
    el("regressionEmpty").hidden = true;
    content.hidden = false;
    content.innerHTML = `<div class="empty-state">Calculando…</div>`;

    const endpoint = state.regressionType === "linear" ? "linear" : "logistic";
    try {
      const data = await postJson(`/api/regression/${state.sessionId}/${endpoint}`, { dependent, independents, references });
      renderRegressionResult(data);
    } catch (err) {
      renderRegressionError(err.message);
    }
  });

  function renderRegressionError(message) {
    const content = el("regressionContent");
    el("regressionEmpty").hidden = true;
    content.hidden = false;
    content.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function renderRegressionResult(data) {
    const content = el("regressionContent");
    const isLogit = data.type === "logistic";
    const depHeading = varHeadingHtml(data.dependent, data.dependent_label);

    const summaryTiles = isLogit
      ? `${statTile("N", data.n)}${statTile("Pseudo R² (McFadden)", fmt(data.pseudo_r_squared, 3))}${statTile("Log-verosimilitud", fmt(data.log_likelihood, 2))}`
      : `${statTile("N", data.n)}${statTile("R²", fmt(data.r_squared, 3))}${statTile("R² ajustado", fmt(data.r_squared_adj, 3))}${data.f_statistic !== null ? statTile("F", fmt(data.f_statistic, 2)) : ""}`;

    const rows = data.coefficients.map((c) => `
      <tr>
        <td style="text-align:left">${escapeHtml(c.term)}</td>
        <td>${fmt(c.coef, 3)}</td>
        <td>${fmt(c.std_err, 3)}</td>
        ${isLogit ? `<td>${fmt(c.odds_ratio, 3)}</td>` : ""}
        <td class="${c.significant_at_05 ? "text-significant" : ""}">${fmtP(c.p_value)}</td>
      </tr>
    `).join("");

    content.innerHTML = `
      <div class="card">
        <h3>${isLogit ? "Regresión logística" : "Regresión lineal múltiple"}: ${depHeading}</h3>
        ${isLogit ? `<p class="modal-hint">Modela la probabilidad de "${escapeHtml(data.dependent_event)}" frente a la referencia "${escapeHtml(data.dependent_reference)}".</p>` : ""}
        <div class="stat-grid" style="margin-top:14px">${summaryTiles}</div>
      </div>
      <div class="card">
        <h3>Coeficientes</h3>
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr>
                <th style="text-align:left">Término</th>
                <th>Coef.</th>
                <th>Error típico</th>
                ${isLogit ? "<th>Odds ratio</th>" : ""}
                <th>p-valor</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="modal-hint" style="margin-top:14px">Los predictores categóricos se muestran como "variable = categoría (ref: categoría de referencia)". Por defecto la referencia es la categoría más baja según el orden lógico de la variable; puedes cambiarla en el desplegable que aparece junto a cada variable categórica marcada. En verde, los coeficientes significativos (p &lt; 0,05).</p>
      </div>
    `;
  }

  // ---------- Utils ----------
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
