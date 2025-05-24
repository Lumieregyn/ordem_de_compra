# Ordem de Compra Integration

## Setup

1. Renomeie `.env` e preencha suas credenciais Tiny:
   - CLIENT_ID
   - CLIENT_SECRET
   - REDIRECT_URI

2. Instale dependências:

   ```bash
   npm install
   ```

3. Inicie o servidor:

   ```bash
   npm start
   ```

## Endpoints

- **GET /auth**: inicia o fluxo OAuth2 (redireciona ao Tiny).
- **GET /callback?code=**: recebe o código, troca por token de acesso.
- **GET /enviar-oc**: gera e envia a ordem de compra em XML (necessita token).
