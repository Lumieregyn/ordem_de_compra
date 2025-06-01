const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TOKEN_PATH = path.join(__dirname, '..', 'token.json');

/**
 * Salva o token completo e calcula a data de expiração.
 */
function salvarToken(tokenData) {
  try {
    tokenData.expires_at = Date.now() + tokenData.expires_in * 1000;
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2), 'utf-8');
    console.log('💾 Token salvo em token.json');
  } catch (err) {
    console.error('❌ Erro ao salvar token:', err.message);
  }
}

/**
 * Lê o token salvo no disco.
 */
function lerToken() {
  try {
    if (!fs.existsSync(TOKEN_PATH)) return null;
    const raw = fs.readFileSync(TOKEN_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('❌ Erro ao ler token:', err.message);
    return null;
  }
}

/**
 * Usa o refresh_token da Tiny para obter um novo access_token.
 */
async function renovarToken(tokenAtual) {
  try {
    console.log('🔄 Token expirado. Tentando renovar com refresh_token...');

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

    salvarToken(response.data);
    return response.data.access_token;
  } catch (err) {
    console.error('❌ Erro ao renovar token:', err.message);
    return null;
  }
}

/**
 * Obtém o access_token atual, renovando se necessário.
 */
async function getAccessToken() {
  const token = lerToken();
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
