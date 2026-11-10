# Implantação de Inteligência Artificial e Gateway OmniRoute no B3 Triple Screen v2.0

> **Documento Mestre de Engenharia, Governança Quantitativa e Integração de IA**
> **Data:** 24 de Outubro de 2026
> **Repositório:** `b3-triple-screen-v2`
> **Ambiente Operacional:** Linux Ubuntu, Python 3.12, systemd, rclone (Google Drive), OmniRoute Gateway

---

## 1. Visão Executiva e Objetivos Estratégicos

O ecossistema **B3 Triple Screen v2.0** é um motor determinístico de alta fidelidade para análise quantitativa e atuarial de ações e opções listadas na B3. Diariamente, ele processa séries temporais de preços, volatilidade implícita (via Newton-Raphson com fallback em Brent), precificação de opções (Black-Scholes-Merton analítico para europeias e Bjerksund-Stensland para americanas) e filtros fractais de confluência PhiCube.

### O Problema Resolvido
Pipelines autônomos que utilizam Modelos de Linguagem de Larga Escala (LLMs) enfrentam gargalos crônicos:
1. **Limites Rígidos de Cota e Rate Limit (HTTP 429):** Interrupção de rotinas automáticas quando requisições intradiárias ou batch excedem os limites por minuto (RPM) ou diários (TPD).
2. **Descontinuação Silenciosa de Modelos (HTTP 404):** Mudanças na nomenclatura de modelos de provedores externos (ex: depreciação do `gemini-2.5-flash` pelo Google AI Studio em favor do `gemini-3.5-flash` e `gemini-flash-latest`).
3. **Acoplamento Frágil:** Depender diretamente de um único SDK ou de bibliotecas legadas sem tolerância a falhas.

### A Solução Implementada
Foi implantada uma **Arquitetura de Provedor Desacoplada e Resiliente (Best of Both Worlds)**:
* **Gateway Local OmniRoute (Porta 20128):** Executado como um serviço persistente (`systemd --user`), provê um proxy reverso compatível com a API OpenAI, auto-fallback, orquestração de cotas e acesso a tokens gratuitos via OAuth da conta Google Antigravity.
* **Provedor Nativo Oficial (`google-genai`):** Canal direto e estrito para execução em nuvem ou ambientes sem OmniRoute local.
* **Contratos Estritos Pydantic v2:** Toda a saída de IA é validada contra esquemas de dados tipados, impedindo alucinações e garantindo integridade estrutural.

---

## 2. Topologia da Arquitetura

```
                          [ B3 Market Close (18:00 - 18:30) ]
                                          │
                                          ▼
                       [ data/latest.json (Snapshot Definitivo) ]
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    │                                           │
         [ 19:00 Cron Trigger ]                         [ Terminal / IDE ]
         (0 19 * * 1-5 Seg-Sex)                         (Kilo Code / CLI)
                    │                                           │
                    └─────────────────────┬─────────────────────┘
                                          ▼
                         [ src/ai/synthesizer.py ]
                    (Extração de Métricas & Regra LL-MKT-001)
                                          │
                                          ▼
                         [ BaseLLMProvider Interface ]
                                   /             \
                                  /               \
       (Provedor Primário Nuvem) /                 \ (Gateway Local 20128)
                                ▼                   ▼
                       [ GeminiProvider ]   [ OmniRouteProvider ]
                       (google-genai SDK)    (httpx localhost:20128)
                                │                   │
                                │           ┌───────┴───────┐
                                │           │  OAuth Google │
                                │           │  (Antigravity)│
                                │           └───────┬───────┘
                                ▼                   ▼
                        [ Google AI Studio / Gemini Models ]
                                          │
                                          ▼
                          [ Validação Pydantic v2 ]
                         (src/ai/schemas.MarketBriefing)
                                          │
                                          ▼
                    [ data/briefing_latest.json (Persistido) ]
```

---

## 3. Componentes do Módulo `src/ai/`

O módulo foi implementado em estrito respeito à **Regra de Isolamento e Higiene de Raiz**:

```
src/ai/
├── __init__.py           # Exportação canônica (MarketBriefing, MarketSynthesizer, etc.)
├── schemas.py            # Modelos Pydantic v2 com validação tipada
├── synthesizer.py        # Orquestrador da síntese e injeção de lições de mercado
├── cli.py                # Interface de linha de comando com suporte a providers e modelos
└── providers/
    ├── __init__.py       # Factory e registros de provedores
    ├── base.py           # Interface abstrata BaseLLMProvider
    ├── gemini.py         # Provedor via SDK oficial google-genai
    └── omniroute.py      # Provedor via Gateway local OmniRoute (OpenAI-compatible)
```

### 3.1. Contratos Pydantic v2 (`schemas.py`)
Garantem que a IA responda exatamente a estrutura esperada pelo pipeline financeiro:
* `TickerAssessment`: Código do ticker, preço spot, tendência, fase, Estocástico %K, veredito PhiCube, diagnóstico técnico e sugestão de hedge/opções.
* `MacroOverview`: Data da sessão, taxa CDI anualizada ($DU/252$), dias úteis restantes ($DU$), séries ativas de Call/Put, sentimento e alertas de cauda.
* `MarketBriefing`: Agregação consolidada com visão macro, destaques e recomendações acionáveis.

### 3.2. Governança e Regras de Mercado Integradas (`synthesizer.py`)
O sintetizador compacta o snapshot `data/latest.json` (reduzindo de ~50k tokens para ~2k tokens) e injeta diretrizes inegociáveis no prompt do sistema:
* **[LL-MKT-001] Disciplina Anti-Ruína em Ativos Esticados:** Quando ativos em tendência de ALTA encontram-se na fase `A_CAMINHO` com Estocástico %K acima de 80 e `gatilho_entrada: null`, a IA é **proibida** de sugerir compras a mercado no topo, sendo obrigada a orientar paciência até o pullback (suporte Fibonacci ou EMA13) ou estruturas de venda coberta e travas de baixa para captura de volatilidade.

---

## 4. Configuração e Governança do Gateway OmniRoute

O OmniRoute atua como proxy reverso local, absorvendo complexidades de autenticação, cotas e renovação de tokens.

### 4.1. Serviço Daemon no Linux (`systemd --user`)
* **Arquivo:** `~/.config/systemd/user/omniroute.service`
* **Porta:** `20128`
* **Resiliência:** `Restart=always`, inicializado automaticamente com o target do usuário no boot.
* **Comando:**
  ```bash
  systemctl --user status omniroute
  ```

### 4.2. Conexões de Autenticação Cadastradas
No banco de dados local `~/.omniroute/storage.sqlite`, duas conexões trabalham em redundância:
1. **Gemini (Google AI Studio) Primário:** Provedor de API Key direta.
2. **Antigravity (OAuth):** Vinculada à conta `durso16@gmail.com`, concedendo acesso gratuito contínuo com renovação automática de tokens pelo ecossistema Google Antigravity.

---

## 5. Matriz de Parametrização por Complexidade de Tarefa

Para evitar desperdício de cota ou latência desnecessária, adota-se a seguinte matriz de roteamento:

| Complexidade | Modelo Recomendado | Latência | Custo/Cota | Aplicação Prática |
| :--- | :--- | :--- | :--- | :--- |
| **Baixa / Rotina Batch** | `gemini-3.1-flash-lite` | ~1.5s – 3.0s | Gratuita (Cota Alta) | **Briefing diário do cron das 19h00** (`src/ai/cli.py`). Validação estruturada rápida sem filas. |
| **Média / Geração de Código** | `auto/best-coding`<br>`gemini-flash-latest` | ~2.5s – 5.0s | Gratuita | Refatoração de funções, testes unitários, escrita de scripts auxiliares na IDE. |
| **Alta / Raciocínio Profundo** | `antigravity/claude-sonnet-4-6`<br>`auto/best-reasoning` | ~8.0s – 20.0s | Gratuita (Pool OAuth) | Análise atuarial complexa, auditoria de anomalias na curva de volatilidade implícita, arquitetura. |

---

## 6. Automação Operacional (Crontab & Ciclo Diário)

Seguindo a lição de auditoria operacional **`[LL-OPS-003]`**, rotinas de mercado financeiro operam estritamente em **dias úteis (`1-5`, Segunda a Sexta)**:

```cron
# 1. Pipeline Intradiário de Coleta de Dados B3 (09:00 às 18:45 a cada 5 min)
*/5 9-18 * * 1-5 /home/jose-eduardo/projetos/b3-triple-screen-v2/scripts/cron_pipeline.sh

# 2. Resiliência pós-reboot do host
@reboot sleep 20 && /home/jose-eduardo/projetos/b3-triple-screen-v2/scripts/cron_pipeline.sh

# 3. Síntese Executiva de Inteligência Artificial pós-fechamento (19:00 em ponto)
0 19 * * 1-5 /home/jose-eduardo/projetos/b3-triple-screen-v2/.venv/bin/python /home/jose-eduardo/projetos/b3-triple-screen-v2/src/ai/cli.py --provider omniroute --output /home/jose-eduardo/projetos/b3-triple-screen-v2/data/briefing_latest.json >> /home/jose-eduardo/projetos/b3-triple-screen-v2/data/cron_ai.log 2>&1
```

### Por que às 19:00?
* O pregão regular da B3 encerra às 18:00 (ou 18:30 com after-market).
* Às 18:45, a última rodada do `cron_pipeline.sh` fecha e persiste o `data/latest.json` definitivo.
* Às 19:00, o OmniRoute sintetiza a sessão, grava o `briefing_latest.json` e deixa as diretrizes prontas para a abertura do dia seguinte.

---

## 7. Guia de Operação e Resolução de Problemas (Troubleshooting)

### Erro 401 Unauthorized
* **Causa:** Conexão do provedor no OmniRoute marcada como inativa após falha no teste periódico de saúde de modelos.
* **Solução:** No painel `http://localhost:20128/dashboard/providers/gemini`, certificar-se de que o modelo padrão selecionado seja ativo (ex: `gemini-3.1-flash-lite` ou `gemini-flash-latest`), e que a `Chave_antigravity` tenha acesso liberado aos modelos.

### Erro 404 Model Not Found
* **Causa:** O Google descontinuou modelos legados (ex: `gemini-2.5-flash`).
* **Solução:** Utilizar sempre a nomenclatura moderna (`gemini-3.1-flash-lite`, `gemini-3.5-flash` ou `gemini-flash-latest`).

### Erro 429 Too Many Requests / Quota Exceeded
* **Causa:** Modelos experimentais em fase de prévia (ex: `gemini-3.7-flash` ou `gemini-3.1-pro`) sofrendo exaustão de cota gratuita no Google AI Studio.
* **Solução:** Alternar a chamada para `gemini-3.1-flash-lite`, cuja cota do plano gratuito possui ampla capacidade de throughput.

---

## 8. Verificação e Testes de Software

O módulo foi entregue com cobertura completa de testes unitários em [`tests/unit/test_ai_synthesis.py`](file:///home/jose-eduardo/projetos/b3-triple-screen-v2/tests/unit/test_ai_synthesis.py).

* **Comando de Teste:**
  ```bash
  /home/jose-eduardo/projetos/b3-triple-screen-v2/.venv/bin/pytest tests/unit/test_ai_synthesis.py
  ```
* **Status:** **66/66 testes passando (100% de integridade com motor quantitativo/atuarial)**.
