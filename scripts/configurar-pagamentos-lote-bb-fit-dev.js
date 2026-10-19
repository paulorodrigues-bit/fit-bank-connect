"use strict";

require("dotenv").config();

const {
    buscarClienteDev
} = require("../src/services/clientesIntegracao");

const {
    salvarConfiguracaoBancoCliente
} = require("../src/services/credenciaisBancarias");

const SCOPES_PADRAO = [
    "pagamentos-lote.lancamentos-info",
    "pagamentos-lote.lotes-info",
    "pagamentos-lote.pagamentos-info",
    "pagamentos-lote.cancelar-requisicao",
    "pagamentos-lote.boletos-info",
    "pagamentos-lote.boletos-requisicao",
    "pagamentos-lote.lotes-requisicao",
    "pagamentos-lote.transferencias-info",
    "pagamentos-lote.transferencias-requisicao"
].join(" ");

function obrigatorio(nome) {
    const valor = String(process.env[nome] || "").trim();

    if (!valor) {
        const erro = new Error(`${nome} não configurado no .env`);
        erro.code = "FIT_BB_ENV_AUSENTE";
        throw erro;
    }

    return valor;
}

function opcional(nome) {
    const valor = String(process.env[nome] || "").trim();
    return valor || null;
}

async function main() {
    const ambiente = String(
        process.env.BB_ENV || "homologacao"
    ).trim().toLowerCase();

    if (ambiente !== "homologacao") {
        throw new Error(
            "Este configurador V1.10 deve ser usado somente com BB_ENV=homologacao"
        );
    }

    const clientId = obrigatorio("BB_CLIENT_ID");
    const clientSecret = obrigatorio("BB_CLIENT_SECRET");
    const appKey = obrigatorio("BB_APP_KEY");

    const scope = String(
        process.env.BB_SCOPE_PAGAMENTOS_LOTE || SCOPES_PADRAO
    ).trim();

    const configuracao = {
        token_url: "https://oauth.hm.bb.com.br/oauth/token",
        scope,
        envio_habilitado: false
    };

    const baseUrl = opcional("BB_PAGAMENTOS_BASE_URL");
    const numeroContrato = opcional("BB_PAGAMENTOS_NUMERO_CONTRATO");
    const agenciaDebito = opcional("BB_PAGAMENTOS_AGENCIA_DEBITO");
    const contaDebito = opcional("BB_PAGAMENTOS_CONTA_DEBITO");
    const digitoDebito = opcional("BB_PAGAMENTOS_DIGITO_CONTA_DEBITO");

    if (baseUrl) {
        configuracao.base_url = baseUrl;
    }

    if (numeroContrato) {
        configuracao.numero_contrato_pagamento = Number(numeroContrato);
    }

    if (agenciaDebito) {
        configuracao.agencia_debito = Number(agenciaDebito);
    }

    if (contaDebito) {
        configuracao.conta_corrente_debito = Number(contaDebito);
    }

    if (digitoDebito) {
        configuracao.digito_conta_debito = digitoDebito;
    }

    const cliente = await buscarClienteDev();

    await salvarConfiguracaoBancoCliente({
        clienteIntegracaoId: cliente.id,
        banco: "bb",
        produto: "pagamentos_lote",
        ambiente: "homologacao",
        authMode: "oauth",
        clientId,
        configuracao,
        credenciais: {
            client_secret: clientSecret,
            app_key: appKey
        }
    });

    console.log("[OK] Pagamentos em Lote BB vinculado ao fit-dev.");
    console.log("[OK] OAuth e scopes armazenados por cliente.");
    console.log("[OK] Client Secret e App Key armazenados criptografados.");
    console.log("[OK] Envio bancário permanece DESABILITADO.");
    console.log("BB_PAGAMENTOS_LOTE_CONFIG_V110_OK");
}

main().catch(erro => {
    console.error("CONFIGURACAO_BB_PAGAMENTOS_V110_FALHOU");
    console.error(`Mensagem: ${erro.message}`);
    process.exitCode = 1;
});
