const express = require('express');
const router = express.Router();
const axios = require('axios');

// GET /auth → Redireciona para autenticação OAuth2 Tiny
router.get('/', (req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.CLIENT_ID,
    redirect_uri: process.env.REDIRECT_URI,
    scope: 'openid',
  });

  res.redirect(`https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?${params}`);
});

// GET /callback → Recebe o código e troca pelo token
router.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Código ausente');

  try {
    const response = await axios.post(
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const token = response.data?.access_token;
    if (!token) return res.status(500).send('Token não retornado pela API');

    // Salva token global (ou no arquivo, banco etc)
    global.tinyAccessToken = token;

    console.log('✅ Token obtido com sucesso. Expira em', response.data.expires_in, 'segundos.');
    res.send('✅ Token salvo com sucesso.');
  } catch (err) {
    console.error('❌ Erro no callback:', err.response?.data || err.message);
    res.status(500).send('Erro ao salvar token');
  }
});

module.exports = router;
