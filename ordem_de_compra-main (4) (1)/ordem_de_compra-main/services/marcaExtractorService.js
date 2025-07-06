const { getProdutoFromTinyV3 } = require('./tinyProductService');
const { inferirMarcaViaIA } = require('./openaiMarcaService');

// Cache local para evitar reprocessamento
const marcasCache = new Map();

// Função auxiliar: normaliza texto removendo acentos, pontuação e caixa
function normalizarTexto(texto) {
  return texto
    ?.toLowerCase()
    .normalize('NFD')                 // Remove acentos
    .replace(/[\u0300-\u036f]/g, '')  // Remove marcas diacríticas
    .replace(/[^a-z0-9\s]/g, '')      // Remove pontuação
    .trim();
}

// Função auxiliar: tenta encontrar a marca com base em campos de texto
function extrairMarcaPorRegex(produto) {
  const camposTexto = [
    produto.nome,
    produto.descricao,
    produto.descricaoComplementar,
    produto.observacoes
  ].filter(Boolean).join(' ').toLowerCase();

  const marcasConhecidas = ['dermage', 'vichy', 'epilare', 'isdin', 'lumiere'];

  for (const marca of marcasConhecidas) {
    const regex = new RegExp(`\\b${marca}\\b`, 'i');
    if (regex.test(camposTexto)) {
      return marca;
    }
  }

  return null;
}

// Função principal: extrai marca com múltiplas estratégias
async function extrairMarca(produtoId) {
  if (marcasCache.has(produtoId)) {
    return marcasCache.get(produtoId);
  }

  const produto = await getProdutoFromTinyV3(produtoId);
  if (!produto) {
    const resultado = { nomeMarca: 'Desconhecida', fonte: 'erro' };
    marcasCache.set(produtoId, resultado);
    return resultado;
  }

  // 1. Marca direta no campo do produto
  if (produto.marca?.nome) {
    const resultado = { nomeMarca: produto.marca.nome, fonte: 'campo direto' };
    marcasCache.set(produtoId, resultado);
    return resultado;
  }

  // 2. Tentativa por regex em descrições e campos complementares
  const marcaDetectada = extrairMarcaPorRegex(produto);
  if (marcaDetectada) {
    const resultado = { nomeMarca: marcaDetectada, fonte: 'regex' };
    marcasCache.set(produtoId, resultado);
    return resultado;
  }

  // 3. Fallback IA (OpenAI GPT)
  const nomeInferido = await inferirMarcaViaIA(produto);
  const resultado = { nomeMarca: nomeInferido || 'Desconhecida', fonte: 'IA' };
  marcasCache.set(produtoId, resultado);
  return resultado;
}

module.exports = {
  extrairMarca
};
