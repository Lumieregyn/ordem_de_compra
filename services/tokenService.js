// services/tokenService.js
const { createClient } = require('redis');
const axios = require('axios');

const redis = createClient({
  url: process.env.REDIS_URL,
});

redis.on('error', err => console.error('❌ Erro no Redis:', err));

const TOKEN_KEY = 'tiny:token';
const REFRESH_SKEW_MS = 60_000; // tenta renovar 60s antes de expirar
let refreshInFlight = null;     // promise global para deduplicar refresh concorrente

/**
 * Conecta ao Redis se ainda não estiver conectado
 */
async function conectarRedis() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

/**
 * Salva token no Redis e adiciona campo expires_at com timestamp absoluto (ms)
 */
async function salvarToken(tokenData) {
  await conectarRedis();
  tokenData.expires_at = Date.now() + (Number(tokenData.expires_in || 0) * 1000);
  await redis.set(TOKEN_KEY, JSON.stringify(tokenData));
  console.log('💾 Token salvo no Redis. Expira em:', new Date(tokenData.expires_at).toISOString());
}

/**
 * Recupera token bruto do Redis
 */
async function lerToken() {
  await conectarRedis();
  const raw = await redis.get(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Faz a requisição de refresh no IdP
 */
async function requestRefresh(tokenAtual) {
  return axios.post(
    'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      refresh_token: tokenAtual.refresh_token,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      validateStatus: () => true,
      timeout: 15000,
    }
  );
}

/**
 * Renova o access_token usando o refresh_token (com deduplicação e retry leve)
 */
async function renovarToken(tokenAtual) {
  // Se já houver um refresh em andamento, aguarda o mesmo
  if (refreshInFlight) {
    try {
      return await refreshInFlight;
    } catch {
      // cai para tentativa direta abaixo
    }
  }

  refreshInFlight = (async () => {
    console.log('🔄 Renovando token com refresh_token...');
    try {
      // 1ª tentativa
      let resp = await requestRefresh(tokenAtual);

      // Caso falhe por erro transitório (ex.: 5xx), tenta mais 1 vez
      if (!resp.data?.access_token || resp.status >= 500) {
        await new Promise(r => setTimeout(r, 800));
        resp = await requestRefresh(tokenAtual);
      }

      if (!resp.data?.access_token) {
        console.error('❌ Erro ao renovar token:', resp.status, resp.data);
        throw new Error('refresh_failed');
      }

      await salvarToken(resp.data);
      console.log('✅ Token renovado com sucesso');
      return resp.data.access_token;
    } finally {
      // garante limpar o in-flight mesmo em erro
      refreshInFlight = null;
    }
  })();

  try {
    return await refreshInFlight;
  } catch (e) {
    console.error('❌ Falha final ao renovar token:', e.message);
    return null;
  }
}

/**
 * Obtém um access_token válido (renova automaticamente se necessário)
 */
async function getAccessToken() {
  const token = await lerToken();
  if (!token) {
    console.warn('⚠️ Token não encontrado no Redis');
    return null;
  }

  const agora = Date.now();
  const expiraEm = Number(token.expires_at || 0);

  // Se faltar mais que REFRESH_SKEW_MS, usa o atual
  if (agora < (expiraEm - REFRESH_SKEW_MS)) {
    return token.access_token;
  }

  // Senão, tenta renovar (pró-ativo ou expirado)
  const novo = await renovarToken(token);
  if (!novo) {
    console.warn('⚠️ Renovação falhou. Token pode estar expirado/inválido.');
    return null;
  }
  return novo;
}

module.exports = {
  salvarToken,
  getAccessToken
};
