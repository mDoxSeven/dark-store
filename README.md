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
- canal `nitro-link` com arte cromada, impulsos entre diamantes e catálogo V2 próprio;
- entrada protegida por um canal de verificação V2 com arte própria e botão cinza;
- ticket privado com confirmação, recusa com exclusão automática e botão para notificar o atendimento;
- encerramento administrativo de tickets concluídos, com liberação do canal de avaliações e convite V2 no privado;
- editor completo de Components V2 com Markdown, galeria, thumbnail, divisores e anexos;
- botões V2 de link ou cargo, com adicionar, remover ou alternar;
- anti-raid para rajadas de entrada, contas novas e ações destrutivas no Audit Log;
- quarentena, expulsão ou banimento configuráveis;
- dono e o próprio bot protegidos das respostas automáticas;
- simulador anti-raid local para validar os limites sem punir membros.
- central de suporte isolada para o servidor Vortex, criada por `!criarsuporte`;
- módulo independente de bancas, cronograma e gestão para o servidor Passtime.

## Configurar o Discord

No Discord Developer Portal, habilite `Guild Install`, os escopos `bot` e `applications.commands`, o `Server Members Intent` e o `Message Content Intent` (necessário para `!criarsuporte`). Na primeira instalação use `Administrator`; depois que a estrutura estiver pronta, reduza as permissões com cuidado.

O bot valida no início se o token pertence à aplicação esperada, se o dono está no servidor e se possui as permissões necessárias. O comando é registrado somente no servidor configurado.

## Suporte Vortex

Com o mesmo bot instalado no servidor `1551447870358560930`, um administrador executa `!criarsuporte`. O comando funciona somente nesse servidor e pode ser repetido: ele reutiliza os IDs salvos, corrige permissões e não duplica a estrutura válida.

Ele cria as categorias `SUPORTE • VORTEX` e `TICKETS • VORTEX`, os canais `abrir-ticket` e `fila-suporte`, o cargo `Suporte` quando necessário e publica o painel Components V2 com a arte pública da Vortex. Atribua o cargo criado apenas à equipe autorizada.

O painel oferece **Dúvidas**, **Denúncia** e **Parceria**. Cada escolha cria um canal privado, menciona o autor no ticket e comunica o cargo de suporte na fila interna. A equipe pode assumir o atendimento e notificar o membro no privado. Depois de assumido, somente o atendente responsável — ou um administrador — pode fechar. O encerramento avisa o membro, mantém o registro no banco e exclui o canal automaticamente.

## Passtime

O módulo funciona somente no servidor `1506789977927712808`. Os usuários `1002774556269891694` e `1516915772192985088`, ou o dono do servidor, podem executar `!passtime` para criar ou sincronizar a estrutura. O comando é idempotente: reconhece os canais decorados que já existem, preserva seus nomes e símbolos, reaproveita as artes publicadas em `solicitar-banca`, `identificação`, `pontuação` e `equipe` e usa os emojis personalizados encontrados no próprio servidor.

O painel de banca abre um formulário para emoji e nome, cria um canal privado para o membro e libera acesso aos cargos **Minion • Corretor**, **Minion • Decorador** e **Passtime • Gestão**. As bancas podem ser arquivadas, desarquivadas ou apagadas pela gestão.

Comandos administrativos: `!apelido`, `!embed`, `!logs`, `!verificacao`, `!clear`, `!membersrole`, `!anuncio`, `!banca`, `!banca_apagar`, `!banca_arquivar`, `!banca_desarquivar`, `!cronograma`, `!lembrete`, `!atualizar_cronograma`, `!limpar_cronograma`, `!editar_horarios` e `!equipe`. Os lembretes usam o horário de Brasília e os editores abrem formulários privados. O `Message Content Intent` e o `Server Members Intent` precisam estar habilitados.

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

O `/criar` também adiciona o canal `nitro-link`. Produtos ativos com a categoria exatamente `nitro` entram no seletor V2 desse canal e utilizam o mesmo fluxo privado de ticket, Pix e estoque individual. Cadastre somente links, códigos ou benefícios digitais que você esteja autorizado a distribuir.

## Verificação de entrada

O `/criar` valida os cargos `1547683703227154542` (entrada pendente) e `1548020246537830520` (membro verificado), cria o canal `verificacao`, aplica as permissões da estrutura e publica o painel V2. Novos membros recebem automaticamente o cargo de entrada e enxergam apenas a verificação. Ao clicar em **Verificar**, o bot adiciona o cargo verificado, remove o cargo inicial e libera os canais públicos. Os dois cargos precisam existir e ficar abaixo do cargo do bot.

Na primeira verificação, o bot também publica automaticamente no canal `boas-vindas` um Components V2 com a menção, o avatar e a posição do novo membro. Cliques repetidos não duplicam o anúncio.

O botão cinza **Encerrar pedido** fica nos tickets e somente administradores podem usá-lo. Ele exige que o pedido esteja entregue, adiciona o cargo `1548068549434544159`, agenda o fechamento do ticket e envia ao comprador um V2 privado convidando para uma avaliação `10/10` no canal `1547806201604219015`. Pedidos recusados, pendentes ou cancelados não recebem o cargo. O `/criar` valida o cargo e restringe o canal de avaliações aos membros que já concluíram uma compra.

## Estoque automático e manual

O estoque automático recebe um código autorizado por bloco e envia uma unidade no privado após a aprovação. O estoque manual recebe apenas uma quantidade numérica: ao confirmar o pagamento, uma unidade é baixada e o pedido fica como **entrega manual pendente**. Depois de entregar pelo ticket, use **marcar entrega concluída** no painel. Quando os dois tipos existem no mesmo produto, o estoque automático é consumido primeiro.

## Pagamento Pix

No painel, abra `configurações`, informe a chave Pix, o nome do recebedor exatamente como registrado no DICT e a cidade, depois ative o Pix. Cada novo pedido passa a guardar seu próprio BR Code com valor e identificador da compra. O cliente recebe o código copia e cola e o QR Code na resposta privada do botão de compra.

O QR não confirma recebimento automaticamente. Antes de aprovar e entregar um item, confira o pagamento na instituição financeira e compare valor e identificador do pedido. Pedidos antigos preservam o código gerado mesmo se a configuração Pix mudar.

Depois de confirmar a compra, o cliente pode usar **Cancelar pedido** enquanto o pagamento ainda está pendente. O bot pede a confirmação **Ainda não paguei · cancelar**, cancela pedido e atendimento juntos e agenda a remoção do canal, mantendo o histórico no painel. Pedidos aprovados, reservados ou em entrega não podem ser cancelados pelo cliente. Se já houve Pix, o cliente deve chamar o administrador: cancelar no bot não estorna dinheiro nem invalida um código já copiado.

O `/criar confirmar: Sim` cria o cargo **!**, sem conceder Administrador e sem atribuí-lo a nenhum membro. Entregue esse cargo manualmente somente à equipe autorizada: ele permite acessar os tickets e usar o botão cinza **Cancelar venda · equipe**. A autorização é conferida pelo ID do cargo registrado, não apenas pelo nome ou pela permissão genérica de Administrador; o dono da loja também pode cancelar. A venda precisa continuar pendente, sem pagamento aprovado nem estoque reservado. O bot pede confirmação, mantém o pedido no painel com o ID de quem cancelou e fecha o atendimento. Cancelamentos não liberam avaliação e não fazem estorno.

Ao aprovar o pagamento no painel, o bot publica um V2 **Pagamento confirmado pela equipe** no ticket. Para estoque automático, a entrega também confirma o pagamento no privado; para estoque manual, o aviso orienta o cliente a aguardar a equipe no ticket. Esse aviso depende da aprovação administrativa, não de confirmação bancária automática.

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
