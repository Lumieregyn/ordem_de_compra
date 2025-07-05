const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const MAX_PAGINAS = 10;

function normalizarFornecedor(nome) {
  return nome
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\b(FORNECEDOR|LTDA|ME|URGENTE)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function listarTodosFornecedores() {
  const token = await getAccessToken();
  if (!token) return [];

  const todos = [];
  let page = 1;
  const limit = 50;

  try {
    while (page <= MAX_PAGINAS) {
      const response = await axios.get(`https://erp.tiny.com.br/public-api/v3/contatos?tipo=J&page=${page}&limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const contatosPagina = response.data.itens || [];
      if (!contatosPagina.length) break;

      todos.push(...contatosPagina);
      page++;
      await delay(500);
    }

    const fornecedoresValidos = todos.filter(c =>
      c.nome && normalizarFornecedor(c.nome).includes('fornecedor')
    ).map(c => ({
      id: c.id,
      nomeOriginal: c.nome,
      nomeNormalizado: normalizarFornecedor(c.nome)
    }));

    console.log(`📦 Fornecedores PJ encontrados: ${fornecedoresValidos.length}`);
    console.table(fornecedoresValidos.map(f => ({ id: f.id, nome: f.nomeOriginal })));

    return fornecedoresValidos;
  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores:', err.message);
    return [];
  }
}

module.exports = {
  listarTodosFornecedores,
  normalizarFornecedor
};
