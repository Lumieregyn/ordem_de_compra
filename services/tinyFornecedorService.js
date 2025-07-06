const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const BASE_URL = 'https://erp.tiny.com.br/public-api/v3/contatos';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const PAGE_LIMIT = 50;
const MAX_PAGINAS = 30;

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
  if (!token) throw new Error('Token de acesso não disponível');

  const fornecedoresMap = new Map();
  let totalBruto = 0;
  let comNomePadrao = 0;
  const foraDoPadrao = [];

  for (let page = 1; page <= MAX_PAGINAS; page++) {
    try {
      const response = await axios.get(BASE_URL, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: {
          tipo: 'J',
          page,
          limit: PAGE_LIMIT
        }
      });

      const lista = response.data?.itens || [];
      console.log(`📄 Página ${page} retornou ${lista.length} fornecedores`);

      if (lista.length === 0) break;

      for (const f of lista) {
        if (f?.id && f?.nome) {
          totalBruto++;

          const nomeOriginal = f.nome;
          const nomeNormalizado = normalizarFornecedor(nomeOriginal);

          if (nomeOriginal.toUpperCase().startsWith('FORNECEDOR ')) {
            comNomePadrao++;
          } else {
            foraDoPadrao.push({ id: f.id, nome: nomeOriginal });
          }

          fornecedoresMap.set(f.id, {
            id: f.id,
            nomeOriginal,
            nomeNormalizado
          });
        }
      }

      await delay(700);
    } catch (error) {
      console.error(`[listarTodosFornecedores] Erro na página ${page}:`, error.response?.data || error.message);
      break;
    }
  }

  const fornecedores = Array.from(fornecedoresMap.values());

  console.log(`📦 Total PJ recebidos da Tiny (bruto): ${totalBruto}`);
  console.log(`✅ Com nome padrão "FORNECEDOR ...": ${comNomePadrao}`);
  console.log(`🚫 Fora do padrão (mantidos para IA/heurística): ${foraDoPadrao.length}`);

  if (foraDoPadrao.length > 0) {
    console.log('📋 Exemplos de nomes fora do padrão:');
    console.table(foraDoPadrao.slice(0, 10));
  }

  console.table(fornecedores.slice(0, 20));

  return fornecedores;
}

module.exports = {
  listarTodosFornecedores,
  normalizarFornecedor
};
