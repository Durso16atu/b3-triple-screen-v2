---
name: actuarial-invariants
description: "Regras e limites atuariais para modelagem de opções, gregas e precificação"
---

# Regras de Não-Arbitragem e Invariantes Atuariais

Este projeto respeita rigorosamente as condições de não-arbitragem e coerência atuarial. Toda implementação deve verificar os seguintes invariantes:

## Limites Intrínsecos
- **Call (Opção de Compra):** O preço de uma call nunca pode ser menor que o seu valor intrínseco.
  `C >= max(0, S - K)`
- **Put (Opção de Venda):** O preço de uma put nunca pode ser menor que o seu valor intrínseco.
  `P >= max(0, K - S)`

## Paridade Put-Call
Aplicada sobre a base de Dias Úteis (DU/252):
`C - P = S - K * exp(-r * DU/252)`
*Restrição BRL:* Deve considerar características específicas do CDI e taxa livre de risco aplicável.

## Monotonicidade
- Opções com strikes menores devem ter preços maiores (para Call) ou menores (para Put).
- Opções com maior vencimento (DU) devem ter preços maiores ou iguais (em ausência de dividendos discretos que justifiquem anomalias).

## Limites das Gregas
- **Delta:** Call em [0, 1]. Put em [-1, 0].
- **Gamma:** Sempre positivo (em opções plain-vanilla compradas).
- **Theta (DU):** Geralmente negativo.

Estas regras formam os "sanity checks" de todo o processamento de opções.
