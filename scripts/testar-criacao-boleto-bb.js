"use strict";

require("dotenv").config();

const {
    buscarClienteDev
} = require("../src/services/clientesIntegracao");

const {
    criarPagamentoSaida
} = require("../src/services/pagamentosSaida");

function dataFutura(dias) {
    const data = new Date();
    data.setDate(data.getDate() + dias);
    return data.toISOString().slice(0, 10);
}

async function main() {
    console.log("[INFO] Criando boleto BB local, sem envio ao banco...");

    if (
        String(process.env.BB_PAGAMENTOS_SEND_ENABLED || "false")
            .trim()
            .toLowerCase() === "true"
    ) {
        throw new Error(
            "BB_PAGAMENTOS_SEND_ENABLED deve permanecer false neste teste"
        );
    }

    const cliente = await buscarClienteDev();

    const resultado = await criarPagamentoSaida(
        {
            banco: "bb",
            empresa: "FIT-HML",
            id_titulo: "BOLETO-BB-V110-001",
            tipo_pagamento: "BOLETO",
            valor: 12.34,
            data_pagamento: dataFutura(7),
            favorecido: {
                nome: "BENEFICIARIO TESTE BB",
                documento: "12345678000110"
            },
            dados_pagamento: {
                numero_requisicao: 190101,
                linha_digitavel: "00197120000000005000000003068980002025000517",
                numero_documento_debito: 0,
                descricao_pagamento: "Teste V1.10 sem envio",
                codigo_seu_documento: "FIT-BOL-V110-001",
                valor_nominal: 12.34,
                valor_desconto: 0,
                valor_mora_multa: 0
            }
        },
        "BB-PAGAMENTOS-V110-BOLETO-001",
        cliente.id
    );

    if (resultado.pagamento.banco !== "bb") {
        throw new Error("Pagamento não foi persistido com banco=bb");
    }

    if (resultado.pagamento.tipo_pagamento !== "BOLETO") {
        throw new Error(
            `Tipo inesperado: ${resultado.pagamento.tipo_pagamento}`
        );
    }

    if (resultado.pagamento.status !== "AGUARDANDO_APROVACAO") {
        throw new Error(
            `Status inesperado: ${resultado.pagamento.status}`
        );
    }

    console.log(`[OK] Boleto BB criado: ${resultado.pagamento.id}`);
    console.log(`[OK] Idempotente: ${resultado.idempotente ? "sim" : "não"}`);
    console.log("[OK] Status: AGUARDANDO_APROVACAO.");
    console.log("[OK] Código de barras permanece em dados criptografados/mascarados.");
    console.log("[OK] Nenhum pagamento foi enviado ao BB.");
    console.log("BB_PAGAMENTOS_BOLETO_CRIACAO_V110_OK");
}

main().catch(erro => {
    console.error("TESTE_BB_PAGAMENTOS_BOLETO_CRIACAO_V110_FALHOU");
    console.error(`Mensagem: ${erro.message}`);
    console.error(`Código: ${erro.code || "SEM_CODIGO"}`);
    if (Array.isArray(erro.detalhes)) {
        console.error(`Detalhes: ${erro.detalhes.join(" | ")}`);
    }
    process.exitCode = 1;
});
