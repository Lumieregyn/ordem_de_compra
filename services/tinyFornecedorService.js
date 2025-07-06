const axios = require('axios');

const BASE_URL = 'https://api.tiny.com.br/api2/fornecedores.pesquisa.php';
const API_TOKEN = process.env.TINY_API_TOKEN;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalizarFornecedor(nome) {
  return nome
    ?.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\b(FORNECEDOR|LTDA|ME|URGENTE)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function listarTodosFornecedores() {
  const fornecedoresPorNome = new Map();
  const delayEntreRequisicoes = 800;

  let totalBruto = 0;
  let comNomePadrao = 0;
  const foraDoPadrao = [];

  for (let pagina = 1; pagina <= 100; pagina++) {
    try {
      const url = `${BASE_URL}?token=${API_TOKEN}&formato=json&pagina=${pagina}&tipo=J`;
      const response = await axios.get(url);

      const lista = response.data?.retorno?.fornecedores || [];
      if (!lista.length) break;

      for (const item of lista) {
        const f = item?.fornecedor;
        if (!f?.id || !f?.nome || f?.tipoPessoa !== 'J') continue;

        totalBruto++;

        const nomeOriginal = f.nome;
        const nomeNormalizado = normalizarFornecedor(nomeOriginal);

        if (nomeOriginal.toUpperCase().startsWith('FORNECEDOR ')) {
          comNomePadrao++;
        } else {
          foraDoPadrao.push({ id: f.id, nome: nomeOriginal });
        }

        // ✅ Garante deduplicação por nome normalizado
        if (!fornecedoresPorNome.has(nomeNormalizado)) {
          fornecedoresPorNome.set(nomeNormalizado, {
            id: f.id,
            nomeOriginal,
            nomeNormalizado
          });
        }
      }

      const ultimaPagina = response.data?.retorno?.pagina?.ultima === 'true';
      if (ultimaPagina) break;

      await delay(delayEntreRequisicoes);
    } catch (error) {
      console.error(`[listarTodosFornecedores] Erro na página ${pagina}:`, error.response?.data || error.message);
      break;
    }
  }

  const fornecedores = Array.from(fornecedoresPorNome.values());

  console.log(`📦 Total PJ recebidos da Tiny (bruto): ${totalBruto}`);
  console.log(`✅ Com nome padrão "FORNECEDOR ...": ${comNomePadrao}`);
  console.log(`📉 Total únicos (por nome): ${fornecedores.length}`);
  if (foraDoPadrao.length > 0) {
    console.log('📋 Exemplos fora do padrão:');
    console.table(foraDoPadrao.slice(0, 5));
  }

  return fornecedores;
}

module.exports = {
  listarTodosFornecedores,
  normalizarFornecedor
};
