# Ordem de Compra Backend

Este projeto demonstra como enviar uma ordem de compra para a API do Tiny ERP usando OAuth2.

## Setup

1. Copie o arquivo `.env.example` para `.env` e preencha as variáveis de ambiente.
2. Instale as dependências:
   ```
   npm install
   ```
3. Inicie o servidor:
   ```
   npm start
   ```

## Rotas

- `GET /auth`: Redireciona para a página de autorização do Tiny.
- `GET /callback`: Recebe o código de autorização e obtém o token de acesso.
- `GET /enviar-oc`: Envia a ordem de compra configurada no `services/ocGenerator.js`.

## Customização

- Ajuste o XML gerado em `services/ocGenerator.js` conforme a sua necessidade e de acordo com a documentação do Tiny ERP.
