// Converte "3.907,65" ou "3907,65" → 3907.65 (number). Se já for number, mantém.
function toNumberSafe(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const s = v.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

 function gerarPayloadOrdemCompra(dados) {
   const {
     pedido,
     produto,
     sku,
     quantidade,
-    valorUnitario,
+    valorUnitario,
     idFornecedor
   } = dados;
@@
-  const valorTotal = Number((quantidade * valorUnitario).toFixed(2));
+  const qtd = toNumberSafe(quantidade);
+  const vu  = toNumberSafe(valorUnitario);
+  const valorTotal = Number((qtd * vu).toFixed(2));
@@
   const payload = {
     data: dataPedido,
     dataPrevista,
     condicao: pedido.condicao || "A prazo 30 dias",
     fretePorConta: "R",
     observacoes: pedido.observacoes || "Gerado automaticamente",
     observacoesInternas: "OC gerada automaticamente via IA",
     contato: { id: idFornecedor },
     categoria: { id: 0 },
     parcelas: [
       {
         dias: 30,
-        valor: valorTotal,
+        valor: valorTotal,
         contaContabil: { id: 1 },
         meioPagamento: "1",
         observacoes: "Pagamento único"
       }
     ],
     itens: [
       {
         produto: { id: produto.id },
-        quantidade,
-        valor: valorUnitario,
-        informacoesAdicionais: `SKU: ${sku} / Fornecedor: ${produto?.marca?.nome || '---'}`,
+        quantidade: qtd,
+        valor: vu,
+        informacoesAdicionais: `SKU: ${sku} / Fornecedor: ${produto?.marca?.nome || '---'}`,
         aliquotaIPI: 0,
         valorICMS: 0
       }
     ]
   };
