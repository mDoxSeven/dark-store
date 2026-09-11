# dark store

Aplicação Discord e painel privado independentes do empty.

- aplicação: `1547707174254280794`;
- servidor exclusivo: `1547613908016038032`;
- responsável: `1002774556269891694`;
- painel: `127.0.0.1:3010`, acessível remotamente somente por túnel SSH.

## Recursos

- `/criar` idempotente para categorias, canais, duas calls e cargo de quarentena;
- catálogo e estoque criptografado em SQLite próprio;
- pedidos com aprovação manual e entrega privada em arquivo;
- editor completo de Components V2 com Markdown, galeria, thumbnail, divisores e anexos;
- botões V2 de link ou cargo, com adicionar, remover ou alternar;
- anti-raid para rajadas de entrada, contas novas e ações destrutivas no Audit Log;
- quarentena, expulsão ou banimento configuráveis;
- dono e o próprio bot protegidos das respostas automáticas;
- simulador anti-raid local para validar os limites sem punir membros.

## Configurar o Discord

No Discord Developer Portal, habilite `Guild Install`, os escopos `bot` e `applications.commands`, e o `Server Members Intent`. Na primeira instalação use `Administrator`; depois que a estrutura estiver pronta, reduza as permissões com cuidado.

O bot valida no início se o token pertence à aplicação esperada, se o dono está no servidor e se possui as permissões necessárias. O comando é registrado somente no servidor configurado.

## Configurar a VPS

```bash
cd /root
git clone https://github.com/mDoxSeven/dark-store.git
cd /root/dark-store

cp .env.example .env
nano .env
chmod 600 .env
```

Preencha `DARK_DISCORD_TOKEN` no `.env` diretamente na VPS. Nunca publique esse arquivo.

```bash
npm ci --no-audit --no-fund
npm run setup
npm run admin:create
NODE_OPTIONS=--max-old-space-size=384 npm run build
pm2 start ecosystem.config.cjs --only dark-store
pm2 save
```

Guarde a senha impressa por `admin:create`; ela não será exibida novamente.

Confira:

```bash
pm2 status
pm2 logs dark-store --lines 80 --nostream
curl http://127.0.0.1:3010/api/health
```

Resultado esperado:

```json
{"status":"ok","database":"connected","discord":"connected"}
```

No Discord, execute `/criar` primeiro sem confirmação para ver a prévia e depois com `confirmar: Sim`. O comando não remove canais existentes e mantém os IDs criados no banco.

## Acessar o painel

No computador do administrador:

```powershell
ssh -L 3010:127.0.0.1:3010 root@143.198.127.172
```

Abra `http://127.0.0.1:3010`. Não exponha a porta `3010` diretamente à internet.

## Anti-raid

O `/criar` gera o cargo `Quarentena`, aplica bloqueios aos canais gerenciados e salva seu ID. A proteção nasce desativada: revise no painel o canal de logs, limites, lista confiável e resposta antes de ativar.

O bot observa entradas e eventos destrutivos de canal, cargo, banimento e webhook. Ações do dono, do proprietário do servidor e do próprio bot são ignoradas. O cargo do bot precisa permanecer acima dos cargos que ele gerencia.

## Dados privados

- `data/store.db`: produtos, pedidos, painéis e configurações;
- `data/stock.key`: chave do estoque;
- `data/admin.json`: credencial do painel;
- `data/assets`: imagens anexadas pelo editor.

Todos são ignorados pelo Git. Para recuperar o estoque é necessário guardar juntos o banco e `stock.key` em backup privado.

## Desenvolvimento local

Sem token, deixe `DARK_REQUIRE_DISCORD=false` e execute:

```powershell
npm install
npm run setup
npm run admin:create
npm run dev
```

## Verificar

```powershell
npm run setup
npm run build
node --check public/app.js
npm test
```
