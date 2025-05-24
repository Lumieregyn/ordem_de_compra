# Ordem de Compra Inteligente - Etapa 2

Este projeto implementa:
- Autenticação OAuth2 com Tiny API
- Geração de Ordem de Compra simulada
- Rotas:
  - `/auth` - inicia o fluxo OAuth2
  - `/callback` - recebe o código de autorização
  - `/gerar-oc` - retorna JSON com a ordem de compra e token
