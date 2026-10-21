/* =====================================================================
 * GESTÃO DE BANCA — Funding Anual, Regras Anti-Ruína, Grid de Opções
 * e Diário de Operações (Estratégia de tiros assimétricos / F. Góes)
 *
 * PRIVACIDADE: todos os dados financeiros reais (funding, operações)
 * ficam SOMENTE no localStorage do navegador. Nada é gravado em
 * data/latest.json nem enviado ao GitHub. Use Exportar/Importar backup.
 *
 * O módulo é isolado: apenas LÊ window.appState (underlyings/options)
 * produzido pelo app.js. Funções puras são exportadas para testes Node.
 * ===================================================================== */
(function (root) {
  "use strict";

  const STORAGE_KEY = "b3ts_banca_v1";
  const LOTE_PADRAO = 100;

  const PARAMS_PADRAO = {
    riscoPorTiroPct: 5, // % do capital vivo arriscado por operação (escolha do usuário)
    exposicaoMaxPct: 25, // % máximo do capital vivo em risco aberto simultâneo
    maxPosicoes: 5, // nº máximo de posições abertas
    maxPorAtivo: 1, // posições abertas por ativo-objeto
    circuitBreakerPct: 30, // perda realizada no ano (% do funding) que trava novas entradas
    loteMinimo: LOTE_PADRAO,
    taxaPorOrdem: 0, // R$ corretagem + emolumentos por ordem (entrada ou saída)
    aliquotaIR: 15, // % IR swing trade sobre lucro líquido
    minNegocios: 5, // liquidez mínima: nº de negócios no dia
    deltaMin: 0.1,
    deltaMax: 0.45,
    minDU: 5, // evita opções a menos de N dias úteis do vencimento
    premioMin: 0.03, // evita "pó" sem liquidez real
    acertoAssumido: 25, // % de acerto assumido enquanto não há histórico (< 10 trades)
    payoffAssumido: 4, // ganho médio / perda média assumido (R múltiplo)
    limiarRuinaPct: 50, // drawdown que define "ruína" no Monte Carlo
  };

  /* ------------------------------------------------------------------ */
  /* 1. FUNÇÕES PURAS (testáveis)                                        */
  /* ------------------------------------------------------------------ */

  function num(v, def = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }

  /** Soma os aportes (funding) do ano informado. */
  function fundingDoAno(fundings, ano) {
    return (fundings || [])
      .filter((f) => Number(f.ano) === Number(ano))
      .reduce((s, f) => s + num(f.valor), 0);
  }

  /** Resultado líquido (R$) de uma operação fechada, já descontando taxas. */
  function resultadoOperacao(op) {
    const qtd = num(op.quantidade);
    const bruto = (num(op.premioSaida) - num(op.premioEntrada)) * qtd;
    return bruto - num(op.taxas);
  }

  /** Risco (R$) de uma operação aberta = prêmio pago + taxas (perda máxima se virar pó). */
  function riscoOperacaoAberta(op) {
    return num(op.premioEntrada) * num(op.quantidade) + num(op.taxas);
  }

  /** Estado consolidado da banca no ano. */
  function calcularSaudeBanca(estado, ano) {
    const p = Object.assign({}, PARAMS_PADRAO, estado.params || {});
    const base = fundingDoAno(estado.fundings, ano);
    const ops = (estado.operacoes || []).filter((o) => Number(String(o.dataEntrada).slice(0, 4)) === Number(ano));
    const fechadas = ops.filter((o) => o.status === "FECHADA");
    const abertas = ops.filter((o) => o.status === "ABERTA");

    const resultados = fechadas.map(resultadoOperacao);
    const realizado = resultados.reduce((s, r) => s + r, 0);
    const riscoAberto = abertas.reduce((s, o) => s + riscoOperacaoAberta(o), 0);
    const capitalVivo = base + realizado;
    const caixaLivre = capitalVivo - riscoAberto;

    // Curva de capital (fechamentos em ordem cronológica) para drawdown máximo
    let pico = base;
    let eq = base;
    let ddMax = 0;
    fechadas
      .slice()
      .sort((a, b) => String(a.dataSaida || "").localeCompare(String(b.dataSaida || "")))
      .forEach((o) => {
        eq += resultadoOperacao(o);
        pico = Math.max(pico, eq);
        if (pico > 0) ddMax = Math.max(ddMax, (pico - eq) / pico);
      });

    const ganhos = resultados.filter((r) => r > 0);
    const perdas = resultados.filter((r) => r <= 0);
    const temHistorico = fechadas.length >= 10;
    const taxaAcerto = fechadas.length ? ganhos.length / fechadas.length : null;
    const ganhoMedio = ganhos.length ? ganhos.reduce((s, r) => s + r, 0) / ganhos.length : 0;
    const perdaMedia = perdas.length ? Math.abs(perdas.reduce((s, r) => s + r, 0) / perdas.length) : 0;
    const payoffReal = perdaMedia > 0 ? ganhoMedio / perdaMedia : null;

    const pUso = temHistorico && taxaAcerto !== null ? taxaAcerto : num(p.acertoAssumido) / 100;
    const rUso = temHistorico && payoffReal ? payoffReal : num(p.payoffAssumido);
    const kelly = calcularKelly(pUso, rUso);

    const perdaRealizadaPct = base > 0 ? Math.max(0, -realizado) / base : 0;
    const circuitBreakerAtivo = base > 0 && perdaRealizadaPct * 100 >= num(p.circuitBreakerPct);

    const orcamentoTiro = Math.max(0, capitalVivo * (num(p.riscoPorTiroPct) / 100));
    const limiteExposicao = Math.max(0, capitalVivo * (num(p.exposicaoMaxPct) / 100));
    const exposicaoRestante = Math.max(0, limiteExposicao - riscoAberto);
    const vagasPosicoes = Math.max(0, num(p.maxPosicoes) - abertas.length);
    const tirosDisponiveis = orcamentoTiro > 0 ? Math.min(vagasPosicoes, Math.floor(exposicaoRestante / orcamentoTiro + 1e-9)) : 0;
    const tirosAteRuina = orcamentoTiro > 0 ? Math.floor(capitalVivo / orcamentoTiro) : 0;

    return {
      params: p,
      ano,
      base,
      realizado,
      riscoAberto,
      capitalVivo,
      caixaLivre,
      ddMax,
      perdaRealizadaPct,
      circuitBreakerAtivo,
      orcamentoTiro,
      limiteExposicao,
      exposicaoRestante,
      vagasPosicoes,
      tirosDisponiveis,
      tirosAteRuina,
      abertas,
      fechadas,
      taxaAcerto,
      payoffReal,
      temHistorico,
      pUso,
      rUso,
      kelly,
      irEstimado: realizado > 0 ? realizado * (num(p.aliquotaIR) / 100) : 0,
    };
  }

  /** Fração de Kelly: f* = p − (1 − p) / R. Retorna também ¼ Kelly (recomendado). */
  function calcularKelly(p, R) {
    if (!(R > 0)) return { cheio: 0, quarto: 0, expectativa: -1 };
    const cheio = p - (1 - p) / R;
    return {
      cheio,
      quarto: Math.max(0, cheio / 4),
      expectativa: p * R - (1 - p), // expectativa em R por operação
    };
  }

  /** Gerador pseudo-aleatório determinístico (mulberry32) para Monte Carlo reprodutível. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Monte Carlo de ruína com fração fixa sobre capital vivo.
   * Perda = −100% do prêmio (pó). Ganho = +R × risco.
   * Ruína = drawdown ≥ limiar OU capital insuficiente para 1 lote mínimo.
   */
  function simularRuina({ p, R, fracao, nTrades = 100, nCaminhos = 3000, limiarRuina = 0.5, capitalInicial = 1, custoMinLote = 0, seed = 42 }) {
    const rand = rng(seed);
    let ruinas = 0;
    const finais = [];
    const sequencias = [];
    for (let c = 0; c < nCaminhos; c++) {
      let eq = capitalInicial;
      let pico = capitalInicial;
      let arruinado = false;
      let seq = 0;
      let seqMax = 0;
      for (let t = 0; t < nTrades; t++) {
        const risco = Math.max(eq * fracao, custoMinLote);
        if (risco > eq || eq <= 0) {
          arruinado = true;
          break;
        }
        if (rand() < p) {
          eq += risco * R;
          seq = 0;
        } else {
          eq -= risco;
          seq += 1;
          seqMax = Math.max(seqMax, seq);
        }
        pico = Math.max(pico, eq);
        if ((pico - eq) / pico >= limiarRuina) {
          arruinado = true;
          break;
        }
      }
      if (arruinado) ruinas++;
      finais.push(eq / capitalInicial);
      sequencias.push(seqMax);
    }
    finais.sort((a, b) => a - b);
    sequencias.sort((a, b) => a - b);
    const q = (arr, x) => arr[Math.min(arr.length - 1, Math.floor(arr.length * x))];
    return {
      probRuina: ruinas / nCaminhos,
      mediana: q(finais, 0.5),
      p10: q(finais, 0.1),
      p90: q(finais, 0.9),
      seqPerdasMediana: q(sequencias, 0.5),
      seqPerdasP90: q(sequencias, 0.9),
    };
  }

  /** Direção permitida pelo sistema para um ativo (CALL, PUT ou null). */
  function direcaoPermitida(u) {
    if (!u) return null;
    const v = u.phicube && u.phicube.confluence_verdict;
    if (u.trend_signal === "ALTA" && (v === "FORTE_COMPRA" || v === "COMPRA_PULLBACK")) return "CALL";
    if (u.trend_signal === "BAIXA" && v === "VENDA") return "PUT";
    return null;
  }

  /**
   * Gera o grid de opções operáveis no momento, dimensionando lotes pela banca.
   * Cada linha traz status OK ou BLOQUEADA com os motivos.
   */
  function gerarGrid(underlyings, options, saude, extras = {}) {
    const p = saude.params;
    const lote = Math.max(1, num(p.loteMinimo, LOTE_PADRAO));
    const taxa = num(p.taxaPorOrdem);
    const mapaU = {};
    (underlyings || []).forEach((u) => (mapaU[u.ticker] = u));
    const abertasPorAtivo = {};
    saude.abertas.forEach((o) => (abertasPorAtivo[o.ativo] = (abertasPorAtivo[o.ativo] || 0) + 1));

    const linhas = (options || []).map((o) => {
      const u = mapaU[o.underlying_ticker];
      const dir = direcaoPermitida(u);
      const premio = num(o.market_price) > 0 ? num(o.market_price) : num(o.theoretical_price);
      const delta = Math.abs(num(o.greeks && o.greeks.delta));
      const custoLote = premio * lote + taxa;
      const orcamento = Math.min(saude.orcamentoTiro, saude.exposicaoRestante, Math.max(0, saude.caixaLivre));
      const lotes = custoLote > 0 ? Math.floor(orcamento / custoLote + 1e-9) : 0;
      const qtd = lotes * lote;
      const perdaMax = lotes * premio * lote + taxa;
      const spot = num(o.spot_price, u ? num(u.spot_price) : 0);
      const breakeven = o.type === "CALL" ? num(o.strike) + premio : num(o.strike) - premio;
      const distBE = spot > 0 ? (breakeven / spot - 1) * 100 : 0;

      // Alvo direcional PhiBo (projeção 161,8% / 100%) → payoff intrínseco no vencimento (conservador)
      let alvoAtivo = null;
      if (u && u.phicube) {
        alvoAtivo = o.type === "CALL" ? num(u.phicube.phibo_1618) || num(u.phicube.phibo_100) : num(u.phicube.phibo_swing_low) || null;
      }
      let payoffAlvo = null;
      if (alvoAtivo && premio > 0) {
        const intr = o.type === "CALL" ? Math.max(0, alvoAtivo - num(o.strike)) : Math.max(0, num(o.strike) - alvoAtivo);
        payoffAlvo = intr / premio;
      }

      const motivos = [];
      if (saude.base <= 0) motivos.push("Sem funding cadastrado no ano");
      if (saude.circuitBreakerAtivo) motivos.push(`Circuit breaker: perda ≥ ${p.circuitBreakerPct}% do funding`);
      if (!dir) motivos.push("Ativo sem sinal direcional (Triple Screen + PhiCube)");
      else if (dir !== o.type) motivos.push(`Sinal pede ${dir}, não ${o.type}`);
      if (o.num_trades !== undefined && num(o.num_trades) < num(p.minNegocios)) motivos.push(`Liquidez baixa (${num(o.num_trades)} negócios)`);
      if (o.is_real_b3_ticker === false) motivos.push("Ticker sintético (não negociável)");
      if (delta < num(p.deltaMin) || delta > num(p.deltaMax)) motivos.push(`Delta ${delta.toFixed(2)} fora da faixa ${p.deltaMin}–${p.deltaMax}`);
      if (num(o.du) < num(p.minDU)) motivos.push(`Vencimento muito próximo (${o.du} DU)`);
      if (premio < num(p.premioMin)) motivos.push(`Prêmio < R$ ${num(p.premioMin).toFixed(2)}`);
      if (saude.vagasPosicoes <= 0) motivos.push(`Limite de ${p.maxPosicoes} posições abertas atingido`);
      if ((abertasPorAtivo[o.underlying_ticker] || 0) >= num(p.maxPorAtivo)) motivos.push(`Já existe posição aberta em ${o.underlying_ticker}`);
      if (lotes < 1 && saude.base > 0) motivos.push(`1 lote custa R$ ${custoLote.toFixed(2)} > orçamento R$ ${orcamento.toFixed(2)}`);

      return {
        symbol: o.symbol,
        ativo: o.underlying_ticker,
        tipo: o.type,
        strike: num(o.strike),
        du: num(o.du),
        vencimento: o.maturity_date,
        spot,
        premio,
        delta,
        iv: num(o.iv),
        negocios: o.num_trades,
        custoLote,
        lotes,
        quantidade: qtd,
        custoTotal: lotes > 0 ? lotes * premio * lote + taxa : 0,
        perdaMax: lotes > 0 ? perdaMax : 0,
        perdaMaxPct: saude.capitalVivo > 0 && lotes > 0 ? (perdaMax / saude.capitalVivo) * 100 : 0,
        alvo100: premio * 2,
        breakeven,
        distBE,
        alvoAtivo,
        payoffAlvo,
        fase: u ? u.phase : null,
        veredito: u && u.phicube ? u.phicube.confluence_verdict : null,
        direcao: dir,
        status: motivos.length ? "BLOQUEADA" : "OK",
        motivos,
      };
    });

    const pesoFase = (f) => (f === "ARMADO" ? 0 : f === "A_CAMINHO" ? 1 : 2);
    linhas.sort((a, b) => {
      if (a.status !== b.status) return a.status === "OK" ? -1 : 1;
      if (pesoFase(a.fase) !== pesoFase(b.fase)) return pesoFase(a.fase) - pesoFase(b.fase);
      return num(b.payoffAlvo, -1) - num(a.payoffAlvo, -1);
    });
    if (extras.somenteDirecionais) return linhas.filter((l) => l.direcao && l.direcao === l.tipo);
    return linhas;
  }

  const API_PURA = {
    PARAMS_PADRAO,
    fundingDoAno,
    resultadoOperacao,
    riscoOperacaoAberta,
    calcularSaudeBanca,
    calcularKelly,
    simularRuina,
    direcaoPermitida,
    gerarGrid,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = API_PURA;
    return; // ambiente Node (testes): não monta UI
  }

  /* ------------------------------------------------------------------ */
  /* 2. PERSISTÊNCIA LOCAL (localStorage)                                */
  /* ------------------------------------------------------------------ */

  function carregarEstado() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const e = raw ? JSON.parse(raw) : {};
      return {
        fundings: Array.isArray(e.fundings) ? e.fundings : [],
        operacoes: Array.isArray(e.operacoes) ? e.operacoes : [],
        params: Object.assign({}, PARAMS_PADRAO, e.params || {}),
      };
    } catch (err) {
      return { fundings: [], operacoes: [], params: Object.assign({}, PARAMS_PADRAO) };
    }
  }

  function salvarEstado(e) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(e));
  }

  let estado = carregarEstado();
  let gridCache = null;
  let gridGeradoEm = null;
  let filtroGrid = "OK";

  /* ------------------------------------------------------------------ */
  /* 3. HELPERS DE UI                                                    */
  /* ------------------------------------------------------------------ */

  const brl = (v) => "R$ " + num(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (v, d = 1) => num(v).toFixed(d).replace(".", ",") + "%";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const anoAtual = () => new Date().getFullYear();
  const hojeISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  function kpi(titulo, valor, desc, cor) {
    return `<div class="kpi-box"><div class="kpi-title">${titulo}</div><div class="kpi-val" style="font-size:1.1rem;${cor ? `color:${cor};` : ""}">${valor}</div><div class="kpi-desc">${desc || ""}</div></div>`;
  }

  function campo(id, label, valor, extra = "") {
    return `<label style="display:flex;flex-direction:column;gap:4px;font-size:0.7rem;color:var(--muted);text-transform:uppercase;font-weight:600;">${label}
      <input id="${id}" value="${esc(valor)}" ${extra} style="background:#0b0f19;border:1px solid var(--border);color:var(--text);padding:7px 9px;border-radius:6px;font-family:monospace;font-size:0.85rem;"></label>`;
  }

  const btn = (txt, onclick, cor = "#1e293b") =>
    `<button onclick="${onclick}" class="btn-refresh" style="background:${cor};padding:6px 12px;font-size:0.78rem;">${txt}</button>`;

  /* ------------------------------------------------------------------ */
  /* 4. RENDERIZAÇÃO                                                     */
  /* ------------------------------------------------------------------ */

  function renderFunding(saude) {
    const ano = anoAtual();
    const linhas = estado.fundings
      .map((f, i) => ({ f, i }))
      .sort((a, b) => String(b.f.data).localeCompare(String(a.f.data)))
      .map(
        ({ f, i }) => `<tr><td>${esc(f.ano)}</td><td>${esc(f.data)}</td><td style="color:var(--green);">${brl(f.valor)}</td><td style="font-family:inherit;">${esc(f.obs || "")}</td>
        <td>${btn("Excluir", `BancaUI.excluirFunding(${i})`, "#3f1d1d")}</td></tr>`
      )
      .join("");
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end;">
        ${campo("bf-ano", "Ano", ano, 'type="number" min="2020" max="2100"')}
        ${campo("bf-valor", "Valor do aporte (R$)", "", 'type="number" step="0.01" min="0" placeholder="ex: 3000"')}
        ${campo("bf-data", "Data do aporte", hojeISO(), 'type="date"')}
        ${campo("bf-obs", "Observação", "", 'placeholder="ex: aporte anual corretora"')}
        <div>${btn("➕ Registrar Funding", "BancaUI.adicionarFunding()", "#065f46")}</div>
      </div>
      <div style="margin-top:12px;font-size:0.78rem;color:var(--muted);">Funding do ano ${ano}: <b style="color:var(--green);font-family:monospace;">${brl(saude.base)}</b></div>
      <div style="overflow-x:auto;margin-top:10px;"><table><thead><tr><th>Ano</th><th>Data</th><th>Valor</th><th>Obs.</th><th></th></tr></thead>
      <tbody>${linhas || `<tr><td colspan="5" style="text-align:center;color:var(--dim);">Nenhum funding cadastrado. Informe o valor que você alocará na corretora.</td></tr>`}</tbody></table></div>`;
  }

  function renderParametros() {
    const p = estado.params;
    const defs = [
      ["riscoPorTiroPct", "Risco por tiro (%)"],
      ["exposicaoMaxPct", "Exposição máx. aberta (%)"],
      ["maxPosicoes", "Máx. posições abertas"],
      ["maxPorAtivo", "Máx. posições por ativo"],
      ["circuitBreakerPct", "Circuit breaker anual (%)"],
      ["loteMinimo", "Lote mínimo (opções)"],
      ["taxaPorOrdem", "Taxas por ordem (R$)"],
      ["aliquotaIR", "Alíquota IR (%)"],
      ["minNegocios", "Liquidez mín. (negócios)"],
      ["deltaMin", "Delta mínimo"],
      ["deltaMax", "Delta máximo"],
      ["minDU", "DU mínimos p/ vencimento"],
      ["premioMin", "Prêmio mínimo (R$)"],
      ["acertoAssumido", "Acerto assumido (%)"],
      ["payoffAssumido", "Payoff assumido (R)"],
      ["limiarRuinaPct", "Limiar de ruína (DD %)"],
    ];
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
      ${defs.map(([k, l]) => campo(`bp-${k}`, l, p[k], 'type="number" step="any"')).join("")}</div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
        ${btn("💾 Salvar Parâmetros", "BancaUI.salvarParametros()", "#1e3a8a")}
        ${btn("↺ Restaurar Padrões", "BancaUI.restaurarParametros()")}
      </div>
      <div style="margin-top:8px;font-size:0.7rem;color:var(--dim);">Acerto/Payoff assumidos são usados no Kelly e no Monte Carlo até existirem ≥ 10 operações fechadas; depois o sistema usa o seu histórico real.</div>`;
  }

  function renderSaude(saude) {
    const p = saude.params;
    const mc = simularRuina({
      p: saude.pUso,
      R: saude.rUso,
      fracao: num(p.riscoPorTiroPct) / 100,
      nTrades: 100,
      nCaminhos: 3000,
      limiarRuina: num(p.limiarRuinaPct) / 100,
      capitalInicial: Math.max(1, saude.capitalVivo),
      custoMinLote: num(p.premioMin) * num(p.loteMinimo) + num(p.taxaPorOrdem),
    });
    const k = saude.kelly;
    const riscoAcimaKelly = num(p.riscoPorTiroPct) / 100 > k.quarto;
    const corRuina = mc.probRuina < 0.05 ? "var(--green)" : mc.probRuina < 0.2 ? "var(--gold)" : "#ef4444";
    const ddCor = saude.circuitBreakerAtivo ? "#ef4444" : saude.perdaRealizadaPct * 100 > num(p.circuitBreakerPct) * 0.6 ? "var(--gold)" : "var(--green)";

    let alerta = "";
    if (saude.base <= 0) {
      alerta = `<div style="padding:12px;border:1px solid rgba(251,191,36,.4);background:rgba(251,191,36,.08);border-radius:8px;color:var(--gold);font-size:0.82rem;margin-bottom:12px;">⚠️ Cadastre o funding do ano ${saude.ano} para habilitar o dimensionamento de lotes.</div>`;
    } else if (saude.circuitBreakerAtivo) {
      alerta = `<div style="padding:12px;border:1px solid rgba(239,68,68,.5);background:rgba(239,68,68,.1);border-radius:8px;color:#fca5a5;font-size:0.82rem;margin-bottom:12px;">⛔ CIRCUIT BREAKER ATIVO — perda realizada de ${pct(saude.perdaRealizadaPct * 100)} do funding (limite ${p.circuitBreakerPct}%). Novas entradas travadas até novo aporte ou revisão dos parâmetros.</div>`;
    } else if (riscoAcimaKelly) {
      alerta = `<div style="padding:12px;border:1px solid rgba(251,191,36,.4);background:rgba(251,191,36,.08);border-radius:8px;color:var(--gold);font-size:0.8rem;margin-bottom:12px;">⚠️ Risco por tiro (${pct(p.riscoPorTiroPct)}) acima do ¼ Kelly (${pct(k.quarto * 100)}) para acerto ${pct(saude.pUso * 100, 0)} e payoff ${saude.rUso.toFixed(1)}R. ${k.cheio <= 0 ? "Expectativa NEGATIVA: com esses números o sistema perde dinheiro no longo prazo." : "Aumenta a chance de sequências de perda profundas."}</div>`;
    }

    return `${alerta}
      <div class="kpi-row" style="margin:0;">
        ${kpi("Funding do Ano", brl(saude.base), `Ano ${saude.ano}`)}
        ${kpi("Capital Vivo", brl(saude.capitalVivo), "Funding + P&L realizado", saude.capitalVivo >= saude.base ? "var(--green)" : "#ef4444")}
        ${kpi("Risco Aberto", brl(saude.riscoAberto), `${saude.abertas.length} posição(ões) • limite ${brl(saude.limiteExposicao)}`, "var(--gold)")}
        ${kpi("Caixa Livre", brl(saude.caixaLivre), "Capital vivo − risco aberto")}
        ${kpi("Orçamento por Tiro", brl(saude.orcamentoTiro), `${pct(p.riscoPorTiroPct)} do capital vivo • prêmio máx. ${brl(saude.orcamentoTiro / Math.max(1, num(p.loteMinimo)))} /opção`, "var(--blue)")}
        ${kpi("Tiros Disponíveis Agora", String(saude.tirosDisponiveis), `${saude.tirosAteRuina} tiros até zerar a banca`)}
        ${kpi("P&L Realizado", brl(saude.realizado), `IR estimado: ${brl(saude.irEstimado)}`, saude.realizado >= 0 ? "var(--green)" : "#ef4444")}
        ${kpi("Perda Realizada / CB", `${pct(saude.perdaRealizadaPct * 100)} / ${pct(p.circuitBreakerPct, 0)}`, `DD máx. da curva: ${pct(saude.ddMax * 100)}`, ddCor)}
        ${kpi("Acerto / Payoff", `${pct(saude.pUso * 100, 0)} / ${saude.rUso.toFixed(1)}R`, saude.temHistorico ? `Histórico real (${saude.fechadas.length} trades)` : `Assumido (${saude.fechadas.length}/10 trades)`)}
        ${kpi("Kelly (cheio / ¼)", `${pct(k.cheio * 100)} / ${pct(k.quarto * 100)}`, `Expectativa: ${k.expectativa >= 0 ? "+" : ""}${k.expectativa.toFixed(2)}R por trade`, k.cheio > 0 ? "var(--green)" : "#ef4444")}
        ${kpi("Prob. de Ruína (100 trades)", pct(mc.probRuina * 100), `DD ≥ ${p.limiarRuinaPct}% • Monte Carlo 3.000 caminhos`, corRuina)}
        ${kpi("Sequência de Perdas", `${mc.seqPerdasMediana} (p90: ${mc.seqPerdasP90})`, `Capital final p10/mediana/p90: ${mc.p10.toFixed(2)}× / ${mc.mediana.toFixed(2)}× / ${mc.p90.toFixed(2)}×`)}
      </div>`;
  }

  function renderGrid(saude) {
    const meta = (root.appState && root.appState.metadata) || {};
    if (!gridCache) {
      return `<div style="color:var(--dim);font-size:0.85rem;">Clique em <b>Gerar Grid Agora</b> para montar as operações possíveis com a banca e o mercado deste momento.</div>`;
    }
    const linhas = filtroGrid === "OK" ? gridCache.filter((l) => l.status === "OK") : filtroGrid === "DIR" ? gridCache.filter((l) => l.direcao && l.direcao === l.tipo) : gridCache;
    const nOk = gridCache.filter((l) => l.status === "OK").length;
    const corpo = linhas
      .slice(0, 150)
      .map((l, idx) => {
        const ok = l.status === "OK";
        const corTipo = l.tipo === "CALL" ? "var(--green)" : "#f87171";
        const motivos = l.motivos.length ? `<div style="font-size:0.68rem;color:#fca5a5;font-family:inherit;max-width:280px;white-space:normal;">${l.motivos.map(esc).join(" • ")}</div>` : "";
        return `<tr style="${ok ? "" : "opacity:0.72;"}">
          <td><b>${esc(l.symbol)}</b><div style="font-size:0.68rem;color:var(--dim);">${esc(l.ativo)} • ${esc(l.fase || "-")} • ${esc(l.veredito || "-")}</div></td>
          <td style="color:${corTipo};font-weight:700;">${l.tipo}</td>
          <td>${l.strike.toFixed(2)}<div style="font-size:0.68rem;color:var(--dim);">spot ${l.spot.toFixed(2)}</div></td>
          <td>${l.du} DU</td>
          <td>${brl(l.premio)}<div style="font-size:0.68rem;color:var(--dim);">Δ ${l.delta.toFixed(2)} • IV ${pct(l.iv * 100, 0)}</div></td>
          <td>${brl(l.custoLote)}</td>
          <td style="font-weight:700;color:${l.lotes > 0 ? "var(--blue)" : "var(--dim)"};">${l.lotes}<div style="font-size:0.68rem;color:var(--dim);">${l.quantidade} opções</div></td>
          <td style="color:#f87171;">${brl(l.perdaMax)}<div style="font-size:0.68rem;color:var(--dim);">${pct(l.perdaMaxPct)} da banca</div></td>
          <td style="color:var(--green);">${brl(l.alvo100)}<div style="font-size:0.68rem;color:var(--dim);">vender ½ (+100%)</div></td>
          <td>${l.breakeven.toFixed(2)}<div style="font-size:0.68rem;color:var(--dim);">${l.distBE >= 0 ? "+" : ""}${pct(l.distBE)} do spot</div></td>
          <td>${l.payoffAlvo !== null ? `<b style="color:${l.payoffAlvo >= 3 ? "var(--green)" : l.payoffAlvo >= 1 ? "var(--gold)" : "var(--dim)"};">${l.payoffAlvo.toFixed(1)}×</b><div style="font-size:0.68rem;color:var(--dim);">alvo ${num(l.alvoAtivo).toFixed(2)}</div>` : "-"}</td>
          <td>${ok ? `<span class="badge badge-open">✅ OK</span><div style="margin-top:4px;">${btn("Registrar", `BancaUI.registrarDoGrid(${idx})`, "#065f46")}</div>` : `<span class="badge" style="background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.3);">⛔ BLOQ.</span>${motivos}`}</td>
        </tr>`;
      })
      .join("");
    root.__bancaGridVisivel = linhas;
    const sel = (v, t) => `<option value="${v}" ${filtroGrid === v ? "selected" : ""}>${t}</option>`;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;font-size:0.78rem;color:var(--muted);">
        <div>Grid gerado em <b>${esc(gridGeradoEm)}</b> • dados de mercado: <b>${esc(meta.generated_at ? new Date(meta.generated_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "-")}</b> • vencimento ${esc(meta.active_maturity ? meta.active_maturity.maturity_date : "-")} • <b style="color:var(--green);">${nOk} operáveis</b> de ${gridCache.length}</div>
        <select onchange="BancaUI.filtrarGrid(this.value)" style="background:#0b0f19;border:1px solid var(--border);color:var(--text);padding:6px;border-radius:6px;">
          ${sel("OK", "Somente operáveis (✅)")}${sel("DIR", "Na direção do sinal (inclui bloqueadas)")}${sel("ALL", "Todas as opções")}
        </select>
      </div>
      <div style="overflow-x:auto;"><table><thead><tr>
        <th>Opção</th><th>Tipo</th><th>Strike</th><th>Venc.</th><th>Prêmio</th><th>Custo 1 lote</th><th>Lotes</th><th>Perda Máx.</th><th>Alvo +100%</th><th>Breakeven</th><th>Payoff Alvo PhiBo</th><th>Status</th>
      </tr></thead><tbody>${corpo || `<tr><td colspan="12" style="text-align:center;color:var(--dim);padding:16px;">Nenhuma opção atende às regras agora. Isso é proteção da banca: aguarde sinal ou revise os parâmetros.</td></tr>`}</tbody></table></div>
      <div style="margin-top:8px;font-size:0.7rem;color:var(--dim);">Payoff Alvo = valor intrínseco no vencimento se o ativo atingir a projeção PhiBo (161,8% p/ CALL; fundo do swing p/ PUT) ÷ prêmio. Estimativa conservadora: ignora valor extrínseco remanescente.</div>`;
  }

  function renderDiario(saude) {
    const ops = estado.operacoes.map((o, i) => ({ o, i }));
    const abertas = ops.filter(({ o }) => o.status === "ABERTA");
    const fechadas = ops.filter(({ o }) => o.status === "FECHADA").sort((a, b) => String(b.o.dataSaida).localeCompare(String(a.o.dataSaida)));
    const linhaAberta = ({ o, i }) => `<tr><td>${esc(o.dataEntrada)}</td><td><b>${esc(o.opcao)}</b><div style="font-size:0.68rem;color:var(--dim);">${esc(o.ativo)} • ${esc(o.tipo)}</div></td>
      <td>${num(o.quantidade)}</td><td>${brl(o.premioEntrada)}</td><td style="color:#f87171;">${brl(riscoOperacaoAberta(o))}</td><td style="color:var(--green);">${brl(num(o.premioEntrada) * 2)}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">${btn("Fechar", `BancaUI.fecharOperacao(${i})`, "#1e3a8a")}${btn("Virou pó", `BancaUI.fecharOperacao(${i},0)`, "#3f1d1d")}${btn("Excluir", `BancaUI.excluirOperacao(${i})`)}</td></tr>`;
    const linhaFechada = ({ o, i }) => {
      const r = resultadoOperacao(o);
      const rr = riscoOperacaoAberta(o) > 0 ? r / riscoOperacaoAberta(o) : 0;
      return `<tr><td>${esc(o.dataEntrada)} → ${esc(o.dataSaida)}</td><td><b>${esc(o.opcao)}</b><div style="font-size:0.68rem;color:var(--dim);">${esc(o.ativo)} • ${esc(o.tipo)}</div></td>
      <td>${num(o.quantidade)}</td><td>${brl(o.premioEntrada)} → ${brl(o.premioSaida)}</td><td style="color:${r >= 0 ? "var(--green)" : "#f87171"};font-weight:700;">${brl(r)}</td><td>${rr >= 0 ? "+" : ""}${rr.toFixed(2)}R</td>
      <td>${btn("Excluir", `BancaUI.excluirOperacao(${i})`)}</td></tr>`;
    };
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:end;">
        ${campo("bo-data", "Data entrada", hojeISO(), 'type="date"')}
        ${campo("bo-opcao", "Opção", "", 'placeholder="ex: PETRK604"')}
        ${campo("bo-ativo", "Ativo-objeto", "", 'placeholder="ex: PETR4"')}
        <label style="display:flex;flex-direction:column;gap:4px;font-size:0.7rem;color:var(--muted);text-transform:uppercase;font-weight:600;">Tipo
          <select id="bo-tipo" style="background:#0b0f19;border:1px solid var(--border);color:var(--text);padding:7px 9px;border-radius:6px;"><option>CALL</option><option>PUT</option></select></label>
        ${campo("bo-qtd", "Quantidade", num(saude.params.loteMinimo, 100), 'type="number" step="100" min="100"')}
        ${campo("bo-premio", "Prêmio pago (R$)", "", 'type="number" step="0.01" min="0"')}
        ${campo("bo-taxas", "Taxas totais (R$)", num(saude.params.taxaPorOrdem), 'type="number" step="0.01" min="0"')}
        <div>${btn("➕ Registrar Entrada", "BancaUI.adicionarOperacao()", "#065f46")}</div>
      </div>
      <div id="bo-aviso" style="margin-top:8px;font-size:0.78rem;"></div>
      <h4 style="margin:16px 0 6px;font-size:0.85rem;">Posições Abertas (${abertas.length})</h4>
      <div style="overflow-x:auto;"><table><thead><tr><th>Entrada</th><th>Opção</th><th>Qtd</th><th>Prêmio</th><th>Risco (pó)</th><th>Alvo +100%</th><th>Ações</th></tr></thead>
      <tbody>${abertas.map(linhaAberta).join("") || `<tr><td colspan="7" style="text-align:center;color:var(--dim);">Sem posições abertas.</td></tr>`}</tbody></table></div>
      <h4 style="margin:16px 0 6px;font-size:0.85rem;">Histórico Fechado (${fechadas.length})</h4>
      <div style="overflow-x:auto;"><table><thead><tr><th>Período</th><th>Opção</th><th>Qtd</th><th>Entrada → Saída</th><th>Resultado</th><th>R</th><th></th></tr></thead>
      <tbody>${fechadas.map(linhaFechada).join("") || `<tr><td colspan="7" style="text-align:center;color:var(--dim);">Nenhuma operação fechada ainda.</td></tr>`}</tbody></table></div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">
        ${btn("⬇ Exportar Backup JSON", "BancaUI.exportar()")}
        <label class="btn-refresh" style="padding:6px 12px;font-size:0.78rem;cursor:pointer;">⬆ Importar Backup<input type="file" accept="application/json" style="display:none;" onchange="BancaUI.importar(this)"></label>
        ${btn("🗑 Apagar Todos os Dados Locais", "BancaUI.apagarTudo()", "#3f1d1d")}
      </div>
      <div style="margin-top:6px;font-size:0.7rem;color:var(--dim);">🔒 Dados guardados apenas neste navegador (localStorage). Não são enviados ao GitHub. Faça backup periódico.</div>`;
  }

  function renderBanca() {
    const container = document.getElementById("banca-root");
    if (!container) return;
    const saude = calcularSaudeBanca(estado, anoAtual());
    if (gridCache) gridCache = gerarGrid(root.appState.underlyings, root.appState.options, saude);
    const painel = (tag, titulo, corpo, direita = "") => `<div class="panel"><div class="panel-header"><div class="panel-title"><span class="tag">${tag}</span> ${titulo}</div>${direita}</div><div class="panel-body">${corpo}</div></div>`;
    container.innerHTML =
      painel("SAÚDE", "Painel Anti-Ruína da Banca", renderSaude(saude)) +
      painel("GRID", "Grid de Opções Operáveis Agora (lote mínimo 100)", renderGrid(saude), btn("⚡ Gerar Grid Agora", "BancaUI.gerarGridAgora()", "#065f46")) +
      painel("DIÁRIO", "Diário de Operações", renderDiario(saude)) +
      `<div class="grid-2">${painel("FUNDING", "Funding Anual (Capital Alocado na Corretora)", renderFunding(saude))}${painel("REGRAS", "Parâmetros de Risco", renderParametros())}</div>`;
  }

  /* ------------------------------------------------------------------ */
  /* 5. AÇÕES (expostas em window.BancaUI)                               */
  /* ------------------------------------------------------------------ */

  const val = (id) => (document.getElementById(id) || {}).value;
  const persistirERender = () => {
    salvarEstado(estado);
    renderBanca();
  };

  const BancaUI = {
    render: renderBanca,
    adicionarFunding() {
      const valor = num(val("bf-valor"), NaN);
      const ano = Math.trunc(num(val("bf-ano"), anoAtual()));
      if (!(valor > 0)) return alert("Informe um valor de aporte maior que zero.");
      estado.fundings.push({ ano, valor, data: val("bf-data") || hojeISO(), obs: val("bf-obs") || "" });
      persistirERender();
    },
    excluirFunding(i) {
      if (!confirm("Excluir este registro de funding?")) return;
      estado.fundings.splice(i, 1);
      persistirERender();
    },
    salvarParametros() {
      Object.keys(PARAMS_PADRAO).forEach((k) => {
        const v = num(val(`bp-${k}`), NaN);
        if (Number.isFinite(v) && v >= 0) estado.params[k] = v;
      });
      persistirERender();
    },
    restaurarParametros() {
      if (!confirm("Restaurar todos os parâmetros de risco para o padrão?")) return;
      estado.params = Object.assign({}, PARAMS_PADRAO);
      persistirERender();
    },
    gerarGridAgora() {
      const saude = calcularSaudeBanca(estado, anoAtual());
      gridCache = gerarGrid(root.appState.underlyings, root.appState.options, saude);
      gridGeradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      renderBanca();
    },
    filtrarGrid(v) {
      filtroGrid = v;
      renderBanca();
    },
    registrarDoGrid(idx) {
      const l = (root.__bancaGridVisivel || [])[idx];
      if (!l) return;
      const set = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.value = v;
      };
      set("bo-opcao", l.symbol);
      set("bo-ativo", l.ativo);
      set("bo-tipo", l.tipo);
      set("bo-qtd", l.quantidade);
      set("bo-premio", l.premio.toFixed(2));
      const el = document.getElementById("bo-opcao");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      const aviso = document.getElementById("bo-aviso");
      if (aviso) aviso.innerHTML = `<span style="color:var(--blue);">Pré-preenchido com ${esc(l.symbol)} (${l.lotes} lote(s)). Ajuste o prêmio para o valor efetivamente executado na corretora e clique em Registrar Entrada.</span>`;
    },
    adicionarOperacao() {
      const saude = calcularSaudeBanca(estado, anoAtual());
      const p = saude.params;
      const op = {
        id: Date.now(),
        dataEntrada: val("bo-data") || hojeISO(),
        opcao: String(val("bo-opcao") || "").trim().toUpperCase(),
        ativo: String(val("bo-ativo") || "").trim().toUpperCase(),
        tipo: val("bo-tipo") || "CALL",
        quantidade: Math.trunc(num(val("bo-qtd"))),
        premioEntrada: num(val("bo-premio")),
        taxas: num(val("bo-taxas")),
        status: "ABERTA",
      };
      if (!op.opcao || !op.ativo) return alert("Informe a opção e o ativo-objeto.");
      if (op.quantidade < num(p.loteMinimo) || op.quantidade % num(p.loteMinimo, 100) !== 0) return alert(`Quantidade deve ser múltipla do lote mínimo (${p.loteMinimo}).`);
      if (!(op.premioEntrada > 0)) return alert("Informe o prêmio pago.");
      const risco = riscoOperacaoAberta(op);
      const violacoes = [];
      if (saude.circuitBreakerAtivo) violacoes.push("circuit breaker ativo");
      if (risco > saude.orcamentoTiro + 0.005) violacoes.push(`risco ${brl(risco)} > orçamento por tiro ${brl(saude.orcamentoTiro)}`);
      if (risco > saude.exposicaoRestante + 0.005) violacoes.push(`excede exposição restante ${brl(saude.exposicaoRestante)}`);
      if (saude.vagasPosicoes <= 0) violacoes.push(`limite de ${p.maxPosicoes} posições`);
      if (saude.abertas.filter((o) => o.ativo === op.ativo).length >= num(p.maxPorAtivo)) violacoes.push(`já há posição em ${op.ativo}`);
      if (violacoes.length && !confirm(`⚠️ Esta entrada VIOLA as regras anti-ruína:\n\n• ${violacoes.join("\n• ")}\n\nRegistrar mesmo assim? (fica marcada como fora da regra)`)) return;
      op.foraDaRegra = violacoes.length > 0;
      estado.operacoes.push(op);
      persistirERender();
    },
    fecharOperacao(i, precoForcado) {
      const o = estado.operacoes[i];
      if (!o) return;
      let preco = precoForcado;
      if (preco === undefined) {
        const r = prompt(`Prêmio de saída (R$) para ${o.opcao}:`, (num(o.premioEntrada) * 2).toFixed(2));
        if (r === null) return;
        preco = num(String(r).replace(",", "."), NaN);
        if (!(preco >= 0)) return alert("Valor inválido.");
        const taxaSaida = num(estado.params.taxaPorOrdem);
        o.taxas = num(o.taxas) + taxaSaida;
      }
      o.premioSaida = preco;
      o.dataSaida = hojeISO();
      o.status = "FECHADA";
      persistirERender();
    },
    excluirOperacao(i) {
      if (!confirm("Excluir esta operação do diário?")) return;
      estado.operacoes.splice(i, 1);
      persistirERender();
    },
    exportar() {
      const blob = new Blob([JSON.stringify(Object.assign({ exportadoEm: new Date().toISOString() }, estado), null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `banca_b3ts_${hojeISO()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    importar(input) {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const e = JSON.parse(reader.result);
          if (!Array.isArray(e.fundings) || !Array.isArray(e.operacoes)) throw new Error("formato");
          if (!confirm("Substituir os dados locais atuais pelo backup?")) return;
          estado = { fundings: e.fundings, operacoes: e.operacoes, params: Object.assign({}, PARAMS_PADRAO, e.params || {}) };
          persistirERender();
        } catch (err) {
          alert("Arquivo de backup inválido.");
        }
      };
      reader.readAsText(f);
    },
    apagarTudo() {
      if (!confirm("Apagar TODOS os dados de funding e operações deste navegador? Faça backup antes.")) return;
      if (!confirm("Confirma definitivamente?")) return;
      estado = { fundings: [], operacoes: [], params: Object.assign({}, PARAMS_PADRAO) };
      gridCache = null;
      persistirERender();
    },
  };

  /* ------------------------------------------------------------------ */
  /* 6. NAVEGAÇÃO POR ABAS                                               */
  /* ------------------------------------------------------------------ */

  function selecionarAba(aba) {
    const painel = document.getElementById("tab-painel");
    const banca = document.getElementById("tab-banca");
    if (!painel || !banca) return;
    const ehBanca = aba === "banca";
    painel.style.display = ehBanca ? "none" : "";
    banca.style.display = ehBanca ? "" : "none";
    document.querySelectorAll("[data-aba]").forEach((b) => {
      const ativo = b.getAttribute("data-aba") === aba;
      b.style.background = ativo ? "rgba(56,189,248,0.15)" : "transparent";
      b.style.color = ativo ? "var(--blue)" : "var(--muted)";
      b.style.borderBottom = ativo ? "2px solid var(--blue)" : "2px solid transparent";
    });
    try {
      localStorage.setItem("b3ts_aba_ativa", aba);
    } catch (e) {}
    if (ehBanca) {
      renderBanca();
      if (!gridCache) {
        let tentativas = 0;
        const t = setInterval(() => {
          tentativas++;
          const pronto = root.appState && root.appState.options && root.appState.options.length > 0;
          if (pronto && !gridCache) BancaUI.gerarGridAgora();
          if (pronto || gridCache || tentativas > 30) clearInterval(t);
        }, 1000);
      }
    }
  }

  root.BancaUI = BancaUI;
  root.selecionarAbaPortal = selecionarAba;

  document.addEventListener("DOMContentLoaded", () => {
    let aba = "painel";
    try {
      aba = localStorage.getItem("b3ts_aba_ativa") || "painel";
    } catch (e) {}
    if (location.hash === "#banca" || location.hash === "#painel") aba = location.hash.slice(1);
    selecionarAba(aba);
  });
})(typeof window !== "undefined" ? window : globalThis);
