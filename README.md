# dark store

Aplicação Discord e painel privado independentes do empty.

- aplicação: `1547707174254280794`;
- servidor exclusivo: `1547613908016038032`;
- responsável: `1002774556269891694`;
- painel: `127.0.0.1:3010`, acessível remotamente somente por túnel SSH.

## Recursos

- `/criar` idempotente para categorias, canais, duas calls e cargo de quarentena;
- catálogo e estoque criptografado em SQLite próprio;
- estoque numérico para itens entregues manualmente no ticket;
- pedidos com aprovação manual e entrega privada em arquivo;
- cobrança Pix estática por pedido, com valor exato, txid, copia e cola e QR Code privado;
- canal `spotify` com catálogo V2 automático para itens digitais autorizados cadastrados nessa categoria;
- canal `discord` com a arte cromada aprovada e catálogo V2 próprio;
- entrada protegida por um canal de verificação V2 com arte própria e botão cinza;
- ticket privado com confirmação, recusa com exclusão automática e botão para notificar o atendimento;
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

## Catálogo Spotify

O `/criar` adiciona o canal `spotify` e a categoria privada de atendimentos. No painel, cadastre um produto ativo com a categoria exatamente `spotify` e adicione estoque; o seletor V2 do canal é atualizado automaticamente. Ao escolher um item, o cliente recebe um ticket privado para confirmar ou recusar. A recusa agenda a exclusão do canal; a confirmação gera o Pix e libera a visualização privada do QR Code.

Em `configurações`, escolha os cargos de atendimento usados por **Notificar administrador**. Os cargos `1548020621760274492` e `1548020929962180658` são carregados como padrão. Se nenhum cargo válido existir, o botão notifica o responsável da loja. Use o catálogo somente para códigos, gift cards, assinaturas e outros itens que você esteja autorizado a comercializar; o sistema não deve ser usado para transferir contas ou credenciais de terceiros.

O mesmo fluxo existe no canal `discord`: cadastre produtos ativos com a categoria exatamente `discord`. Cada produto mantém seu próprio estoque automático e sua própria quantidade manual, sem misturar as unidades de produtos diferentes.

## Verificação de entrada

O `/criar` valida os cargos `1547683703227154542` (entrada pendente) e `1548020246537830520` (membro verificado), cria o canal `verificacao`, aplica as permissões da estrutura e publica o painel V2. Novos membros recebem automaticamente o cargo de entrada e enxergam apenas a verificação. Ao clicar em **Verificar**, o bot adiciona o cargo verificado, remove o cargo inicial e libera os canais públicos. Os dois cargos precisam existir e ficar abaixo do cargo do bot.

Na primeira verificação, o bot também publica automaticamente no canal `boas-vindas` um Components V2 com a menção, o avatar e a posição do novo membro. Cliques repetidos não duplicam o anúncio.

## Estoque automático e manual

O estoque automático recebe um código autorizado por bloco e envia uma unidade no privado após a aprovação. O estoque manual recebe apenas uma quantidade numérica: ao confirmar o pagamento, uma unidade é baixada e o pedido fica como **entrega manual pendente**. Depois de entregar pelo ticket, use **marcar entrega concluída** no painel. Quando os dois tipos existem no mesmo produto, o estoque automático é consumido primeiro.

## Pagamento Pix

No painel, abra `configurações`, informe a chave Pix, o nome do recebedor exatamente como registrado no DICT e a cidade, depois ative o Pix. Cada novo pedido passa a guardar seu próprio BR Code com valor e identificador da compra. O cliente recebe o código copia e cola e o QR Code na resposta privada do botão de compra.

O QR não confirma recebimento automaticamente. Antes de aprovar e entregar um item, confira o pagamento na instituição financeira e compare valor e identificador do pedido. Pedidos antigos preservam o código gerado mesmo se a configuração Pix mudar.

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
