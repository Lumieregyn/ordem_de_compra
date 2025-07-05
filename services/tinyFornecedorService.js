const axios = require('axios');

const BASE_URL = 'https://api.tiny.com.br/api2/fornecedores.pesquisa.php';
const API_TOKEN = process.env.TINY_API_TOKEN;

// Delay para evitar erro 429
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Normaliza nome para matching (reutilizável em toda a IA)
function normalizarFornecedor(nome) {
  return nome
    ?.normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-zA-Z0-9\s]/g, '') // remove símbolos
    .replace(/\b(FORNECEDOR|LTDA|ME|URGENTE)\b/gi, '') // remove palavras comuns
    .replace(/\s+/g, ' ') // normaliza espaços
    .trim()
    .toLowerCase();
}

async function listarTodosFornecedores() {
  const fornecedoresMap = new Map();
  const maxPaginas = 20;
  const delayEntreRequisicoes = 800;

  let totalBruto = 0;
  let comNomePadrao = 0;
  const foraDoPadrao = [];

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    try {
      const url = `${BASE_URL}?token=${API_TOKEN}&formato=json&pagina=${pagina}&tipo=J`;
      const response = await axios.get(url);
      const lista = response.data?.retorno?.fornecedores || [];

      if (lista.length === 0) break;

      for (const item of lista) {
        const f = item?.fornecedor;
        if (f?.id && f?.nome && f?.tipoPessoa === 'J') {
          totalBruto++;

          const nomeOriginal = f.nome;
          const nomeNormalizado = normalizarFornecedor(nomeOriginal);

          // Conta quantos seguem o padrão FORNECEDOR ...
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

      const ultimaPagina = response.data?.retorno?.pagina?.ultima === "true";
      if (ultimaPagina) break;

      await delay(delayEntreRequisicoes);
    } catch (error) {
      console.error(`[listarTodosFornecedores] Erro na página ${pagina}:`, error.response?.data || error.message);
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

  return fornecedores;
}

module.exports = {
  listarTodosFornecedores,
  normalizarFornecedor
};
