# ruff: noqa: E501, E402
"""Schemas tipados Pydantic v2 para diagnóstico e síntese de mercado."""

from pydantic import BaseModel, Field


class TickerAssessment(BaseModel):
    """Diagnóstico técnico-atuarial de um ativo da cesta B3."""

    ticker: str = Field(description="Código do ativo na B3 (ex: PETR4, VALE3)")
    spot_price: float = Field(description="Preço spot de fechamento do ativo")
    trend: str = Field(description="Sinal de tendência primária (ALTA, BAIXA, LATERAL)")
    phase: str = Field(
        description="Fase atual no Triple Screen / PhiCube (ex: A_CAMINHO, PULLBACK, ROMPIMENTO)"
    )
    stoch_k: float = Field(description="Valor do Estocástico Rápido %K")
    confluence_verdict: str = Field(
        description="Veredito de confluência PhiCube (ex: FORTE_COMPRA, NEUTRO, VENDA)"
    )
    assessment: str = Field(
        description="Diagnóstico conciso das condições técnicas e disciplinares"
    )
    hedging_suggestion: str | None = Field(
        default=None,
        description="Sugestão de estrutura de proteção ou venda coberta de opções, se aplicável",
    )


class MacroOverview(BaseModel):
    """Visão macro e parâmetros determinísticos da sessão."""

    session_date: str = Field(description="Data da sessão de pregão no formato YYYY-MM-DD")
    cdi_rate_annual: float = Field(
        description="Taxa CDI anualizada em formato decimal (ex: 0.1365)"
    )
    days_to_maturity_du: int = Field(
        description="Dias úteis restantes até o vencimento ativo de opções"
    )
    active_series: str = Field(description="Séries ativas de Call e Put (ex: K / W)")
    market_sentiment: str = Field(
        description="Sentimento geral derivado da cesta (ex: OTIMISTA_MODERADO, CAUTELOSO, PESSIMISTA)"
    )
    key_risks: list[str] = Field(
        description="Principais alertas de risco de cauda ou disciplinares observados"
    )


class MarketBriefing(BaseModel):
    """Briefing diário executivo consolidado da sessão B3."""

    overview: MacroOverview = Field(description="Panorama macro e conjuntural da sessão")
    highlighted_tickers: list[TickerAssessment] = Field(
        description="Destaques de ativos com confluência ou atenção especial"
    )
    actionable_recommendations: list[str] = Field(
        description="Recomendações disciplinadas acionáveis para o próximo pregão"
    )
