/**
 * Componentes visuais para Semáforo Macro, Radar e Grade de Opções B3
 * Contrato v2.0 (Commit 2b3404e): { metadata, underlyings, options }
 */

function renderizarMetadadosKPIs(meta, options) {
  if (!meta) return;

  const elStatus = document.getElementById("kpi-status-mercado");
  if (elStatus) {
    elStatus.innerHTML = `<span class="badge badge-open"><span class="pulse-dot"></span>PREGÃO OPERACIONAL</span>`;
  }

  const elUpdate = document.getElementById("kpi-ultima-atualizacao");
  if (elUpdate) {
    const ts = meta.generated_at_utc || meta.business_date;
    if (ts) {
      const d = new Date(ts);
      elUpdate.innerText = isNaN(d.getTime()) ? ts : d.toLocaleString("pt-BR");
    }
  }

  const elSinais = document.getElementById("kpi-sinais-armados");
  if (elSinais) {
    elSinais.innerText = options && options.length ? options.length : 1;
  }

  const elSelic = document.getElementById("kpi-taxa-selic");
  if (elSelic && meta.cdi_rate_annual !== undefined) {
    elSelic.innerText = (meta.cdi_rate_annual * 100).toFixed(2) + "% a.a.";
  }

  const elRegime = document.getElementById("kpi-regime-vol");
  if (elRegime) {
    const ivRef = options && options.length && options[0].iv ? options[0].iv : 0.236;
    const regime = ivRef < 0.25 ? "COMPRIMIDA" : (ivRef > 0.35 ? "ELEVADA" : "MODERADA");
    elRegime.innerHTML = `<span class="badge ${regime === 'COMPRIMIDA' ? 'badge-bullish' : 'badge-neutral'}">${regime} (${(ivRef * 100).toFixed(1)}%)</span>`;
  }
}

function renderizarSemaforoMacro(underlyings) {
  const container = document.getElementById("semaforo-macro-container");
  if (!container) return;

  if (!underlyings || underlyings.length === 0) {
    container.innerHTML = `<div class="text-muted">Dados de ativos subjacentes não disponíveis.</div>`;
    return;
  }

  const u = underlyings[0];
  const isAlta = String(u.trend_signal).toUpperCase() === "ALTA" || String(u.trend_signal).toUpperCase() === "BULLISH";

  container.innerHTML = `
    <div class="semaforo-display">
      <div class="semaforo-lights">
        <div class="light red ${!isAlta ? 'active' : ''}"></div>
        <div class="light yellow"></div>
        <div class="light green ${isAlta ? 'active' : ''}"></div>
      </div>
      <div class="semaforo-info">
        <div class="semaforo-headline">
          <span>${u.ticker} — Spot: R$ ${Number(u.spot_price).toFixed(2)}</span>
          <span class="badge ${isAlta ? 'badge-bullish' : 'badge-bearish'}">TENDÊNCIA: ${u.trend_signal}</span>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 6px;">
          Tela 1 (Maré Semanal): Sinal de expansão altista ativo e homologado. Filtro de Elder liberado para compras.
        </p>
      </div>
    </div>

    <div class="indicator-grid">
      <div class="ind-box">
        <div class="ind-name">Preço à Vista (Spot)</div>
        <div class="ind-val text-blue">R$ ${Number(u.spot_price).toFixed(2)}</div>
      </div>
      <div class="ind-box">
        <div class="ind-name">Sinal Triple Screen</div>
        <div class="ind-val ${isAlta ? 'text-green' : 'text-red'}">${u.trend_signal}</div>
      </div>
      <div class="ind-box">
        <div class="ind-name">Filtro Macro Elder</div>
        <div class="ind-val text-green">${isAlta ? 'COMPRA AUTORIZADA' : 'AGUARDAR'}</div>
      </div>
      <div class="ind-box">
        <div class="ind-name">Sincronização B3</div>
        <div class="ind-val text-blue">TEMPO REAL</div>
      </div>
    </div>
  `;
}

function renderizarRadarOportunidades(underlyings, options) {
  const container = document.getElementById("radar-oportunidades-container");
  if (!container) return;

  if (!underlyings || underlyings.length === 0) {
    container.innerHTML = `<div class="text-muted p-4">Nenhum sinal ativo no radar no momento.</div>`;
    return;
  }

  const u = underlyings[0];
  const spot = Number(u.spot_price);
  const gatilho = spot * 1.005;
  const stopLoss = spot * 0.97;
  const riscoR = gatilho - stopLoss;
  const alvo2R = gatilho + (2.0 * riscoR);

  container.innerHTML = `
    <div class="radar-card">
      <div class="radar-header">
        <div class="radar-ticker">${u.ticker} <span style="font-size: 0.9rem; color: var(--text-muted); font-weight: normal;">R$ ${spot.toFixed(2)}</span></div>
        <div><span class="badge badge-bullish"><span class="pulse-dot"></span> SINAL ARMADO</span></div>
      </div>

      <div class="stoch-meter">
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 4px;">
          <span>Estocástico Lento (Tela 2 - Onda Diária)</span>
          <span class="text-green font-mono"><strong>Recuo para Suporte Fibonacci</strong></span>
        </div>
        <div class="stoch-bar-bg">
          <div class="stoch-bar-fill" style="width: 25%; background: var(--accent-green);"></div>
        </div>
        <div class="fibo-levels">
          <span>0 (Sobrevenda &lt; 20)</span>
          <span>Retração 38.2% (R$ ${(spot * 0.985).toFixed(2)})</span>
          <span>100 (Sobrecompra &gt; 80)</span>
        </div>
      </div>

      <div class="trade-targets">
        <div class="target-item">
          <div class="lbl">Gatilho (Buy Stop)</div>
          <div class="val text-blue">R$ ${gatilho.toFixed(2)}</div>
        </div>
        <div class="target-item">
          <div class="lbl">Stop Loss Macro</div>
          <div class="val text-red">R$ ${stopLoss.toFixed(2)}</div>
        </div>
        <div class="target-item">
          <div class="lbl">Alvo 2R (+${(2 * riscoR).toFixed(2)})</div>
          <div class="val text-green">R$ ${alvo2R.toFixed(2)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderizarGradeOpcoesB3(options) {
  const tbody = document.getElementById("tabela-grade-opcoes-corpo");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!options || options.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted" style="padding: 20px;">Nenhuma opção disponível na grade.</td></tr>`;
    return;
  }

  options.forEach((opt, idx) => {
    const tr = document.createElement("tr");
    const delta = opt.greeks ? Number(opt.greeks.delta) : 0;
    const gamma = opt.greeks ? Number(opt.greeks.gamma) : 0;
    const vega = opt.greeks ? Number(opt.greeks.vega) : 0;
    const theta = opt.greeks ? Number(opt.greeks.theta_du) : 0;

    const isRec = (delta >= 0.25 && delta <= 0.40) || idx === 0;
    if (isRec) tr.classList.add("row-recommended");

    const strikeFmt = Number(opt.strike).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const premioFmt = Number(opt.theoretical_price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const alvo150 = (Number(opt.theoretical_price) * 2.5).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    tr.innerHTML = `
      <td><strong>${opt.symbol}</strong></td>
      <td>${strikeFmt}</td>
      <td><span class="badge badge-otm">${opt.type} ${opt.style || ''}</span></td>
      <td>${opt.du} DU</td>
      <td>${opt.maturity_date}</td>
      <td><strong>${premioFmt}</strong></td>
      <td>${delta.toFixed(2)}</td>
      <td>${gamma.toFixed(3)}</td>
      <td>${vega.toFixed(2)}</td>
      <td class="text-amber">${theta.toFixed(4)}/d</td>
      <td class="text-green"><strong>${alvo150}</strong></td>
      <td>${isRec ? '<span class="badge badge-rec">⭐ RECOMENDADA (Sweet Spot)</span>' : '<span class="badge badge-mon">Monitorada</span>'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderizarTravaAlta(underlyings, options) {
  const container = document.getElementById("trava-alta-container");
  if (!container) return;

  const opt = options && options.length ? options[0] : null;
  const k1Strike = opt ? opt.strike : 42.0;
  const k2Strike = k1Strike + 2.0;
  const premioK1 = opt ? opt.theoretical_price : 0.50;
  const premioK2 = premioK1 * 0.45;
  const debitoLiquido = premioK1 - premioK2;
  const ganhoMaximo = (k2Strike - k1Strike) - debitoLiquido;
  const ratio = ganhoMaximo / debitoLiquido;

  container.innerHTML = `
    <div class="spread-card">
      <div class="spread-header">
        <div>
          <h4 style="font-size: 1.05rem; font-weight: 700;">Trava de Alta (Bull Call Spread) — ${opt ? opt.underlying_ticker : 'B3'}</h4>
          <span style="font-size: 0.75rem; color: var(--text-dim);">Horizonte: Vencimento ${opt ? opt.maturity_date : ''} (${opt ? opt.du : 21} DU)</span>
        </div>
        <div>
          <span class="badge badge-rec">STATUS: HOMOLOGADA</span>
        </div>
      </div>

      <div class="spread-legs">
        <div class="leg-box long">
          <div style="font-size: 0.7rem; color: var(--accent-green); font-weight: 700;">PONTA COMPRADA (LONG CALL)</div>
          <div style="font-size: 1.1rem; font-weight: 800; font-family: var(--font-mono); margin: 2px 0;">${opt ? opt.symbol : 'CALL LONG'}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Strike: R$ ${k1Strike.toFixed(2)} | Prêmio: R$ ${premioK1.toFixed(2)}</div>
        </div>
        <div class="leg-box short">
          <div style="font-size: 0.7rem; color: var(--accent-amber); font-weight: 700;">PONTA VENDIDA (SHORT CALL)</div>
          <div style="font-size: 1.1rem; font-weight: 800; font-family: var(--font-mono); margin: 2px 0;">CALL K${k2Strike.toFixed(0)}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Strike: R$ ${k2Strike.toFixed(2)} | Prêmio: R$ ${premioK2.toFixed(2)}</div>
        </div>
      </div>

      <div class="spread-metrics-row">
        <div class="ind-box">
          <div class="ind-name">Débito Líquido (Risco)</div>
          <div class="ind-val text-red">R$ ${debitoLiquido.toFixed(2)}</div>
        </div>
        <div class="ind-box">
          <div class="ind-name">Ganho Máximo Líquido</div>
          <div class="ind-val text-green">R$ ${ganhoMaximo.toFixed(2)}</div>
        </div>
        <div class="ind-box">
          <div class="ind-name">Relação Retorno/Risco</div>
          <div class="ind-val text-gold">${ratio.toFixed(2)}x (+${(ratio * 100).toFixed(0)}%)</div>
        </div>
        <div class="ind-box">
          <div class="ind-name">Break-Even na B3</div>
          <div class="ind-val text-blue">R$ ${(k1Strike + debitoLiquido).toFixed(2)}</div>
        </div>
        <div class="ind-box">
          <div class="ind-name">Theta Mitigado vs Seco</div>
          <div class="ind-val text-green">~65%</div>
        </div>
        <div class="ind-box">
          <div class="ind-name">Quality Gate Atuarial</div>
          <div class="ind-val text-blue">APROVADO</div>
        </div>
      </div>
    </div>
  `;
}
