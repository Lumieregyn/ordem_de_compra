const axios = require('axios');
let accessToken = null;

async function authCallback(code) {
  if (!code) throw new Error('Código de autorização ausente');

  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('client_id', process.env.CLIENT_ID);
  params.append('client_secret', process.env.CLIENT_SECRET);
  params.append('redirect_uri', process.env.REDIRECT_URI);

  try {
    const response = await axios.post(
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
      params,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      }
    );

    accessToken = response.data.access_token;
    console.log('✅ Token obtido com sucesso. Expira em', response.data.expires_in, 'segundos.');
  } catch (err) {
    console.error('❌ Erro no callback:', err.response?.data || err.message);
    throw err;
  }
}

function getAccessToken() {
  return accessToken;
}

module.exports = {
  authCallback,
  getAccessToken
};
