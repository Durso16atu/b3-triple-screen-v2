import { state } from './state.js';
import { renderUnderlyingsTable, renderOptionsTable } from './components/tables.js';
import { formatPercent } from './utils/formatters.js';

async function init() {
  try {
    const response = await fetch('../data/latest.json');
    if (!response.ok) {
        const fallback = await fetch('./data/latest.json');
        if (fallback.ok) {
            const data = await fallback.json();
            state.setData(data);
        } else {
            throw new Error("Cannot fetch latest.json");
        }
    } else {
        const data = await response.json();
        state.setData(data);
    }
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
    document.getElementById('metadata-bar').innerHTML = 'Falha ao carregar dados. Executou o pipeline?';
  }
}

function updateUI(data, filters) {
  if (!data) return;

  document.getElementById('metadata-bar').innerHTML = `
    Data Base: ${data.metadata.business_date} |
    CDI Anual: ${formatPercent(data.metadata.cdi_rate_annual)} |
    Checksum: ${data.metadata.checksum.substring(0,8)}...
  `;

  const filteredUnderlyings = data.underlyings.filter(u =>
    filters.ticker === 'ALL' || u.ticker === filters.ticker
  );
  renderUnderlyingsTable(filteredUnderlyings, 'underlyings-container');

  const filteredOptions = data.options.filter(o => {
    const matchTicker = filters.ticker === 'ALL' || o.underlying_ticker === filters.ticker;
    const matchType = filters.type === 'ALL' || o.type === filters.type;
    const matchDelta = o.greeks.delta >= filters.minDelta && o.greeks.delta <= filters.maxDelta;
    return matchTicker && matchType && matchDelta;
  });

  renderOptionsTable(filteredOptions, 'options-container');
}

document.addEventListener('DOMContentLoaded', () => {
  state.subscribe(updateUI);
  init();

  document.getElementById('filter-ticker').addEventListener('change', (e) => {
    state.setFilter('ticker', e.target.value);
  });

  document.getElementById('filter-type').addEventListener('change', (e) => {
    state.setFilter('type', e.target.value);
  });
});
