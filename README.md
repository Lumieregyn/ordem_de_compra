# Integração Tiny API V3 - Ordem de Compra

Este projeto implementa a integração com a API V3 do Tiny ERP para geração e envio de ordem de compra.

## Configuração

1. Renomeie `.env.example` para `.env` e preencha:
   ```
   CLIENT_ID=...
   CLIENT_SECRET=...
   REDIRECT_URI=https://your-domain.up.railway.app/callback
   ```

2. Instale dependências:
   ```
   npm install
   ```

3. Execute a aplicação:
   ```
   npm start
   ```

## Endpoints

- **GET /auth**: inicia fluxo OAuth2 no Tiny.
- **GET /callback?code=**: recebe código, troca por token e envia ordem de compra.
- **GET /enviar-oc**: instrução de uso do fluxo.
