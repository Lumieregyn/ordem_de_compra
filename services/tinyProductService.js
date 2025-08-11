const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

// ---- helpers cirúrgicos ----
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// Rate limit simples: 1 requisição a cada ~350ms (ajuste se precisar)
let _lastCallAt = 0;
async function rateLimit() {
  const GAP_MS = 350;
  const now = Date.now();
  const wait = Math.max(0, _lastCallAt + GAP_MS - now);
  if (wait > 0) await delay(wait);
  _lastCallAt = Date.now();
}

// Cache em memória com TTL (10 min) para evitar chamadas repetidas
const CACHE_TTL_MS = 10 * 60 * 1000;
const produtoCache = new Map(); // id -> { data, exp }

function cacheGet(id) {
  const hit = produtoCache.get(id);
  if (hit && hit.exp > Date.now()) return hit.data;
  if (hit) produtoCache.delete(id);
  return null;
}
function cacheSet(id, data) {
  produtoCache.set(id, { data, exp: Date.now() + CACHE_TTL_MS });
}

// ---- função ajustada ----
async function getProdutoFromTinyV3(id) {
  if (!id) return null;

  // 1) cache primeiro
  const cached = cacheGet(id);
  if (cached) return cached;

  // 2) rate limit simples
  await rateLimit();

  const token = await getAccessToken();
  if (!token) throw new Error('Sem access_token para Tiny v3');

  const url = `${TINY_API_V3_BASE}/produtos/${id}`;
  const TIMEOUT_MS = 15000;
  const MAX_RETRY = 5;
  const BACKOFF_BASE = 500; // ms

  for (let tentativa = 1; tentativa <= MAX_RETRY; tentativa++) {
    try {
      const resp = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: TIMEOUT_MS,
        validateStatus: () => true
      });

      if (resp.status === 200 && resp.data) {
        // Ajuste: a Tiny costuma devolver o objeto já no corpo.
        const produto = resp.data;
        if (produto?.id) {
          cacheSet(id, produto);
          return produto;
        }
        // se vier wrapper diferente, adapte aqui:
        // const produto = resp.data?.item || resp.data?.produto;
        // ...
      }

      if (resp.status === 404) {
        // não existe mesmo; não adianta retry
        return null;
      }

      // 429 ou 5xx: backoff e tenta de novo
      if (resp.status === 429 || resp.status >= 500) {
        const jitter = Math.floor(Math.random() * 250);
        const espera = BACKOFF_BASE * Math.pow(2, tentativa - 1) + jitter;
        console.warn(`⚠️ (prod ${id}) status=${resp.status} retry ${tentativa}/${MAX_RETRY} em ${espera}ms`);
        await delay(espera);
        continue;
      }

      // outros códigos: loga e desiste
      console.error(`❌ (prod ${id}) status=${resp.status} body=`, resp.data);
      return null;

    } catch (err) {
      // timeout / rede → retry com backoff
      const jitter = Math.floor(Math.random() * 250);
      const espera = BACKOFF_BASE * Math.pow(2, tentativa - 1) + jitter;
      if (tentativa >= MAX_RETRY) {
        console.error(`❌ (prod ${id}) erro final:`, err.message);
        return null;
      }
      console.warn(`⏳ (prod ${id}) erro=${err.code || err.message} retry ${tentativa}/${MAX_RETRY} em ${espera}ms`);
      await delay(espera);
    }
  }

  return null;
}

module.exports = { getProdutoFromTinyV3 };
