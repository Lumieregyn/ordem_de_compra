const { normalizarTexto } = require('./normalizarTexto');
const { analisarPedidoViaIA } = require('./openaiMarcaService');

async function selecionarFornecedor(marca, sku, listaFornecedores) {
  if (!marca || !sku || !Array.isArray(listaFornecedores)) {
    console.warn('[selecionarFornecedor] Dados inválidos');
    return null;
  }

  const marcaNormalizada = normalizarTexto(marca);
  const nomeExato = `fornecedor ${marcaNormalizada}`;

  // 1. Match direto
  const direto = listaFornecedores.find(f => 
    normalizarTexto(f.nome) === nomeExato
  );
  if (direto) return direto;

  // 2. Match heurístico
  const heuristico = listaFornecedores.find(f => {
    const nomeFornecedor = normalizarTexto(f.nome.replace('fornecedor', '').trim());
    return (
      nomeFornecedor.includes(marcaNormalizada) ||
      marcaNormalizada.includes(nomeFornecedor)
    );
  });
  if (heuristico) return heuristico;

  // 3. IA fallback
  try {
    const respostaIA = await analisarPedidoViaIA({
      produtoSKU: sku,
      marca,
      fornecedores: listaFornecedores
    });

    if (respostaIA?.deveGerarOC && typeof respostaIA.idFornecedor === 'number') {
      const viaIA = listaFornecedores.find(f => f.id === respostaIA.idFornecedor);
      if (viaIA) return viaIA;
    }

    console.warn(`[IA] Nenhum fornecedor confiável para SKU ${sku}`);
    return null;
  } catch (error) {
    console.error(`[ERRO IA] ${sku}:`, error.message);
    return null;
  }
}

module.exports = {
  selecionarFornecedor
};
