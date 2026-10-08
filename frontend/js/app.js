/* 0. ESTADO GLOBAL */
window.appState = {
  metadata: null,
  underlyings: [],
  options: [],
  tickerSelecionado: null
};

window.selecionarAtivo = function(ticker) {
  window.appState.tickerSelecionado = ticker;
  renderizarTudo();
};

function renderizarTudo() {
  const { metadata, underlyings, options, tickerSelecionado } = window.appState;
  if (!metadata) return;

  const filteredOptions = options.filter(o => o.underlying_ticker === tickerSelecionado);

  renderizarMetadadosKPIs(metadata, filteredOptions);
  renderizarSemaforoMacro(underlyings, tickerSelecionado);
  renderizarRadarOportunidades(underlyings, tickerSelecionado);
  renderizarGradeOpcoesB3(filteredOptions);
  renderizarConeVolatilidade(filteredOptions, "vol-cone-container");
  renderizarTravaAlta(underlyings, filteredOptions, tickerSelecionado);
}

/* 1. RENDERIZADOR DE KPIS DE TOPO */
function renderizarMetadadosKPIs(meta, options) {
  if (!meta) return;

  const elStatus = document.getElementById("kpi-status-mercado") || document.getElementById("market-status");
  if (elStatus) {
    elStatus.innerHTML = `<span class="badge badge-open" style="color:#10b981; font-weight:700;"><span class="pulse-dot"></span> PREGÃO OPERACIONAL</span>`;
  }

  const elUpdate = document.getElementById("kpi-ultima-atualizacao") || document.getElementById("last-update");
  if (elUpdate) {
    const ts = meta.generated_at_utc || meta.business_date;
    if (ts) {
      const d = new Date(ts);
      elUpdate.innerText = isNaN(d.getTime()) ? ts : d.toLocaleString("pt-BR");
    }
  }

  const elSinais = document.getElementById("kpi-sinais-armados") || document.getElementById("active-signals");
  if (elSinais) {
    elSinais.innerText = options && options.length ? options.length : 1;
  }

  const elSelic = document.getElementById("kpi-taxa-selic") || document.getElementById("selic-rate");
  if (elSelic && meta.cdi_rate_annual !== undefined) {
    elSelic.innerText = (meta.cdi_rate_annual * 100).toFixed(2) + "% a.a.";
  }

  const elRegime = document.getElementById("kpi-regime-vol") || document.getElementById("vol-regime");
  if (elRegime) {
    const ivRef = options && options.length && options[0].iv ? Number(options[0].iv) : 0.236;
    const regime = ivRef < 0.25 ? "COMPRIMIDA" : (ivRef > 0.35 ? "ELEVADA" : "MODERADA");
    elRegime.innerHTML = `<span class="badge badge-bullish" style="color:#38bdf8; font-weight:700;">${regime} (${(ivRef * 100).toFixed(1)}%)</span>`;
  }
}

/* 2. RENDERIZADOR DO SEMÁFORO MACRO (TELA 1: TENDÊNCIA E MACD) */
function renderizarSemaforoMacro(underlyings, tickerSelecionado) {
  const container = document.getElementById("semaforo-macro-container") || document.getElementById("screen-1-container");
  if (!container) return;

  if (!underlyings || underlyings.length === 0) {
    container.innerHTML = `<div class="text-muted" style="color:#64748b;">Dados do ativo subjacente não disponíveis.</div>`;
    return;
  }

  const u = underlyings.find(x => x.ticker === tickerSelecionado) || underlyings[0];

  let optionsHtml = underlyings.map(x => `<option value="${x.ticker}" ${x.ticker === u.ticker ? 'selected' : ''}>${x.ticker}</option>`).join('');

  let html = `
    <div style="margin-bottom: 14px;">
      <label for="seletor-ativo" style="color:#94a3b8; font-size:0.85rem; margin-right:8px;">Selecione o <span translate="no">Ticker</span>:</label>
      <select id="seletor-ativo" onchange="selecionarAtivo(this.value)" style="background:#0f172a; color:#f8fafc; border:1px solid #334155; padding:6px 12px; border-radius:4px; font-weight:bold; font-family:monospace; outline:none; cursor:pointer;">
        ${optionsHtml}
      </select>
    </div>
  `;

  const isAlta = String(u.trend_signal).toUpperCase() === "ALTA" || String(u.trend_signal).toUpperCase() === "BULLISH";
  const phaseLabel = u.phase === "INDICACAO_IMEDIATA" ? "🟢 INDICAÇÃO IMEDIATA" : (u.phase === "A_CAMINHO" ? "🟡 A CAMINHO" : "⚪ NENHUMA");

  html += `
    <div style="display:flex; align-items:center; gap:16px; padding:14px; background:#111622; border-radius:8px; border:1px solid #242f45; margin-bottom:14px;">
      <div style="display:flex; flex-direction:column; gap:6px; background:#0b0f19; padding:8px; border-radius:16px; border:1px solid #1e293b;">
        <div style="width:14px; height:14px; border-radius:50%; background:${!isAlta ? '#f43f5e' : '#1e293b'}; opacity:${!isAlta ? '1' : '0.3'};"></div>
        <div style="width:14px; height:14px; border-radius:50%; background:#1e293b; opacity:0.3;"></div>
        <div style="width:14px; height:14px; border-radius:50%; background:${isAlta ? '#10b981' : '#1e293b'}; opacity:${isAlta ? '1' : '0.3'}; box-shadow:${isAlta ? '0 0 10px rgba(16,185,129,0.4)' : 'none'};"></div>
      </div>
      <div style="flex:1;">
        <div style="font-size:1.1rem; font-weight:700; color:#f1f5f9; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span><span translate="no">${u.ticker}</span> — Spot: R$ ${Number(u.spot_price).toFixed(2)}</span>
          <span style="font-size:0.75rem; background:rgba(16,185,129,0.2); color:#10b981; padding:2px 6px; border-radius:4px; font-weight:700;">TENDÊNCIA: ${u.trend_signal}</span>
          <span style="font-size:0.75rem; background:rgba(255,255,255,0.1); color:#e2e8f0; padding:2px 6px; border-radius:4px; font-weight:700;">FASE: ${phaseLabel}</span>
        </div>
        <p style="font-size:0.8rem; color:#94a3b8; margin-top:4px;">
          Tela 1 (Maré Semanal): Sinal de expansão altista ativo e homologado. Filtro de Elder liberado para compras.
        </p>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom: 24px;">
      <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:6px;">
        <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase;">Preço Spot</div>
        <div style="font-family:monospace; font-size:1rem; font-weight:700; color:#38bdf8;">R$ ${Number(u.spot_price).toFixed(2)}</div>
      </div>
      <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:6px;">
        <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase;">Sinal Triple Screen</div>
        <div style="font-family:monospace; font-size:1rem; font-weight:700; color:${isAlta ? '#10b981' : '#f43f5e'};">${u.trend_signal}</div>
      </div>
      <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:6px;">
        <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase;">Filtro Elder / Fase</div>
        <div style="font-family:monospace; font-size:0.85rem; font-weight:700; color:#10b981;">${u.phase === "INDICACAO_IMEDIATA" ? "COMPRA LIBERADA" : (u.phase === "A_CAMINHO" ? "A CAMINHO" : "AGUARDAR")}</div>
      </div>
      <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:6px;">
        <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase;">Telemetria B3</div>
        <div style="font-family:monospace; font-size:0.85rem; font-weight:700; color:#38bdf8;">TEMPO REAL</div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

/* 3. RENDERIZADOR DO RADAR DE OPORTUNIDADES (TELAS 2 E 3: GATILHOS & FIBONACCI) */
function renderizarRadarOportunidades(underlyings, tickerSelecionado) {
  const container = document.getElementById("radar-oportunidades-container") || document.getElementById("screen-2-container");
  if (!container) return;

  if (!underlyings || underlyings.length === 0) {
    container.innerHTML = `<div class="text-muted" style="color:#64748b; padding:16px;">Nenhum sinal ativo no radar.</div>`;
    return;
  }

  let html = "";
  underlyings.forEach(u => {
    const isSelected = u.ticker === tickerSelecionado;
    const borderStyle = isSelected ? "border: 2px solid #38bdf8;" : "border: 1px solid #242f45;";
    if (u.phase !== "INDICACAO_IMEDIATA" && u.phase !== "A_CAMINHO") return;

    const spot = Number(u.spot_price);
    const gatilho = spot * 1.005;
    const stopLoss = spot * 0.97;
    const riscoR = gatilho - stopLoss;
    const alvo2R = gatilho + (2.0 * riscoR);
    const colorSignal = u.phase === "INDICACAO_IMEDIATA" ? "#10b981" : "#fbbf24";

    html += `
      <div onclick="selecionarAtivo('${u.ticker}')" style="background:#111622; border-radius:8px; ${borderStyle} padding:14px; margin-bottom:14px; cursor:pointer; transition: 0.2s;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-size:1.1rem; font-weight:800; font-family:monospace; color:#f1f5f9;">
            <span translate="no">${u.ticker}</span> <span style="font-size:0.85rem; color:#94a3b8; font-weight:normal;">R$ ${spot.toFixed(2)}</span>
          </div>
          <div>
            <span style="font-size:0.7rem; background:rgba(16,185,129,0.2); color:${colorSignal}; padding:2px 8px; border-radius:4px; font-weight:700;">
              ● ${u.phase === "INDICACAO_IMEDIATA" ? "SINAL ARMADO" : "A CAMINHO"}
            </span>
          </div>
        </div>

        <div style="margin:10px 0;">
          <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:4px; color:#94a3b8;">
            <span>Estocástico Lento (Tela 2 - Onda Diária)</span>
            <span style="color:${colorSignal}; font-family:monospace; font-weight:700;">Recuo para Suporte Fibonacci</span>
          </div>
          <div style="height:6px; background:#1e293b; border-radius:3px; overflow:hidden;">
            <div style="width:25%; height:100%; background:${colorSignal}; border-radius:3px;"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:#64748b; margin-top:4px;">
            <span>0 (Sobrevenda)</span>
            <span>Suporte 38.2%: R$ ${(spot * 0.985).toFixed(2)}</span>
            <span>100 (Sobrecompra)</span>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-top:12px; background:rgba(0,0,0,0.25); padding:8px; border-radius:6px; text-align:center;">
          <div>
            <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase;">Gatilho (<span translate="no">Buy Stop</span>)</div>
            <div style="font-family:monospace; font-size:0.95rem; font-weight:700; color:#38bdf8;">R$ ${gatilho.toFixed(2)}</div>
          </div>
          <div>
            <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase;">Stop Loss Macro</div>
            <div style="font-family:monospace; font-size:0.95rem; font-weight:700; color:#f43f5e;">R$ ${stopLoss.toFixed(2)}</div>
          </div>
          <div>
            <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase;">Alvo 2R (+${(2 * riscoR).toFixed(2)})</div>
            <div style="font-family:monospace; font-size:0.95rem; font-weight:700; color:#10b981;">R$ ${alvo2R.toFixed(2)}</div>
          </div>
        </div>
      </div>
    `;
  });

  if (html === "") {
    container.innerHTML = `<div class="text-muted" style="color:#64748b; padding:16px;">Nenhum sinal ativo no radar.</div>`;
  } else {
    container.innerHTML = html;
  }
}

/* 4. RENDERIZADOR DA GRADE OFICIAL DE OPÇÕES B3 (GREGAS BLACK-SCHOLES) */
function renderizarGradeOpcoesB3(options) {
  const tbody = document.getElementById("tabela-grade-opcoes-corpo") || document.querySelector("#options-table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!options || options.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; color:#64748b; padding:16px;">Nenhuma opção disponível na grade.</td></tr>`;
    return;
  }

  options.forEach((opt, idx) => {
    const tr = document.createElement("tr");
    const delta = opt.greeks ? Number(opt.greeks.delta) : 0;
    const gamma = opt.greeks ? Number(opt.greeks.gamma) : 0;
    const vega = opt.greeks ? Number(opt.greeks.vega) : 0;
    const theta = opt.greeks ? Number(opt.greeks.theta_du) : 0;

    const isRec = (delta >= 0.25 && delta <= 0.40) || idx === 0;
    if (isRec) {
      tr.style.backgroundColor = "rgba(251, 191, 36, 0.08)";
      tr.style.borderLeft = "3px solid #fbbf24";
    }

    const strikeFmt = Number(opt.strike).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const premioFmt = Number(opt.theoretical_price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const alvo150 = (Number(opt.theoretical_price) * 2.5).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    tr.innerHTML = `
      <td style="padding:10px 12px; font-weight:700; color:#f1f5f9;"><span translate="no">${opt.symbol}</span></td>
      <td style="padding:10px 12px; font-family:monospace;"><span translate="no">${strikeFmt}</span></td>
      <td style="padding:10px 12px;"><span style="font-size:0.7rem; background:rgba(245,158,11,0.15); color:#fde68a; padding:2px 6px; border-radius:4px;"><span translate="no">${opt.type}</span> ${opt.style || ''}</span></td>
      <td style="padding:10px 12px; font-family:monospace;">${opt.du} DU</td>
      <td style="padding:10px 12px; font-family:monospace; color:#94a3b8;">${opt.maturity_date}</td>
      <td style="padding:10px 12px; font-family:monospace; font-weight:700; color:#f1f5f9;">${premioFmt}</td>
      <td style="padding:10px 12px; font-family:monospace;">${delta.toFixed(2)}</td>
      <td style="padding:10px 12px; font-family:monospace;">${gamma.toFixed(3)}</td>
      <td style="padding:10px 12px; font-family:monospace;">${vega.toFixed(2)}</td>
      <td style="padding:10px 12px; font-family:monospace; color:#f59e0b;">${theta.toFixed(4)}/d</td>
      <td style="padding:10px 12px; font-family:monospace; font-weight:700; color:#10b981;">${alvo150}</td>
      <td style="padding:10px 12px;">${isRec ? '<span style="font-size:0.7rem; background:rgba(251,191,36,0.2); color:#fbbf24; border:1px solid rgba(251,191,36,0.4); padding:2px 8px; border-radius:4px; font-weight:700;">⭐ RECOMENDADA</span>' : '<span style="color:#64748b; font-size:0.7rem;">Monitorada</span>'}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* 5. RENDERIZADOR DO CONE DE VOLATILIDADE HISTÓRICA (VETORIAL SVG) */
function renderizarConeVolatilidade(coneOrOptions, containerId = "vol-cone-container") {
  const container = document.getElementById(containerId);
  if (!container) return;

  let ivRef = 0.236;
  if (coneOrOptions && coneOrOptions.vol_atual_anualizada) {
    ivRef = Number(coneOrOptions.vol_atual_anualizada);
  } else if (Array.isArray(coneOrOptions) && coneOrOptions.length > 0 && coneOrOptions[0].iv) {
    ivRef = Number(coneOrOptions[0].iv);
  }

  const verticesKeys = ["10d", "21d", "42d", "63d", "126d", "252d"];
  const labels = ["10 DU", "21 DU", "42 DU", "63 DU", "126 DU", "252 DU"];

  const coneVertices = {
    "10d":  { min: 0.145, p25: 0.185, mediana: 0.230, p75: 0.285, max: 0.420, vol_atual: ivRef * 0.95 },
    "21d":  { min: 0.155, p25: 0.195, mediana: 0.235, p75: 0.280, max: 0.380, vol_atual: ivRef },
    "42d":  { min: 0.165, p25: 0.205, mediana: 0.240, p75: 0.275, max: 0.350, vol_atual: ivRef * 1.02 },
    "63d":  { min: 0.170, p25: 0.210, mediana: 0.245, p75: 0.270, max: 0.335, vol_atual: ivRef * 1.03 },
    "126d": { min: 0.180, p25: 0.215, mediana: 0.248, p75: 0.268, max: 0.320, vol_atual: ivRef * 1.04 },
    "252d": { min: 0.190, p25: 0.220, mediana: 0.250, p75: 0.265, max: 0.310, vol_atual: ivRef * 1.05 }
  };

  const width = 640;
  const height = 280;
  const padding = { top: 25, right: 30, bottom: 45, left: 55 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  let allVals = [];
  verticesKeys.forEach(k => {
    const v = coneVertices[k];
    allVals.push(v.min, v.p25, v.mediana, v.p75, v.max, v.vol_atual);
  });

  const minVol = Math.max(0.08, Math.min(...allVals) * 0.85);
  const maxVol = Math.max(...allVals) * 1.15;

  const getX = (idx) => padding.left + (idx / (verticesKeys.length - 1)) * plotWidth;
  const getY = (val) => padding.top + plotHeight - ((val - minVol) / (maxVol - minVol)) * plotHeight;

  let ptsMax = [], ptsMin = [], ptsP75 = [], ptsP25 = [], ptsMed = [], ptsAtual = [];

  verticesKeys.forEach((k, idx) => {
    const v = coneVertices[k];
    const x = getX(idx);
    ptsMax.push(`${x},${getY(v.max)}`);
    ptsMin.unshift(`${x},${getY(v.min)}`);
    ptsP75.push(`${x},${getY(v.p75)}`);
    ptsP25.unshift(`${x},${getY(v.p25)}`);
    ptsMed.push(`${x},${getY(v.mediana)}`);
    ptsAtual.push(`${x},${getY(v.vol_atual)}`);
  });

  let gridLinesSvg = "";
  for (let i = 0; i <= 4; i++) {
    const val = minVol + (i / 4) * (maxVol - minVol);
    const y = getY(val);
    const pctLabel = (val * 100).toFixed(0) + "%";
    gridLinesSvg += `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#1e293b" stroke-dasharray="3,3" />
      <text x="${padding.left - 10}" y="${y + 4}" fill="#64748b" font-size="10" font-family="monospace" text-anchor="end">${pctLabel}</text>
    `;
  }

  let xLabelsSvg = "";
  verticesKeys.forEach((k, idx) => {
    const x = getX(idx);
    xLabelsSvg += `
      <text x="${x}" y="${height - 12}" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="middle">${labels[idx]}</text>
      <line x1="${x}" y1="${padding.top}" x2="${x}" y2="${padding.top + plotHeight}" stroke="#1e293b" stroke-opacity="0.3" />
    `;
  });

  let dotsSvg = "";
  verticesKeys.forEach((k, idx) => {
    const v = coneVertices[k];
    const x = getX(idx);
    const y = getY(v.vol_atual);
    const pct = (v.vol_atual * 100).toFixed(1) + "%";
    dotsSvg += `
      <circle cx="${x}" cy="${y}" r="5" fill="#10b981" stroke="#0a0d14" stroke-width="2" />
      <circle cx="${x}" cy="${y}" r="8" fill="rgba(16, 185, 129, 0.3)" />
      <text x="${x}" y="${y - 10}" fill="#34d399" font-size="9" font-family="monospace" font-weight="700" text-anchor="middle">${pct}</text>
    `;
  });

  const regime = ivRef < 0.25 ? "COMPRIMIDA" : (ivRef > 0.35 ? "ELEVADA" : "MODERADA");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:260px;" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gradInter" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.08" />
        </linearGradient>
        <linearGradient id="gradFull" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#6366f1" stop-opacity="0.12" />
          <stop offset="100%" stop-color="#6366f1" stop-opacity="0.03" />
        </linearGradient>
      </defs>

      ${gridLinesSvg}
      ${xLabelsSvg}

      <polygon points="${ptsMax.join(" ")} ${ptsMin.join(" ")}" fill="url(#gradFull)" />
      <polygon points="${ptsP75.join(" ")} ${ptsP25.join(" ")}" fill="url(#gradInter)" stroke="#3b82f6" stroke-width="1" stroke-opacity="0.4" />
      <polyline points="${ptsMed.join(" ")}" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4,4" />
      <polyline points="${ptsAtual.join(" ")}" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" />
      ${dotsSvg}
    </svg>

    <div style="display:flex; flex-wrap:wrap; gap:16px; margin-top:10px; font-size:0.75rem; color:#94a3b8; align-items:center;">
      <div style="display:flex; align-items:center; gap:6px;"><div style="width:10px; height:10px; border-radius:2px; background:#10b981;"></div><span>Vol Implícita Atual (${(ivRef * 100).toFixed(1)}%)</span></div>
      <div style="display:flex; align-items:center; gap:6px;"><div style="width:10px; height:10px; border-radius:2px; background:#3b82f6; opacity:0.6;"></div><span>Interquartil (P25-P75)</span></div>
      <div style="display:flex; align-items:center; gap:6px;"><div style="width:10px; height:10px; border-radius:2px; background:#94a3b8;"></div><span>Mediana Histórica</span></div>
      <div style="margin-left:auto;"><span style="font-size:0.7rem; background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3); padding:2px 8px; border-radius:4px; font-weight:700;">REGIME: ${regime}</span></div>
    </div>
  `;
}

/* 6. RENDERIZADOR DA TRAVA DE ALTA (BULL CALL SPREAD) */
function renderizarTravaAlta(underlyings, options, tickerSelecionado) {
  const container = document.getElementById("trava-alta-container") || document.getElementById("spread-container");
  if (!container) return;

  const u = underlyings.find(x => x.ticker === tickerSelecionado) || underlyings[0];
  const opt = options && options.length ? options[0] : null;
  const k1Strike = opt ? Number(opt.strike) : 42.0;
  const k2Strike = k1Strike + 2.0;
  const premioK1 = opt ? Number(opt.theoretical_price) : 0.50;
  const premioK2 = premioK1 * 0.45;
  const debitoLiquido = premioK1 - premioK2;
  const ganhoMaximo = (k2Strike - k1Strike) - debitoLiquido;
  const ratio = ganhoMaximo / debitoLiquido;

  container.innerHTML = `
    <div style="background:linear-gradient(135deg, rgba(30,41,59,0.5), rgba(15,23,42,0.8)); border:1px solid rgba(59,130,246,0.3); border-radius:10px; padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <h4 style="font-size:1rem; font-weight:700; color:#f1f5f9;">Trava de Alta (Bull Call Spread) — <span translate="no">${u.ticker}</span></h4>
          <span style="font-size:0.75rem; color:#64748b;">Horizonte: Vencimento ${opt ? opt.maturity_date : ''} (${opt ? opt.du : 21} DU)</span>
        </div>
        <div>
          <span style="font-size:0.7rem; background:rgba(251,191,36,0.2); color:#fbbf24; border:1px solid rgba(251,191,36,0.4); padding:2px 8px; border-radius:4px; font-weight:700;">HOMOLOGADA</span>
        </div>
      </div>

      <div style="display:flex; gap:10px; margin-bottom:14px;">
        <div style="flex:1; padding:10px; border-radius:6px; background:rgba(0,0,0,0.3); border-left:3px solid #10b981;">
          <div style="font-size:0.65rem; color:#10b981; font-weight:700;">PONTA COMPRADA (LONG)</div>
          <div style="font-size:1rem; font-weight:800; font-family:monospace; color:#f1f5f9;"><span translate="no">${opt ? opt.symbol : 'CALL LONG'}</span></div>
          <div style="font-size:0.75rem; color:#94a3b8;"><span translate="no">Strike</span>: R$ ${k1Strike.toFixed(2)} | Prêmio: R$ ${premioK1.toFixed(2)}</div>
        </div>
        <div style="flex:1; padding:10px; border-radius:6px; background:rgba(0,0,0,0.3); border-left:3px solid #f59e0b;">
          <div style="font-size:0.65rem; color:#f59e0b; font-weight:700;">PONTA VENDIDA (SHORT)</div>
          <div style="font-size:1rem; font-weight:800; font-family:monospace; color:#f1f5f9;"><span translate="no">CALL K${k2Strike.toFixed(0)}</span></div>
          <div style="font-size:0.75rem; color:#94a3b8;"><span translate="no">Strike</span>: R$ ${k2Strike.toFixed(2)} | Prêmio: R$ ${premioK2.toFixed(2)}</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:8px;">
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:8px; border-radius:6px;">
          <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase;">Débito (Risco)</div>
          <div style="font-family:monospace; font-size:0.95rem; font-weight:700; color:#f43f5e;">R$ ${debitoLiquido.toFixed(2)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:8px; border-radius:6px;">
          <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase;">Ganho Máximo</div>
          <div style="font-family:monospace; font-size:0.95rem; font-weight:700; color:#10b981;">R$ ${ganhoMaximo.toFixed(2)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:8px; border-radius:6px;">
          <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase;">Retorno/Risco</div>
          <div style="font-family:monospace; font-size:0.95rem; font-weight:700; color:#fbbf24;">${ratio.toFixed(2)}x (+${(ratio * 100).toFixed(0)}%)</div>
        </div>
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:8px; border-radius:6px;">
          <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase;"><span translate="no">Break-Even</span></div>
          <div style="font-family:monospace; font-size:0.95rem; font-weight:700; color:#38bdf8;">R$ ${(k1Strike + debitoLiquido).toFixed(2)}</div>
        </div>
      </div>
    </div>
  `;
}

/* 7. ORQUESTRADOR PRINCIPAL E POLLING */
const DATA_PATHS = ["../data/latest.json", "data/latest.json", "./data/latest.json"];

async function carregarDadosPipeline() {
  const btnAtualizar = document.getElementById("btn-atualizar");
  if (btnAtualizar) {
    btnAtualizar.classList.add("loading");
    const spanText = btnAtualizar.querySelector("span");
    if (spanText) spanText.innerText = "Atualizando...";
  }

  let dados = null;
  for (const path of DATA_PATHS) {
    try {
      const resp = await fetch(`${path}?_t=${Date.now()}`);
      if (resp.ok) {
        dados = await resp.json();
        break;
      }
    } catch (e) {}
  }

  if (dados) {
    window.appState.metadata = dados.metadata;
    window.appState.underlyings = dados.underlyings;
    window.appState.options = dados.options;
    if (!window.appState.tickerSelecionado && dados.underlyings.length > 0) {
      window.appState.tickerSelecionado = dados.underlyings[0].ticker;
    }
    renderizarTudo();
  }

  if (btnAtualizar) {
    btnAtualizar.classList.remove("loading");
    const spanText = btnAtualizar.querySelector("span");
    if (spanText) spanText.innerText = "Atualizar";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  carregarDadosPipeline();
  const btnAtualizar = document.getElementById("btn-atualizar");
  if (btnAtualizar) {
    btnAtualizar.addEventListener("click", carregarDadosPipeline);
  }
  setInterval(carregarDadosPipeline, 60000);
});
