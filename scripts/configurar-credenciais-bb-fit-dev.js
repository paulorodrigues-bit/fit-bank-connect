"use strict";

require("dotenv").config();

const {
    buscarClienteDev
} = require("../src/services/clientesIntegracao");

const {
    salvarConfiguracaoBancoCliente
} = require("../src/services/credenciaisBancarias");

function obrigatorio(nome) {
    const valor = String(process.env[nome] || "").trim();

    if (!valor) {
        const erro = new Error(`${nome} não configurado no .env`);
        erro.code = "FIT_BB_ENV_AUSENTE";
        throw erro;
    }

    return valor;
}

async function main() {
    const ambiente = String(
        process.env.BB_ENV || "homologacao"
    ).trim().toLowerCase();

    if (ambiente !== "homologacao") {
        throw new Error(
            "Este configurador V1.7 deve ser usado somente com BB_ENV=homologacao"
        );
    }

    const clientId = obrigatorio("BB_CLIENT_ID");
    const clientSecret = obrigatorio("BB_CLIENT_SECRET");
    const appKey = obrigatorio("BB_APP_KEY");
    const scope = obrigatorio("BB_SCOPE_COBRANCAS");

    const numeroConvenio = String(
        process.env.BB_TESTE_NUMERO_CONVENIO || "3128557"
    ).trim();

    const cliente = await buscarClienteDev();

    await salvarConfiguracaoBancoCliente({
        clienteIntegracaoId: cliente.id,
        banco: "bb",
        produto: "cobrancas",
        ambiente: "homologacao",
        authMode: "oauth",
        clientId,
        configuracao: {
            token_url: "https://oauth.hm.bb.com.br/oauth/token",
            scope,
            numero_convenio: numeroConvenio,
            numero_carteira: 17,
            numero_variacao_carteira: 35
        },
        credenciais: {
            client_secret: clientSecret,
            app_key: appKey
        }
    });

    console.log("[OK] Credenciais BB de Cobranças vinculadas ao fit-dev.");
    console.log("[OK] Convênio/carteira/variação de homologação vinculados ao cliente.");
    console.log("[OK] Segredos armazenados criptografados e não exibidos.");
    console.log("BB_CONFIG_COBRANCAS_FIT_DEV_V17_OK");
}

main().catch(erro => {
    console.error("CONFIGURACAO_BB_V17_FALHOU");
    console.error(`Mensagem: ${erro.message}`);
    process.exitCode = 1;
});
