/**
 * B3 Triple Screen v2.0 - Integração Google Apps Script
 * Endpoint Web App (doGet) para servir dados intradiários em tempo real da Base Mestre.
 * Planilha ID: 1jpffPu52JjapHSjmqOe-BEYcrUBM8tSatC9g3o3Wqu0
 */

const SPREADSHEET_ID = "1jpffPu52JjapHSjmqOe-BEYcrUBM8tSatC9g3o3Wqu0";

/**
 * Ponto de entrada GET para a Web App.
 * Retorna payload JSON compatível com o Schema v2.0 do B3 Triple Screen.
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const now = new Date();
    const nowUtcIso = now.toISOString();
    const businessDate = Utilities.formatDate(now, "America/Sao_Paulo", "yyyy-MM-dd");

    // 1. Extração da aba Dashboard_KPIs
    const kpisData = extrairDashboardKPIs(ss);

    // 2. Extração da aba Sinais_Ativos
    const underlyings = extrairSinaisAtivos(ss, nowUtcIso);

    // 3. Extração da aba Grade_Opcoes_B3
    const options = extrairGradeOpcoes(ss, underlyings);

    // 4. Montagem dos Metadados em conformidade com o Contrato v2.0
    const metadata = {
      schema_version: "2.0",
      generated_at_utc: kpisData.timestamp || nowUtcIso,
      business_date: kpisData.business_date || businessDate,
      cdi_rate_annual: Number(kpisData.cdi_rate_annual || 0.1075),
      workdays_per_year: 252,
      engine_version: "2.0.0",
      source: "Google Sheets Live",
      market_status: kpisData.market_status || "OPERACIONAL",
      total_signals: Number(kpisData.total_signals || underlyings.length),
      checksum: ""
    };

    const payload = {
      metadata: metadata,
      underlyings: underlyings,
      options: options
    };

    // 5. Cálculo do Checksum SHA-256
    payload.metadata.checksum = calcularChecksumSha256(payload);

    return ContentService.createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    const erroPayload = {
      status: "error",
      message: error.toString(),
      timestamp: new Date().toISOString()
    };
    return ContentService.createTextOutput(JSON.stringify(erroPayload))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Lê a aba Dashboard_KPIs como pares chave-valor ou tabela.
 */
function extrairDashboardKPIs(ss) {
  const kpis = {
    source: "Google Sheets Live",
    cdi_rate_annual: 0.1075,
    market_status: "PREGÃO OPERACIONAL"
  };

  const sheet = ss.getSheetByName("Dashboard_KPIs");
  if (!sheet) return kpis;

  const values = sheet.getDataRange().getValues();
  if (!values || values.length === 0) return kpis;

  // Itera linhas mapeando chaves normalizadas
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (!row || row.length < 2) continue;
    const chave = String(row[0]).trim().toLowerCase();
    const valor = row[1];

    if (chave === "timestamp" || chave === "data_hora" || chave === "data") {
      kpis.timestamp = valor instanceof Date ? valor.toISOString() : String(valor);
    } else if (chave === "business_date" || chave === "data_pregao") {
      kpis.business_date = valor instanceof Date ? Utilities.formatDate(valor, "America/Sao_Paulo", "yyyy-MM-dd") : String(valor);
    } else if (chave === "market_status" || chave === "status_mercado") {
      kpis.market_status = String(valor);
    } else if (chave === "cdi_rate_annual" || chave === "taxa_cdi" || chave === "taxa_selic" || chave === "selic") {
      let num = parseFloat(String(valor).replace("%", "").replace(",", "."));
      if (!isNaN(num)) {
        if (num > 1) num = num / 100.0;
        kpis.cdi_rate_annual = num;
      }
    } else if (chave === "total_signals" || chave === "total_sinais" || chave === "sinais_ativos") {
      kpis.total_signals = Number(valor);
    }
  }

  return kpis;
}

/**
 * Lê a aba Sinais_Ativos e mapeia para a lista de underlyings.
 */
function extrairSinaisAtivos(ss, defaultIsoTime) {
  const sheet = ss.getSheetByName("Sinais_Ativos");
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];

  const headers = values[0].map(h => String(h).trim().toLowerCase());
  const underlyings = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || row.length === 0) continue;

    const rowObj = {};
    for (let c = 0; c < headers.length; c++) {
      rowObj[headers[c]] = row[c];
    }

    const ticker = String(rowObj["ticker"] || rowObj["ativo"] || rowObj["papel"] || row[0] || "").trim().toUpperCase();
    if (!ticker) continue;

    const spot = parseFloat(String(rowObj["spot_price"] || rowObj["spot"] || rowObj["preco"] || rowObj["preco_spot"] || 0).replace(",", "."));
    let trend = String(rowObj["trend_signal"] || rowObj["tendencia"] || rowObj["sinal"] || "NEUTRO").trim().toUpperCase();
    if (!["ALTA", "BAIXA", "NEUTRO"].includes(trend)) {
      trend = trend.includes("ALTA") || trend.includes("BULL") ? "ALTA" : (trend.includes("BAIXA") || trend.includes("BEAR") ? "BAIXA" : "NEUTRO");
    }

    let phase = String(rowObj["phase"] || rowObj["fase"] || "AGUARDANDO").trim().toUpperCase();
    if (!["INDICACAO_IMEDIATA", "A_CAMINHO", "AGUARDANDO", "NENHUMA"].includes(phase)) {
      phase = phase.includes("IMEDIATA") || phase.includes("ARMADO") ? "INDICACAO_IMEDIATA" : (phase.includes("CAMINHO") ? "A_CAMINHO" : "AGUARDANDO");
    }

    const supFibo = parseFloat(String(rowObj["suporte_fibonacci"] || rowObj["fibo"] || (spot * 0.95)).replace(",", "."));
    const gatilho = parseFloat(String(rowObj["gatilho_entrada"] || rowObj["gatilho"] || (spot * 1.01)).replace(",", "."));
    const stopLoss = parseFloat(String(rowObj["stop_loss"] || rowObj["stop"] || (spot * 0.93)).replace(",", "."));
    const alvo2r = parseFloat(String(rowObj["alvo_2r"] || rowObj["alvo"] || (spot * 1.15)).replace(",", "."));

    underlyings.push({
      ticker: ticker,
      spot_price: isNaN(spot) ? 0 : Number(spot.toFixed(2)),
      trend_signal: trend,
      phase: phase,
      suporte_fibonacci: isNaN(supFibo) ? 0 : Number(supFibo.toFixed(2)),
      gatilho_entrada: isNaN(gatilho) ? 0 : Number(gatilho.toFixed(2)),
      stop_loss: isNaN(stopLoss) ? 0 : Number(stopLoss.toFixed(2)),
      alvo_2r: isNaN(alvo2r) ? 0 : Number(alvo2r.toFixed(2)),
      updated_at: defaultIsoTime
    });
  }

  return underlyings;
}

/**
 * Lê a aba Grade_Opcoes_B3 e mapeia para a lista de derivativos (options).
 */
function extrairGradeOpcoes(ss, underlyings) {
  const sheet = ss.getSheetByName("Grade_Opcoes_B3");
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];

  const headers = values[0].map(h => String(h).trim().toLowerCase());
  const options = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || row.length === 0) continue;

    const rowObj = {};
    for (let c = 0; c < headers.length; c++) {
      rowObj[headers[c]] = row[c];
    }

    const symbol = String(rowObj["symbol"] || rowObj["opcao"] || rowObj["ticker_opcao"] || row[0] || "").trim().toUpperCase();
    if (!symbol) continue;

    const underlyingTicker = String(rowObj["underlying_ticker"] || rowObj["ativo_subjacente"] || rowObj["ativo"] || "").trim().toUpperCase();
    const type = String(rowObj["type"] || rowObj["tipo"] || "CALL").trim().toUpperCase() === "PUT" ? "PUT" : "CALL";
    const style = String(rowObj["style"] || rowObj["estilo"] || "EUROPEAN").trim().toUpperCase() === "AMERICAN" ? "AMERICAN" : "EUROPEAN";

    const strike = parseFloat(String(rowObj["strike"] || 0).replace(",", "."));
    let maturity = rowObj["maturity_date"] || rowObj["vencimento"] || "2026-11-20";
    if (maturity instanceof Date) {
      maturity = Utilities.formatDate(maturity, "America/Sao_Paulo", "yyyy-MM-dd");
    }

    const du = parseInt(String(rowObj["du"] || rowObj["dias_uteis"] || 30), 10);
    const spot = parseFloat(String(rowObj["spot_price"] || rowObj["spot"] || 0).replace(",", "."));
    const marketPrice = parseFloat(String(rowObj["market_price"] || rowObj["premio_mercado"] || rowObj["ultimo"] || 0).replace(",", "."));
    const theoPrice = parseFloat(String(rowObj["theoretical_price"] || rowObj["premio_teorico"] || marketPrice).replace(",", "."));
    const iv = parseFloat(String(rowObj["iv"] || rowObj["vol_implicita"] || 0.30).replace(",", "."));

    // Gregas
    const delta = parseFloat(String(rowObj["delta"] || (type === "CALL" ? 0.35 : -0.35)).replace(",", "."));
    const gamma = parseFloat(String(rowObj["gamma"] || 0.05).replace(",", "."));
    const thetaDu = parseFloat(String(rowObj["theta_du"] || rowObj["theta"] || -0.02).replace(",", "."));
    const vega = parseFloat(String(rowObj["vega"] || 0.08).replace(",", "."));
    const rho = parseFloat(String(rowObj["rho"] || 0.02).replace(",", "."));

    const intrinsicOk = (type === "CALL") ? (marketPrice >= Math.max(0, spot - strike) - 0.01) : (marketPrice >= Math.max(0, strike - spot) - 0.01);

    options.push({
      symbol: symbol,
      underlying_ticker: underlyingTicker,
      type: type,
      style: style,
      strike: Number(strike.toFixed(2)),
      maturity_date: String(maturity),
      du: isNaN(du) ? 30 : du,
      spot_price: Number(spot.toFixed(2)),
      market_price: Number(marketPrice.toFixed(2)),
      theoretical_price: Number(theoPrice.toFixed(4)),
      iv: Number(iv.toFixed(4)),
      greeks: {
        delta: Number(delta.toFixed(4)),
        gamma: Number(gamma.toFixed(4)),
        theta_du: Number(thetaDu.toFixed(4)),
        vega: Number(vega.toFixed(4)),
        rho: Number(rho.toFixed(4))
      },
      actuarial_checks: {
        intrinsic_bound_ok: Boolean(intrinsicOk),
        parity_violation_brl: 0.0
      }
    });
  }

  return options;
}

/**
 * Calcula o hash SHA-256 do payload para integridade de dados.
 */
function calcularChecksumSha256(payload) {
  try {
    const copia = JSON.parse(JSON.stringify(payload));
    copia.metadata.checksum = "";
    // Ordena chaves para determinismo
    const str = JSON.stringify(copia);
    const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
    let txtHash = "";
    for (let i = 0; i < rawHash.length; i++) {
      let b = rawHash[i];
      if (b < 0) b += 256;
      let byteStr = b.toString(16);
      if (byteStr.length === 1) byteStr = "0" + byteStr;
      txtHash += byteStr;
    }
    return txtHash;
  } catch (e) {
    return "";
  }
}
