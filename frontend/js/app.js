/* 0. ESTADO GLOBAL */
window.appState = {
  metadata: null,
  underlyings: [],
  options: [],
  tickerSelecionado: null,
  faseSelecionada: "TODAS",
  janelaCandles: 35,
  overlayGrafico: "ELDER" // "ELDER", "PHICUBE_MIMA", "GOES_PRICESHOOTER"
};

window.selecionarJanelaCandles = function(dias) {
  window.appState.janelaCandles = Number(dias) || 35;
  renderizarTudo();
};

window.selecionarOverlayGrafico = function(modo) {
  window.appState.overlayGrafico = modo || "ELDER";
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
  renderizarBussolaPhiCube(underlyings, filteredOptions, tickerSelecionado);
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
window.atualizarInspecaoCandle = function(dt, o, h, l, c, ema, varPct, corVar, extraInfo = "") {
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
    ${extraInfo ? `<span style="color:#fbbf24; font-weight:600;">${extraInfo}</span>` : ""}
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
  const overlayMode = window.appState.overlayGrafico || "ELDER";
  const candles = history.slice(-janela);
  if (candles.length === 0) return "";

  const lastC = candles[candles.length - 1];
  const recent14 = candles.slice(-14);
  const low14 = Math.min(...recent14.map(c => Number(c.low)));
  const high14 = Math.max(...recent14.map(c => Number(c.high)));
  const amp14 = Math.max(0.20, high14 - low14);

  const trend = String(u.trend_signal || "NEUTRO").toUpperCase();
  const isArmed = u.phase === "INDICACAO_IMEDIATA" && u.gatilho_entrada != null && u.stop_loss != null;
  const phi = u.phicube || null;

  const callSeries = metadata?.active_maturity?.call_series || "K";
  const putSeries = metadata?.active_maturity?.put_series || "W";
  const prefix = u.ticker.substring(0, 4);

  let optCallSymbol = `${prefix}${callSeries}${Math.round(spot * 10)}`;
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
  let corInf = "#38bdf8";
  let fillZona = "rgba(16, 185, 129, 0.11)";
  let tituloZona = "";
  let tooltipSup = "";
  let tooltipInf = "";

  if (overlayMode === "GOES_PRICESHOOTER" && phi && phi.caiu_comprou_72 != null && phi.levantou_cortou_72 != null) {
    linhaSup = Number(phi.caiu_comprou_72);
    linhaInf = Number(phi.levantou_cortou_72);
    if (linhaSup <= linhaInf) linhaSup = Number((linhaInf + 0.30).toFixed(2));
    labelSup = `CAIU COMPROU 72 (78.6% Suporte / PV | ${optCallSymbol}): R$ ${linhaSup.toFixed(2)}`;
    labelInf = `LEVANTOU CORTOU 72 (21.4% Resist / PC): R$ ${linhaInf.toFixed(2)}`;
    corSup = "#10b981";
    corInf = "#f43f5e";
    fillZona = "rgba(16, 185, 129, 0.08)";
    tituloZona = `Setup Fernando Góes (Caiu Comprou R$ ${linhaSup.toFixed(2)} | Alvo Phibo 100%: R$ ${(phi.phibo_100 || spot).toFixed(2)})`;
    tooltipSup = `Linha Caiu Comprou 72 (Fernando Góes - PriceShooter): retração fractal de 78,6% do canal de 72 pregões (R$ ${linhaSup.toFixed(2)}). Enquanto o preço trabalhar acima ou testar este piso com Smart MA virando, é zona de compra a favor da tendência.`;
    tooltipInf = `Linha Levantou Cortou 72 (Fernando Góes - PriceShooter): retração inferior de 21,4% do canal de 72 pregões (R$ ${linhaInf.toFixed(2)}). Abaixo deste nível ativa-se Proibido Comprar (PC).`;
  } else if (trend === "ALTA" || trend === "BULLISH") {
    if (isArmed) {
      linhaSup = Number(u.gatilho_entrada);
      linhaInf = Number(u.stop_loss);
      labelSup = `GATILHO CALL ATIVO (${optCallSymbol}): R$ ${linhaSup.toFixed(2)}`;
      labelInf = `STOP LOSS / PISO DO RECUO (%K < 30%): R$ ${linhaInf.toFixed(2)}`;
      tituloZona = `Gatilho Armado CALL (${optCallSymbol})`;
    } else {
      linhaSup = Number((low14 + 0.30 * amp14).toFixed(2));
      linhaInf = Number((low14 - 0.01).toFixed(2));
      if (linhaSup <= linhaInf) {
        linhaSup = Number((linhaInf + 0.25).toFixed(2));
      }
      const strikeProjCall = Number((linhaSup * 1.025).toFixed(1));
      const optProjCallSymbol = Math.abs(spot - linhaSup) / spot < 0.03
        ? optCallSymbol
        : `${prefix}${callSeries}${Math.round(strikeProjCall * 10)}`;
      labelSup = `GATILHO HIPOTÉTICO CALL (%K <= 30% + Virada | Proj: ${optProjCallSymbol}): R$ ${linhaSup.toFixed(2)}`;
      labelInf = `PISO DE SOBREVENDA (%K = 0% / STOP CALL): R$ ${linhaInf.toFixed(2)}`;
      tituloZona = `Faixa CALL (%K ≤ 30%: ${optProjCallSymbol} | Ref Spot: ${optCallSymbol})`;
    }
    corSup = "#10b981";
    corInf = "#38bdf8";
    fillZona = "rgba(16, 185, 129, 0.12)";
    const strikeProjTooltip = Number((linhaSup * 1.025).toFixed(2));
    tooltipSup = `Linha Paralela Superior (Limiar de Gatilho CALL — %K = 30%): calculada pela fórmula do Estocástico Lento (Mín14 + 30% da amplitude = R$ ${linhaSup.toFixed(2)}). Ao recuar até R$ ${linhaSup.toFixed(2)} com virada compradora (%K > %D ou Force Index EMA-2 < 0 subindo), o Strike OTM ótimo projetado situa-se próximo a R$ ${strikeProjTooltip.toFixed(2)} (enquanto ao Spot atual de R$ ${spot.toFixed(2)} a referência da grade é ${optCallSymbol}).`;
    tooltipInf = `Linha Paralela Inferior (Piso de Sobrevenda %K = 0% / Stop Loss): posicionada 1 centavo abaixo da mínima de 14 pregões (R$ ${linhaInf.toFixed(2)}). Delimita a base da faixa de captura onde o gatilho é armado e protegido.`;
  } else if (trend === "BAIXA" || trend === "BEARISH") {
    linhaSup = Number((high14 + 0.01).toFixed(2));
    linhaInf = Number((low14 + 0.70 * amp14).toFixed(2));
    if (linhaSup <= linhaInf) {
      linhaSup = Number((linhaInf + 0.25).toFixed(2));
    }
    const strikeProjPut = Number((linhaInf * 0.975).toFixed(1));
    const optPutSymbol = `${prefix}${putSeries}${Math.round(strikeProjPut * 10)}`;
    labelSup = `TETO DE SOBRECOMPRA (%K = 100% / STOP PUT): R$ ${linhaSup.toFixed(2)}`;
    labelInf = `GATILHO HIPOTÉTICO PUT (%K >= 70% + Virada | Proj: ${optPutSymbol}): R$ ${linhaInf.toFixed(2)}`;
    corSup = "#f59e0b";
    corInf = "#f43f5e";
    fillZona = "rgba(244, 63, 94, 0.12)";
    tituloZona = `Faixa de Gatilho PUT (%K ≥ 70% | ${optPutSymbol})`;
    tooltipSup = `Linha Paralela Superior (Teto de Sobrecompra %K = 100% / Stop PUT): posicionada 1 centavo acima da máxima de 14 pregões (R$ ${linhaSup.toFixed(2)}). Delimita o topo da faixa de repique e o Stop Técnico da operação.`;
    tooltipInf = `Linha Paralela Inferior (Limiar de Gatilho PUT — %K = 70%): calculada pela fórmula do Estocástico Lento (Mín14 + 70% da amplitude = R$ ${linhaInf.toFixed(2)}). Na Maré de Baixa, o preço precisa repicar acima desta linha (%K > 70%) e confirmar virada vendedora (%K < %D ou Force Index EMA-2 > 0 caindo) para acionar a PUT projetada ${optPutSymbol} (Strike ~R$ ${strikeProjPut.toFixed(2)}).`;
  } else {
    linhaSup = Number((low14 + 0.70 * amp14).toFixed(2));
    linhaInf = Number((low14 + 0.30 * amp14).toFixed(2));
    if (linhaSup <= linhaInf) {
      linhaSup = Number((spot * 1.02).toFixed(2));
      linhaInf = Number((spot * 0.98).toFixed(2));
    }
    const strikeProjPut = Number((linhaSup * 0.975).toFixed(1));
    const strikeProjCall = Number((linhaInf * 1.025).toFixed(1));
    const optPutSymbol = `${prefix}${putSeries}${Math.round(strikeProjPut * 10)}`;
    const optProjCallSymbol = `${prefix}${callSeries}${Math.round(strikeProjCall * 10)}`;
    labelSup = `LIMIAR SOBRECOMPRA PUT (%K >= 70% | Proj: ${optPutSymbol}): R$ ${linhaSup.toFixed(2)}`;
    labelInf = `LIMIAR SOBREVENDA CALL (%K <= 30% | Proj: ${optProjCallSymbol}): R$ ${linhaInf.toFixed(2)}`;
    corSup = "#f43f5e";
    corInf = "#10b981";
    fillZona = "rgba(56, 189, 248, 0.08)";
    tituloZona = "Banda de Equilíbrio (%K: 30% a 70%)";
    tooltipSup = `Linha Paralela Superior (Limiar %K = 70% — R$ ${linhaSup.toFixed(2)}): fronteira de sobrecompra de 14 dias. Caso a Tela 1 vire para BAIXA, repiques acima desta linha com virada vendedora acionam PUT (${optPutSymbol}).`;
    tooltipInf = `Linha Paralela Inferior (Limiar %K = 30% — R$ ${linhaInf.toFixed(2)}): fronteira de sobrevenda de 14 dias. Caso a Tela 1 vire para ALTA, recuos abaixo desta linha com virada compradora acionam CALL (${optProjCallSymbol}).`;
  }

  const allPrices = [];
  candles.forEach(c => {
    allPrices.push(Number(c.high), Number(c.low));
    if (c.ema13 != null && !isNaN(c.ema13)) allPrices.push(Number(c.ema13));
    if (overlayMode === "PHICUBE_MIMA") {
      ["mima17", "mima72", "mima144"].forEach(k => {
        if (c[k] != null && !isNaN(c[k])) allPrices.push(Number(c[k]));
      });
    } else if (overlayMode === "GOES_PRICESHOOTER") {
      ["pv_support", "pc_resist", "smart_upper", "smart_lower"].forEach(k => {
        if (c[k] != null && !isNaN(c[k])) allPrices.push(Number(c[k]));
      });
    }
  });
  allPrices.push(linhaSup, linhaInf, spot);

  const rawMin = Math.min(...allPrices);
  const rawMax = Math.max(...allPrices);
  const span = Math.max(0.4, rawMax - rawMin);
  const minP = rawMin - span * 0.12;
  const maxP = rawMax + span * 0.14;

  const width = 640;
  const height = 295;
  const pad = { top: 24, right: 68, bottom: 32, left: 54 };
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
  const ySpot = getY(spot);
  const lastEmaNum = lastC.ema13 != null && !isNaN(lastC.ema13) ? Number(lastC.ema13) : null;
  const yEma = lastEmaNum != null ? getY(lastEmaNum) : null;

  const yTopZone = Math.min(ySup, yInf);
  const hZone = Math.max(2, Math.abs(yInf - ySup));
  const supPillW = Math.max(180, labelSup.length * 5.2 + 12);
  const infPillW = Math.max(180, labelInf.length * 5.2 + 12);

  const zonaFundoSvg = `
    <rect x="${pad.left}" y="${yTopZone.toFixed(1)}" width="${plotW}" height="${hZone.toFixed(1)}" fill="${fillZona}" />
    <line x1="${pad.left}" y1="${ySup.toFixed(1)}" x2="${width - pad.right}" y2="${ySup.toFixed(1)}" stroke="${corSup}" stroke-width="1.8" stroke-dasharray="6,4" />
    <line x1="${pad.left}" y1="${yInf.toFixed(1)}" x2="${width - pad.right}" y2="${yInf.toFixed(1)}" stroke="${corInf}" stroke-width="1.8" stroke-dasharray="6,4" />
    <line x1="${pad.left}" y1="${ySpot.toFixed(1)}" x2="${width - pad.right}" y2="${ySpot.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2,3" stroke-opacity="0.45" />
  `;

  let extraRightBadges = "";
  if (Math.abs(ySpot - ySup) > 15 && Math.abs(ySpot - yInf) > 15) {
    extraRightBadges += `
      <rect x="${width - pad.right + 2}" y="${(ySpot - 8).toFixed(1)}" width="62" height="15" rx="3" fill="#1e293b" stroke="#94a3b8" stroke-width="0.8" />
      <text x="${width - pad.right + 33}" y="${(ySpot + 3).toFixed(1)}" fill="#f8fafc" font-size="8.5" font-family="monospace" font-weight="700" text-anchor="middle">${spot.toFixed(2)}</text>
    `;
  }
  if (yEma != null && Math.abs(yEma - ySup) > 15 && Math.abs(yEma - yInf) > 15 && Math.abs(yEma - ySpot) > 15) {
    extraRightBadges += `
      <rect x="${width - pad.right + 2}" y="${(yEma - 8).toFixed(1)}" width="62" height="15" rx="3" fill="rgba(56,189,248,0.18)" stroke="#38bdf8" stroke-width="0.8" />
      <text x="${width - pad.right + 33}" y="${(yEma + 3).toFixed(1)}" fill="#38bdf8" font-size="8.5" font-family="monospace" font-weight="700" text-anchor="middle">${lastEmaNum.toFixed(2)}</text>
    `;
  }

  const zonaLabelsSvg = `
    <rect x="${width - pad.right + 2}" y="${(ySup - 8).toFixed(1)}" width="62" height="16" rx="3" fill="${corSup}" fill-opacity="0.22" stroke="${corSup}" stroke-width="0.8" />
    <text x="${width - pad.right + 33}" y="${(ySup + 3.5).toFixed(1)}" fill="${corSup}" font-size="9" font-family="monospace" font-weight="700" text-anchor="middle">${linhaSup.toFixed(2)}</text>
    <rect x="${pad.left + 4}" y="${(ySup - 14).toFixed(1)}" width="${supPillW.toFixed(1)}" height="13" rx="3" fill="#090d16" fill-opacity="0.88" />
    <text x="${pad.left + 8}" y="${(ySup - 4.5).toFixed(1)}" fill="${corSup}" font-size="8.5" font-family="monospace" font-weight="700">${labelSup}</text>

    <rect x="${width - pad.right + 2}" y="${(yInf - 8).toFixed(1)}" width="62" height="16" rx="3" fill="${corInf}" fill-opacity="0.22" stroke="${corInf}" stroke-width="0.8" />
    <text x="${width - pad.right + 33}" y="${(yInf + 3.5).toFixed(1)}" fill="${corInf}" font-size="9" font-family="monospace" font-weight="700" text-anchor="middle">${linhaInf.toFixed(2)}</text>
    <rect x="${pad.left + 4}" y="${(yInf + 2).toFixed(1)}" width="${infPillW.toFixed(1)}" height="13" rx="3" fill="#090d16" fill-opacity="0.88" />
    <text x="${pad.left + 8}" y="${(yInf + 11.5).toFixed(1)}" fill="${corInf}" font-size="8.5" font-family="monospace" font-weight="700">${labelInf}</text>
    ${extraRightBadges}
  `;

  let emaPts = [];
  let m17Pts = [], m72Pts = [], m144Pts = [];
  let pvPts = [], pcPts = [], smUpPts = [], smLoPts = [];
  let candlesSvg = "";
  let xLabelsSvg = "";
  const labelInterval = Math.max(2, Math.floor(candles.length / 6));

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
    if (c.mima17 != null && !isNaN(c.mima17)) m17Pts.push(`${cx.toFixed(1)},${getY(c.mima17).toFixed(1)}`);
    if (c.mima72 != null && !isNaN(c.mima72)) m72Pts.push(`${cx.toFixed(1)},${getY(c.mima72).toFixed(1)}`);
    if (c.mima144 != null && !isNaN(c.mima144)) m144Pts.push(`${cx.toFixed(1)},${getY(c.mima144).toFixed(1)}`);
    if (c.pv_support != null && !isNaN(c.pv_support)) pvPts.push(`${cx.toFixed(1)},${getY(c.pv_support).toFixed(1)}`);
    if (c.pc_resist != null && !isNaN(c.pc_resist)) pcPts.push(`${cx.toFixed(1)},${getY(c.pc_resist).toFixed(1)}`);
    if (c.smart_upper != null && !isNaN(c.smart_upper)) smUpPts.push(`${cx.toFixed(1)},${getY(c.smart_upper).toFixed(1)}`);
    if (c.smart_lower != null && !isNaN(c.smart_lower)) smLoPts.push(`${cx.toFixed(1)},${getY(c.smart_lower).toFixed(1)}`);

    const prevClose = idx > 0 ? Number(candles[idx - 1].close) : o;
    const diffPct = prevClose > 0 ? (((cl - prevClose) / prevClose) * 100) : 0;
    const varPctStr = (diffPct >= 0 ? "+" : "") + diffPct.toFixed(2) + "%";
    const dtShort = String(c.date).length >= 10 ? String(c.date).substring(8, 10) + "/" + String(c.date).substring(5, 7) : String(c.date);

    const isLast = idx === candles.length - 1;
    const distToLast = (candles.length - 1) - idx;
    const isPeriodic = (idx % labelInterval === 0) && (distToLast >= Math.max(2, Math.ceil(labelInterval * 0.65)));
    if (isPeriodic || isLast) {
      xLabelsSvg += `<text x="${cx.toFixed(1)}" y="${height - 10}" fill="#94a3b8" font-size="9" font-family="monospace" text-anchor="middle">${dtShort}</text>`;
    }

    let hoverExtra = "";
    if (overlayMode === "PHICUBE_MIMA" && c.mima17 != null && c.mima72 != null) {
      hoverExtra = `M17: R$ ${Number(c.mima17).toFixed(2)} | M72: R$ ${Number(c.mima72).toFixed(2)}`;
    } else if (overlayMode === "GOES_PRICESHOOTER" && c.pv_support != null) {
      hoverExtra = `CaiuComprou: R$ ${Number(c.pv_support).toFixed(2)} | SmartMA: R$ ${Number(c.smart_lower || cl).toFixed(2)}`;
    }

    candlesSvg += `
      <g class="candle-group">
        <line x1="${cx.toFixed(1)}" y1="${yHigh.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yLow.toFixed(1)}" stroke="${color}" stroke-width="1.3" />
        <rect x="${(cx - candleW / 2).toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${candleW.toFixed(1)}" height="${bodyH.toFixed(1)}" fill="${color}" rx="1" />
        <rect x="${(cx - stepX / 2).toFixed(1)}" y="${pad.top}" width="${stepX.toFixed(1)}" height="${plotH}" fill="transparent" style="cursor:crosshair;"
          onmouseenter="atualizarInspecaoCandle('${c.date}', '${o}', '${h}', '${l}', '${cl}', '${c.ema13}', '${varPctStr}', '${color}', '${hoverExtra}')" />
      </g>
    `;
  });

  let overlayLinesSvg = "";
  if (overlayMode === "ELDER") {
    overlayLinesSvg = emaPts.length > 1
      ? `<polyline points="${emaPts.join(" ")}" fill="none" stroke="#38bdf8" stroke-width="1.8" stroke-opacity="0.9" />`
      : "";
  } else if (overlayMode === "PHICUBE_MIMA") {
    if (m144Pts.length > 1) overlayLinesSvg += `<polyline points="${m144Pts.join(" ")}" fill="none" stroke="#eab308" stroke-width="1.8" stroke-opacity="0.85" />`;
    if (m72Pts.length > 1) overlayLinesSvg += `<polyline points="${m72Pts.join(" ")}" fill="none" stroke="#f97316" stroke-width="2.0" stroke-opacity="0.9" />`;
    if (m17Pts.length > 1) overlayLinesSvg += `<polyline points="${m17Pts.join(" ")}" fill="none" stroke="#d946ef" stroke-width="1.8" stroke-opacity="0.9" />`;
    if (pvPts.length > 1) overlayLinesSvg += `<polyline points="${pvPts.join(" ")}" fill="none" stroke="#10b981" stroke-width="1.4" stroke-dasharray="3,3" stroke-opacity="0.8" />`;
  } else if (overlayMode === "GOES_PRICESHOOTER") {
    if (pvPts.length > 1) overlayLinesSvg += `<polyline points="${pvPts.join(" ")}" fill="none" stroke="#10b981" stroke-width="2.2" stroke-opacity="0.95" />`;
    if (pcPts.length > 1) overlayLinesSvg += `<polyline points="${pcPts.join(" ")}" fill="none" stroke="#f43f5e" stroke-width="1.8" stroke-opacity="0.85" />`;
    if (smUpPts.length > 1) overlayLinesSvg += `<polyline points="${smUpPts.join(" ")}" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.85" />`;
    if (smLoPts.length > 1) overlayLinesSvg += `<polyline points="${smLoPts.join(" ")}" fill="none" stroke="#fbbf24" stroke-width="1.5" stroke-opacity="0.85" />`;
  }

  const lastPrevClose = candles.length >= 2 ? Number(candles[candles.length - 2].close) : Number(lastC.open);
  const lastDiffPct = lastPrevClose > 0 ? (((Number(lastC.close) - lastPrevClose) / lastPrevClose) * 100) : 0;
  const lastVarStr = (lastDiffPct >= 0 ? "+" : "") + lastDiffPct.toFixed(2) + "%";
  const lastColor = Number(lastC.close) >= Number(lastC.open) ? "#10b981" : "#f43f5e";
  const lastEmaStr = lastEmaNum != null ? `R$ ${lastEmaNum.toFixed(2)}` : "—";

  const distEmaPct = lastEmaNum != null && spot > 0
    ? (((lastEmaNum - spot) / spot) * 100)
    : null;
  const distEmaStr = distEmaPct != null
    ? `${distEmaPct >= 0 ? "+" : ""}${distEmaPct.toFixed(1)}%`
    : "—";

  const alvoLinhaRef = (trend === "BAIXA" || trend === "BEARISH") ? linhaInf : linhaSup;
  const distGatilhoPct = spot > 0 ? (((alvoLinhaRef - spot) / spot) * 100) : 0;
  const distGatilhoStr = `${distGatilhoPct >= 0 ? "+" : ""}${distGatilhoPct.toFixed(1)}%`;

  let legendaDireitaHtml = `
    <div style="display:inline-flex; align-items:center; gap:6px;">
      <span style="width:12px; height:2.5px; background:#38bdf8; display:inline-block;"></span>
      <span style="color:#38bdf8; font-family:monospace;">EMA13: ${lastEmaStr} (${distEmaStr})</span>
    </div>
  `;
  if (overlayMode === "PHICUBE_MIMA") {
    legendaDireitaHtml = `
      <div style="display:inline-flex; align-items:center; gap:8px; font-family:monospace; font-size:0.7rem;">
        <span style="color:#d946ef;">● M17: R$ ${Number(lastC.mima17 || spot).toFixed(2)}</span>
        <span style="color:#f97316;">● M72: R$ ${Number(lastC.mima72 || spot).toFixed(2)}</span>
        <span style="color:#eab308;">● M144: R$ ${Number(lastC.mima144 || spot).toFixed(2)}</span>
      </div>
    `;
  } else if (overlayMode === "GOES_PRICESHOOTER") {
    legendaDireitaHtml = `
      <div style="display:inline-flex; align-items:center; gap:8px; font-family:monospace; font-size:0.7rem;">
        <span style="color:#10b981;">▬ Caiu Comprou: R$ ${Number(lastC.pv_support || linhaSup).toFixed(2)}</span>
        <span style="color:#fbbf24;">▬ Smart MA: R$ ${Number(lastC.smart_lower || spot).toFixed(2)}</span>
      </div>
    `;
  }

  return `
    <div style="background:#0d121d; border:1px solid #242f45; border-radius:8px; padding:14px; margin-top:4px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-size:0.82rem; font-weight:700; color:#f1f5f9;">📈 Candlesticks Diários — <span translate="no">${u.ticker}</span></span>
          <span style="font-size:0.68rem; background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.3); padding:1px 6px; border-radius:4px; font-family:monospace;">${tituloZona}</span>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
          <div style="display:flex; gap:3px; background:#090d16; padding:2px; border-radius:5px; border:1px solid #1e293b;">
            <button onclick="selecionarOverlayGrafico('ELDER')" style="background:${overlayMode === 'ELDER' ? '#2563eb' : 'transparent'}; color:${overlayMode === 'ELDER' ? '#fff' : '#94a3b8'}; border:none; padding:2px 7px; border-radius:4px; font-size:0.68rem; font-family:monospace; font-weight:700; cursor:pointer;">⚡ Elder EMA13</button>
            <button onclick="selecionarOverlayGrafico('PHICUBE_MIMA')" style="background:${overlayMode === 'PHICUBE_MIMA' ? '#059669' : 'transparent'}; color:${overlayMode === 'PHICUBE_MIMA' ? '#fff' : '#94a3b8'}; border:none; padding:2px 7px; border-radius:4px; font-size:0.68rem; font-family:monospace; font-weight:700; cursor:pointer;">🌀 Leque MIMA</button>
            <button onclick="selecionarOverlayGrafico('GOES_PRICESHOOTER')" style="background:${overlayMode === 'GOES_PRICESHOOTER' ? '#d97706' : 'transparent'}; color:${overlayMode === 'GOES_PRICESHOOTER' ? '#fff' : '#94a3b8'}; border:none; padding:2px 7px; border-radius:4px; font-size:0.68rem; font-family:monospace; font-weight:700; cursor:pointer;">🎯 F. Góes</button>
          </div>
          <div style="display:flex; gap:3px;">
            ${[20, 35, 60].map(d => `
              <button onclick="selecionarJanelaCandles(${d})" style="background:${janela === d ? '#2563eb' : '#1e293b'}; color:${janela === d ? '#fff' : '#94a3b8'}; border:1px solid ${janela === d ? '#3b82f6' : '#334155'}; padding:2px 7px; border-radius:4px; font-size:0.68rem; font-family:monospace; font-weight:700; cursor:pointer;">${d} DU</button>
            `).join("")}
          </div>
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

      <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:295px; display:block;" xmlns="http://www.w3.org/2000/svg"
        onmouseleave="atualizarInspecaoCandle('${lastC.date}', '${Number(lastC.open)}', '${Number(lastC.high)}', '${Number(lastC.low)}', '${Number(lastC.close)}', '${lastC.ema13}', '${lastVarStr}', '${lastColor}')">
        ${gridSvg}
        ${xLabelsSvg}
        ${zonaFundoSvg}
        ${overlayLinesSvg}
        ${candlesSvg}
        ${zonaLabelsSvg}
      </svg>

      <div style="display:flex; flex-wrap:wrap; justify-content:space-between; gap:10px; margin-top:10px; padding-top:8px; border-top:1px solid #1e293b; font-size:0.72rem; color:#94a3b8;">
        <div class="tooltip-wrap tooltip-left" onclick="event.stopPropagation()">
          <span style="display:inline-flex; align-items:center; gap:6px; cursor:help; text-decoration:underline dotted rgba(148,163,184,0.5); text-underline-offset:3px;">
            <span style="width:12px; height:3px; background:${corSup}; display:inline-block;"></span>
            <strong style="color:${corSup}; font-family:monospace;">Linha Sup: R$ ${linhaSup.toFixed(2)} (${distGatilhoStr})</strong>
          </span>
          <div class="tooltip-bubble" onclick="event.stopPropagation()">
            <div class="tooltip-title" style="color:${corSup};">📏 Linha Horizontal Superior</div>
            <div class="tooltip-text">${tooltipSup}</div>
          </div>
        </div>

        <div class="tooltip-wrap tooltip-center" onclick="event.stopPropagation()">
          <span style="display:inline-flex; align-items:center; gap:6px; cursor:help; text-decoration:underline dotted rgba(148,163,184,0.5); text-underline-offset:3px;">
            <span style="width:12px; height:3px; background:${corInf}; display:inline-block;"></span>
            <strong style="color:${corInf}; font-family:monospace;">Linha Inf: R$ ${linhaInf.toFixed(2)}</strong>
          </span>
          <div class="tooltip-bubble" onclick="event.stopPropagation()">
            <div class="tooltip-title" style="color:${corInf};">📐 Linha Horizontal Inferior</div>
            <div class="tooltip-text">${tooltipInf}</div>
          </div>
        </div>

        ${legendaDireitaHtml}
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

        ${u.phicube ? (() => {
          const p = u.phicube;
          const mScore = Number(p.mima_alignment_score || 0);
          const mCol = mScore >= 4 ? "#10b981" : (mScore <= 1 ? "#f43f5e" : "#fbbf24");
          const pvStr = p.pv_pc_rule === "PV_PROIBIDO_VENDER" ? "🟢 PV (Proibido Vender)" : (p.pv_pc_rule === "PC_PROIBIDO_COMPRAR" ? "🔴 PC (Proibido Comprar)" : "⚪ Neutro");
          const ccStr = p.caiu_comprou_72 != null ? `R$ ${Number(p.caiu_comprou_72).toFixed(2)}` : "—";
          return `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-top:8px; padding-top:8px; border-top:1px dashed #1e293b; font-size:0.68rem; font-family:monospace;">
              <span style="color:${mCol}; font-weight:700;">🌀 Leque MIMA: ${mScore}/5</span>
              <span style="color:#cbd5e1;">${pvStr}</span>
              <span style="color:#38bdf8;">Caiu Comprou: ${ccStr}</span>
              ${p.grande_tacada_aligned ? '<span style="background:rgba(16,185,129,0.18); color:#10b981; padding:1px 6px; border-radius:4px; font-weight:700;">⚡ GRANDE TACADA</span>' : ''}
            </div>
          `;
        })() : ""}
      </div>
    `;
  });

  if (html === "") {
    container.innerHTML = `<div class="text-muted" style="color:#64748b; padding:16px;">Nenhum sinal ativo no radar.</div>`;
  } else {
    container.innerHTML = html;
  }
}

/* 3.5 RENDERIZADOR DA TELA 4 FRACTAL (BÚSSOLA PHICUBE & SETUP FERNANDO GÓES) */
function renderizarBussolaPhiCube(underlyings, filteredOptions, tickerSelecionado) {
  const container = document.getElementById("phicube-bussola-container");
  if (!container) return;

  if (!underlyings || underlyings.length === 0) {
    container.innerHTML = `<div style="color:#64748b;">Dados fractais PhiCube indisponíveis.</div>`;
    return;
  }

  const u = underlyings.find(x => x.ticker === tickerSelecionado) || underlyings[0];
  const p = u.phicube;
  if (!p) {
    container.innerHTML = `<div style="color:#64748b;">Execute o pipeline atualizado para carregar a Bússola PhiCube de ${u.ticker}.</div>`;
    return;
  }

  const spot = Number(u.spot_price);
  const mScore = Number(p.mima_alignment_score || 0);
  const mColor = mScore >= 4 ? "#10b981" : (mScore <= 1 ? "#f43f5e" : "#fbbf24");
  const pvRuleTxt = p.pv_pc_rule === "PV_PROIBIDO_VENDER"
    ? "🟢 PROIBIDO VENDER (PV Ativo)"
    : (p.pv_pc_rule === "PC_PROIBIDO_COMPRAR" ? "🔴 PROIBIDO COMPRAR (PC Ativo)" : "⚪ ZONA NEUTRA");
  const pvRuleCol = p.pv_pc_rule === "PV_PROIBIDO_VENDER" ? "#10b981" : (p.pv_pc_rule === "PC_PROIBIDO_COMPRAR" ? "#f43f5e" : "#94a3b8");

  const badgeSanto = (st) => {
    const col = st === "ALTA" ? "#10b981" : (st === "BAIXA" ? "#f43f5e" : "#94a3b8");
    const ico = st === "ALTA" ? "▲" : (st === "BAIXA" ? "▼" : "●");
    return `<span style="color:${col}; font-weight:700;">${ico} ${st}</span>`;
  };

  const hit618 = p.phibo_direction === "ALTA" ? spot >= Number(p.phibo_618) : spot <= Number(p.phibo_618);
  const hit100 = p.phibo_direction === "ALTA" ? spot >= Number(p.phibo_100) : spot <= Number(p.phibo_100);

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:14px;">
      <!-- Coluna 1: Bússola Bo Williams (MIMA + Santo + PV/PC) -->
      <div style="background:#0d121d; border:1px solid #242f45; border-radius:8px; padding:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <span style="font-size:0.85rem; font-weight:700; color:#f1f5f9;">🧭 Bússola Bo Williams — <span translate="no">${u.ticker}</span></span>
          <span style="font-size:0.72rem; font-family:monospace; font-weight:700; color:${mColor}; background:rgba(255,255,255,0.05); padding:2px 8px; border-radius:4px;">Leque MIMA: ${mScore}/5</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; font-size:0.78rem; font-family:monospace;">
          <div style="display:flex; justify-content:space-between; padding:6px 8px; background:#111622; border-radius:4px;">
            <span style="color:#94a3b8;">Estado do Leque:</span>
            <strong style="color:${mColor};">${p.mima_fan_state}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding:6px 8px; background:#111622; border-radius:4px;">
            <span style="color:#94a3b8;">Santos (17 / 72 / 305):</span>
            <span>17:${badgeSanto(p.santo_17_state)} | 72:${badgeSanto(p.santo_72_state)} | 305:${badgeSanto(p.santo_305_state)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:6px 8px; background:#111622; border-radius:4px;">
            <span style="color:#94a3b8;">Regra PV / PC:</span>
            <strong style="color:${pvRuleCol};">${pvRuleTxt}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding:6px 8px; background:#111622; border-radius:4px;">
            <span style="color:#94a3b8;">Difusor André Moraes:</span>
            <strong style="color:${p.difusor_state === 'ALTA' ? '#10b981' : '#f43f5e'};">${p.difusor_state} (EMA 21/55)</strong>
          </div>
        </div>
      </div>

      <!-- Coluna 2: Setup Fernando Góes (PriceShooter + A Grande Tacada) -->
      <div style="background:#0d121d; border:1px solid #242f45; border-radius:8px; padding:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <span style="font-size:0.85rem; font-weight:700; color:#f1f5f9;">🎯 Fernando Góes (<span translate="no">PriceShooter</span>)</span>
          <span style="font-size:0.7rem; font-family:monospace; font-weight:700; color:${p.grande_tacada_aligned ? '#10b981' : '#fbbf24'}; background:rgba(255,255,255,0.05); padding:2px 8px; border-radius:4px;">
            ${p.grande_tacada_aligned ? '⚡ GRANDE TACADA ALINHADA' : '⏳ AGUARDANDO ALINHAMENTO 8-34-144'}
          </span>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; font-size:0.78rem; font-family:monospace;">
          <div style="display:flex; justify-content:space-between; padding:6px 8px; background:#111622; border-radius:4px;">
            <span style="color:#94a3b8;">Suporte Caiu Comprou (72):</span>
            <strong style="color:#10b981;">R$ ${Number(p.caiu_comprou_72 || 0).toFixed(2)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding:6px 8px; background:#111622; border-radius:4px;">
            <span style="color:#94a3b8;">Resist. Levantou Cortou (72):</span>
            <strong style="color:#f43f5e;">R$ ${Number(p.levantou_cortou_72 || 0).toFixed(2)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding:6px 8px; background:#111622; border-radius:4px;">
            <span style="color:#94a3b8;">Escada <span translate="no">Smart MA</span> (Corpo):</span>
            <span style="color:#38bdf8;">Inf: R$ ${Number(p.smart_ma_lower || spot).toFixed(2)} | Sup: R$ ${Number(p.smart_ma_upper || spot).toFixed(2)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:6px 8px; background:#111622; border-radius:4px;">
            <span style="color:#94a3b8;"><span translate="no">PSBanda</span> (Sinal 4 vs 17/72):</span>
            <strong style="color:${p.psbanda_state === 'COMPRA' ? '#10b981' : (p.psbanda_state === 'VENDA' ? '#f43f5e' : '#94a3b8')};">${p.psbanda_state}</strong>
          </div>
        </div>
      </div>

      <!-- Coluna 3: Projeções Áureas Phibo (Calibragem de Alvos e Opções) -->
      <div style="background:#0d121d; border:1px solid #242f45; border-radius:8px; padding:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <span style="font-size:0.85rem; font-weight:700; color:#f1f5f9;">📐 Alvos Phibo Automáticos (72 DU)</span>
          <span style="font-size:0.7rem; font-family:monospace; font-weight:700; color:#fbbf24; background:rgba(251,191,36,0.15); padding:2px 8px; border-radius:4px;">Projeção: ${p.phibo_direction}</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; font-size:0.78rem; font-family:monospace;">
          <div style="display:flex; justify-content:space-between; padding:6px 8px; background:#111622; border-radius:4px;">
            <span style="color:#94a3b8;">Swing 72 Barras (Mín → Máx):</span>
            <span style="color:#cbd5e1;">R$ ${Number(p.phibo_swing_low).toFixed(2)} → R$ ${Number(p.phibo_swing_high).toFixed(2)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:6px 8px; background:#111622; border-radius:4px;">
            <span style="color:#94a3b8;">Alvo Phibo 61,8%:</span>
            <strong style="color:${hit618 ? '#94a3b8' : '#fbbf24'};">R$ ${Number(p.phibo_618).toFixed(2)} ${hit618 ? '[Batido]' : '🎯'}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding:6px 8px; background:#111622; border-radius:4px;">
            <span style="color:#94a3b8;">Alvo Phibo 100,0%:</span>
            <strong style="color:${hit100 ? '#94a3b8' : '#fbbf24'};">R$ ${Number(p.phibo_100).toFixed(2)} ${hit100 ? '[Batido]' : '🎯'}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding:6px 8px; background:#111622; border-radius:4px;">
            <span style="color:#94a3b8;">Alvo Phibo 161,8% (Expansão):</span>
            <strong style="color:#10b981;">R$ ${Number(p.phibo_1618).toFixed(2)} 🚀</strong>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* 4. RENDERIZADOR DA GRADE OFICIAL DE OPÇÕES B3 (2 PERFIS: TRIPLE SCREEN ITM/ATM VS. F. GÓES OTM) */
function renderizarGradeOpcoesB3(options) {
  const tbody = document.getElementById("tabela-grade-opcoes-corpo") || document.querySelector("#options-table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!options || options.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; color:#64748b; padding:16px;">Nenhuma opção disponível na grade.</td></tr>`;
    return;
  }

  options.forEach((opt) => {
    const tr = document.createElement("tr");
    const delta = opt.greeks ? Number(opt.greeks.delta) : 0;
    const gamma = opt.greeks ? Number(opt.greeks.gamma) : 0;
    const vega = opt.greeks ? Number(opt.greeks.vega) : 0;
    const theta = opt.greeks ? Number(opt.greeks.theta_du) : 0;
    const spot = Number(opt.spot_price || 0);
    const strike = Number(opt.strike || 0);
    const premio = Number(opt.theoretical_price || 0);

    const isTripleScreenProfile = delta >= 0.48 && delta <= 0.78 && premio > 0.38;
    const isGoesProfile = strike > spot && premio >= 0.08 && premio <= 0.38;
    const isShortLegSpread = strike > spot && premio > 0.38 && delta < 0.48;
    const isDeepItm = delta > 0.78;

    let moneynessTag = "ATM";
    let moneynessCol = "#38bdf8";
    if (strike < spot * 0.985) {
      moneynessTag = "ITM";
      moneynessCol = "#10b981";
    } else if (strike > spot * 1.015) {
      moneynessTag = "OTM";
      moneynessCol = "#fbbf24";
    }

    let alvoValorFmt = "";
    let alvoSub = "";
    let alvoCol = "#10b981";
    let perfilBadgeHtml = "";

    if (isTripleScreenProfile) {
      tr.style.backgroundColor = "rgba(16, 185, 129, 0.07)";
      tr.style.borderLeft = "3px solid #10b981";
      alvoValorFmt = (premio * 1.75).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      alvoSub = "+75% (Swing 2R)";
      alvoCol = "#10b981";
      perfilBadgeHtml = `
        <div class="tooltip-wrap tooltip-right" onclick="event.stopPropagation()">
          <span style="font-size:0.68rem; background:rgba(16,185,129,0.18); color:#10b981; border:1px solid rgba(16,185,129,0.4); padding:3px 8px; border-radius:4px; font-weight:700; cursor:help;">
            🛡️ TRIPLE SCREEN (${moneynessTag} • Aporte Maior / Swing)
          </span>
          <div class="tooltip-bubble" onclick="event.stopPropagation()">
            <div class="tooltip-title" style="color:#10b981;">🛡️ Perfil Estrutural Triple Screen (ITM / ATM)</div>
            <div class="tooltip-text">Opção com Delta elevado (&Delta; = ${delta.toFixed(2)}) e menor proporção de valor extrínseco. Ideal para aportes maiores no Swing Trade de 8 a 20 pregões do Triple Screen (saída de Sobrevenda %K &lt; 30% rumo ao Alvo 2R), sofrendo muito menos corrosão proporcional pelo Theta (&Theta;) ou servindo como Ponta Comprada da Trava de Alta.</div>
          </div>
        </div>
      `;
    } else if (isGoesProfile) {
      tr.style.backgroundColor = "rgba(251, 191, 36, 0.09)";
      tr.style.borderLeft = "3px solid #fbbf24";
      alvoValorFmt = (premio * 2.50).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      alvoSub = "+150% (Tiro Curto)";
      alvoCol = "#fbbf24";
      perfilBadgeHtml = `
        <div class="tooltip-wrap tooltip-right" onclick="event.stopPropagation()">
          <span style="font-size:0.68rem; background:rgba(251,191,36,0.22); color:#fbbf24; border:1px solid rgba(251,191,36,0.5); padding:3px 8px; border-radius:4px; font-weight:700; cursor:help;">
            🎯 TIRO CURTO F. GÓES (OTM • Faixa 10 a 30 centavos)
          </span>
          <div class="tooltip-bubble" onclick="event.stopPropagation()">
            <div class="tooltip-title" style="color:#fbbf24;">🎯 Regra dos Centavos Fernando Góes (R$ 0,10 a R$ 0,30 OTM)</div>
            <div class="tooltip-text">Opção OTM na faixa canônica de centavos (Prêmio = R$ ${premio.toFixed(2)}, &Delta; = ${delta.toFixed(2)}, &Gamma; = ${gamma.toFixed(3)}). Permite entrar com fração pequena do capital e alto número de contratos para buscar explosão assimétrica (+100% a +200%) em 1 a 5 pregões no Caiu Comprou / Grande Tacada, com risco máximo estritamente travado nos centavos pagos.</div>
          </div>
        </div>
      `;
    } else if (isShortLegSpread) {
      alvoValorFmt = (premio * 0.40).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      alvoSub = "Financia Trava (Short)";
      alvoCol = "#38bdf8";
      perfilBadgeHtml = `
        <div class="tooltip-wrap tooltip-right" onclick="event.stopPropagation()">
          <span style="font-size:0.68rem; background:rgba(56,189,248,0.14); color:#38bdf8; border:1px solid rgba(56,189,248,0.35); padding:2px 7px; border-radius:4px; font-weight:600; cursor:help;">
            📐 OTM INTERMEDIÁRIA (Ponta Vendida da Trava)
          </span>
          <div class="tooltip-bubble" onclick="event.stopPropagation()">
            <div class="tooltip-title" style="color:#38bdf8;">📐 OTM Intermediária (Acima de R$ 0,38 • Ponta Vendida)</div>
            <div class="tooltip-text">Prêmio unitário elevado demais para compra a seco na regra de centavos do Fernando Góes, porém com excelente prêmio extrínseco para ser VENDIDA contra uma Call ITM/ATM na Trava de Alta do Triple Screen (abatendo o custo da operação e neutralizando o Theta).</div>
          </div>
        </div>
      `;
    } else if (isDeepItm) {
      alvoValorFmt = (premio * 1.45).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      alvoSub = "+45% (Delta Puro)";
      alvoCol = "#38bdf8";
      perfilBadgeHtml = `<span style="font-size:0.68rem; background:rgba(56,189,248,0.12); color:#38bdf8; border:1px solid rgba(56,189,248,0.3); padding:2px 7px; border-radius:4px; font-weight:600;">🔒 DEEP ITM (Substituto Sintético)</span>`;
    } else {
      alvoValorFmt = (premio * 3.00).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      alvoSub = "+200% (Pozinho)";
      alvoCol = "#94a3b8";
      perfilBadgeHtml = `<span style="font-size:0.68rem; background:rgba(148,163,184,0.12); color:#94a3b8; border:1px solid rgba(148,163,184,0.25); padding:2px 7px; border-radius:4px;">⚡ POZINHO EXTREMO (&lt; R$ 0,08)</span>`;
    }

    const strikeFmt = strike.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const premioFmt = premio.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const ivPctStr = opt.iv ? `IV: ${(Number(opt.iv) * 100).toFixed(1)}%` : "";
    const b3MetaStr = opt.is_real_b3_ticker
      ? `<span style="display:block; font-size:0.63rem; font-family:monospace; color:#38bdf8; font-weight:500;">B3 Real • ${opt.num_trades || 0} neg.${opt.has_market_maker ? " • FM ✔" : ""}</span>`
      : "";

    tr.innerHTML = `
      <td style="padding:10px 12px; font-weight:700; color:#f1f5f9;"><span translate="no">${opt.symbol}</span>${b3MetaStr}</td>
      <td style="padding:10px 12px; font-family:monospace;"><span translate="no">${strikeFmt}</span> <span style="font-size:0.65rem; color:${moneynessCol}; font-weight:700;">(${moneynessTag})</span></td>
      <td style="padding:10px 12px;"><span style="font-size:0.7rem; background:rgba(245,158,11,0.15); color:#fde68a; padding:2px 6px; border-radius:4px;"><span translate="no">${opt.type}</span> ${opt.style || ''}</span></td>
      <td style="padding:10px 12px; font-family:monospace;">${opt.du} DU</td>
      <td style="padding:10px 12px; font-family:monospace; color:#94a3b8;">${opt.maturity_date}</td>
      <td style="padding:10px 12px; font-family:monospace; font-weight:700; color:#f1f5f9;">${premioFmt} <span style="display:block; font-size:0.63rem; color:#94a3b8; font-weight:400;">${ivPctStr}</span></td>
      <td style="padding:10px 12px; font-family:monospace; font-weight:700; color:${isTripleScreenProfile ? '#10b981' : (isGoesProfile ? '#fbbf24' : '#cbd5e1')};">${delta.toFixed(2)}</td>
      <td style="padding:10px 12px; font-family:monospace;">${gamma.toFixed(3)}</td>
      <td style="padding:10px 12px; font-family:monospace;">${vega.toFixed(2)}</td>
      <td style="padding:10px 12px; font-family:monospace; color:#f59e0b;">${theta.toFixed(4)}/d</td>
      <td style="padding:10px 12px; font-family:monospace; font-weight:700; color:${alvoCol};">${alvoValorFmt} <span style="font-size:0.65rem; color:#94a3b8; display:block;">${alvoSub}</span></td>
      <td style="padding:10px 12px;">${perfilBadgeHtml}</td>
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

/* 6. RENDERIZADOR DA MESA DE DERIVATIVOS (SWING ESTRUTURAL TRIPLE SCREEN VS. TIRO CURTO F. GÓES) */
function renderizarTravaAlta(underlyings, options, tickerSelecionado) {
  const container = document.getElementById("trava-alta-container") || document.getElementById("spread-container");
  if (!container) return;

  const u = underlyings.find(x => x.ticker === tickerSelecionado) || underlyings[0];
  const spot = Number(u.spot_price || 40.0);

  let optLongTS = null;
  let optShortTS = null;
  let optGoesOTM = null;

  if (options && options.length >= 2) {
    const sortedOptions = [...options].sort((a, b) => Number(a.strike) - Number(b.strike));

    // Perfil 1 (Triple Screen Estrutural): Ponta Comprada ITM/ATM (Delta ~0.50 a 0.72) e Ponta Vendida OTM
    optLongTS = sortedOptions.find(o => Number(o.greeks?.delta) >= 0.50 && Number(o.greeks?.delta) <= 0.75)
      || sortedOptions.find(o => Number(o.strike) <= spot)
      || sortedOptions[0];

    const k1Idx = sortedOptions.indexOf(optLongTS);
    optShortTS = sortedOptions[Math.min(k1Idx + 2, sortedOptions.length - 1)];
    if (optShortTS === optLongTS && k1Idx < sortedOptions.length - 1) {
      optShortTS = sortedOptions[k1Idx + 1];
    }

    // Perfil 2 (Fernando Góes Tiro Curto): Regra canônica dos centavos (R$ 0,10 a R$ 0,32 OTM, máx R$ 0,38)
    const goesIdealBand = sortedOptions.filter(
      o => Number(o.strike) > spot && Number(o.theoretical_price) >= 0.10 && Number(o.theoretical_price) <= 0.32
    );
    const goesExtendedBand = sortedOptions.filter(
      o => Number(o.strike) > spot && Number(o.theoretical_price) >= 0.08 && Number(o.theoretical_price) <= 0.38
    );

    if (goesIdealBand.length > 0) {
      // Prioriza a série mais líquida dentro da faixa de R$ 0,10 a R$ 0,32 (ou mais próxima de R$ 0,22)
      optGoesOTM = [...goesIdealBand].sort((a, b) => {
        const tradesDiff = Number(b.num_trades || 0) - Number(a.num_trades || 0);
        if (Math.abs(tradesDiff) >= 10) return tradesDiff;
        return Math.abs(Number(a.theoretical_price) - 0.22) - Math.abs(Number(b.theoretical_price) - 0.22);
      })[0];
    } else if (goesExtendedBand.length > 0) {
      optGoesOTM = [...goesExtendedBand].sort(
        (a, b) => Math.abs(Number(a.theoretical_price) - 0.22) - Math.abs(Number(b.theoretical_price) - 0.22)
      )[0];
    } else {
      const otmAll = sortedOptions.filter(o => Number(o.strike) > spot);
      optGoesOTM = (otmAll.length > 0 ? otmAll : sortedOptions).reduce((best, cur) =>
        Math.abs(Number(cur.theoretical_price) - 0.20) < Math.abs(Number(best.theoretical_price) - 0.20) ? cur : best
      );
    }
  }

  const k1Strike = optLongTS ? Number(optLongTS.strike) : spot * 0.96;
  const k2Strike = optShortTS ? Number(optShortTS.strike) : spot * 1.04;
  const premioK1 = optLongTS ? Number(optLongTS.theoretical_price) : 1.20;
  const premioK2 = optShortTS ? Number(optShortTS.theoretical_price) : 0.45;
  const deltaK1 = optLongTS?.greeks ? Number(optLongTS.greeks.delta) : 0.62;
  const deltaK2 = optShortTS?.greeks ? Number(optShortTS.greeks.delta) : 0.32;

  const debitoLiquido = Math.max(0.01, premioK1 - premioK2);
  const ganhoMaximo = Math.max(0, (k2Strike - k1Strike) - debitoLiquido);
  const ratio = ganhoMaximo / debitoLiquido;
  const phi = u.phicube || null;

  const goesStrike = optGoesOTM ? Number(optGoesOTM.strike) : spot * 1.15;
  const goesPremio = optGoesOTM ? Number(optGoesOTM.theoretical_price) : 0.22;
  const goesDelta = optGoesOTM?.greeks ? Number(optGoesOTM.greeks.delta) : 0.12;
  const goesGamma = optGoesOTM?.greeks ? Number(optGoesOTM.greeks.gamma) : 0.04;
  const goesTheta = optGoesOTM?.greeks ? Number(optGoesOTM.greeks.theta_du) : -0.01;
  const goesTrades = optGoesOTM?.num_trades ? ` • ${optGoesOTM.num_trades} neg.` : "";

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:16px;">
      <!-- Card 1: Perfil Estrutural Triple Screen (ITM/ATM • Swing Longo / Aporte Maior) -->
      <div style="background:linear-gradient(135deg, rgba(16,185,129,0.08), rgba(15,23,42,0.9)); border:1px solid rgba(16,185,129,0.35); border-radius:10px; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; gap:8px; flex-wrap:wrap;">
          <div>
            <h4 style="font-size:0.95rem; font-weight:700; color:#f1f5f9;">🛡️ 1. Swing Estrutural Triple Screen (Trava ITM/ATM)</h4>
            <span style="font-size:0.72rem; color:#94a3b8;">Horizonte: 8 a 20 DU (Venc: ${optLongTS ? optLongTS.maturity_date : ''} • ${optLongTS ? optLongTS.du : 21} DU)</span>
          </div>
          <span style="font-size:0.68rem; background:rgba(16,185,129,0.2); color:#10b981; border:1px solid rgba(16,185,129,0.4); padding:2px 8px; border-radius:4px; font-weight:700;">APORTE MAIOR • DELTA FORTE</span>
        </div>

        <div style="display:flex; gap:10px; margin-bottom:12px;">
          <div style="flex:1; padding:10px; border-radius:6px; background:rgba(0,0,0,0.35); border-left:3px solid #10b981;">
            <div style="font-size:0.65rem; color:#10b981; font-weight:700;">COMPRA ITM/ATM (LONG &Delta; ${deltaK1.toFixed(2)})</div>
            <div style="font-size:0.95rem; font-weight:800; font-family:monospace; color:#f1f5f9;"><span translate="no">${optLongTS ? optLongTS.symbol : 'CALL LONG'}</span></div>
            <div style="font-size:0.72rem; color:#94a3b8;">Strike: R$ ${k1Strike.toFixed(2)} | Prêmio: R$ ${premioK1.toFixed(2)}</div>
          </div>
          <div style="flex:1; padding:10px; border-radius:6px; background:rgba(0,0,0,0.35); border-left:3px solid #38bdf8;">
            <div style="font-size:0.65rem; color:#38bdf8; font-weight:700;">VENDA OTM (SHORT &Delta; ${deltaK2.toFixed(2)} • Neutraliza &Theta;)</div>
            <div style="font-size:0.95rem; font-weight:800; font-family:monospace; color:#f1f5f9;"><span translate="no">${optShortTS ? optShortTS.symbol : 'CALL SHORT'}</span></div>
            <div style="font-size:0.72rem; color:#94a3b8;">Strike: R$ ${k2Strike.toFixed(2)} | Prêmio: R$ ${premioK2.toFixed(2)}</div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-bottom:10px;">
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:8px; border-radius:6px;">
            <div style="font-size:0.62rem; color:#64748b; text-transform:uppercase;">Débito Líquido</div>
            <div style="font-family:monospace; font-size:0.9rem; font-weight:700; color:#f43f5e;">R$ ${debitoLiquido.toFixed(2)}</div>
          </div>
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:8px; border-radius:6px;">
            <div style="font-size:0.62rem; color:#64748b; text-transform:uppercase;">Lucro Máx</div>
            <div style="font-family:monospace; font-size:0.9rem; font-weight:700; color:#10b981;">R$ ${ganhoMaximo.toFixed(2)}</div>
          </div>
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:8px; border-radius:6px;">
            <div style="font-size:0.62rem; color:#64748b; text-transform:uppercase;">Retorno/Risco</div>
            <div style="font-family:monospace; font-size:0.9rem; font-weight:700; color:#10b981;">${ratio.toFixed(2)}x (+${(ratio * 100).toFixed(0)}%)</div>
          </div>
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:8px; border-radius:6px;">
            <div style="font-size:0.62rem; color:#64748b; text-transform:uppercase;"><span translate="no">Break-Even</span></div>
            <div style="font-family:monospace; font-size:0.9rem; font-weight:700; color:#38bdf8;">R$ ${(k1Strike + debitoLiquido).toFixed(2)}</div>
          </div>
        </div>
        <div style="font-size:0.72rem; color:#94a3b8; background:rgba(0,0,0,0.25); padding:8px 10px; border-radius:6px;">
          💡 <strong>Racional Atuarial (Elder):</strong> Compra Delta dentro/no dinheiro (&Delta;=${deltaK1.toFixed(2)}) após desconto profundo no diário (%K &lt; 30%) e financia o tempo (&Theta;) vendendo OTM intermediária. Adequada para aporte estrutural maior em Swing Trade longo.
        </div>
      </div>

      <!-- Card 2: Perfil Tiro Curto Fernando Góes (OTM • Regra 10 a 30 Centavos) -->
      <div style="background:linear-gradient(135deg, rgba(251,191,36,0.08), rgba(15,23,42,0.9)); border:1px solid rgba(251,191,36,0.35); border-radius:10px; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; gap:8px; flex-wrap:wrap;">
          <div>
            <h4 style="font-size:0.95rem; font-weight:700; color:#f1f5f9;">🎯 2. Tiro Curto Fernando Góes (Call OTM 10 a 30 Centavos)</h4>
            <span style="font-size:0.72rem; color:#94a3b8;">Horizonte: 1 a 5 DU (Saída Rápida na Explosão / Alvo Phibo: R$ ${phi ? Number(phi.phibo_100).toFixed(2) : (spot * 1.05).toFixed(2)})</span>
          </div>
          <span style="font-size:0.68rem; background:rgba(251,191,36,0.2); color:#fbbf24; border:1px solid rgba(251,191,36,0.45); padding:2px 8px; border-radius:4px; font-weight:700;">CAPITAL PEQUENO • FAIXA R$ 0,10 A R$ 0,30</span>
        </div>

        <div style="display:flex; gap:10px; margin-bottom:12px;">
          <div style="flex:1; padding:10px; border-radius:6px; background:rgba(0,0,0,0.35); border-left:3px solid #fbbf24;">
            <div style="font-size:0.65rem; color:#fbbf24; font-weight:700;">CALL OTM CENTAVOS (&Delta; ${goesDelta.toFixed(2)} | &Gamma; ${goesGamma.toFixed(3)}${goesTrades})</div>
            <div style="font-size:0.95rem; font-weight:800; font-family:monospace; color:#f1f5f9;"><span translate="no">${optGoesOTM ? optGoesOTM.symbol : 'CALL OTM'}</span></div>
            <div style="font-size:0.72rem; color:#94a3b8;">Strike OTM: R$ ${goesStrike.toFixed(2)} | Custo Unitário: <strong style="color:#fbbf24;">R$ ${goesPremio.toFixed(2)}</strong></div>
          </div>
          <div style="flex:1; padding:10px; border-radius:6px; background:rgba(0,0,0,0.35); border-left:3px solid #10b981;">
            <div style="font-size:0.65rem; color:#10b981; font-weight:700;">SUPORTE CAIU COMPROU 72 / GATILHO GÓES</div>
            <div style="font-size:0.95rem; font-weight:800; font-family:monospace; color:#10b981;">R$ ${phi && phi.caiu_comprou_72 ? Number(phi.caiu_comprou_72).toFixed(2) : (spot * 0.98).toFixed(2)}</div>
            <div style="font-size:0.72rem; color:#94a3b8;">${phi && phi.grande_tacada_aligned ? '⚡ Leque 8-34-144 Alinhado' : '⏳ Aguardar Virada Smart MA'}</div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-bottom:10px;">
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:8px; border-radius:6px;">
            <div style="font-size:0.62rem; color:#64748b; text-transform:uppercase;">Custo (Centavos)</div>
            <div style="font-family:monospace; font-size:0.9rem; font-weight:700; color:#fbbf24;">R$ ${goesPremio.toFixed(2)}</div>
          </div>
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:8px; border-radius:6px;">
            <div style="font-size:0.62rem; color:#64748b; text-transform:uppercase;">Alvo 1 (+100% / 2x)</div>
            <div style="font-family:monospace; font-size:0.9rem; font-weight:700; color:#38bdf8;">R$ ${(goesPremio * 2.0).toFixed(2)}</div>
          </div>
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:8px; border-radius:6px;">
            <div style="font-size:0.62rem; color:#64748b; text-transform:uppercase;">Alvo 2 (+200% / 3x)</div>
            <div style="font-family:monospace; font-size:0.9rem; font-weight:700; color:#10b981;">R$ ${(goesPremio * 3.0).toFixed(2)}</div>
          </div>
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:8px; border-radius:6px;">
            <div style="font-size:0.62rem; color:#64748b; text-transform:uppercase;">&Theta; Diário</div>
            <div style="font-family:monospace; font-size:0.9rem; font-weight:700; color:#f43f5e;">${goesTheta.toFixed(4)}/d</div>
          </div>
        </div>
        <div style="font-size:0.72rem; color:#94a3b8; background:rgba(0,0,0,0.25); padding:8px 10px; border-radius:6px;">
          💡 <strong>Racional Assimétrico (Góes):</strong> Tiro curto em opção OTM com fração pequena dos recursos. Busca aceleração explosiva de Gamma (&Gamma;=${goesGamma.toFixed(3)}) em 1 a 5 pregões na reação do suporte Caiu Comprou, realizando lucro rápido antes que o Theta corroa o prêmio.
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
  return ["../data/latest.json", "./data/latest.json", "data/latest.json", urlAbsoluta, urlRawGitHub];
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
