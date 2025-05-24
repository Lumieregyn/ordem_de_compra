import express from 'express';
import axios from 'axios';

const app = express();

// Use environment variables
const clientId = process.env.CLIENT_ID;
const redirectUri = process.env.REDIRECT_URI;
const port = process.env.PORT || 8080;

// Middleware to parse JSON bodies
app.use(express.json());

// Route: start OAuth flow
app.get('/auth', (req, res) => {
  console.log('🔍 /auth route hit');
  if (!clientId || !redirectUri) {
    return res.status(500).send('Missing CLIENT_ID or REDIRECT_URI');
  }
  const authUrl = `https://api.tiny.com.br/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.redirect(authUrl);
});

// Route: OAuth callback handler
app.get('/callback', async (req, res) => {
  console.log('🔍 /callback route hit');
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Missing code');
  }
  try {
    const tokenResp = await axios.post('https://api.tiny.com.br/oauth2/token', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: redirectUri
      }
    });
    const { access_token } = tokenResp.data;
    return res.send(`Código recebido do Tiny: ${access_token}`);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Error fetching token');
  }
});

// Route: send purchase order
app.get('/enviar-oc', async (req, res) => {
  console.log('🔍 /enviar-oc route hit');
  // Example order payload, adjust as needed
  const order = {
    ordem: {
      id: 'OC-12345',
      itens: [
        { sku: 'ITEM1', quantidade: 2, preco: 100 },
        { sku: 'ITEM2', quantidade: 1, preco: 200 }
      ],
      total: 400
    }
  };

  try {
    const apiResp = await axios.post('https://api.tiny.com.br/api2/ordemcompra.incluir', order, {
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TINY_TOKEN}` }
    });
    return res.json({ sucesso: true, tiny: apiResp.data });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ sucesso: false, error: err.response?.data || err.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});