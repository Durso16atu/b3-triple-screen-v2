---
name: git-hygiene
description: "Padrões de versionamento, commits e governança"
---

# Padrão de Higiene Git

Este projeto implementa tolerância zero para commits com formatação fora do padrão.

## Conventional Commits
As mensagens de commit DEVEM seguir a convenção `tipo(escopo opcional): descrição`:

Tipos permitidos:
- `feat`: Uma nova funcionalidade
- `fix`: Correção de um bug
- `docs`: Apenas mudanças na documentação
- `style`: Mudanças que não alteram o significado do código (espaço, formatação, etc.)
- `refactor`: Uma mudança de código que nem corrige um bug nem adiciona uma funcionalidade
- `perf`: Mudança focada em performance
- `test`: Adicionar testes ausentes ou corrigir testes existentes
- `chore`: Mudanças no processo de build, dependências ou ferramentas
- `ci`: Alterações nos arquivos de configuração de CI

## Higiene de Diretório
É ESTRITAMENTE PROIBIDO:
- Commitar arquivos temporários, logs ou dumps gerados (.json de teste, .csv, cache).
- Salvar e manter scripts soltos de execução (.py, .sh) na raiz do projeto. Qualquer utilitário deve estar contido em pastas dedicadas com propósito claro.
- Violar o `.gitignore`.
