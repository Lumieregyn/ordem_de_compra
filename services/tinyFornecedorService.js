const axios = require('axios');

const BASE_URL = 'https://api.tiny.com.br/api2/fornecedores.pesquisa.php';
const API_TOKEN = process.env.TINY_API_TOKEN;

// utilitário simples
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Lista fornecedores PJ cujo nome começa com "FORNECEDOR "
 * - Usa API v2 com paginação até a última página
 * - Filtro robusto por nome
 * - Dedupe por ID
 * - Retry leve para 429/5xx
 */
async function listarTodosFornecedores() {
  if (!API_TOKEN) {
    console.error('[listarTodosFornecedores] ❌ TINY_API_TOKEN ausente nas envs');
    return [];
  }

  const fornecedoresMap = new Map();
  let pagina = 1;

  // ajustes finos
  const DELAY_BETWEEN = 800;     // ms entre páginas (evita 429)
  const MAX_RETRY = 3;           // por página
  const TIMEOUT_MS = 15000;      // por requisição

  while (true) {
    let tentativa = 0;
    let sucessoPagina = false;

    while (tentativa < MAX_RETRY && !sucessoPagina) {
      tentativa++;
      try {
        const resp = await axios.get(BASE_URL, {
          params: {
            token: API_TOKEN,
            formato: 'json',
            pagina,
            // o endpoint aceita filtro por nome; passamos exatamente "FORNECEDOR "
            nome: 'FORNECEDOR '
          },
          timeout: TIMEOUT_MS,
          validateStatus: () => true
        });

        const retorno = resp.data?.retorno;
        const lista = retorno?.fornecedores || [];
        const ultimaFlag = retorno?.pagina?.ultima;

        // coleta + filtro
        for (const item of lista) {
          const f = item?.fornecedor;
          if (!f) continue;

          const nome = (f.nome || '').toString().trim();
          const tipo = (f.tipoPessoa || '').toString().trim().toUpperCase();

          // mantém regra: começa com "FORNECEDOR " e PJ
          if (
            f.id &&
            nome.toUpperCase().startsWith('FORNECEDOR ') &&
            tipo === 'J'
          ) {
            fornecedoresMap.set(f.id, f); // dedupe por ID
          }
        }

        // fim da paginação?
        const isUltima =
          ultimaFlag === true || ultimaFlag === 'true' || lista.length === 0;

        sucessoPagina = true;

        if (isUltima) {
          const fornecedores = Array.from(fornecedoresMap.values());
          console.log(
            `[listarTodosFornecedores] ✅ total=${fornecedores.length} | páginas=${pagina}`
          );
          return fornecedores;
        }

        // próxima página
        pagina++;
        await delay(DELAY_BETWEEN);
      } catch (err) {
        const status = err?.response?.status;
        const body = err?.response?.data;

        // retry leve para 429/5xx/timeout
        const elegivelRetry =
          status === 429 ||
          (status && status >= 500) ||
          err.code === 'ECONNABORTED';

        console.warn(
          `[listarTodosFornecedores] ⚠️ página=${pagina} tentativa=${tentativa}/${MAX_RETRY} | status=${status} | erro=${err.message}`
        );
        if (!elegivelRetry || tentativa >= MAX_RETRY) {
          console.error(
            `[listarTodosFornecedores] ❌ falha na página ${pagina} (abortando)`,
            body || err.message
          );
          // retorna o que tiver coletado até aqui (comportamento conservador)
          return Array.from(fornecedoresMap.values());
        }

        // backoff exponencial simples
        const espera = 800 * Math.pow(2, tentativa - 1);
        await delay(espera);
      }
    }
  }
}

module.exports = { listarTodosFornecedores };
