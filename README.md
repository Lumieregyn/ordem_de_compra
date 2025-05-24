# Ordem de Compra Inteligente - Backend (Etapa 2)

Esta etapa inclui a integração com o OAuth2 da API Tiny v3.

## Rotas disponíveis

- `/auth`: redireciona para autenticação com o Tiny
- `/callback`: recebe o token de acesso
- `/gerar-oc`: simula geração da OC com token

## Como usar no Railway

1. Adicione as variáveis de ambiente:
- `CLIENT_ID`
- `CLIENT_SECRET`
- `REDIRECT_URI`

2. Acesse `/auth` para iniciar o fluxo
3. Após o callback, acesse `/gerar-oc`
