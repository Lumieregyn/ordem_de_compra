const { enviarWhatsappErro } = require('./whatsAppService');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function analisarComIA(data, numeroPedido, marca) {
  const detalhes = data?.retorno?.detalhes || data?.retorno?.erros || 'Sem detalhes';
  const mensagem = data?.retorno?.mensagem || '';

  const prompt = `Você é um sistema de auditoria de pedidos. Analise a resposta abaixo da API Tiny e diga apenas se a Ordem de Compra foi criada com sucesso, mesmo que contenha avisos.

- Pedido: ${numeroPedido || '[indefinido]'}
- Marca: ${marca || '[indefinida]'}
- Mensagem: ${mensagem}
- Detalhes: ${JSON.stringify(detalhes)}

Responda apenas com "SIM" ou "NAO".`;

  try {
    const resposta = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    });

    return resposta.choices[0]?.message?.content?.toLowerCase().includes('sim');
  } catch (e) {
    console.warn('⚠️ Falha ao consultar IA, fallback para heurística:', e.message);
    return false;
  }
}

async function validarRespostaOrdem(data, numeroPedido, marca, fornecedor) {
  const detalhesRaw = data?.retorno?.erros || data?.retorno?.detalhes;
  let detalhes = [];

  if (Array.isArray(detalhesRaw)) {
    detalhes = detalhesRaw;
  } else if (typeof detalhesRaw === 'object' && detalhesRaw !== null) {
    detalhes = [detalhesRaw];
  }

  const idOrdem = data?.retorno?.ordem_compra?.id;
  const status = data?.retorno?.status;
  const mensagem = data?.retorno?.mensagem;

  const sucessoIA = await analisarComIA(data, numeroPedido, marca);

  if (idOrdem || sucessoIA) {
    console.log(`✅ OC criada com sucesso (ID: ${idOrdem || 'N/A'}, status: '${status}')`);

    if (mensagem || detalhes.length > 0) {
      console.log('[OC ℹ️] Mensagem adicional da Tiny:', { mensagem, detalhes });
    }

    const texto = `✅ Ordem de Compra criada com sucesso\nPedido: ${numeroPedido || '[indefinido]'}\nMarca: ${marca || '[indefinida]'}\nFornecedor: ${fornecedor?.nome || '[desconhecido]'}`;

    try {
      await enviarWhatsappErro(texto);
    } catch (e) {
      console.warn('⚠️ Falha ao enviar alerta de sucesso (ignorado):', e.message);
    }

    return true;
  }

  if (!data || !data.retorno) {
    const erroCampoContabil = detalhes.some(e => e?.campo === 'parcelas[0].contaContabil.id');
    if (!erroCampoContabil) {
      console.error('❌ Resposta inválida da API Tiny: estrutura ausente');
      await enviarWhatsappErro(`🚨 Erro na resposta da API Tiny\nPedido: ${numeroPedido || '[indefinido]'}\nMarca: ${marca || '[indefinida]'}\nMotivo: Estrutura ausente`);
    }
    return false;
  }

  console.error('❌ Falha na criação da OC via API Tiny:', {
    status: status,
    erros: detalhes.length > 0 ? detalhes : 'Sem detalhes de erro',
    ordem_compra: data.retorno?.ordem_compra,
  });

  const erroTexto = `🚨 Falha ao criar Ordem de Compra\nPedido: ${numeroPedido || '[indefinido]'}\nMarca: ${marca || '[indefinida]'}\nMotivo: ${mensagem || 'Sem mensagem'}\nDetalhes: ${JSON.stringify(detalhes)}`;

  await enviarWhatsappErro(erroTexto);

  return false;
}

module.exports = { validarRespostaOrdem };
