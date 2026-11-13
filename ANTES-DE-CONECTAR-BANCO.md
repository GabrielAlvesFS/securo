# ⚠️ Ler antes de conectar Pluggy / Enable Banking / SimpleFIN

> Nota para o meu eu do futuro. Hoje (2026-09-10) a instância roda sem nenhuma
> credencial bancária, e por isso vários riscos estão inertes. Eles **acordam**
> no momento em que eu preencher as credenciais na `.env`.
>
> Contexto completo: [`SECURITY-AUDIT.md`](./SECURITY-AUDIT.md) — este arquivo é
> só o subconjunto que muda de estado quando um banco é conectado.

---

## 1. O problema principal: o compose de dev expõe a `.env` ao container do frontend

**`docker-compose.yml:145`**

```yaml
volumes:
  - ./frontend:/app
  - ./:/workspace:ro      # ← o repositório INTEIRO, incluindo .env e secrets/
```

O propósito é legítimo (resolver a versão do app via `git rev-parse`), mas o mount
é a raiz do projeto. Enquanto a `.env` só tem `SECRET_KEY` e `AGENTS_MCP_JWT_SECRET`,
o incômodo é teórico.

**No instante em que eu adicionar `PLUGGY_CLIENT_SECRET`** (ou o PEM do Enable
Banking em `./secrets/`), essas credenciais passam a ser legíveis pelo container
Node/Vite — que é justamente quem executa a maior árvore de dependências de
terceiros do projeto (922 pacotes npm).

### Escolher uma das saídas antes de preencher a credencial

- [ ] **Opção A — migrar para o compose de produção**
      `docker compose -f docker-compose.prod.yml up -d`
      Não tem o mount, e `DEBUG=false`.
      ⚠️ **Contrapartida:** o prod puxa `ghcr.io/securo-finance/securo-backend:latest`,
      uma imagem pré-construída que **não passou pela auditoria** (auditei o código-fonte,
      não o binário publicado), num tag mutável.

- [ ] **Opção B — prod compose, mas construindo local** (melhor dos dois mundos)
      Trocar no `docker-compose.prod.yml`:
      ```yaml
      # image: ghcr.io/securo-finance/securo-backend:latest
      build: ./backend
      ```
      Sem mount, sem DEBUG, e rodando o código que eu li.

- [ ] **Opção C — continuar no dev, mas estreitar o mount**
      Substituir `- ./:/workspace:ro` por apenas o que o `build/version.ts` precisa:
      ```yaml
      - ./.git:/workspace/.git:ro
      - ./package.json:/workspace/package.json:ro
      ```
      (validar que `APP_VERSION_ROOT=/workspace` ainda resolve a versão)

---

## 2. O que mais "acorda" com cada integração

| Ao ativar | Passa a acontecer | Referência |
|---|---|---|
| **Qualquer banco** | Sync horário automático (`app/worker.py:22-25`) e sync disparado no startup (`app/main.py:95`) | — |
| **SimpleFIN** | Domínio de cada instituição vai para `google.com/s2/favicons` — o Google passa a saber quais são os meus bancos | AUDIT §2.1 |
| **Pluggy** | **Não** usa o favicon do Google — logo real vem do `cdn.pluggy.ai` (`pluggy.py:68-71`). Nada novo vaza. | AUDIT §2.1 |
| **Enable Banking** | Exige o PEM em `./secrets/enable_banking_private.pem` — chave privada em disco, e exposta pelo mount do item 1 | AUDIT §2.4 |
| **Ativos de bolsa** | Tickers vão diariamente para a Yahoo (`yfinance`) **e** domínios das empresas para o Google | AUDIT §2.1 e §2.3 |

---

## 3. Checklist do dia em que eu for conectar

- [ ] Escolhi A, B ou C do item 1 **antes** de colar a credencial na `.env`
- [ ] Confirmei que `.env` continua ignorada: `git check-ignore -v .env`
- [ ] Se for Enable Banking: `chmod 600 secrets/*.pem`
- [ ] Se for SimpleFIN e me incomodar o vazamento de domínios: neutralizar
      `favicon_url_for` em `backend/app/providers/favicon.py:31-37` (retornar `None`)
      — o frontend já cai no ícone genérico (`account-icon.tsx:69`, `assets.tsx:83`).
      ⚠️ Quebra 4 asserts em `backend/tests/test_providers_simplefin.py`
      (linhas 548, 551, 599, 603) — trocar para `is None`.
- [ ] Fiz backup do Postgres **depois** de ter a `SECRET_KEY` definitiva
      (girar a `SECRET_KEY` torna ilegível tudo que foi cifrado com a anterior —
      `app/agents/services/crypto.py:1-7`)
- [ ] Continuo sem expor a porta 8000/3000 para fora do localhost sem HTTPS

---

## 4. Se um dia eu ligar o módulo AI Agents

Hoje `AGENTS_ENABLED=false` e o módulo nem é importado (`app/main.py:205`). Ao ligar:

- [ ] Manter `AGENTS_MCP_EXTERNAL_HOST_PORT` no default `127.0.0.1:8765` — **nunca** `0.0.0.0`
- [ ] Não emitir token MCP externo sem antes reler a **AUDIT §1.2**: tokens externos
      escrevem nos meus dados com `apply=true`, e a única barreira é uma instrução
      em linguagem natural dentro do prompt. Vetor de prompt injection via
      descrição de transação vinda do banco.

---

## 5. Verificar adulteração do upstream a qualquer momento

O fork está byte-idêntico ao upstream. Para reconferir depois de um `git pull`:

```bash
git fetch upstream && git diff upstream/main...HEAD   # vazio = idêntico
```
