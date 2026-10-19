"use strict";

require("dotenv").config();

const axios = require("axios");

const TOKEN_URL = String(
    process.env.BB_TOKEN_URL ||
    "https://oauth.hm.bb.com.br/oauth/token"
).trim();

const DEFAULT_SCOPE =
    "cobrancas.boletos-info cobrancas.boletos-requisicao";

function obrigatorio(nome) {
    const valor = String(process.env[nome] || "").trim();

    if (!valor) {
        const erro = new Error(`${nome} não configurado no .env`);
        erro.code = "FIT_BB_ENV_AUSENTE";
        throw erro;
    }

    return valor;
}

function resumoErro(erro) {
    const status = erro.response?.status || null;
    const data = erro.response?.data || null;

    const mensagem =
        data?.error_description ||
        data?.message ||
        data?.error ||
        (Array.isArray(data?.errors) && data.errors[0]?.message) ||
        erro.message ||
        "Erro desconhecido";

    return {
        status,
        mensagem: String(mensagem).slice(0, 500)
    };
}

async function main() {
    const clientId = obrigatorio("BB_CLIENT_ID");
    const clientSecret = obrigatorio("BB_CLIENT_SECRET");

    const scope = String(
        process.env.BB_SCOPE_COBRANCAS || DEFAULT_SCOPE
    ).trim();

    const form = new URLSearchParams();
    form.set("grant_type", "client_credentials");
    form.set("scope", scope);

    console.log("[INFO] Testando OAuth Banco do Brasil - Homologação...");
    console.log(`[INFO] Endpoint: ${TOKEN_URL}`);
    console.log("[INFO] Credenciais carregadas localmente sem exibir valores.");

    try {
        const resposta = await axios.post(
            TOKEN_URL,
            form.toString(),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json"
                },
                auth: {
                    username: clientId,
                    password: clientSecret
                },
                timeout: 20000,
                validateStatus: status => status >= 200 && status < 300
            }
        );

        const token = resposta.data?.access_token;

        if (!token) {
            throw new Error(
                "OAuth respondeu com sucesso, mas sem access_token"
            );
        }

        console.log(`[OK] OAuth BB respondeu HTTP ${resposta.status}.`);
        console.log("[OK] Token recebido: sim (valor oculto).");
        console.log(`[OK] Tipo: ${resposta.data?.token_type || "Bearer"}.`);
        console.log(
            `[OK] Expira em: ${resposta.data?.expires_in ?? "não informado"} segundos.`
        );
        console.log("TOKEN_BB_HML_OK");
    } catch (erro) {
        const seguro = resumoErro(erro);

        console.error("TESTE_TOKEN_BB_FALHOU");
        console.error(`HTTP: ${seguro.status ?? "sem resposta HTTP"}`);
        console.error(`Mensagem: ${seguro.mensagem}`);
        process.exitCode = 1;
    }
}

main();
