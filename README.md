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

Para reconhecer outra pessoa como gestora, atribua a ela o cargo **Passtime • Gestão** criado pelo `!passtime`. O Angel confere o ID salvo desse cargo, portanto não é necessário cadastrar o ID individual da pessoa no código. Administradores, membros com **Gerenciar servidor** e os dois responsáveis fixos também continuam autorizados.

Comandos administrativos: `!apelido`, `!embed`, `!logs`, `!verificacao`, `!clear`, `!membersrole`, `!anuncio`, `!banca`, `!banca_apagar`, `!banca_arquivar`, `!banca_desarquivar`, `!cronograma`, `!lembrete`, `!atualizar_cronograma`, `!limpar_cronograma`, `!editar_horarios` e `!equipe`. O cronograma publicado possui um menu para membros verificados escolherem dia, atividade e horário, consultarem as próprias reservas e cancelarem horários. Cada alteração atualiza o mesmo painel automaticamente; o Angel envia um aviso duas horas antes e outro no horário, sempre pelo fuso de Brasília. Os editores administrativos continuam disponíveis. O `Message Content Intent` e o `Server Members Intent` precisam estar habilitados.

## Liderança - Alta

O módulo funciona somente no servidor `1542871650473746454`. Um administrador executa `!criarlideranca` para reconhecer os canais decorados que já existem, preservar suas artes e publicar os painéis Components V2. O comando pode ser repetido para corrigir permissões e atualizar os painéis sem duplicar a estrutura.

O botão de verificação cria uma solicitação privada. Um integrante de um dos quatro cargos administrativos configurados aprova ou recusa; somente a aprovação adiciona o cargo `1542876488729108480` e libera o restante do servidor. RPP, justificativa, sugestão, pedido de função para o bot, avaliação, relatório, upamento e destaque também usam formulários com análise administrativa e aviso no privado.

O cronograma começa com os horários informados e também possui botões administrativos para adicionar, remover e sincronizar atividades. Os horários do Passtime são espelhados automaticamente: qualquer reserva, cancelamento ou limpeza no servidor Passtime atualiza o painel da Liderança. Também é possível usar `!lideranca_cronograma dia HH:MM @Cargo atividade`; para remover, use `!lideranca_cronograma apagar dia HH:MM @Cargo`.

Os cargos oficiais de **Mov Chat**, **Passtime**, **Design**, **Recrutamento** e **Eventos** são reconhecidos pelo ID. O `!criarlideranca` cria ou sincroniza um canal privado de relatório para cada área. Outras áreas podem ser adicionadas depois com `!lideranca_area @Cargo Nome da Área`.

## Mov Chat da Alta

No servidor oficial da Alta (`1309533710156169337`), somente o cargo de Líder (`1514152283380781157`) administra o módulo. Use `!config_chat adicionar #canal` para monitorar um canal e `!config_chat remover #canal` para removê-lo. O Angel contabiliza as mensagens humanas, mas não concede pontos automaticamente; a Líder confere a meta e registra a pontuação de participação manualmente.

Membros comuns usam `!chat` ou `!mensagens` para consultar somente as próprias mensagens e pontuação; mencionar outra pessoa não libera a consulta. Apenas a Líder pode usar `!config_chat`, `!dar_pontos`, `!remover_pontos`, `!resetar_chat`, `!resetar_rank` e `!limpeza_chat`. Os dois comandos de reset são aliases seguros da mesma ação: após confirmação, encerram mensagens e pontos juntos, preservam o histórico e iniciam um novo ciclo.

Todo sábado às `16:00`, no horário de Brasília, o Angel publica o relatório completo no canal `1554586776939794532` do servidor de Liderança (`1542871650473746454`). O relatório contém as mensagens e a pontuação manual de cada membro. Mensagens e pontos só são reiniciados depois que o Discord confirma o envio de todas as páginas; se a entrega falhar, o ciclo permanece intacto e o Angel tenta novamente.

Depois da confirmação do relatório, uma limpeza incremental começa nos canais monitorados. O Angel remove somente mensagens anteriores ao fechamento, da mais antiga para a mais nova, no ritmo de uma mensagem a cada dois segundos. Mensagens fixadas e mensagens do novo ciclo são preservadas; o progresso fica salvo para continuar após reinícios. A gestão consulta com `!limpeza_chat`, pausa com `!limpeza_chat pausar` e continua com `!limpeza_chat retomar`.

## Recrutamento da Alta

Após a família anterior, `/rec` pergunta se o recrutado tem interesse na staff. “Não” publica a ficha; “Sim” permite escolher várias áreas (Mov Chat, Passtime, Design, Recrutamento e Eventos). O interesse é salvo na ficha e no espelho da Liderança, sem conceder cargos de staff. Fichas antigas exibem “Não informado”.

Ao iniciar, o Angel cadastra ou reutiliza seis emojis `alta_rec_chrome_*` no servidor de Liderança `1542871650473746454`. Precisa de permissão para criar expressões e de seis vagas disponíveis; na Alta precisa de Usar emojis externos. Os PNGs transparentes ficam em `public/rec-emojis`; para regenerar use `node scripts/generate-rec-emojis.mjs`. Se o cadastro falhar, o log informa o motivo e as fichas usam símbolos simples até a próxima inicialização.

O Angel registra `/rec` somente no servidor oficial da Alta. Membros com o cargo de Recrutamento `1417338258815193219` usam `/rec recrutado:@membro` no canal `1514841820947939508`, selecionam **Born**, **Featured** ou **Purple** e informam se o recrutado veio de **Turquia**, **Nyx**, **Elite** ou **Dragons**. A ficha Components V2 com avatar é publicada em `1514841659194736650` aguardando validação; o cargo inicial só é aplicado depois da aprovação.

Somente os usuários `446428192220119041`, `1251718254729232516` e `1002774556269891694` podem usar os botões **Validar recrutamento** e **Recusar recrutamento**, além do `/resetrec`. O `/relatoriorec` mostra apenas recrutamentos aprovados no ciclo atual e aceita o parâmetro opcional `membro`; `/resetrec confirmar:Sim` inicia um novo ciclo sem apagar o histórico nem remover cargos. O aviso V2 do módulo é criado ou atualizado automaticamente em `1516279462931595385`.

Quando o módulo da Liderança já foi criado, somente fichas aprovadas são espelhadas automaticamente no relatório privado da área de Recrutamento. O cargo do Angel precisa ficar acima dos três cargos iniciais.

## Spotify — Tocando agora

No servidor oficial da Alta, cada membro pode usar `alta!ouvindo` para publicar uma V2 com a música exibida em sua presença do Spotify: capa, faixa, artistas, álbum, progresso e botão direto para ouvir. O recurso usa o emoji animado `<a:spotify:1554212340277186680>` da própria Alta.

O modo recomendado usa Spotify OAuth e não depende da presença do Discord. Crie um aplicativo no Spotify Developer Dashboard, cadastre uma URL pública HTTPS terminada em `/spotify/callback` e configure `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` e `SPOTIFY_REDIRECT_URI` no `.env`. Ao primeiro `alta!ouvindo`, cada membro recebe o botão **Conectar Spotify** e autoriza somente o escopo `user-read-currently-playing`. Tokens são criptografados no banco e renovados automaticamente.

Se o OAuth não estiver configurado, o Angel mantém como fallback a presença do Discord quando `DARK_SPOTIFY_PRESENCE_ENABLED=true` e o **Presence Intent** estiver habilitado no Developer Portal.

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
