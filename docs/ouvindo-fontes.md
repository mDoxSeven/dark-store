# Captura híbrida do alta!ouvindo

O Angel procura a atividade Spotify recebida pelo Discord primeiro. Se houver uma faixa válida, envia o mesmo card animado sem solicitar OAuth. Sem atividade, consulta a conta Spotify conectada. Quando não houver conexão, reprodução ou houver erro da API, tenta atualizar a presença antes de solicitar conexão ou exibir o erro.

A captura Discord exige `DARK_SPOTIFY_PRESENCE_ENABLED=true` no `.env` e Presence Intent habilitado para o bot no Discord Developer Portal. Reinicie o serviço após alterar a variável. A captura só funciona quando o Discord entrega a atividade ao bot. Não acessa o áudio do computador ou celular do membro.

Faixas cujo horário de término já passou não são reutilizadas. Eventos de presença sem atividade Spotify removem o cache. Sem as duas fontes, o bot apresenta a falha; não inventa uma música. Falhas de acesso à API orientam a autorização da conta no aplicativo Spotify.

Outra integração possível é Last.fm, por meio de `user.getRecentTracks` e do indicador `nowplaying`. Exige chave de API do Last.fm, associação de usuário e scrobbling do player da pessoa. Não está implementada nesta versão. Não entrega necessariamente duração/progresso e não se deve apresentar uma faixa histórica como reprodução atual.

Referências: [Presença Discord](https://docs.discord.com/developers/events/gateway-events#presence-update), [Last.fm user.getRecentTracks](https://www.last.fm/api/show/user.getRecentTracks).
