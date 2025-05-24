# Ordem de Compra Inteligente - Etapa 2 (com debug)

Este backend inclui:
- Rota /auth com logs e proteção
- Rota /callback com tratamento de erros
- Rota /gerar-oc com token
- Console.log ativado para Railway

## Como usar

1. Suba no GitHub
2. Conecte ao Railway
3. Adicione as variáveis:
   - CLIENT_ID
   - CLIENT_SECRET
   - REDIRECT_URI
4. Acesse:
   - /auth → inicia autorização
   - /callback → troca token
   - /gerar-oc → exibe OC simulada com token
