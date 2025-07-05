const axios = require('axios');

const BASE_URL = 'https://api.tiny.com.br/api2/fornecedores.pesquisa.php';
const API_TOKEN = process.env.TINY_API_TOKEN;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalizarFornecedor(nome) {
  return nome
    ?.normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-zA-Z0-9\s]/g, '') // remove símbolos
    .replace(/\b(FORNECEDOR|LTDA|ME|URGENTE)\b/gi, '') // remove palavras irrelevantes
    .replace(/\s+/g, ' ') // normaliza espaços
    .trim()
    .toLowerCase();
}

async function listarTodosFornecedores() {
  const fornecedoresBrutos = [];
  const fornecedoresValidosMap = new Map();
  const fornecedoresIgnorados = [];
  const maxPaginas = 20;
  const delayEntreRequisicoes = 800;

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    try {
      const url = `${BASE_URL}?token=${API_TOKEN}&formato=json&pagina=${pagina}&tipo=J`;
      const response = await axios.get(url);
      const lista = response.data?.retorno?.fornecedores || [];

      if (lista.length === 0) break;

      lista.forEach(item => {
        const f = item?.fornecedor;
        if (!f?.id || !f?.nome || f.tipoPessoa !== 'J') return;

        if (fornecedoresValidosMap.has(f.id)) return; // já registrado

        fornecedoresBrutos.push(f);

        const nomeNormalizado = normalizarFornecedor(f.nome);
        const objFormatado = {
          id: f.id,
          nomeOriginal: f.nome,
          nomeNormalizado
        };

        if (f.nome.toUpperCase().startsWith('FORNECEDOR')) {
          fornecedoresValidosMap.set(f.id, objFormatado);
        } else {
          fornecedoresIgnorados.push(objFormatado);
        }
      });

      const ultima = response.data?.retorno?.pagina?.ultima;
      if (ultima === 'true') break;

      await delay(delayEntreRequisicoes);
    } catch (error) {
      console.error(`[listarTodosFornecedores] Erro na página ${pagina}:`, error.response?.data || error.message);
      break;
    }
  }

  const fornecedoresValidos = Array.from(fornecedoresValidosMap.values());

  console.log(`📦 Total PJ encontrados: ${fornecedoresBrutos.length}`);
  console.log(`✅ Com padrão 'FORNECEDOR ': ${fornecedoresValidos.length}`);
  console.log(`🚫 Ignorados fora do padrão: ${fornecedoresIgnorados.length}`);

  if (fornecedoresIgnorados.length > 0) {
    console.table(fornecedoresIgnorados.slice(0, 10));
  }

  return fornecedoresValidos;
}

module.exports = {
  listarTodosFornecedores,
  normalizarFornecedor
};
