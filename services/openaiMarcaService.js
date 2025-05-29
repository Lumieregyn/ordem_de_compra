const { Configuration, OpenAIApi } = require('openai');
const { listarProdutosTiny } = require('./tinyProductService');
const { listarFornecedoresTiny } = require('./tinyFornecedorService');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});

const openai = new OpenAIApi(configuration);

/**
 * Recebe um pedido da Tiny, extrai SKU, marca e determina fornecedor.
 * @param {*} pedido 
 * @returns resposta formatada para webhook
 */
async function analisarPedidoViaIA(pedido) {
  const produtos = await listarProdutosTiny();
  const fornecedores = await listarFornecedoresTiny();

  if (fornecedores.length === 0) {
    console.warn('⚠️ Nenhum fornecedor disponível na Tiny');
  }

  const resultados = [];

  for (const item of pedido.itens || []) {
    const produtoId = item.produto?.id;
    const produtoEncontrado = produtos.find(p => p.id === produtoId);
    const sku = produtoEncontrado?.sku || 'DESCONHECIDO';
    const marca = produtoEncontrado?.marca?.trim()?.toUpperCase() || 'Não informado';

    console.log(`🔎 SKU detectado: ${sku}`);

    let fornecedorSelecionado = '';
    let deveGerarOC = false;
    let motivo = '';

    if (marca === 'Não informado') {
      motivo = 'Marca não encontrada no produto';
    } else {
      // Comparação direta por nome (case insensitive, ignorando espaços)
      const fornecedorMatch = fornecedores.find(f =>
        normalizarTexto(f.nome) === normalizarTexto(marca)
      );

      if (fornecedorMatch) {
        fornecedorSelecionado = fornecedorMatch.nome;
        deveGerarOC = true;
        motivo = 'O nome do fornecedor é exatamente igual ao da marca do produto';
      } else {
        motivo = 'Fornecedor da marca não encontrado na lista disponível';
      }
    }

    resultados.push({
      produtoSKU: sku,
      marca,
      fornecedor: fornecedorSelecionado,
      deveGerarOC,
      motivo
    });
  }

  return { itens: resultados };
}

/**
 * Normaliza textos removendo acentuação, espaços extras e caixa alta
 */
function normalizarTexto(texto) {
  return texto
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

module.exports = {
  analisarPedidoViaIA
};
