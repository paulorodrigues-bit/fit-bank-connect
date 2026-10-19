"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
    buscarClienteDev
} = require("../src/services/clientesIntegracao");

const {
    salvarConfiguracaoBancoCliente
} = require("../src/services/credenciaisBancarias");

const CERTIFICADO_PUBLICO_PADRAO =
    "C:\\Users\\paulo\\fit-bank-connect\\certificates\\2) Pública (vencimento em 2026)\\api-extratos.cer";

function obrigatorio(nome) {
    const valor = String(process.env[nome] || "").trim();

    if (!valor) {
        const erro = new Error(`${nome} não configurado no .env`);
        erro.code = "FIT_BB_ENV_AUSENTE";
        throw erro;
    }

    return valor;
}

function resolverCaminho(informado, nome) {
    const absoluto = path.isAbsolute(informado)
        ? informado
        : path.resolve(process.cwd(), informado);

    if (!fs.existsSync(absoluto)) {
        throw new Error(
            `${nome} aponta para um arquivo que não existe: ${absoluto}`
        );
    }

    return absoluto;
}

function caminhoObrigatorio(nome) {
    return resolverCaminho(obrigatorio(nome), nome);
}

function detectarModoCertificado(certPath) {
    const informado = String(
        process.env.BB_EXTRATOS_CERT_MODE || ""
    ).trim().toLowerCase();

    if (informado) {
        return informado;
    }

    const extensao = path.extname(certPath).toLowerCase();

    if (extensao === ".pfx" || extensao === ".p12") {
        return "pfx";
    }

    if (extensao === ".cer" || extensao === ".crt" || extensao === ".pem") {
        return "pem";
    }

    throw new Error(
        "Não foi possível detectar o modo do certificado. Configure BB_EXTRATOS_CERT_MODE=pfx ou pem."
    );
}

async function main() {
    const ambiente = String(
        process.env.BB_ENV || "homologacao"
    ).trim().toLowerCase();

    if (ambiente !== "homologacao") {
        throw new Error(
            "Este configurador V1.8.2 deve ser usado somente com BB_ENV=homologacao"
        );
    }

    const clientId = obrigatorio("BB_CLIENT_ID");
    const clientSecret = obrigatorio("BB_CLIENT_SECRET");
    const appKey = obrigatorio("BB_APP_KEY");

    const certInformado = String(
        process.env.BB_EXTRATOS_CERT_PATH || CERTIFICADO_PUBLICO_PADRAO
    ).trim();

    const certPath = resolverCaminho(
        certInformado,
        "BB_EXTRATOS_CERT_PATH"
    );

    const certMode = detectarModoCertificado(certPath);

    let keyPath = null;

    if (certMode === "pem" || certMode === "cer" || certMode === "crt") {
        keyPath = caminhoObrigatorio("BB_EXTRATOS_KEY_PATH");
    }

    const certPassword = String(
        process.env.BB_EXTRATOS_CERT_PASSWORD || ""
    );

    const scope = String(
        process.env.BB_SCOPE_EXTRATOS || "extrato-info"
    ).trim();

    const mciTeste = String(
        process.env.BB_EXTRATOS_MCITESTE || "26968930"
    ).trim();

    const agencia = Number(
        process.env.BB_EXTRATOS_AGENCIA_TESTE || 551
    );

    const conta = Number(
        process.env.BB_EXTRATOS_CONTA_TESTE || 5087
    );

    const cliente = await buscarClienteDev();

    await salvarConfiguracaoBancoCliente({
        clienteIntegracaoId: cliente.id,
        banco: "bb",
        produto: "extratos",
        ambiente: "homologacao",
        authMode: "oauth",
        clientId,
        configuracao: {
            token_url: "https://oauth.hm.bb.com.br/oauth/token",
            scope,
            base_url: "https://extratos.mtls.api.hm.bb.com.br/v2",
            cert_mode: certMode === "pfx" ? "pfx" : "pem",
            cert_path: certPath,
            key_path: keyPath,
            mci_teste: mciTeste,
            agencia,
            conta
        },
        credenciais: {
            client_secret: clientSecret,
            app_key: appKey,
            cert_password: certPassword
        }
    });

    console.log("[OK] BB Extratos vinculado ao fit-dev.");
    console.log(`[OK] Modo mTLS configurado: ${certMode === "pfx" ? "PFX/P12" : "certificado público + chave privada"}.`);
    console.log("[OK] Certificado e segredos não foram exibidos no terminal.");
    console.log("BB_EXTRATOS_CONFIG_V182_OK");
}

main().catch(erro => {
    console.error("CONFIGURACAO_BB_EXTRATOS_V182_FALHOU");
    console.error(`Mensagem: ${erro.message}`);
    process.exitCode = 1;
});
