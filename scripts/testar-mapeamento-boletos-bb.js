"use strict";

const assert = require("assert");

const {
    montarLoteBoletosBB
} = require("../src/banks/bbPagamentosLoteMapper");

const {
    normalizarEstadoRequisicaoBB,
    normalizarEstadoPagamentoBB
} = require("../src/banks/bbPagamentosLoteStatus");

function main() {
    const pagamento = {
        banco: "bb",
        empresa: "FIT-HML",
        id_titulo: "BOLETO-BB-TESTE-001",
        tipo_pagamento: "BOLETO",
        valor: 400.75,
        data_pagamento: "2026-04-17",
        favorecido: {
            nome: "BENEFICIARIO TESTE",
            documento: "12345678000110"
        },
        dados_pagamento: {
            numero_requisicao: 1211,
            linha_digitavel: "00197120000000005000000003068980002025000517",
            numero_documento_debito: 361751,
            descricao_pagamento: "Teste boleto BB V1.10",
            codigo_seu_documento: "FIT-BOLETO-001",
            codigo_nosso_documento: "",
            valor_nominal: 400.75,
            valor_desconto: 0,
            valor_mora_multa: 0,
            codigo_tipo_pagador: 0,
            documento_pagador: "0",
            codigo_tipo_avalista: 0,
            documento_avalista: "0"
        }
    };

    const configuracao = {
        numero_contrato_pagamento: 123456,
        agencia_debito: 1234,
        conta_corrente_debito: 56789,
        digito_conta_debito: "X"
    };

    const payload = montarLoteBoletosBB({
        pagamento,
        configuracao
    });

    assert.strictEqual(payload.numeroRequisicao, 1211);
    assert.strictEqual(payload.codigoContrato, 123456);
    assert.strictEqual(payload.numeroAgenciaDebito, 1234);
    assert.strictEqual(payload.numeroContaCorrenteDebito, 56789);
    assert.strictEqual(payload.digitoVerificadorContaCorrenteDebito, "X");
    assert.strictEqual(payload.lancamentos.length, 1);
    assert.strictEqual(
        payload.lancamentos[0].numeroCodigoBarras,
        "00197120000000005000000003068980002025000517"
    );
    assert.strictEqual(payload.lancamentos[0].dataPagamento, 17042026);
    assert.strictEqual(payload.lancamentos[0].valorPagamento, 400.75);
    assert.strictEqual(payload.lancamentos[0].codigoTipoBeneficiario, 2);
    assert.strictEqual(
        payload.lancamentos[0].documentoBeneficiario,
        "12345678000110"
    );

    const consistente = normalizarEstadoPagamentoBB("CONSISTENTE");
    assert.strictEqual(consistente.status_fit, "PROCESSANDO");

    const req1 = normalizarEstadoRequisicaoBB(1);
    assert.strictEqual(req1.status_fit, "PROCESSANDO");

    console.log("[OK] Contrato FIT → BB montou POST /lotes-boletos.");
    console.log("[OK] Data AAAA-MM-DD foi convertida para DDMMAAAA.");
    console.log("[OK] Código de barras, beneficiário e valores foram normalizados.");
    console.log("[OK] CONSISTENTE não é tratado como pagamento liquidado.");
    console.log("[OK] Nenhuma chamada bancária foi realizada.");
    console.log("BB_PAGAMENTOS_BOLETO_MAPPER_V110_OK");
}

try {
    main();
} catch (erro) {
    console.error("TESTE_BB_PAGAMENTOS_BOLETO_MAPPER_V110_FALHOU");
    console.error(`Mensagem: ${erro.message}`);
    process.exitCode = 1;
}
