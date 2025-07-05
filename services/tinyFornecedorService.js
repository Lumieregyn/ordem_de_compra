const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const BASE_URL = 'https://erp.tiny.com.br/public-api/v3';
const DELAY_MS = 500;
const PAGE_SIZE = 100;
const MAX_PAGINAS = Infinity;

/**
 * Normaliza nome para uso em matching (sem acentos, símbolos, excessos).
 */
function normalizarFornecedor(nome) {
  return nome
    ?.normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\b(FORNECEDOR|LTDA|ME|URGENTE)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Lista todos os fornecedores PJ, sem duplicados, com logs dos fora do padrão.
 */
async function listarTodosFornecedores() {
  const token = await getAccessToken();
  if (!token) return [];

  const allContacts = [];
  let page = 1;

  try {
    while (page <= MAX_PAGINAS) {
      const response = await axios.get(`${BASE_URL}/contatos`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { tipo: 'J', page, limit: PAGE_SIZE }
      });

      const pageItems = response.data?.itens || [];
      if (pageItems.length === 0) break;

      allContacts.push(...pageItems);
      page++;
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }

    // Deduplicar por ID
    const mapa = new Map();
    const ignorados = [];

    for (const f of allContacts) {
      const nomeValido = f.nome?.toUpperCase()?.startsWith('FORNECEDOR ');
      if (nomeValido) {
        mapa.set(f.id, {
          id: f.id,
          nomeOriginal: f.nome,
          nomeNormalizado: normalizarFornecedor(f.nome)
        });
      } else {
        ignorados.push({ id: f.id, nome: f.nome });
      }
    }

    const validos = Array.from(mapa.values());
    console.log(`📦 Total fornecedores PJ retornados: ${allContacts.length}`);
    console.log(`✅ Com nome padrão: ${validos.length}`);
    console.log(`🚫 Ignorados por nome fora do padrão: ${ignorados.length}`);
    if (ignorados.length > 0) {
      console.table(ignorados.slice(0, 10));
    }

    return validos;
  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores:', err.message || err);
    return [];
  }
}

module.exports = {
  listarTodosFornecedores,
  normalizarFornecedor
};
