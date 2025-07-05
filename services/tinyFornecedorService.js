const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

/**
 * Normaliza o nome do fornecedor para matching.
 */
function normalizarFornecedor(nome) {
  return nome
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
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

  const todos = [];
  let page = 1;
  const limit = 50;

  try {
    while (true) {
      const response = await axios.get(
        `${TINY_API_V3_BASE}/contatos`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { tipo: 'J', page, limit }
        }
      );

      const contatosPagina = response.data?.itens || [];
      if (!contatosPagina.length) break;

      todos.push(...contatosPagina);
      page++;
      await delay(500);
    }

    // Deduplica fornecedores por ID
    const mapFornecedores = new Map();
    for (const f of todos) {
      if (f.id && f.nome) {
        mapFornecedores.set(f.id, f);
      }
    }

    const fornecedoresUnicos = Array.from(mapFornecedores.values());

    console.log(`📦 Fornecedores PJ únicos encontrados: ${fornecedoresUnicos.length}`);
    console.table(fornecedoresUnicos.map(f => ({ id: f.id, nome: f.nome })));

    // Mapeia para formato esperado
    return fornecedoresUnicos.map(f => ({
      id: f.id,
      nomeOriginal: f.nome,
      nomeNormalizado: normalizarFornecedor(f.nome)
    }));
  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores:', err.message);
    return [];
  }
}

module.exports = {
  listarTodosFornecedores,
  normalizarFornecedor
};
