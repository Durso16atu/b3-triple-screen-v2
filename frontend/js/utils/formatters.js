export const formatCurrency = (value, placeholder = "—") =>
  value != null && !isNaN(value)
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
    : placeholder;

export const formatPercent = (value, placeholder = "—") =>
  value != null && !isNaN(value)
    ? new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2 }).format(value)
    : placeholder;

export const formatGreek = (value, decimals = 4, placeholder = "—") =>
  value != null && !isNaN(value)
    ? Number(value).toFixed(decimals)
    : placeholder;

export const formatDate = (dateStr, placeholder = "—") => {
  if (!dateStr) return placeholder;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};
