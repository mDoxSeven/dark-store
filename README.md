# dark store — laboratório independente

Projeto separado do empty. Aplicação prevista `1547707174254280794`, servidor previsto `1547613908016038032`. Esta entrega funciona **somente localmente**: não lê token, não abre Gateway, não registra comandos e não chama a API do Discord.

Inclui:

- painel próprio com identidade cromada `dark`;
- login local por senha, sem OAuth;
- simulação idempotente de `/criar`, com categorias, canais e duas calls fictícias;
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
- `data/admin.json`: hash e salt da senha administrativa.

Esses arquivos são ignorados pelo Git. Guarde backups privados do banco e da chave; um sem o outro não recupera estoque. Nenhum dado do empty é importado automaticamente.

Cada bloco do estoque representa uma entrega. Separe itens por uma linha em branco. A prévia V2 é armazenada em `LocalMessage`, sem postagem externa. Pedidos usam IDs fictícios e não representam pagamentos.

## Verificar

```powershell
npm run setup
npm run build
npm test
```

Quando houver uma decisão posterior de integrar a aplicação ao Discord, isso deve ser uma etapa separada: credenciais próprias, registro controlado, permissões mínimas e testes em ambiente isolado. Este projeto não contém esse ativador.
