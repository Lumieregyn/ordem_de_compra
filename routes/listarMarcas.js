app.get('/listar-marcas', async (req, res) => {
  const token = accessToken || process.env.TINY_API_TOKEN;

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso não encontrado.' });
  }

  const marcasUnicas = new Set();
  let pagina = 1;
  let continuar = true;

  try {
    while (continuar) {
      const response = await axios.post(
        'https://api.tiny.com.br/api2/produtos.pesquisa.php',
        null,
        {
          params: {
            token,
            formato: 'json',
            pagina,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const produtos = response.data?.retorno?.produtos || [];

      // 🚨 Debug opcional: veja como os produtos estão vindo
      if (pagina === 1) {
        console.log('🔎 Primeira página recebida:', JSON.stringify(produtos, null, 2));
      }

      produtos.forEach((p) => {
        const marca = p.produto?.marca;
        if (marca) {
          marcasUnicas.add(marca.trim());
        }
      });

      const ultimaPagina = parseInt(response.data?.retorno?.numero_paginas || 1);
      continuar = pagina < ultimaPagina;
      pagina++;
    }

    res.json({
      marcas: Array.from(marcasUnicas).sort(),
      total: marcasUnicas.size
    });

  } catch (error) {
    console.error('❌ Erro ao buscar marcas:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao consultar marcas na API da Tiny.' });
  }
});
