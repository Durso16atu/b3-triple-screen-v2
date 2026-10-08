export const formatCurrency = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export const formatPercent = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2 }).format(value);

export const formatGreek = (value) =>
  Number(value).toFixed(4);

export const formatDate = (dateStr) => {
  const d = new Date(dateStr);
  // Simple check for valid date
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('pt-BR', {timeZone: 'UTC'});
};
