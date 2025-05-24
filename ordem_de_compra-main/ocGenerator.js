const pedido = require('../mock/pedido_aprovado.json');

function gerarOrdemCompra() {
    const itensNecessarios = pedido.itens.filter(item => item.sku.toUpperCase().includes('PEDIDO'));
    return {
        numeroPedido: pedido.numero,
        data: new Date().toISOString().split('T')[0],
        itens: itensNecessarios.map(item => ({
            sku: item.sku,
            nome: item.nome,
            quantidade: item.quantidade
        })),
        observacoes: pedido.observacoes
    };
}

module.exports = { gerarOrdemCompra };
