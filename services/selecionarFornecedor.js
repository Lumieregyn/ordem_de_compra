const { analisarPedidoViaIA } = require('./openaiMarcaService');
const { normalizarFornecedor } = require('./tinyFornecedorService');

async function selecionarFornecedor(marca, sku, listaFornecedores) {
  if (!marca || !sku || !Array.isArray(listaFornecedores)) {
    console.warn('[selecionarFornecedor] Dados inválidos');
    return null;
  }

  const marcaNormalizada = normalizarFornecedor(marca);

  // 1. Match direto (nome exato)
  const direto = listaFornecedores.find(f => f.nomeNormalizado === marcaNormalizada);
  if (direto) {
    console.log(`[MATCH DIRETO] SKU: ${sku} → ${direto.nomeOriginal}`);
    return direto;
  }

  // 2. Match heurístico (contém)
  const heuristico = listaFornecedores.find(f =>
    f.nomeNormalizado.includes(marcaNormalizada) ||
    marcaNormalizada.includes(f.nomeNormalizado)
  );
  if (heuristico) {
    console.log(`[MATCH HEURÍSTICO] SKU: ${sku} → ${heuristico.nomeOriginal}`);
    return heuristico;
  }

  // 3. IA fallback
  try {
    const respostaIA = await analisarPedidoViaIA({
      produtoSKU: sku,
      marca,
      fornecedores: listaFornecedores
    });

    if (respostaIA?.deveGerarOC && typeof respostaIA.idFornecedor === 'number') {
      const viaIA = listaFornecedores.find(f => f.id === respostaIA.idFornecedor);
      if (viaIA) {
        if (viaIA.nomeOriginal !== respostaIA.nomeFornecedor) {
          console.warn(`[IA] Inconsistência nome/ID: esperado "${viaIA.nomeOriginal}" mas IA retornou "${respostaIA.nomeFornecedor}"`);
        }
        console.log(`[MATCH IA] SKU: ${sku} → ${viaIA.nomeOriginal}`);
        return viaIA;
      }
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
