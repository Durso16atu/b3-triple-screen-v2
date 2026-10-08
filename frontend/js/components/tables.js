import { formatCurrency, formatPercent, formatGreek, formatDate } from '../utils/formatters.js';

export const renderUnderlyingsTable = (underlyings, containerId) => {
  const container = document.getElementById(containerId);
  if (!underlyings || underlyings.length === 0) {
    container.innerHTML = '<p>Nenhum ativo encontrado.</p>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th class="left">Ticker</th>
          <th>Preço Atual</th>
          <th>Tendência Triple Screen</th>
        </tr>
      </thead>
      <tbody>
  `;

  underlyings.forEach(u => {
    const badgeClass = u.trend_signal.toLowerCase();
    html += `
      <tr>
        <td class="left"><strong>${u.ticker}</strong></td>
        <td>${formatCurrency(u.spot_price)}</td>
        <td><span class="badge ${badgeClass}">${u.trend_signal}</span></td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
};

export const renderOptionsTable = (options, containerId) => {
  const container = document.getElementById(containerId);
  if (!options || options.length === 0) {
    container.innerHTML = '<p>Nenhuma opção encontrada para os filtros atuais.</p>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th class="left">Símbolo</th>
          <th>Tipo</th>
          <th>Strike</th>
          <th>Vencimento (DU)</th>
          <th>Prêmio Mercado</th>
          <th>Prêmio Teórico</th>
          <th>IV</th>
          <th>Delta</th>
          <th>Theta(1DU)</th>
          <th>Actuarial OK?</th>
        </tr>
      </thead>
      <tbody>
  `;

  options.forEach(o => {
    const actOk = o.actuarial_checks.intrinsic_bound_ok ? '✅' : '❌';
    html += `
      <tr>
        <td class="left"><strong>${o.symbol}</strong></td>
        <td>${o.type}</td>
        <td>${formatCurrency(o.strike)}</td>
        <td>${formatDate(o.maturity_date)} (${o.du} DU)</td>
        <td>${formatCurrency(o.market_price)}</td>
        <td>${formatCurrency(o.theoretical_price)}</td>
        <td>${formatPercent(o.iv)}</td>
        <td>${formatGreek(o.greeks.delta)}</td>
        <td>${formatGreek(o.greeks.theta_du)}</td>
        <td>${actOk}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
};
