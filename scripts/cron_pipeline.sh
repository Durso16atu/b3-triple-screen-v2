#!/usr/bin/env bash
# ==============================================================================
# B3 Triple Screen v2.0 - Atualizador Autônomo Local Intradiário
# ==============================================================================
set -euo pipefail

REPO_DIR="/home/jose-eduardo/projetos/b3-triple-screen-v2"
LOCK_FILE="/tmp/b3_pipeline_cron.lock"

# Evita execuções concorrentes usando flock
exec 200>"$LOCK_FILE"
flock -n 200 || {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Outra execução do pipeline já está em andamento. Abortando."
  exit 0
}

cd "$REPO_DIR"

# 1. Verifica dia da semana (1 = Segunda, 5 = Sexta)
DOW=$(date +%u)
if [ "$DOW" -gt 5 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fim de semana (DOW=$DOW). Pregão fechado."
  exit 0
fi

# 2. Verifica horário de pregão B3 (09:00 às 18:45 BRT)
HM=$(date +%H%M)
if [ "$((10#$HM))" -lt 900 ] || [ "$((10#$HM))" -gt 1845 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fora do horário de monitoramento B3 (09:00 - 18:45). Hora atual: $HM."
  exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando atualização autônoma intradiária B3..."

# 3. Sincroniza branch local antes da execução
git checkout -- data/latest.json 2>/dev/null || true
git pull --rebase --autostash origin main || true

# 4. Executa pipeline e testes de validação atuarial
"$REPO_DIR/.venv/bin/python" src/pipeline.py
"$REPO_DIR/.venv/bin/python" -m unittest tests/test_schema_and_pipeline.py

# 5. Se houver alterações em data/latest.json, commita e faz push
git add data/latest.json
if git diff --staged --quiet; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Nenhuma alteração de dados detectada."
else
  git commit -m "chore(data): atualizar latest.json intradiario (auto local)"
  git pull --rebase --autostash -X theirs origin main
  git push origin main
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Dados atualizados e enviados com sucesso para o GitHub Pages!"
fi
