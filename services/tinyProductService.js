const axios = require('axios');
const { getAccessToken } = require('./tokenService');

// Ajuste: maior limite por página para reduzir número de requisições, conforme Tiny ERP
const DELAY_MS = 500;
const MAX_PAGINAS = Infinity;  // Busca até não retornar mais itens
const PAGE_SIZE = 100; // Ajuste conforme limite suportado pela API
const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

/**
 * Normaliza o nome do fornecedor para matching.
 */
function normalizarFornecedor(nome) {
  return nome
    ?.normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')  // Remove acentuação
    .replace(/[^a-zA-Z0-9\s]/g, '')  // Remove símbolos
    .replace(/\s+/g, ' ')           // Espaços únicos
    .trim()
    .toLowerCase();
}

/**
 * Lista todos os fornecedores Pessoa Jurídica via API V3, sem duplicatas.
 * Continua paginando até não retornar mais itens.
 * @returns {Promise<Array<{id: number, nomeOriginal: string, nomeNormalizado: string}>>}
 */
async function listarTodosFornecedores() {
  const token = await getAccessToken();
  if (!token) return [];

  const allContacts = [];
  let page = 1;

  try {
    while (page <= MAX_PAGINAS) {
      const response = await axios.get(
        `${TINY_API_V3_BASE}/contatos`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { tipo: 'J', page, limit: PAGE_SIZE }
        }
      );

      const contacts = response.data?.itens || [];
      if (contacts.length === 0) break;

      allContacts.push(...contacts);
      page++;
      await new Promise(res => setTimeout(res, DELAY_MS));
    }

    // Deduplica fornecedores por ID
    const uniqueMap = new Map(allContacts.map(f => [f.id, f]));
    const uniqueContacts = Array.from(uniqueMap.values());

    console.log(`📦 Total fornecedores PJ encontrados: ${uniqueContacts.length}`);
    console.table(uniqueContacts.map(f => ({ id: f.id, nome: f.nome })));

    // Formata para uso no fluxo de seleção
    return uniqueContacts.map(f => ({
      id: f.id,
      nomeOriginal: f.nome,
      nomeNormalizado: normalizarFornecedor(f.nome)
    }));
  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores:', err.message || err);
    return [];
  }
}

module.exports = {
  listarTodosFornecedores,
  normalizarFornecedor
};
