const { buscarPedidosEmRotaEntrega } = require('../services/rastreamentoPedidoService');
const { enviarMensagem } = require('../services/whatsAppService');

async function monitorarPedidos() {
  const pedidos = await buscarPedidosEmRotaEntrega();

  for (const pedido of pedidos) {
    const telefone = pedido.cliente?.telefone || 'sem-telefone';
    const mensagem = `📦 Olá, ${pedido.cliente?.nome}! Seu pedido ${pedido.numero} já está em rota de entrega. 🚚`;

    await enviarMensagem(telefone, mensagem);
    console.log(`✅ Notificação enviada para ${telefone}`);
  }
}

module.exports = { monitorarPedidos };
