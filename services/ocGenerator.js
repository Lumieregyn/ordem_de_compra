function gerarOrdemCompra() {
    return {
        fornecedor: "Fornecedor Exemplo",
        produtos: [
            { sku: "PEDIDO-NORD-56390", quantidade: 2 },
            { sku: "PEDIDO-NORD-88888", quantidade: 1 }
        ],
        prazo: "10 dias úteis"
    };
}

module.exports = { gerarOrdemCompra };
