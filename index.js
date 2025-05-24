const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const app = express();

app.use(express.json());

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;
const tokenFile = path.join(__dirname, "token.json");

// Rota raiz
app.get("/", (req, res) => {
  res.send("✅ Backend de Ordem de Compra Inteligente está ativo.");
});

// Rota de autenticação OAuth2
app.get("/auth", (req, res) => {
  const authUrl = `https://api.tiny.com.br/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  console.log("🔍 /auth route hit");
  console.log("📦 Env vars:", { clientId, redirectUri });
  res.redirect(authUrl);
});

// Rota de callback OAuth2
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("❌ Código de autorização não fornecido.");

  try {
    const response = await axios.post("https://api.tiny.com.br/oauth2/token", null, {
      params: {
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      },
    });

    const tokenData = response.data;
    fs.writeFileSync(tokenFile, JSON.stringify(tokenData, null, 2));
    console.log("✅ Token salvo com sucesso:", tokenData);
    res.send("✅ Autorização concluída. Token salvo com sucesso.");
  } catch (error) {
    console.error("❌ Erro ao obter o token:", error.response?.data || error.message);
    res.status(500).send("❌ Erro ao obter o token.");
  }
});

// Rota de envio de ordem de compra (Etapa 2)
app.get("/enviar-oc", async (req, res) => {
  try {
    if (!fs.existsSync(tokenFile)) {
      return res.status(401).send("❌ Token ausente. Acesse /auth primeiro.");
    }

    const tokenData = JSON.parse(fs.readFileSync(tokenFile, "utf8"));
    const accessToken = tokenData.access_token;

    // Mock de uma OC simulada
    const ocData = {
      pedido: {
        data_pedido: "2025-05-24",
        nome: "Fornecedor Teste",
        itens: [
          {
            descricao: "Produto A",
            quantidade: 2,
            valor_unitario: 100,
          },
        ],
      },
    };

    const response = await axios.post("https://api.tiny.com.br/api2/pedido.incluir.php", null, {
      params: {
        token: accessToken,
        formato: "json",
        pedido: JSON.stringify(ocData),
      },
    });

    console.log("📦 OC enviada:", response.data);
    res.send("✅ Ordem de Compra enviada com sucesso.");
  } catch (error) {
    console.error("❌ Erro ao enviar OC:", error.response?.data || error.message);
    res.status(500).send("❌ Erro ao enviar Ordem de Compra.");
  }
});

// Inicialização do servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
