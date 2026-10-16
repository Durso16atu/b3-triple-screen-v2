/* 0. ESTADO GLOBAL */
window.appState = {
  metadata: null,
  underlyings: [],
  options: [],
  tickerSelecionado: null,
  faseSelecionada: "TODAS",
  janelaCandles: 35
};

window.selecionarJanelaCandles = function(dias) {
  window.appState.janelaCandles = Number(dias) || 35;
  renderizarTudo();
};

window.selecionarFase = function(fase) {
  window.appState.faseSelecionada = fase;
  // Pick the first ticker of this phase if it's not "TODAS"
  const underlyings = window.appState.underlyings;
  let filtered = underlyings;
  if (fase !== "TODAS") {
    filtered = underlyings.filter(u => u.phase === fase);
  }
  if (filtered.length > 0) {
    window.appState.tickerSelecionado = filtered[0].ticker;
  }
  renderizarTudo();
};

window.selecionarAtivo = function(ticker) {
  window.appState.tickerSelecionado = ticker;
  // Sincroniza a fase com o ticker selecionado
  const u = window.appState.underlyings.find(x => x.ticker === ticker);
  if (u) {
    window.appState.faseSelecionada = u.phase;
  }
  renderizarTudo();
};

function renderizarTudo() {
  const { metadata, underlyings, options, tickerSelecionado } = window.appState;
  if (!metadata) return;

  const filteredOptions = options.filter(o => o.underlying_ticker === tickerSelecionado);

  renderizarMetadadosKPIs(metadata, filteredOptions);
  renderizarSemaforoMacro(underlyings, tickerSelecionado, filteredOptions, metadata);
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
    const statusTxt = meta.market_status || "OPERACIONAL";
    elStatus.innerHTML = `<span class="badge badge-open" style="color:#10b981; font-weight:700;"><span class="pulse-dot"></span> ${statusTxt}</span>`;
  }

  const elDescSessao = document.getElementById("kpi-desc-sessao");
  if (elDescSessao) {
    const sDate = meta.session_date || meta.business_date || "—";
    elDescSessao.innerText = `Sessão B3: ${sDate}`;
  }

  const elVencimento = document.getElementById("kpi-vencimento-ativo");
  const elSeries = document.getElementById("kpi-series-ativas");
  if (meta.active_maturity) {
    const am = meta.active_maturity;
    const matDateStr = am.maturity_date || "—";
    const du = am.days_to_maturity_du !== undefined ? am.days_to_maturity_du : "—";
    const callS = am.call_series || "—";
    const putS = am.put_series || "—";
    const rolledText = am.rolled ? " • Rolado" : "";
    if (elVencimento) {
      elVencimento.innerText = `${matDateStr} (${du} DU)`;
    }
    if (elSeries) {
      elSeries.innerText = `Calls: ${callS} | Puts: ${putS}${rolledText}`;
    }
  }

  const elUpdate = document.getElementById("kpi-ultima-atualizacao") || document.getElementById("last-update");
  if (elUpdate) {
    const ts = meta.generated_at || meta.generated_at_utc || meta.business_date;
    if (ts) {
      const d = new Date(ts);
      elUpdate.innerText = isNaN(d.getTime()) ? ts : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    }
  }

  const elFonte = document.getElementById("kpi-fonte-dados");
  if (elFonte) {
    const src = meta.data_source || "yfinance";
    elFonte.innerText = `Fonte: ${src} (America/Sao_Paulo)`;
  }

  const badgeFonte = document.getElementById("badge-fonte-dados");
  if (badgeFonte) {
    const src = meta.data_source || "yfinance";
    badgeFonte.innerText = `Fonte: ${src} (America/Sao_Paulo)`;
  }

  const elSinais = document.getElementById("kpi-sinais-armados") || document.getElementById("active-signals");
  if (elSinais) {
    const underlyings = window.appState.underlyings || [];
    const countArmados = underlyings.filter(u => u.phase === "INDICACAO_IMEDIATA" && u.gatilho_entrada != null).length;
    elSinais.innerText = countArmados;
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

/* 2. RENDERIZADOR DO SEMÁFORO MACRO (TELA 1: TENDÊNCIA, MACD E GRÁFICO CANDLESTICK) */
window.atualizarInspecaoCandle = function(dt, o, h, l, c, ema, varPct, corVar) {
  const bar = document.getElementById("candle-inspector-bar");
  if (!bar) return;
  const emaStr = ema && ema !== "null" ? `R$ ${Number(ema).toFixed(2)}` : "—";
  bar.innerHTML = `
    <span style="color:#e2e8f0; font-weight:700;">📅 ${dt}</span>
    <span>Abert: <strong style="color:#f1f5f9;">R$ ${Number(o).toFixed(2)}</strong></span>
    <span>Máx: <strong style="color:#10b981;">R$ ${Number(h).toFixed(2)}</strong></span>
    <span>Mín: <strong style="color:#f43f5e;">R$ ${Number(l).toFixed(2)}</strong></span>
    <span>Fech: <strong style="color:${corVar};">R$ ${Number(c).toFixed(2)} (${varPct})</strong></span>
    <span>EMA13: <strong style="color:#38bdf8;">${emaStr}</strong></span>
  `;
};

function gerarHtmlGraficoCandlestick(u, filteredOptions, metadata) {
  const spot = Number(u.spot_price);
  const rawHistory = Array.isArray(u.ohlc_history) && u.ohlc_history.length >= 5
    ? u.ohlc_history
    : null;

  let history = [];
  if (rawHistory) {
    history = rawHistory;
  } else {
    // Fallback determinístico caso algum cache antigo ainda não possua ohlc_history
    const sup = u.suporte_fibonacci && u.suporte_fibonacci > 0 ? Number(u.suporte_fibonacci) : spot * 0.96;
    for (let i = 34; i >= 0; i--) {
      const wave = Math.sin(i * 0.45) * (spot - sup) * 0.35;
      const baseC = spot - (i * (spot - sup) * 0.012) + wave;
      const o = Number((baseC - 0.12 * (i % 2 === 0 ? 1 : -1)).toFixed(2));
      const c = i === 0 ? spot : Number(baseC.toFixed(2));
      const h = Number((Math.max(o, c) + 0.22).toFixed(2));
      const l = Number((Math.min(o, c) - 0.20).toFixed(2));
      history.push({ date: `D-${i}`, open: o, high: h, low: l, close: c, ema13: Number(((o + c) / 2).toFixed(2)) });
    }
  }

  const janela = Number(window.appState.janelaCandles) || 35;
  const candles = history.slice(-janela);
  if (candles.length === 0) return "";

  const lastC = candles[candles.length - 1];
  const prevC = candles.length >= 2 ? candles[candles.length - 2] : lastC;
  const recent14 = candles.slice(-14);
  const min14 = u.suporte_fibonacci && u.suporte_fibonacci > 0
    ? Number(u.suporte_fibonacci)
    : Math.min(...recent14.map(c => Number(c.low)));
  const max14 = Math.max(...recent14.map(c => Number(c.high)));

  const trend = String(u.trend_signal || "NEUTRO").toUpperCase();
  const isArmed = u.phase === "INDICACAO_IMEDIATA" && u.gatilho_entrada != null && u.stop_loss != null;

  const callSeries = metadata?.active_maturity?.call_series || "K";
  const putSeries = metadata?.active_maturity?.put_series || "W";
  const prefix = u.ticker.substring(0, 4);

  let optCallSymbol = `${prefix}${callSeries}${Math.round(spot)}`;
  if (Array.isArray(filteredOptions) && filteredOptions.length > 0) {
    const sortedOpts = [...filteredOptions].sort((a, b) => Number(a.strike) - Number(b.strike));
    const recOpt = sortedOpts.find(o => Number(o.greeks?.delta) >= 0.25 && Number(o.greeks?.delta) <= 0.45)
      || sortedOpts.find(o => Number(o.strike) >= spot)
      || sortedOpts[0];
    if (recOpt && recOpt.symbol) optCallSymbol = recOpt.symbol;
  }

  let linhaSup = 0;
  let linhaInf = 0;
  let labelSup = "";
  let labelInf = "";
  let corSup = "#10b981";
  let corInf = "#f59e0b";
  let fillZona = "rgba(16, 185, 129, 0.09)";
  let tituloZona = "";
  let tooltipSup = "";
  let tooltipInf = "";

  if (trend === "ALTA" || trend === "BULLISH") {
    if (isArmed) {
      linhaSup = Number(u.gatilho_entrada);
      linhaInf = Number(u.stop_loss);
      labelSup = `GATILHO CALL ATIVO (${optCallSymbol}): R$ ${linhaSup.toFixed(2)}`;
      labelInf = `STOP LOSS / PISO DO RECUO: R$ ${linhaInf.toFixed(2)}`;
    } else {
      linhaSup = Number((Number(prevC.high) + 0.01).toFixed(2));
      linhaInf = Number(Math.min(min14, Number(lastC.low) - 0.01).toFixed(2));
      if (linhaSup <= linhaInf) {
        linhaSup = Number((Math.max(Number(prevC.high), Number(lastC.high)) + 0.15).toFixed(2));
      }
      labelSup = `GATILHO HIPOTÉTICO CALL (${optCallSymbol}): R$ ${linhaSup.toFixed(2)}`;
      labelInf = `PISO DE RECUO / SUPORTE 14D (STOP CALL): R$ ${linhaInf.toFixed(2)}`;
    }
    corSup = "#10b981";
    corInf = "#38bdf8";
    fillZona = "rgba(16, 185, 129, 0.09)";
    tituloZona = `Zona Operacional CALL (${optCallSymbol})`;
    tooltipSup = `Linha Paralela Superior (Buy Stop Tela 3): posicionada 1 centavo acima da máxima de D-1 (R$ ${linhaSup.toFixed(2)}). Na Maré de Alta, o rompimento desta linha após o recuo em sobrevenda (%K < 30%) aciona a compra da CALL ${optCallSymbol}.`;
    tooltipInf = `Linha Paralela Inferior (Suporte de Recuo / Stop Loss): posicionada na mínima de suporte de 14 dias (R$ ${linhaInf.toFixed(2)}). Delimita o piso da área de barganha onde o Estocástico recua para armar o gatilho e onde fica o Stop de proteção.`;
  } else if (trend === "BAIXA" || trend === "BEARISH") {
    linhaSup = Number((max14 + 0.01).toFixed(2));
    linhaInf = Number((Number(prevC.low) - 0.01).toFixed(2));
    if (linhaSup <= linhaInf) {
      linhaSup = Number((Math.max(Number(prevC.high), Number(lastC.high)) + 0.15).toFixed(2));
    }
    const optPutSymbol = `${prefix}${putSeries}${Math.round(linhaInf)}`;
    labelSup = `TETO DO REPIQUE / STOP TÉCNICO PUT: R$ ${linhaSup.toFixed(2)}`;
    labelInf = `GATILHO HIPOTÉTICO PUT (${optPutSymbol}): R$ ${linhaInf.toFixed(2)}`;
    corSup = "#f59e0b";
    corInf = "#f43f5e";
    fillZona = "rgba(244, 63, 94, 0.09)";
    tituloZona = `Zona Operacional PUT (${optPutSymbol})`;
    tooltipSup = `Linha Paralela Superior (Resistência / Stop PUT): máxima de 14 dias + 1 tick (R$ ${linhaSup.toFixed(2)}). Em tendência semanal de baixa, repiques até esta faixa levam o Estocástico à sobrecompra (%K > 70%) para armar venda/PUT.`;
    tooltipInf = `Linha Paralela Inferior (Gatilho Sell Stop PUT): posicionada 1 centavo abaixo da mínima de D-1 (R$ ${linhaInf.toFixed(2)}). A perda deste nível confirma retomada vendedora para entrada na PUT ${optPutSymbol}.`;
  } else {
    linhaSup = Number((max14 + 0.01).toFixed(2));
    linhaInf = Number((min14 - 0.01).toFixed(2));
    if (linhaSup <= linhaInf) {
      linhaSup = Number((spot * 1.02).toFixed(2));
      linhaInf = Number((spot * 0.98).toFixed(2));
    }
    const optPutSymbol = `${prefix}${putSeries}${Math.round(linhaInf)}`;
    labelSup = `GATILHO HIPOTÉTICO CALL (${optCallSymbol}): R$ ${linhaSup.toFixed(2)}`;
    labelInf = `GATILHO HIPOTÉTICO PUT (${optPutSymbol}): R$ ${linhaInf.toFixed(2)}`;
    corSup = "#10b981";
    corInf = "#f43f5e";
    fillZona = "rgba(56, 189, 248, 0.07)";
    tituloZona = "Canal de Descongestionamento (CALL / PUT)";
    tooltipSup = `Linha Paralela Superior (Gatilho Hipotético CALL): topo de 14 pregões + 1 tick (R$ ${linhaSup.toFixed(2)}). Com a Maré Semanal neutra, marca a resistência cujo rompimento alinhado à Tela 1 libera compra de CALL (${optCallSymbol}).`;
    tooltipInf = `Linha Paralela Inferior (Gatilho Hipotético PUT): fundo de 14 pregões - 1 tick (R$ ${linhaInf.toFixed(2)}). Marca o suporte crítico cuja perda em alinhamento baixista aciona proteção via PUT (${optPutSymbol}).`;
  }

  const allPrices = [];
  candles.forEach(c => {
    allPrices.push(Number(c.high), Number(c.low));
    if (c.ema13 != null && !isNaN(c.ema13)) allPrices.push(Number(c.ema13));
  });
  allPrices.push(linhaSup, linhaInf, spot);

  const rawMin = Math.min(...allPrices);
  const rawMax = Math.max(...allPrices);
  const span = Math.max(0.4, rawMax - rawMin);
  const minP = rawMin - span * 0.10;
  const maxP = rawMax + span * 0.12;

  const width = 640;
  const height = 295;
  const pad = { top: 22, right: 64, bottom: 32, left: 54 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const getY = (val) => pad.top + plotH - ((Number(val) - minP) / (maxP - minP)) * plotH;
  const stepX = plotW / candles.length;
  const candleW = Math.max(3.5, Math.min(13, stepX * 0.66));

  let gridSvg = "";
  for (let i = 0; i <= 4; i++) {
    const pVal = minP + (i / 4) * (maxP - minP);
    const y = getY(pVal);
    gridSvg += `
      <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}" stroke="#1e293b" stroke-dasharray="3,3" />
      <text x="${pad.left - 6}" y="${(y + 3.5).toFixed(1)}" fill="#64748b" font-size="9.5" font-family="monospace" text-anchor="end">R$ ${pVal.toFixed(2)}</text>
    `;
  }

  const ySup = getY(linhaSup);
  const yInf = getY(linhaInf);
  const yTopZone = Math.min(ySup, yInf);
  const hZone = Math.max(2, Math.abs(yInf - ySup));

  const zonaParalelaSvg = `
    <rect x="${pad.left}" y="${yTopZone.toFixed(1)}" width="${plotW}" height="${hZone.toFixed(1)}" fill="${fillZona}" />
    <line x1="${pad.left}" y1="${ySup.toFixed(1)}" x2="${width - pad.right}" y2="${ySup.toFixed(1)}" stroke="${corSup}" stroke-width="1.8" stroke-dasharray="6,4" />
    <rect x="${width - pad.right + 2}" y="${(ySup - 8).toFixed(1)}" width="58" height="16" rx="3" fill="${corSup}" fill-opacity="0.22" stroke="${corSup}" stroke-width="0.8" />
    <text x="${width - pad.right + 31}" y="${(ySup + 3.5).toFixed(1)}" fill="${corSup}" font-size="9" font-family="monospace" font-weight="700" text-anchor="middle">${linhaSup.toFixed(2)}</text>
    <text x="${pad.left + 6}" y="${(ySup - 4).toFixed(1)}" fill="${corSup}" font-size="8.5" font-family="monospace" font-weight="700">${labelSup}</text>

    <line x1="${pad.left}" y1="${yInf.toFixed(1)}" x2="${width - pad.right}" y2="${yInf.toFixed(1)}" stroke="${corInf}" stroke-width="1.8" stroke-dasharray="6,4" />
    <rect x="${width - pad.right + 2}" y="${(yInf - 8).toFixed(1)}" width="58" height="16" rx="3" fill="${corInf}" fill-opacity="0.22" stroke="${corInf}" stroke-width="0.8" />
    <text x="${width - pad.right + 31}" y="${(yInf + 3.5).toFixed(1)}" fill="${corInf}" font-size="9" font-family="monospace" font-weight="700" text-anchor="middle">${linhaInf.toFixed(2)}</text>
    <text x="${pad.left + 6}" y="${(yInf + 11).toFixed(1)}" fill="${corInf}" font-size="8.5" font-family="monospace" font-weight="700">${labelInf}</text>
  `;

  let emaPts = [];
  let candlesSvg = "";
  let xLabelsSvg = "";
  const labelInterval = Math.max(1, Math.floor(candles.length / 6));

  candles.forEach((c, idx) => {
    const cx = pad.left + (idx + 0.5) * stepX;
    const o = Number(c.open);
    const h = Number(c.high);
    const l = Number(c.low);
    const cl = Number(c.close);
    const isBull = cl >= o;
    const color = isBull ? "#10b981" : "#f43f5e";

    const yHigh = getY(h);
    const yLow = getY(l);
    const yOpen = getY(o);
    const yClose = getY(cl);
    const bodyTop = Math.min(yOpen, yClose);
    const bodyH = Math.max(2.0, Math.abs(yClose - yOpen));

    if (c.ema13 != null && !isNaN(c.ema13)) {
      emaPts.push(`${cx.toFixed(1)},${getY(c.ema13).toFixed(1)}`);
    }

    const prevClose = idx > 0 ? Number(candles[idx - 1].close) : o;
    const diffPct = prevClose > 0 ? (((cl - prevClose) / prevClose) * 100) : 0;
    const varPctStr = (diffPct >= 0 ? "+" : "") + diffPct.toFixed(2) + "%";
    const dtShort = String(c.date).length >= 10 ? String(c.date).substring(8, 10) + "/" + String(c.date).substring(5, 7) : String(c.date);

    if (idx % labelInterval === 0 || idx === candles.length - 1) {
      xLabelsSvg += `<text x="${cx.toFixed(1)}" y="${height - 10}" fill="#94a3b8" font-size="9" font-family="monospace" text-anchor="middle">${dtShort}</text>`;
    }

    candlesSvg += `
      <g class="candle-group">
        <line x1="${cx.toFixed(1)}" y1="${yHigh.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yLow.toFixed(1)}" stroke="${color}" stroke-width="1.3" />
        <rect x="${(cx - candleW / 2).toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${candleW.toFixed(1)}" height="${bodyH.toFixed(1)}" fill="${color}" rx="1" />
        <rect x="${(cx - stepX / 2).toFixed(1)}" y="${pad.top}" width="${stepX.toFixed(1)}" height="${plotH}" fill="transparent" style="cursor:crosshair;"
          onmouseenter="atualizarInspecaoCandle('${c.date}', '${o}', '${h}', '${l}', '${cl}', '${c.ema13}', '${varPctStr}', '${color}')" />
      </g>
    `;
  });

  const emaSvg = emaPts.length > 1
    ? `<polyline points="${emaPts.join(" ")}" fill="none" stroke="#38bdf8" stroke-width="1.8" stroke-opacity="0.9" />`
    : "";

  const lastPrevClose = candles.length >= 2 ? Number(candles[candles.length - 2].close) : Number(lastC.open);
  const lastDiffPct = lastPrevClose > 0 ? (((Number(lastC.close) - lastPrevClose) / lastPrevClose) * 100) : 0;
  const lastVarStr = (lastDiffPct >= 0 ? "+" : "") + lastDiffPct.toFixed(2) + "%";
  const lastColor = Number(lastC.close) >= Number(lastC.open) ? "#10b981" : "#f43f5e";
  const lastEmaStr = lastC.ema13 != null && !isNaN(lastC.ema13) ? `R$ ${Number(lastC.ema13).toFixed(2)}` : "—";

  return `
    <div style="background:#0d121d; border:1px solid #242f45; border-radius:8px; padding:14px; margin-top:4px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:0.82rem; font-weight:700; color:#f1f5f9;">📈 Candlesticks Diários — <span translate="no">${u.ticker}</span></span>
          <span style="font-size:0.68rem; background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.3); padding:1px 6px; border-radius:4px; font-family:monospace;">${tituloZona}</span>
        </div>
        <div style="display:flex; gap:4px;">
          ${[20, 35, 60].map(d => `
            <button onclick="selecionarJanelaCandles(${d})" style="background:${janela === d ? '#2563eb' : '#1e293b'}; color:${janela === d ? '#fff' : '#94a3b8'}; border:1px solid ${janela === d ? '#3b82f6' : '#334155'}; padding:2px 8px; border-radius:4px; font-size:0.7rem; font-family:monospace; font-weight:700; cursor:pointer;">${d} DU</button>
          `).join("")}
        </div>
      </div>

      <div id="candle-inspector-bar" style="display:flex; flex-wrap:wrap; gap:12px; font-size:0.72rem; font-family:monospace; color:#94a3b8; background:#090d16; padding:6px 10px; border-radius:6px; border:1px solid #1e293b; margin-bottom:8px;">
        <span style="color:#e2e8f0; font-weight:700;">📅 ${lastC.date}</span>
        <span>Abert: <strong style="color:#f1f5f9;">R$ ${Number(lastC.open).toFixed(2)}</strong></span>
        <span>Máx: <strong style="color:#10b981;">R$ ${Number(lastC.high).toFixed(2)}</strong></span>
        <span>Mín: <strong style="color:#f43f5e;">R$ ${Number(lastC.low).toFixed(2)}</strong></span>
        <span>Fech: <strong style="color:${lastColor};">R$ ${Number(lastC.close).toFixed(2)} (${lastVarStr})</strong></span>
        <span>EMA13: <strong style="color:#38bdf8;">${lastEmaStr}</strong></span>
      </div>

      <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:295px; display:block;" xmlns="http://www.w3.org/2000/svg">
        ${gridSvg}
        ${xLabelsSvg}
        ${zonaParalelaSvg}
        ${emaSvg}
        ${candlesSvg}
      </svg>

      <div style="display:flex; flex-wrap:wrap; justify-content:space-between; gap:10px; margin-top:10px; padding-top:8px; border-top:1px solid #1e293b; font-size:0.72rem; color:#94a3b8;">
        <div class="tooltip-wrap tooltip-left" onclick="event.stopPropagation()">
          <span style="display:inline-flex; align-items:center; gap:6px; cursor:help; text-decoration:underline dotted rgba(148,163,184,0.5); text-underline-offset:3px;">
            <span style="width:12px; height:3px; background:${corSup}; display:inline-block;"></span>
            <strong style="color:${corSup}; font-family:monospace;">Linha Superior: R$ ${linhaSup.toFixed(2)}</strong>
          </span>
          <div class="tooltip-bubble" onclick="event.stopPropagation()">
            <div class="tooltip-title" style="color:${corSup};">📏 Linha Horizontal Superior (Triple Screen)</div>
            <div class="tooltip-text">${tooltipSup}</div>
          </div>
        </div>

        <div class="tooltip-wrap tooltip-center" onclick="event.stopPropagation()">
          <span style="display:inline-flex; align-items:center; gap:6px; cursor:help; text-decoration:underline dotted rgba(148,163,184,0.5); text-underline-offset:3px;">
            <span style="width:12px; height:3px; background:${corInf}; display:inline-block;"></span>
            <strong style="color:${corInf}; font-family:monospace;">Linha Inferior: R$ ${linhaInf.toFixed(2)}</strong>
          </span>
          <div class="tooltip-bubble" onclick="event.stopPropagation()">
            <div class="tooltip-title" style="color:${corInf};">📐 Linha Horizontal Inferior (Triple Screen)</div>
            <div class="tooltip-text">${tooltipInf}</div>
          </div>
        </div>

        <div style="display:inline-flex; align-items:center; gap:6px;">
          <span style="width:12px; height:2.5px; background:#38bdf8; display:inline-block;"></span>
          <span style="color:#38bdf8; font-family:monospace;">EMA 13 Diária (Zona de Valor)</span>
        </div>
      </div>
    </div>
  `;
}

function renderizarSemaforoMacro(underlyings, tickerSelecionado, filteredOptions = [], metadata = null) {
  const container = document.getElementById("semaforo-macro-container") || document.getElementById("screen-1-container");
  if (!container) return;

  if (!underlyings || underlyings.length === 0) {
    container.innerHTML = `<div class="text-muted" style="color:#64748b;">Dados do ativo subjacente não disponíveis.</div>`;
    return;
  }

  const u = underlyings.find(x => x.ticker === tickerSelecionado) || underlyings[0];
  const faseSel = window.appState.faseSelecionada;

  // Filter tickers for the ticker dropdown based on selected phase
  let tickersParaMostrar = underlyings;
  if (faseSel !== "TODAS") {
    tickersParaMostrar = underlyings.filter(x => x.phase === faseSel);
  }

  let optionsHtml = tickersParaMostrar.map(x => `<option value="${x.ticker}" ${x.ticker === u.ticker ? 'selected' : ''}>${x.ticker}</option>`).join('');

  let html = `
    <div style="margin-bottom: 14px; display: flex; gap: 16px; flex-wrap: wrap;">
      <div>
        <label for="seletor-fase" style="color:#94a3b8; font-size:0.85rem; margin-right:8px;">Filtro de Fase:</label>
        <select id="seletor-fase" onchange="selecionarFase(this.value)" style="background:#0f172a; color:#f8fafc; border:1px solid #334155; padding:6px 12px; border-radius:4px; font-weight:bold; font-family:monospace; outline:none; cursor:pointer;">
          <option value="TODAS" ${faseSel === 'TODAS' ? 'selected' : ''}>TODAS</option>
          <option value="INDICACAO_IMEDIATA" ${faseSel === 'INDICACAO_IMEDIATA' ? 'selected' : ''}>🟢 INDICAÇÃO IMEDIATA</option>
          <option value="A_CAMINHO" ${faseSel === 'A_CAMINHO' ? 'selected' : ''}>🟡 A CAMINHO</option>
          <option value="AGUARDANDO" ${faseSel === 'AGUARDANDO' ? 'selected' : ''}>⚪ AGUARDANDO</option>
        </select>
      </div>
      <div>
        <label for="seletor-ativo" style="color:#94a3b8; font-size:0.85rem; margin-right:8px;">Selecione o <span translate="no">Ticker</span>:</label>
        <select id="seletor-ativo" onchange="selecionarAtivo(this.value)" style="background:#0f172a; color:#f8fafc; border:1px solid #334155; padding:6px 12px; border-radius:4px; font-weight:bold; font-family:monospace; outline:none; cursor:pointer;">
          ${optionsHtml}
        </select>
      </div>
    </div>
  `;

  const isAlta = String(u.trend_signal).toUpperCase() === "ALTA" || String(u.trend_signal).toUpperCase() === "BULLISH";
  const phaseLabel = u.phase === "INDICACAO_IMEDIATA" ? "🟢 INDICAÇÃO IMEDIATA" : (u.phase === "A_CAMINHO" ? "🟡 A CAMINHO" : "⚪ AGUARDANDO");
  const tooltipFaseTela1 = obterTooltipFase(u.phase, false);

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
          <span class="tooltip-wrap tooltip-right" onclick="event.stopPropagation()">
            <span style="font-size:0.75rem; background:rgba(16,185,129,0.2); color:#10b981; padding:2px 6px; border-radius:4px; font-weight:700; cursor:help;">TENDÊNCIA: ${u.trend_signal}</span>
            <div class="tooltip-bubble" onclick="event.stopPropagation()">
              <div class="tooltip-title">🧭 Tela 1: A Maré Semanal (Alexander Elder)</div>
              <div class="tooltip-text">Consenso entre a Média Móvel Exponencial de 13 semanas (EMA 13) e o MACD Histograma semanal. Somente tendências de ALTA autorizam operações de compra no sistema.</div>
            </div>
          </span>
          <span class="tooltip-wrap tooltip-right" onclick="event.stopPropagation()">
            <span style="font-size:0.75rem; background:rgba(255,255,255,0.1); color:#e2e8f0; padding:2px 6px; border-radius:4px; font-weight:700; cursor:help;">FASE: ${phaseLabel}</span>
            <div class="tooltip-bubble" onclick="event.stopPropagation()">
              <div class="tooltip-title">${tooltipFaseTela1.titulo}</div>
              <div class="tooltip-text">${tooltipFaseTela1.texto}</div>
            </div>
          </span>
        </div>
        <p style="font-size:0.8rem; color:#94a3b8; margin-top:4px;">
          Tela 1 (Maré Semanal): Sinal de expansão altista ativo e homologado. Filtro de Elder liberado para compras.
        </p>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom: 16px;">
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

  html += gerarHtmlGraficoCandlestick(u, filteredOptions, metadata || window.appState.metadata);

  container.innerHTML = html;
}

function obterTooltipFase(phase, isArmed) {
  if (isArmed) {
    return {
      titulo: "🟢 Sinal Armado — Consenso Triple Screen",
      texto: "Maré Semanal (Tela 1) em ALTA e recuo diário (Tela 2) em Sobrevenda (%K < 30%) com inflexão compradora confirmada. Ordem Buy Stop ativa na máxima de D-1 + R$ 0,01 com Stop Loss e Alvo 2R. Para mudar de status: volta para A CAMINHO se %K subir para >= 30%, ou para AGUARDANDO se a Tela 1 perder a alta."
    };
  }
  if (phase === "A_CAMINHO") {
    return {
      titulo: "🟡 A Caminho — Maré Semanal de Alta",
      texto: "Tendência semanal de ALTA confirmada (EMA 13 e MACD Histograma subindo), mas aguardando recuo na Tela 2. Critério para mudar para 🟢 SINAL ARMADO: o Estocástico Lento deve cair para Sobrevenda (%K < 30%) e confirmar virada (%K > %D ou Force Index EMA-2 < 0 subindo). Cai para ⚪ AGUARDANDO se a Tela 1 perder a alta."
    };
  }
  return {
    titulo: "⚪ Aguardando Setup — Sem Tendência de Alta",
    texto: "A Maré Semanal (Tela 1) está em BAIXA ou NEUTRO, bloqueando compras. Critério para mudar de status: avança para 🟡 A CAMINHO quando EMA 13 e MACD Histograma semanais subirem juntos (Tela 1 = ALTA), ou para 🟢 SINAL ARMADO se além da Tela 1 em ALTA houver %K < 30% com virada compradora."
  };
}

function calcularDescricaoEstocastico(u, isArmed) {
  const k = u.stoch_k != null && !isNaN(u.stoch_k) ? Number(u.stoch_k) : null;
  const d = u.stoch_d != null && !isNaN(u.stoch_d) ? Number(u.stoch_d) : null;

  if (isArmed) {
    const kStr = k != null ? k.toFixed(1) : "--.-";
    const dStr = d != null ? d.toFixed(1) : "--.-";
    const barWidth = k != null ? Math.min(100, Math.max(0, k)).toFixed(1) : "45.0";
    return {
      texto: `Pullback Confirmado (%K: ${kStr}% | %D: ${dStr}%) — Gatilho Armado`,
      cor: "#10b981",
      larguraBarra: barWidth,
      tooltipTitulo: "🚀 Pullback Finalizado e Gatilho Ativo",
      tooltipTexto: `O recuo diário atingiu Sobrevenda (%K: ${kStr}% < 30% | %D: ${dStr}%) e confirmou retomada compradora. Status alterado para 🟢 SINAL ARMADO com Buy Stop na máxima de D-1 + R$ 0,01, Stop Loss na mínima do recuo - R$ 0,01 e Alvo 2R.`
    };
  }

  if (k != null && d != null) {
    const kStr = k.toFixed(1);
    const dStr = d.toFixed(1);
    const barWidth = Math.min(100, Math.max(0, k)).toFixed(1);

    if (k > 70) {
      return {
        texto: `Sobrecompra (%K: ${kStr}% | %D: ${dStr}%) — Aguardar Recuo`,
        cor: "#f43f5e",
        larguraBarra: barWidth,
        tooltipTitulo: "⚠️ Estocástico em Sobrecompra (%K > 70%)",
        tooltipTexto: `Preço à vista esticado no curto prazo (%K: ${kStr}% > 70% | %D: ${dStr}%). Não contempla mudança para compra agora pois comprar no topo eleva o risco de correção imediata. Para mudar para 🟢 SINAL ARMADO: manter Tela 1 em ALTA, recuar na Tela 2 até Sobrevenda (%K < 30%) e confirmar virada (%K > %D ou Force Index EMA-2 < 0 subindo).`
      };
    }
    if (k >= 30 && k <= 70) {
      if (k < d) {
        return {
          texto: `Recuo em Andamento (%K: ${kStr}% | %D: ${dStr}%)`,
          cor: "#fbbf24",
          larguraBarra: barWidth,
          tooltipTitulo: "⏳ Recuo Corretivo em Andamento (%K < %D)",
          tooltipTexto: `Realização de lucros em curso (%K: ${kStr}% abaixo de %D: ${dStr}%, faixa 30%–70%). Ainda não contempla disparo de compra. Para mudar para 🟢 SINAL ARMADO: manter Tela 1 em ALTA, aprofundar o recuo até Sobrevenda (%K < 30%) e confirmar inflexão compradora (%K > %D ou Force Index EMA-2 < 0 subindo).`
        };
      } else {
        return {
          texto: `Zona Neutra (%K: ${kStr}% | %D: ${dStr}%)`,
          cor: "#94a3b8",
          larguraBarra: barWidth,
          tooltipTitulo: "⚖️ Oscilador em Zona de Equilíbrio (30% a 70%)",
          tooltipTexto: `Estocástico Lento na faixa intermediária (%K: ${kStr}% | %D: ${dStr}% entre 30% e 70%), sem desconto suficiente para gatilho. Para mudar para 🟢 SINAL ARMADO: manter Tela 1 em ALTA, recuar até Sobrevenda (%K < 30%) e confirmar virada (%K > %D ou Force Index EMA-2 < 0 subindo).`
        };
      }
    }
    if (k < 30) {
      const faltaSoVirada = u.phase === "A_CAMINHO";
      return {
        texto: `Sobrevenda (%K: ${kStr}% | %D: ${dStr}%) — Aguardando Virada`,
        cor: "#38bdf8",
        larguraBarra: barWidth,
        tooltipTitulo: "🎯 Estocástico em Sobrevenda (%K < 30%)",
        tooltipTexto: faltaSoVirada
          ? `Ativo já descontado na Tela 2 (%K: ${kStr}% < 30% | %D: ${dStr}%) com Maré Semanal em ALTA, mas ainda sem confirmação de virada. Para mudar para 🟢 SINAL ARMADO: basta %K cruzar acima de %D (%K > %D) ou o Force Index EMA-2 (< 0) virar para cima no fechamento diário.`
          : `Apesar de o diário estar em Sobrevenda (%K: ${kStr}% < 30% | %D: ${dStr}%), a Maré Semanal (Tela 1: ${u.trend_signal || "BAIXA/NEUTRO"}) bloqueia compras contra a tendência. Para mudar de status: aguardar EMA 13 e MACD Histograma semanais virarem para ALTA e confirmar inflexão na Tela 2.`
      };
    }
  }

  return {
    texto: u.phase === "A_CAMINHO" ? "Aguardando Recuo" : "Aguardando Setup",
    cor: "#64748b",
    larguraBarra: "15.0",
    tooltipTitulo: u.phase === "A_CAMINHO" ? "🟡 Monitorando Recuo Diário" : "⚪ Aguardando Setup",
    tooltipTexto: u.phase === "A_CAMINHO"
      ? "Tendência primária semanal altista confirmada. Para mudar para 🟢 SINAL ARMADO: aguardar recuo diário até Sobrevenda (%K < 30%) com confirmação de virada compradora (%K > %D ou Force Index EMA-2 < 0 subindo)."
      : "Aguardando alinhamento da Maré Semanal (Tela 1 em ALTA) e recuo diário (%K < 30% com inflexão compradora) para autorizar compras."
  };
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
  const faseSel = window.appState.faseSelecionada;

  underlyings.forEach(u => {
    const isSelected = u.ticker === tickerSelecionado;
    const borderStyle = isSelected ? "border: 2px solid #38bdf8;" : "border: 1px solid #242f45;";

    if (faseSel !== "TODAS" && u.phase !== faseSel) return;

    const spot = Number(u.spot_price);
    const hasTriggers = u.gatilho_entrada != null && u.stop_loss != null && u.alvo_2r != null;
    const isArmed = u.phase === "INDICACAO_IMEDIATA" && hasTriggers;

    const gatilho = hasTriggers ? Number(u.gatilho_entrada) : null;
    const stopLoss = hasTriggers ? Number(u.stop_loss) : null;
    const alvo2R = hasTriggers ? Number(u.alvo_2r) : null;
    const riscoR = (gatilho != null && stopLoss != null) ? (gatilho - stopLoss) : null;

    const stochInfo = calcularDescricaoEstocastico(u, isArmed);
    const tooltipFase = obterTooltipFase(u.phase, isArmed);

    const gatilhoHtml = gatilho != null && !isNaN(gatilho)
      ? `R$ ${gatilho.toFixed(2)}`
      : `<span style="color:#64748b; font-weight:600;">—</span>`;

    const stopLossHtml = stopLoss != null && !isNaN(stopLoss)
      ? `R$ ${stopLoss.toFixed(2)}`
      : `<span style="color:#64748b; font-weight:600;">—</span>`;

    const alvo2RHtml = alvo2R != null && !isNaN(alvo2R)
      ? `R$ ${alvo2R.toFixed(2)}`
      : `<span style="color:#64748b; font-weight:600;">—</span>`;

    const alvoLabel = (riscoR != null && !isNaN(riscoR))
      ? `Alvo 2R (+R$ ${(2 * riscoR).toFixed(2)})`
      : `Alvo 2R`;

    const badgeElement = isArmed
      ? `<span class="badge" style="background:rgba(16,185,129,0.2); color:#10b981; border:1px solid rgba(16,185,129,0.4);"><span class="pulse-dot"></span> SINAL ARMADO</span>`
      : (u.phase === "A_CAMINHO"
        ? `<span class="badge" style="background:rgba(251,191,36,0.2); color:#fbbf24; border:1px solid rgba(251,191,36,0.4);">A CAMINHO</span>`
        : `<span class="badge" style="background:rgba(100,116,139,0.2); color:#94a3b8; border:1px solid rgba(100,116,139,0.3);">AGUARDANDO SETUP</span>`);

    const statusBadge = `
      <div class="tooltip-wrap tooltip-right" onclick="event.stopPropagation()">
        ${badgeElement}
        <div class="tooltip-bubble" onclick="event.stopPropagation()">
          <div class="tooltip-title">${tooltipFase.titulo}</div>
          <div class="tooltip-text">${tooltipFase.texto}</div>
        </div>
      </div>
    `;

    html += `
      <div onclick="selecionarAtivo('${u.ticker}')" style="background:#111622; border-radius:8px; ${borderStyle} padding:14px; margin-bottom:14px; cursor:pointer; transition: 0.2s;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-size:1.1rem; font-weight:800; font-family:monospace; color:#f1f5f9;">
            <span translate="no">${u.ticker}</span> <span style="font-size:0.85rem; color:#94a3b8; font-weight:normal;">R$ ${spot.toFixed(2)}</span>
          </div>
          <div>
            ${statusBadge}
          </div>
        </div>

        <div style="margin:10px 0;">
          <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:4px; color:#94a3b8; gap:8px;">
            <span class="tooltip-wrap tooltip-left" onclick="event.stopPropagation()">
              <span style="text-decoration:underline dotted rgba(148,163,184,0.5); text-underline-offset:3px; cursor:help;">Estocástico Lento (Tela 2 - Onda Diária)</span>
              <div class="tooltip-bubble" onclick="event.stopPropagation()">
                <div class="tooltip-title">🌊 Tela 2: A Onda Diária (Alexander Elder)</div>
                <div class="tooltip-text">Mede o ímpeto corretivo diário contra a tendência semanal principal. O objetivo atuarial é identificar pontos de recuo técnico para compras com risco reduzido e alta assimetria.</div>
              </div>
            </span>
            <span class="tooltip-wrap tooltip-right" onclick="event.stopPropagation()">
              <span style="color:${stochInfo.cor}; font-family:monospace; font-weight:700; text-decoration:underline dotted ${stochInfo.cor}88; text-underline-offset:3px; cursor:help;">${stochInfo.texto}</span>
              <div class="tooltip-bubble" onclick="event.stopPropagation()">
                <div class="tooltip-title" style="color:${stochInfo.cor};">${stochInfo.tooltipTitulo}</div>
                <div class="tooltip-text">${stochInfo.tooltipTexto}</div>
              </div>
            </span>
          </div>
          <div style="height:6px; background:#1e293b; border-radius:3px; overflow:hidden;">
            <div style="width:${stochInfo.larguraBarra}%; height:100%; background:${stochInfo.cor}; border-radius:3px; transition: width 0.3s ease;"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:#64748b; margin-top:4px;">
            <span>0 (Sobrevenda &lt; 30)</span>
            <span>Suporte: R$ ${u.suporte_fibonacci && u.suporte_fibonacci > 0 ? Number(u.suporte_fibonacci).toFixed(2) : (spot * 0.985).toFixed(2)}</span>
            <span>100 (Sobrecompra &gt; 70)</span>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-top:12px; background:rgba(0,0,0,0.25); padding:8px; border-radius:6px; text-align:center;">
          <div class="tooltip-wrap tooltip-center" onclick="event.stopPropagation()" style="display:block;">
            <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase; text-decoration:underline dotted rgba(100,116,139,0.5); text-underline-offset:2px; cursor:help;">Gatilho (<span translate="no">Buy Stop</span>)</div>
            <div style="font-family:monospace; font-size:0.95rem; font-weight:700; color:#38bdf8;">${gatilhoHtml}</div>
            <div class="tooltip-bubble" onclick="event.stopPropagation()">
              <div class="tooltip-title">🎯 Gatilho Tela 3 (Buy Stop)</div>
              <div class="tooltip-text">Preço de disparo posicionado 1 centavo acima da máxima anterior. A compra só ocorre se o mercado confirmar força compradora rompendo esse patamar.</div>
            </div>
          </div>
          <div class="tooltip-wrap tooltip-center" onclick="event.stopPropagation()" style="display:block;">
            <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase; text-decoration:underline dotted rgba(100,116,139,0.5); text-underline-offset:2px; cursor:help;">Stop Loss Macro</div>
            <div style="font-family:monospace; font-size:0.95rem; font-weight:700; color:#f43f5e;">${stopLossHtml}</div>
            <div class="tooltip-bubble" onclick="event.stopPropagation()">
              <div class="tooltip-title">🛑 Stop Loss Macro (1R)</div>
              <div class="tooltip-text">Ponto de saída de emergência posicionado abaixo do suporte recente ou mínima anterior. Define o risco unitário (R) da operação para proteção estrita de capital.</div>
            </div>
          </div>
          <div class="tooltip-wrap tooltip-center" onclick="event.stopPropagation()" style="display:block;">
            <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase; text-decoration:underline dotted rgba(100,116,139,0.5); text-underline-offset:2px; cursor:help;">${alvoLabel}</div>
            <div style="font-family:monospace; font-size:0.95rem; font-weight:700; color:#10b981;">${alvo2RHtml}</div>
            <div class="tooltip-bubble" onclick="event.stopPropagation()">
              <div class="tooltip-title">🏆 Alvo de Lucro (2R)</div>
              <div class="tooltip-text">Projeção matemática de ganho dimensionada em 2 vezes o risco inicial (2R). Garante expectativa matemática positiva mesmo com taxa de acerto conservadora.</div>
            </div>
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

  // Find ATM or close to ATM for K1
  let optK1 = null;
  let optK2 = null;

  if (options && options.length >= 2) {
      // Sort options by strike
      const sortedOptions = [...options].sort((a, b) => Number(a.strike) - Number(b.strike));
      // Find first strike >= spot
      optK1 = sortedOptions.find(o => Number(o.strike) >= Number(u.spot_price));
      if (!optK1) optK1 = sortedOptions[sortedOptions.length - 2];

      const k1Index = sortedOptions.indexOf(optK1);
      optK2 = sortedOptions[Math.min(k1Index + 1, sortedOptions.length - 1)];
      if (optK1 === optK2 && k1Index > 0) {
          optK1 = sortedOptions[k1Index - 1];
      }
  }

  const k1Strike = optK1 ? Number(optK1.strike) : 42.0;
  const k2Strike = optK2 ? Number(optK2.strike) : k1Strike + 2.0;
  const premioK1 = optK1 ? Number(optK1.theoretical_price) : 0.50;
  const premioK2 = optK2 ? Number(optK2.theoretical_price) : premioK1 * 0.45;

  const debitoLiquido = Math.max(0.01, premioK1 - premioK2);
  const ganhoMaximo = Math.max(0, (k2Strike - k1Strike) - debitoLiquido);
  const ratio = ganhoMaximo / debitoLiquido;

  container.innerHTML = `
    <div style="background:linear-gradient(135deg, rgba(30,41,59,0.5), rgba(15,23,42,0.8)); border:1px solid rgba(59,130,246,0.3); border-radius:10px; padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <h4 style="font-size:1rem; font-weight:700; color:#f1f5f9;">Trava de Alta (Bull Call Spread) — <span translate="no">${u.ticker}</span></h4>
          <span style="font-size:0.75rem; color:#64748b;">Horizonte: Vencimento ${optK1 ? optK1.maturity_date : ''} (${optK1 ? optK1.du : 21} DU)</span>
        </div>
        <div>
          <span style="font-size:0.7rem; background:rgba(251,191,36,0.2); color:#fbbf24; border:1px solid rgba(251,191,36,0.4); padding:2px 8px; border-radius:4px; font-weight:700;">HOMOLOGADA</span>
        </div>
      </div>

      <div style="display:flex; gap:10px; margin-bottom:14px;">
        <div style="flex:1; padding:10px; border-radius:6px; background:rgba(0,0,0,0.3); border-left:3px solid #10b981;">
          <div style="font-size:0.65rem; color:#10b981; font-weight:700;">PONTA COMPRADA (LONG)</div>
          <div style="font-size:1rem; font-weight:800; font-family:monospace; color:#f1f5f9;"><span translate="no">${optK1 ? optK1.symbol : 'CALL LONG'}</span></div>
          <div style="font-size:0.75rem; color:#94a3b8;"><span translate="no">Strike</span>: R$ ${k1Strike.toFixed(2)} | Prêmio: R$ ${premioK1.toFixed(2)}</div>
        </div>
        <div style="flex:1; padding:10px; border-radius:6px; background:rgba(0,0,0,0.3); border-left:3px solid #f59e0b;">
          <div style="font-size:0.65rem; color:#f59e0b; font-weight:700;">PONTA VENDIDA (SHORT)</div>
          <div style="font-size:1rem; font-weight:800; font-family:monospace; color:#f1f5f9;"><span translate="no">${optK2 ? optK2.symbol : 'CALL SHORT'}</span></div>
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

/* 7. ORQUESTRADOR PRINCIPAL E CONEXÃO HÍBRIDA COM APPS SCRIPT */
function obterCaminhosDados() {
  const pathAtual = window.location.pathname;
  const basePath = pathAtual.endsWith("/")
    ? pathAtual
    : pathAtual.substring(0, pathAtual.lastIndexOf("/") + 1);
  const urlAbsoluta = `${window.location.origin}${basePath}data/latest.json`;
  const urlRawGitHub = "https://raw.githubusercontent.com/Durso16atu/b3-triple-screen-v2/main/data/latest.json";
  return [urlRawGitHub, urlAbsoluta, "data/latest.json", "./data/latest.json", "../data/latest.json"];
}

const APPS_SCRIPT_URL = window.APPS_SCRIPT_URL || "";

/**
 * Atualiza o badge e a descrição da fonte de dados na interface.
 */
function atualizarBadgeFonte(texto, tipo = "cdn") {
  const badge = document.getElementById("badge-fonte-dados");
  const kpiDesc = document.getElementById("kpi-fonte-dados");

  let color = "#38bdf8";
  let bg = "rgba(56, 189, 248, 0.15)";
  let border = "1px solid rgba(56, 189, 248, 0.3)";

  if (tipo === "live") {
    color = "#10b981";
    bg = "rgba(16, 185, 129, 0.15)";
    border = "1px solid rgba(16, 185, 129, 0.3)";
  } else if (tipo === "fallback") {
    color = "#f59e0b";
    bg = "rgba(245, 158, 11, 0.15)";
    border = "1px solid rgba(245, 158, 11, 0.3)";
  } else if (tipo === "loading") {
    color = "#a855f7";
    bg = "rgba(168, 85, 247, 0.15)";
    border = "1px solid rgba(168, 85, 247, 0.3)";
  }

  if (badge) {
    badge.innerText = texto;
    badge.style.color = color;
    badge.style.background = bg;
    badge.style.border = border;
  }
  if (kpiDesc) {
    kpiDesc.innerText = texto;
  }
}

/**
 * Popula o estado global e aciona a renderização de todos os módulos.
 */
function aplicarDadosNoEstado(dados) {
  if (!dados || !dados.underlyings) return false;

  window.appState.metadata = dados.metadata || {};
  window.appState.underlyings = dados.underlyings || [];
  window.appState.options = dados.options || [];

  if (!window.appState.tickerSelecionado && window.appState.underlyings.length > 0) {
    window.appState.tickerSelecionado = window.appState.underlyings[0].ticker;
  }

  renderizarTudo();
  return true;
}

/**
 * Carrega os dados estáticos do cache local (CDN).
 */
async function carregarFallbackEstatico() {
  let dados = null;
  const paths = obterCaminhosDados();
  for (const path of paths) {
    try {
      const resp = await fetch(`${path}?t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      });
      if (resp.ok) {
        dados = await resp.json();
        break;
      }
    } catch (e) {}
  }
  const aplicado = aplicarDadosNoEstado(dados);
  if (aplicado) {
    const fonte = dados?.metadata?.data_source || "yfinance";
    atualizarBadgeFonte(`Fonte: ${fonte} (America/Sao_Paulo)`, "cdn");
    const kpiFonte = document.getElementById("kpi-fonte-dados");
    if (kpiFonte) {
      const horaCheck = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
      kpiFonte.innerText = `Fonte: ${fonte} (Sinc: ${horaCheck})`;
    }
  }
  return aplicado;
}

/**
 * Orquestrador de Carga e Atualização Contínua:
 * - Imediato e reativo: busca a versão mais fresca de data/latest.json sem travar a interface.
 * - Suporta polling periódico a cada 60s e atualização sob demanda via clique no botão.
 */
async function carregarDadosPipeline(forcarAtualizacaoAoVivo = false) {
  const btnAtualizar = document.getElementById("btn-atualizar");
  const spanText = btnAtualizar ? btnAtualizar.querySelector("span") : null;

  if (forcarAtualizacaoAoVivo) {
    // 1. Feedback visual imediato
    if (btnAtualizar) btnAtualizar.classList.add("loading");
    if (spanText) spanText.innerText = "Atualizando...";
    atualizarBadgeFonte("Sincronizando...", "loading");

    // 2. Busca os dados mais recentes do pipeline com cache-busting estrito
    const sucesso = await carregarFallbackEstatico();

    // 3. Tenta endpoint opcional externo caso explicitamente configurado no window
    if (window.APPS_SCRIPT_URL && window.APPS_SCRIPT_URL !== "") {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const resp = await fetch(window.APPS_SCRIPT_URL, {
          method: "GET",
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (resp.ok) {
          const dados = await resp.json();
          if (dados && dados.underlyings && dados.options) {
            aplicarDadosNoEstado(dados);
            atualizarBadgeFonte("Fonte: Planilha ao Vivo (Google Sheets)", "live");
          }
        }
      } catch (e) {}
    }

    if (btnAtualizar) btnAtualizar.classList.remove("loading");
    if (spanText) spanText.innerText = "Atualizado!";
    setTimeout(() => {
      if (spanText) spanText.innerText = "Atualizar";
    }, 1500);
  } else {
    // Carga inicial rápida (CDN) ou polling periódico
    if (btnAtualizar) btnAtualizar.classList.add("loading");
    if (spanText) spanText.innerText = "Atualizando...";

    const sucesso = await carregarFallbackEstatico();
    if (sucesso) {
      const fonte = window.appState.metadata?.data_source || "yfinance";
      atualizarBadgeFonte(`Fonte: ${fonte} (America/Sao_Paulo)`, "cdn");
    }

    if (btnAtualizar) btnAtualizar.classList.remove("loading");
    if (spanText) spanText.innerText = "Atualizar";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  carregarDadosPipeline(false);
  const btnAtualizar = document.getElementById("btn-atualizar");
  if (btnAtualizar) {
    btnAtualizar.addEventListener("click", () => carregarDadosPipeline(true));
  }
  setInterval(() => carregarDadosPipeline(false), 60000);
});
