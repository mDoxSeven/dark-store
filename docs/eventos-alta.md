# Eventos Alta — Angel

Servidor: `1443601058311176304`. Módulo isolado das demais áreas.

## Instalação

[Adicionar Angel em Eventos](https://discord.com/oauth2/authorize?client_id=1547707174254280794&permissions=327760055312&scope=bot%20applications.commands&guild_id=1443601058311176304&disable_guild_select=true)

Este link usa o application ID padrão deste projeto. Se `DARK_APPLICATION_ID` estiver sobrescrito no VPS, use o ID configurado no lugar. Não pede Administrador. Coloque o cargo do Angel acima de verificado/não verificado, permita anexos e emojis e confira que o intent Server Members está habilitado na aplicação.

Atualize o código no VPS e execute `npm ci`, `npm run setup`, `npm run build`, `sudo systemctl restart dark-store`. As tabelas novas são aditivas; não há reset de dados. Os painéis e emojis serão publicados no primeiro início com acesso ao servidor, ou ao adicionar o bot enquanto estiver conectado. `!eventos publicar` atualiza os painéis sem apagar mensagens de terceiros.

## Canais

| Painel | Canal |
|---|---|
| Verificação | 1443605183392120923 |
| Regras | 1443601654829289686 |
| Guia | 1443601757644259369 |
| Funções | 1443602084279881920 |
| Bancas | 1443603227525255260 |
| Pontos | 1443602732308107457 |
| Cronograma | 1443601963198582915 |
| Aulinha | 1555280334004687018 |
| Justificativas | 1555280070900326531 |
| Roteiro | 1555280646677594142 |
| Relatórios — Eventos | 1444032550413533295 |
| Relatórios — Liderança | 1542886994441408603 |

Cria dois canais privados: verificadores (cargo 1555273338941743205) e análise de gestão. Administradores do Discord mantêm acesso por permissão nativa. Não altera permissões dos canais existentes nem limpa histórico.

## Permissões e fluxos

- Entrada: humanos recebem `1555273066706112552`, exceto quem já tem verificado.
- Verificação: pedido persistido; somente `1555273338941743205` aprova/recusa. Aprovar adiciona `1555273152848863364` e remove não verificado. Gestão não substitui o cargo de verificador.
- Gestão: Posse `1443603327337369651`, Líder Geral `928355723329564692`, Líder `1443603328008454304`, Sub-Líder `1505968563712692257`. Os comandos de gestão exigem um desses cargos, inclusive para o proprietário. Configuração estrutural exige Administrador.
- Bancas e funções: tópicos públicos para os membros que enxergam o canal pai; não são tickets privados. Uma banca por membro, um tópico por função/membro. Encerrar arquiva e bloqueia, preservando histórico.
- Aulinha: formulário com tema, data, duração, detalhes; gestão aprova antes de inserir no cronograma. Pedido com data vencida precisa ser recusado e refeito.
- Justificativa: formulário privado encaminhado somente à gestão, sem exigir exposição de informações sensíveis.
- Presença: botão/seletor no card do evento, disponível durante início/fim informados; uma presença por pessoa/evento; validação da gestão antes dos pontos. Não rastreia automaticamente permanência em voz.
- Pontos: valores por função congelados no agendamento; nunca mudam retroativamente. Sem reset automático.
- Cronograma: atividades aprovadas aparecem em Eventos; a Liderança recebe a projeção dos próximos sete dias, com data explícita. Sincronização a cada minuto. Requer o cronograma da Liderança previamente configurado.
- Relatórios: botão abre período, atividades realizadas, resultados e pendências; área fixa Eventos. Inclui presenças validadas registradas no período. Publica no canal local e no de Liderança. O comando textual emite o acumulado. Envio manual, sem periodicidade nova presumida.

## Configuração pendente: funções e pontuação

Os nomes e valores ainda não foram fornecidos. O painel de funções mostra essa pendência e bloqueia agendamento de eventos com presença até existir uma função cadastrada. Aulinhas não dependem dessa configuração.

A gestão cadastra cada função e um administrador republica os painéis (substitua os placeholders por valores reais; não copie os sinais `< >`):

```text
!eventos funcao <chave>|<Nome da função>|<pontos>
!eventos publicar
```

Máximo 25 funções. Chave sem espaços/acentos, valor inteiro entre 0 e 10000. Repetir a chave atualiza o valor para novos eventos. Outros comandos:

```text
!eventos ajuda
!eventos canal <nome> <ID>
!eventos gestao <ID_DO_CARGO> [OUTRO_ID]
!eventos agendar <Título>|<AAAA-MM-DD HH:MM>|<minutos>
!eventos cancelar <ID_DA_ATIVIDADE>
!eventos relatorio
```

Datas de entrada em Brasília. Cancelamento retira a atividade do cronograma e fecha novas presenças; não apaga participações anteriores. O agendamento, cancelamento e relatório são restritos à gestão.

## Operação e limites

Pedidos e pontos sobrevivem a reinícios. Solicitações sem mensagem são reenviadas pelo reconciliador. IDs únicos e locks locais evitam duplicação em cliques concorrentes no processo único do serviço. Não execute duas instâncias simultâneas deste módulo. Como Discord e SQLite não compartilham transação, uma queda entre o envio remoto e a gravação do ID pode exigir reconciliação manual. Relatórios enviados parcialmente devem ser conferidos antes de reenviar.

Se um cargo ou canal não existir ou estiver fora do alcance do Angel, o bot registra a falha; não amplia permissões automaticamente. Confira `journalctl -u dark-store -n 100 --no-pager`.

Validação local: TypeScript e testes automatizados. Publicação e aparência no Discord dependem de implantar e conferir no servidor; não foram testadas com credenciais reais neste ambiente.

Referências técnicas: [Componentes V2](https://docs.discord.com/developers/components/reference) e [permissões de tópicos](https://docs.discord.com/developers/topics/threads).

## Artes

Originais preservados em `public/events/`. Banco: `public/events/banca.png`. Emoji: `public/events/emoji-miku.png`, normalizado para 128×128 com alfa. Ambos criados com a ferramenta integrada de geração de imagens, não pela API/CLI. O banner é uma variante visual baseada na referência, não uma promessa de identidade pixel a pixel.

Prompt final do banner:

> Use case: text-localization. Edit target: provided banner. Produce a matching companion banner for the Eventos Alta Discord idea-bank panel. Keep the exact wide 1080:380 composition, Hatsune Miku with turquoise twin tails and megaphone at left, pose, drawing style, blue violet lavender gradient background and pink/teal halftone patterns. Change ONLY the large right-side heading to the exact Portuguese text in two lines: 'CRIE SUA' then 'BANCA'. Keep same chunky condensed angular white uppercase lettering with turquoise offset shadow and generous margins. No additional text, no new objects, no watermarks. This is the supplied banner's matching 'Crie sua banca' variant.

Prompt final do emoji:

> Use case: stylized-concept. Asset type: custom Discord emoji for Eventos Alta. A single adorable chibi Hatsune Miku head with short visible turquoise twin tails, black headphones with magenta accents, cheerful smile and bright teal eyes. Glossy polished anime sticker style, bold clean outlines readable at 32px, subtle cyan and lavender highlights matching a turquoise-purple Discord theme. Head only, large centered icon filling square canvas with safe margins. Real transparent background, no text, no border box, no extra objects, no watermark.
