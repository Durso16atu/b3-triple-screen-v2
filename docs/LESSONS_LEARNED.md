# Lessons Learned — B3 Triple Screen v2 (Nível 2: Mercado & Nível 3: Engenharia)

Este documento registra aprendizados extraídos dos snapshots pós-pregão (`data/latest.json`) e das auditorias de código/testes do projeto `b3-triple-screen-v2`.

## Aprendizados de Engenharia e UI (Histórico Recente)

1. **[UI-001] Alinhamento de Faixas de Gatilho Estocástico no Frontend** (`commit e7858c3`)
   - **Problema Corrigido:** Desalinhamento visual entre os limiares matemáticos exatos (`%K <= 30%` para CALL e `%K >= 70%` para PUT) e a faixa renderizada no gráfico.
   - **Regra:** Sempre que um limiar quantitativo for exibido em gráfico (Candlestick / Oscilador), os limites visuais (`yAxis` / `markArea`) devem refletir exatamente as constantes do motor de sinais.

2. **[UI-002] Colisão de Datas no Eixo X e Enquadramento da Linha Superior** (`commit f4cf1c8`)
   - **Problema Corrigido:** Sobreposição de rótulos de datas no eixo X e corte da linha superior em telas densas.
   - **Regra:** Garantir espaçamento/padding superior no eixo Y e rotação/intervalo adaptativo nos rótulos temporais do gráfico.

3. **[AI-001] Integração Resiliente de LLM via Gateway OmniRoute e Fallback SDK**
   - **Problema Corrigido:** Riscos de interrupção do pipeline por HTTP 429 (exaustão de cota) e HTTP 404 (depreciação de modelos legados como `gemini-2.5-flash`).
   - **Regra:** Utilizar arquitetura desacoplada (`src/ai/`) com `gemini-3.1-flash-lite` para rotinas de fechamento batch (19h00 BRT, Seg-Sex `1-5`), contratos de dados estritos via Pydantic v2 e gateway local OmniRoute com auto-fallback.


## Aprendizados de Mercado Pós-Pregão (Snapshots B3)

- **Sessão `2026-10-23` (`maturity_date: 2026-11-19`, `18 DU`, Call `K` / Put `W`, CDI `13,65% a.a.`)**:
  - Fonte primária `yfinance` operou sem necessidade de fallback sintético (`is_synthetic_fallback: false`).
  - Ativos em tendência de alta (`trend_signal: ALTA`) mas com estocástico lento esticado (`stoch_k > 80`, fase `A_CAMINHO`, ex: `PETR4` a R$ 58,68) permanecem com `gatilho_entrada: null`, preservando a disciplina anti-ruína da Gestão de Banca.

- **Sessão `2026-10-27` (`maturity_date: 2026-11-19`, `16 DU`, Call `K` / Put `W`, CDI `13,65% a.a.`)**:
  - Ingestão via `yfinance` íntegra (`is_synthetic_fallback: false`), 28 underlyings monitorados.
  - **Validação Retrospectiva do Pullback:** `PETR4` arrefeceu de R$ 58,68 (%K 82,45) para R$ 52,79 (%K 44,63), confirmando que a retenção de gatilho em sobrecompra evitou compra em topo local.
  - **Confluência Bancária em `INDICACAO_IMEDIATA`:** Os 3 maiores bancos privados/públicos do Ibovespa armaram gatilho de compra simultâneo por sobrevenda tática (%K < 20%) dentro de tendência primária de ALTA semanal:
    - `ITUB4`: spot R$ 41,19 | Gatilho R$ 42,16 | Stop R$ 39,67 | Alvo 2R R$ 47,14 (%K 18,29 / %D 35,63).
    - `BBDC4`: spot R$ 15,73 | Gatilho R$ 16,08 | Stop R$ 14,59 | Alvo 2R R$ 19,06 (%K 18,60 / %D 31,19).
    - `BBAS3`: spot R$ 17,38 | Gatilho R$ 18,13 | Stop R$ 16,47 | Alvo 2R R$ 21,45 (%K 19,15 / %D 24,27).
    - Adicionalmente, varejo cíclico armado: `MGLU3` (%K 29,53, gatilho R$ 6,66) e `VAMO3` (%K 26,75, gatilho R$ 3,22).
  - **Diretriz Tática de Opções (16 DU):** Com apenas 16 dias úteis para o vencimento de novembro, o decaimento teta ($\Theta$) acelera exponencialmente. Para operar os gatilhos armados, preferir travas de alta com débito curto (bull call spread) ou compra sintética com delta $\ge 0,65$ no `voledge_b3`, evitando calls OTM secas que sofrem forte erosão de prêmio.

- **Sessão `2026-11-05` (`maturity_date: 2026-11-19`, `10 DU`, Call `K` / Put `W`, CDI `10,50% a.a.`)**:
  - Ingestão via `yfinance` íntegra (`is_synthetic_fallback: false`), 28 underlyings monitorados.
  - **Validação Retrospectiva do Filtro Semanal (Setor Bancário):** Os ativos bancários que armaram repique tático em 2026-10-27 (`ITUB4`, `BBDC4`, `BBAS3`) perderam suporte na semana seguinte e viraram para `trend_signal: BAIXA` (%K entre 3,5% e 11,3%), desarmando gatilhos de compra e protegendo o capital. O filtro de tendência semanal impediu compras contra a tendência maior de queda do Ibovespa (`BOVA11` em BAIXA).
  - **Sinal Único em `INDICACAO_IMEDIATA` (`PRIO3`):** Spot R$ 61,54 | Tendência primária semanal de `ALTA` | Sobrevenda extrema no diário (%K 7,31 / %D 30,19) | Gatilho R$ 67,56 | Stop R$ 61,53 | Alvo 2R R$ 79,62 | PhiCube NEUTRO.
  - **Retenção de Gatilhos em `A_CAMINHO` (`SUZB3` e `JBSS3`):** Ambos mantêm tendência semanal de `ALTA`, porém com estocástico lento sobrecomprado (`SUZB3` %K 96,1 e `JBSS3` %K 76,5, PhiCube COMPRA_PULLBACK), retendo gatilho até haver retração aos suportes móveis.
  - **Diretriz Tática de Opções a 10 DU da Expiração:** Faltando apenas 10 DU para o vencimento de novembro, o decaimento teta entra em fase crítica. Para `PRIO3`, caso ocorra rompimento do gatilho (R$ 67,56), é proibida compra a seco de calls OTM; a execução deve priorizar travas de alta com débito curto, calls deep ITM ($\Delta \ge 0,70$) ou rolagem antecipada de estrutura para o vencimento de dezembro (`2026-12-17`, série L/X, ~31 DU).

- **Sessão `2026-11-06` (`maturity_date: 2026-11-19`, `9 DU`, Call `K` / Put `W`, CDI `13,65% a.a.`)**:
  - Ingestão via `yfinance` íntegra (`is_synthetic_fallback: false`), 28 underlyings monitorados.
  - **Validação Retrospectiva Crítica de `PRIO3` (Defesa de Capital):** No pregão anterior, `PRIO3` era o único ativo em `INDICACAO_IMEDIATA` com gatilho estrito em R$ 67,56 e stop em R$ 61,53. Em 2026-11-06, o papel recuou para R$ 60,48 (-1,72%), violando o nível de stop e forçando o cruzamento baixista nas médias semanais, o que virou seu `trend_signal` para `BAIXA` (%K colapsando para 1,07). O gatilho diário nunca foi rompido e o sistema desarmou a indicação automaticamente (`gatilho_entrada: null`, fase `AGUARDANDO`), preservando 100% do capital contra perda total de valor extrínseco.
  - **Quadro Sistêmico de Capitulação (85,7% em BAIXA):** 24 dos 28 papéis operam em tendência primária de `BAIXA`, 2 em `NEUTRO` (`VALE3` a R$ 64,04 e `ELET3`), e apenas 2 em `ALTA` (`SUZB3` e `JBSS3`).
  - **Total Ausência de Gatilhos Armados:** 0 ativos em `INDICACAO_IMEDIATA` e 26 ativos em `AGUARDANDO`.
  - **Retenção Algorítmica em `A_CAMINHO`:** Os dois únicos sobreviventes em ALTA (`SUZB3` %K 97,31 e `JBSS3` %K 77,72) seguem com gatilho bloqueado por sobrecompra estocástica, confirmando a regra de ouro de não comprar topos.
  - **Diretriz de Opções a 9 DU do Vencimento:** A 9 dias úteis da expiração de novembro, o risco teta ($\Theta$) inviabiliza compras direcionais de opções a seco. O posicionamento quantitativo determina liquidez e disciplina absoluta, preparando estruturas de volatilidade e travas exclusivamente para o ciclo de dezembro (`2026-12-17`, série L/X, ~30 DU) no `voledge_b3`.

- **Sessão `2026-11-09` (`maturity_date: 2026-11-19`, `8 DU`, Call `K` / Put `W`, CDI `13,65% a.a.`)**:
  - Ingestão via `yfinance` íntegra (`is_synthetic_fallback: false`), 28 underlyings monitorados.
  - **Quadro de Mercado e Tendências:** 23 ativos em `BAIXA` (82,1%), 2 em `NEUTRO` (`VALE3` a R$ 66,11 e `WEGE3` a R$ 50,74), e 3 em `ALTA` (`SUZB3` a R$ 54,20, `RAIZ4` a R$ 28,00 e `JBSS3` a R$ 72,60).
  - **Total Ausência de Gatilhos Armados:** 0 ativos em `INDICACAO_IMEDIATA` e 25 ativos em `AGUARDANDO`.
  - **Retenção Algorítmica em `A_CAMINHO` (Proteção Anti-Topo):** Os 3 ativos com tendência de ALTA encontram-se com estocástico lento sobrecomprado no diário (`SUZB3` %K 98,21 / %D 97,22; `RAIZ4` %K 91,09 / %D 82,27; `JBSS3` %K 82,60 / %D 78,94). Mesmo com o PhiCube emitindo sinais favoráveis (`COMPRA_PULLBACK` em `SUZB3`/`JBSS3` e `FORTE_COMPRA` em `RAIZ4`), o motor de regras reteve rigorosamente os gatilhos (`gatilho_entrada: null`, fase `A_CAMINHO`), exigindo retração saudável até os suportes de médias móveis / Fibonacci antes de qualquer liberação de entrada.
  - **Aprofundamento de Sobrevenda e Validação Contínua de `PRIO3`:** `PRIO3` aprofundou a queda para R$ 59,39 (%K 5,79 / %D 4,73), confirmando o acerto de seu stop algorítmico anterior em R$ 61,53. Sobrevenda extrema generalizada em `PETR3` (%K 2,28), `PETR4` (%K 2,70), `MGLU3` (%K 8,05) e `USIM5` (%K 8,18).
  - **Diretriz Tática de Opções a 8 DU da Expiração:** Com apenas 8 dias úteis restantes para o vencimento de novembro (`2026-11-19`), o decaimento teta ($\Theta$) entra em zona terminal de destruição de prêmio extrínseco. Preservar liquidez integral, proibindo compras direcionais a seco na série K/W e direcionando toda e qualquer estruturação de travas ou volatilidade para o ciclo de dezembro (`2026-12-17`, série L/X, ~28 DU) no `voledge_b3`.

- **Sessão `2026-11-10` (`maturity_date: 2026-12-18`, `27 DU`, Call `L` / Put `X`, CDI `13,65% a.a.`)**:
  - Ingestão primária via `yfinance` íntegra (`is_synthetic_fallback: false`), 28 underlyings monitorados e 321 opções carregadas (100% série L com 5º caractere auditado, 56 tickers reais com liquidez B3).
  - **Eficácia Comprovada da Defesa Anti-Topo (Pullback em `RAIZ4` e `JBSS3`):** No pregão anterior (2026-11-09), os únicos 3 papéis em ALTA semanal operavam com oscilador estocástico sobrecomprado (%K > 80%). O motor reteve os gatilhos (`gatilho_entrada: null`, fase `A_CAMINHO`). Neste pregão de 2026-11-10, `RAIZ4` sofreu forte correção de R$ 28,00 para R$ 24,40 (-12,86%) e `JBSS3` recuou de R$ 72,60 para R$ 68,69 (-5,38%), comprovando matematicamente que a retenção de gatilho em sobrecompra impediu compras de topo.
  - **Quadro Amplo de Sobrevenda em Mercado Baixista (82,1% em BAIXA):** 23 ativos mantêm tendência primária semanal de `BAIXA`, 2 em `NEUTRO` (`VALE3` a R$ 64,80 e `WEGE3` a R$ 50,95) e 3 em `ALTA` (`SUZB3` a R$ 54,46, `RAIZ4` a R$ 24,40 e `JBSS3` a R$ 68,69). Sobrevenda diária extrema em `PETR3` (%K 3,96), `PETR4` (%K 4,12), `VAMO3` (%K 9,31), `USIM5` (%K 10,11), `BBAS3` (%K 11,29), `PRIO3` (%K 11,66), `MGLU3` (%K 12,07) e `BBDC4` (%K 14,01). A proibição de compras contra a tendência semanal preservou o investidor da armadilha de tentar adivinhar fundos em repiques intradiários.
  - **Total Ausência de Gatilhos Armados:** 0 ativos em `INDICACAO_IMEDIATA`, 25 em `AGUARDANDO` e 3 em `A_CAMINHO`.
  - **Validação da Rolagem Antecipada para Série L/X (27 DU):** A antecipação da rolagem para a série L/X (`2026-12-18`, 27 DU) afastou as opções do risco terminal de destruição por decaimento teta ($\Theta$) da série de novembro (`2026-11-19`, apenas 7 DU restantes), permitindo planejamento tático de travas no `voledge_b3` com tempo hábil e delta equilibrado assim que os pullbacks encontrarem suporte confirmado.

- **Sessão `2026-11-11` (`maturity_date: 2026-12-18`, `26 DU`, Call `L` / Put `X`, CDI `13,65% a.a.`)**:
  - Ingestão primária via `yfinance` íntegra (`is_synthetic_fallback: false`), 28 underlyings monitorados e 286 opções carregadas (100% série L com 5º caractere auditado, 259 cotações reais da B3 / 90,6%, zero violações de limites intrínsecos e paridade put-call).
  - **Validação Empírica da Defesa Anti-Topo em `RAIZ4` (-23,6% em 48h):** O derretimento de `RAIZ4` (de R$ 28,00 em 09/11 para R$ 21,40 em 11/11, perda de -23,57% em 48h) reverteu sua tendência semanal para `NEUTRO` e provou matematicamente o benefício de bloquear entradas em sobrecompra diária (%K > 80%). Os 2 únicos ativos em ALTA (`SUZB3` %K 92,91 e `JBSS3` %K 82,30) seguiram retidos em `A_CAMINHO`.
  - **Quadro de Mercado:** 23 ativos em `BAIXA` (82,1%), 3 em `NEUTRO` (`VALE3` R$ 64,43, `WEGE3` R$ 51,61 e `RAIZ4` R$ 21,40) e 2 em `ALTA` (`SUZB3` R$ 53,80 e `JBSS3` R$ 69,00). Total de 0 ativos em `INDICACAO_IMEDIATA`, 26 em `AGUARDANDO` e 2 em `A_CAMINHO`.

- **Sessão `2026-11-13` (`maturity_date: 2026-12-18`, `24 DU`, Call `L` / Put `X`, CDI `13,65% a.a.`)**:
  - Ingestão primária íntegra via `yfinance` (`is_synthetic_fallback: false`), 28 ativos monitorados e 289 opções carregadas (100% série L com 5º caractere auditado, 256 cotações reais da B3 / 88,6%, conformidade total com limites intrínsecos e paridade put-call).
  - **Alargamento Seletivo de ALTA (6 Ativos) e Retenção em `A_CAMINHO`:** A elevação dos ativos em ALTA semanal (de 2 para 6) sinalizou início de descolamento de setores pontuais (`SANB11` R$ 28,40, `SUZB3` R$ 54,77, `CMIG4` R$ 11,03, `ABEV3` R$ 15,79, `JBSS3` R$ 69,16 e `WEGE3` R$ 51,31). O motor conteve 100% dos impulsos prematuros de compra mantendo todos os 6 em `A_CAMINHO` com `gatilho_entrada: null` por sobrecompra (%K entre 61,1% e 95,4%).
  - **Quadro de Mercado:** 18 ativos em `BAIXA` (64,3%), 4 em `NEUTRO` e 6 em `ALTA`. Total de 0 ativos em `INDICACAO_IMEDIATA`, 22 em `AGUARDANDO` e 6 em `A_CAMINHO`.

- **Sessão `2026-11-16` (`maturity_date: 2026-12-18`, `23 DU`, Call `L` / Put `X`, CDI `13,65% a.a.`)**:
  - Ingestão primária via `yfinance` íntegra (`is_synthetic_fallback: false`), 28 underlyings monitorados e 293 opções carregadas (100% série L com 5º caractere auditado, 256 cotações reais da B3 / 87,4%, conformidade total com paridade put-call e limites intrínsecos).
  - **Queda Ampla do Mercado (-1,83% em BOVA11) e Resiliência dos Líderes:** O índice amplo recuou para R$ 166,58, pressionado por fortes baixas em pesos pesados (`VALE3` -4,41% para R$ 60,70 e `PETR4` -2,83% para R$ 44,02). O PhiCube de `BOVA11` sinaliza teste direto no suporte de Fibonacci Phibo 61,8% (R$ 165,59). Em contrapartida, os líderes em ALTA sustentaram força relativa expressiva (`JBSS3` +2,52% a R$ 70,90, `SUZB3` +1,33% a R$ 55,50, `SANB11` +0,88% a R$ 28,65 e `ABEV3` +0,51% a R$ 15,87).
  - **Retenção Algorítmica Contínua em `A_CAMINHO`:** Todos os 6 ativos em ALTA continuam com estocástico diário esticado (%K entre 72,5% e 93,9%), permanecendo estritamente com `gatilho_entrada: null` na fase `A_CAMINHO`. Essa disciplina impede compra em topos locais em meio à volatilidade do mercado.
  - **Filtro Semanal e Defesa Contra Facas Caindo em BAIXA:** Ativos em tendência primária de queda apresentaram sobrevenda diária extrema (`USIM5` %K 7,47, `CSNA3` %K 8,43, `BBAS3` %K 9,39, `PETR4` %K 11,75, `PETR3` %K 16,10). O filtro semanal impediu compras prematuras contra a tendência de queda, protegendo integralmente a banca.
  - **Diretriz de Opções a 23 DU da Expiração:** A 23 dias úteis do vencimento de dezembro (`2026-12-18`), manter liquidez total de caixa (0 ordens abertas). Aguardar pullbacks disciplinados nos 6 ativos em ALTA até suas respectivas médias móveis (EMA13) com arrefecimento do oscilador estocástico para estruturar travas de débito curto no `voledge_b3`.
