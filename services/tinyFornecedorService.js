const axios = require('axios');
const { getAccessToken } = require('./tokenService');
const { delay } = require('./tinyUtils');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const MAX_PAGINAS = 10;

async function listarTodosFornecedores() {
  const token = await getAccessToken();
  if (!token) {
    console.error('❌ Token Tiny não disponível.');
    return [];
  }

  const fornecedoresMap = new Map();

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    try {
      const url = `${TINY_API_V3_BASE}/contatos?tipo=J&nome=FORNECEDOR&page=${pagina}&limit=50`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true,
      });

      const contatos = response.data?.itens || [];
      console.log(`📦 Página ${pagina}: ${contatos.length} fornecedores recebidos`);

      if (contatos.length === 0) break;

      for (const f of contatos) {
        if (
          f?.id &&
          typeof f.nome === 'string' &&
          f.nome.toUpperCase().startsWith('FORNECEDOR ') &&
          f.tipoPessoa === 'J'
        ) {
          fornecedoresMap.set(f.id, f);
        }
      }

      await delay(500); // prevenir 429

    } catch (err) {
      console.error(`❌ Erro ao buscar fornecedores na página ${pagina}:`, err.response?.data || err.message);
      break;
    }
  }

  const fornecedores = Array.from(fornecedoresMap.values());
  console.log(`✅ Total de fornecedores PJ com nome 'FORNECEDOR X': ${fornecedores.length}`);
  return fornecedores;
}

module.exports = {
  listarTodosFornecedores
};
