# dark store — laboratório independente

Projeto separado do empty. Aplicação prevista `1547707174254280794`, servidor previsto `1547613908016038032`. Esta entrega funciona **somente localmente**: não lê token, não abre Gateway, não registra comandos e não chama a API do Discord.

Inclui:

- painel próprio com identidade cromada `dark`;
- login local por senha, sem OAuth;
- simulação idempotente de `/criar`, com categorias, canais e duas calls fictícias;
- editor completo de Components V2, separado do editor de produtos;
- título, Markdown, cor, rodapé, galeria, thumbnail, divisores e espaçamento;
- anexos PNG, JPEG, WEBP ou GIF de até 7 MB, validados pela assinatura real do arquivo;
- até cinco botões de link ou cargo, com cor e ações adicionar, remover e alternar;
- laboratório anti-raid configurável para rajada de entradas, idade mínima e ações destrutivas;
- lista de usuários confiáveis, resposta simulada e histórico de incidentes;
- editor de produtos e prévia de Components V2;
- estoque AES-256-GCM em banco próprio;
- pedidos, confirmação, falha de DM e entrega simulados;
- testes ponta a ponta sem tráfego para o Discord.

## Iniciar localmente

```powershell
npm install
npm run setup
npm run admin:create
npm run dev
```

Abra `http://127.0.0.1:3010` e use a senha impressa uma única vez por `admin:create`. O servidor recusa conexões fora do loopback. Para acessar de outra máquina no futuro, use um túnel SSH até `127.0.0.1`; não altere para `0.0.0.0` sem HTTPS, proxy confiável e revisão de segurança.

`npm run admin:create` não substitui uma senha existente. Para uma recuperação futura, deve existir um procedimento autenticado de rotação; apagar `data/admin.json` manualmente não faz parte da operação normal.

## Dados

- `data/store.db`: banco exclusivo da dark store;
- `data/stock.key`: chave criada ao inserir o primeiro estoque;
- `data/admin.json`: hash e salt da senha administrativa;
- `data/assets`: anexos locais do editor V2.

Esses arquivos são ignorados pelo Git. Guarde backups privados do banco e da chave; um sem o outro não recupera estoque. Nenhum dado do empty é importado automaticamente.

Cada bloco do estoque representa uma entrega. Separe itens por uma linha em branco. Painéis e produtos V2 são armazenados em `LocalMessage`, sem postagem externa. Os IDs de cargos são preenchidos manualmente enquanto o laboratório estiver desconectado. Pedidos usam IDs fictícios e não representam pagamentos.

## Escopo do anti-raid

O mecanismo detecta rajadas de entrada, contas abaixo da idade mínima e sequências de ações destrutivas. As opções de quarentena, expulsão e banimento são simuladas por uma interface interna e registradas no histórico. **Nenhuma punição é aplicada no Discord nesta fase.** A proteção ao vivo exige uma integração futura com Gateway, Audit Log, permissões mínimas e um adaptador de resposta testado no servidor isolado.

## Verificar

```powershell
npm run setup
npm run build
node --check public/app.js
npm test
```

Quando houver uma decisão posterior de integrar a aplicação ao Discord, isso deve ser uma etapa separada: credenciais próprias, registro controlado, permissões mínimas e testes em ambiente isolado. Este projeto não contém esse ativador.
