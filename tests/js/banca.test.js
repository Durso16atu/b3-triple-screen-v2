// Testes das funções puras do módulo Gestão de Banca.
// Executar: node --test tests/js/
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../../frontend/js/components/banca.js");

const ANO = 2026;
const base = (extra = {}) => ({
  fundings: [{ ano: ANO, valor: 3000, data: "2026-10-21" }],
  operacoes: [],
  params: Object.assign({}, B.PARAMS_PADRAO, extra),
});

test("funding soma apenas o ano informado", () => {
  const f = [
    { ano: 2026, valor: 2000 },
    { ano: 2026, valor: 1000 },
    { ano: 2025, valor: 9999 },
  ];
  assert.equal(B.fundingDoAno(f, 2026), 3000);
});

test("orçamento por tiro = capital vivo x risco% (5% de 3000 = 150)", () => {
  const s = B.calcularSaudeBanca(base(), ANO);
  assert.equal(s.base, 3000);
  assert.equal(s.orcamentoTiro, 150);
  assert.equal(s.limiteExposicao, 750); // 25%
  assert.equal(s.tirosDisponiveis, 5);
  assert.equal(s.tirosAteRuina, 20);
});

test("perdas realizadas reduzem capital vivo e o tamanho do tiro (anti-ruína)", () => {
  const e = base();
  e.operacoes.push({ dataEntrada: "2026-10-01", dataSaida: "2026-10-05", status: "FECHADA", quantidade: 100, premioEntrada: 1.5, premioSaida: 0, taxas: 0 });
  const s = B.calcularSaudeBanca(e, ANO);
  assert.equal(s.realizado, -150);
  assert.equal(s.capitalVivo, 2850);
  assert.equal(s.orcamentoTiro, 142.5);
  assert.ok(s.ddMax > 0.049 && s.ddMax < 0.051);
});

test("circuit breaker trava quando perda realizada >= limite", () => {
  const e = base({ circuitBreakerPct: 30 });
  e.operacoes.push({ dataEntrada: "2026-10-01", dataSaida: "2026-10-05", status: "FECHADA", quantidade: 900, premioEntrada: 1.0, premioSaida: 0, taxas: 0 });
  const s = B.calcularSaudeBanca(e, ANO);
  assert.equal(s.circuitBreakerAtivo, true);
});

test("risco aberto consome exposição e vagas", () => {
  const e = base();
  e.operacoes.push({ dataEntrada: "2026-10-20", status: "ABERTA", ativo: "PETR4", quantidade: 100, premioEntrada: 1.2, taxas: 0 });
  const s = B.calcularSaudeBanca(e, ANO);
  assert.equal(s.riscoAberto, 120);
  assert.equal(s.exposicaoRestante, 630);
  assert.equal(s.vagasPosicoes, 4);
  assert.equal(s.tirosDisponiveis, 4);
});

test("Kelly: p=25%, R=4 => f*=6,25%, 1/4 Kelly=1,5625%", () => {
  const k = B.calcularKelly(0.25, 4);
  assert.ok(Math.abs(k.cheio - 0.0625) < 1e-12);
  assert.ok(Math.abs(k.quarto - 0.015625) < 1e-12);
  assert.ok(Math.abs(k.expectativa - 0.25) < 1e-12);
  assert.ok(B.calcularKelly(0.15, 4).cheio < 0); // expectativa negativa
});

test("Monte Carlo: risco maior => maior probabilidade de ruína; determinístico", () => {
  const a = B.simularRuina({ p: 0.25, R: 4, fracao: 0.02, nCaminhos: 2000 });
  const b = B.simularRuina({ p: 0.25, R: 4, fracao: 0.1, nCaminhos: 2000 });
  const a2 = B.simularRuina({ p: 0.25, R: 4, fracao: 0.02, nCaminhos: 2000 });
  assert.ok(b.probRuina > a.probRuina);
  assert.equal(a.probRuina, a2.probRuina);
});

test("direção: CALL em ALTA+FORTE_COMPRA, PUT em BAIXA+VENDA, null caso contrário", () => {
  assert.equal(B.direcaoPermitida({ trend_signal: "ALTA", phicube: { confluence_verdict: "FORTE_COMPRA" } }), "CALL");
  assert.equal(B.direcaoPermitida({ trend_signal: "BAIXA", phicube: { confluence_verdict: "VENDA" } }), "PUT");
  assert.equal(B.direcaoPermitida({ trend_signal: "BAIXA", phicube: { confluence_verdict: "NEUTRO" } }), null);
});

test("grid: dimensiona lotes de 100 e bloqueia quando 1 lote excede o orçamento", () => {
  const u = [{ ticker: "PETR4", spot_price: 58, trend_signal: "ALTA", phase: "A_CAMINHO", phicube: { confluence_verdict: "FORTE_COMPRA", phibo_1618: 73 } }];
  const opt = (symbol, strike, premio, delta) => ({
    symbol, underlying_ticker: "PETR4", type: "CALL", strike, du: 20, spot_price: 58, market_price: premio,
    num_trades: 50, is_real_b3_ticker: true, iv: 0.4, greeks: { delta },
  });
  const s = B.calcularSaudeBanca(base(), ANO); // orçamento 150
  const g = B.gerarGrid(u, [opt("PETRK600", 60, 0.7, 0.35), opt("PETRK560", 56, 3.2, 0.7), opt("PETRK620", 62, 2.0, 0.3)], s);
  const ok = g.find((l) => l.symbol === "PETRK600");
  assert.equal(ok.status, "OK");
  assert.equal(ok.lotes, 2); // 150 / 70 = 2 lotes
  assert.equal(ok.quantidade, 200);
  assert.ok(Math.abs(ok.payoffAlvo - (73 - 60) / 0.7) < 1e-9);
  const caro = g.find((l) => l.symbol === "PETRK620");
  assert.equal(caro.status, "BLOQUEADA");
  assert.ok(caro.motivos.some((m) => m.includes("1 lote custa")));
  const itm = g.find((l) => l.symbol === "PETRK560");
  assert.ok(itm.motivos.some((m) => m.includes("Delta")));
  assert.equal(g[0].symbol, "PETRK600"); // operáveis primeiro
});

test("grid: sem funding, tudo bloqueado", () => {
  const e = base();
  e.fundings = [];
  const s = B.calcularSaudeBanca(e, ANO);
  const g = B.gerarGrid([], [{ symbol: "X", underlying_ticker: "Y", type: "CALL", strike: 1, du: 20, market_price: 0.1, greeks: { delta: 0.3 } }], s);
  assert.equal(g[0].status, "BLOQUEADA");
  assert.ok(g[0].motivos.includes("Sem funding cadastrado no ano"));
});
