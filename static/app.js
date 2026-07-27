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
  };

  const el = (id) => document.getElementById(id);
  const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n) ? "—" : Number(n).toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: 0 }));
  const fmtP = (p) => (p < 0.001 ? "< 0.001" : fmt(p, 3));

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

    el("describeEmpty").hidden = false;
    el("describeContent").hidden = true;
    el("crosstabEmpty").hidden = false;
    el("crosstabContent").hidden = true;
    el("mrsetEmpty").hidden = false;
    el("mrsetContent").hidden = true;
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
            <h3>${escapeHtml(name)} <span class="badge badge--numeric">numérica</span></h3>
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
            <h3>${escapeHtml(name)} <span class="badge badge--categorical">categórica</span></h3>
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
          selectVariable(resData.new_var);
        } catch (err) {
          showModalError(err.message);
        }
      });
    }
  }

  // ---------- Tabs ----------
  const TAB_PANELS = { describe: "tabDescribe", crosstab: "tabCrosstab", mrset: "tabMrset" };
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

  // ---------- Utils ----------
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
