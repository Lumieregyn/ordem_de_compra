const { createClient } = require('redis');
const axios = require('axios');

const redis = createClient({
  url: process.env.REDIS_URL,
});

redis.on('error', err => console.error('❌ Erro no Redis:', err));

const TOKEN_KEY = 'tiny:token';

/**
 * Conecta ao Redis se ainda não estiver conectado
 */
async function conectarRedis() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

/**
 * Salva token no Redis e adiciona campo expires_at com timestamp
 */
async function salvarToken(tokenData) {
  await conectarRedis();
  tokenData.expires_at = Date.now() + tokenData.expires_in * 1000;
  await redis.set(TOKEN_KEY, JSON.stringify(tokenData));
  console.log('💾 Token salvo no Redis com expiração em:', new Date(tokenData.expires_at).toISOString());
}

/**
 * Recupera token do Redis (completo)
 */
async function lerToken() {
  await conectarRedis();
  const raw = await redis.get(TOKEN_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

/**
 * Renova o access_token usando o refresh_token
 */
async function renovarToken(tokenAtual) {
  console.log('🔄 Token expirado. Tentando renovar com refresh_token...');
  try {
    const response = await axios.post(
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        refresh_token: tokenAtual.refresh_token,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        validateStatus: () => true,
      }
    );

    if (!response.data?.access_token) {
      console.error('❌ Erro ao renovar token:', response.data);
      return null;
    }

    await salvarToken(response.data);
    return response.data.access_token;

  } catch (err) {
    console.error('❌ Falha ao renovar token:', err.message);
    return null;
  }
}

/**
 * Obtém o access_token válido (renova automaticamente se necessário)
 */
async function getAccessToken() {
  const token = await lerToken();
  if (!token) return null;

  const agora = Date.now();
  const expiraEm = token.expires_at || 0;

  if (agora < expiraEm - 5000) {
    return token.access_token;
  } else {
    return await renovarToken(token);
  }
}

module.exports = {
  salvarToken,
  getAccessToken
};
