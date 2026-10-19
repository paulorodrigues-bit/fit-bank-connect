"use strict";

require("dotenv").config();

const axios = require("axios");

function dois(n) {
    return String(n).padStart(2, "0");
}

function dataIsoMaisDias(dias) {
    const data = new Date();
    data.setDate(data.getDate() + dias);
    return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`;
}

function obrigatorioEnv(nome) {
    const valor = String(process.env[nome] || "").trim();

    if (!valor) {
        throw new Error(`${nome} não configurado no .env`);
    }

    return valor;
}

function clienteBExiste() {
    return String(
        process.env.FIT_TESTE_CLIENTE_B_ID ||
        "cliente-teste-b"
    ).trim();
}

async function main() {
    const apiKey = obrigatorioEnv("FIT_API_KEY");
    const baseUrl = String(
        process.env.FIT_BANK_BASE_URL ||
        "http://localhost:3001"
    ).replace(/\/+$/, "");

    const clienteA = String(
        process.env.FIT_DEV_CLIENTE_ID || "fit-dev"
    ).trim();

    const clienteB = clienteBExiste();
    const sufixo = String(Date.now()).slice(-8);
    const idempotencyKey = `NEUTRA-BB-${Date.now()}`;

    const payload = {
        banco: "bb",
        titulo: `BBN${sufixo}`,
        valor: 12.34,
        vencimento: dataIsoMaisDias(7),
        pagador: {
            nome: "TECIDOS FARIA DUARTE",
            documento: "74910037000193",
            endereco: "AVENIDA TESTE 100",
            cep: "70040900",
            cidade: "BRASILIA",
            bairro: "CENTRO",
            uf: "DF"
        }
    };

    console.log("[INFO] Testando API neutra de cobranças com Banco do Brasil...");
    console.log("[INFO] Credenciais e tokens permanecerão ocultos.");

    const headersA = {
        "X-FIT-API-Key": apiKey,
        "X-FIT-Cliente-Id": clienteA,
        "Idempotency-Key": idempotencyKey,
        "Content-Type": "application/json"
    };

    const primeira = await axios.post(
        `${baseUrl}/api/v1/cobrancas`,
        payload,
        {
            headers: headersA,
            validateStatus: () => true,
            timeout: 30000
        }
    );

    if (primeira.status !== 201) {
        throw new Error(
            `Primeira emissão esperava HTTP 201 e recebeu ${primeira.status}: ${JSON.stringify(primeira.data).slice(0, 500)}`
        );
    }

    const idFit = primeira.data?.transacao?.id;

    if (!idFit) {
        throw new Error("API neutra respondeu sem transacao.id");
    }

    if (primeira.data?.resultado?.banco !== "bb") {
        throw new Error("Resposta não foi normalizada como banco=bb");
    }

    console.log("[OK] API neutra emitiu cobrança BB e respondeu HTTP 201.");
    console.log(`[OK] Transação FIT criada: ${idFit}`);

    const repetida = await axios.post(
        `${baseUrl}/api/v1/cobrancas`,
        payload,
        {
            headers: headersA,
            validateStatus: () => true,
            timeout: 30000
        }
    );

    if (
        repetida.status !== 200 ||
        repetida.data?.idempotente !== true ||
        repetida.data?.transacao?.id !== idFit
    ) {
        throw new Error(
            `Idempotência neutra falhou. HTTP ${repetida.status}`
        );
    }

    console.log("[OK] Repetição com a mesma Idempotency-Key foi bloqueada como duplicata.");

    const consultaA = await axios.get(
        `${baseUrl}/api/v1/transacoes/${encodeURIComponent(idFit)}`,
        {
            headers: {
                "X-FIT-API-Key": apiKey,
                "X-FIT-Cliente-Id": clienteA
            },
            validateStatus: () => true,
            timeout: 20000
        }
    );

    if (
        consultaA.status !== 200 ||
        consultaA.data?.transacao?.banco !== "bb"
    ) {
        throw new Error(
            `Persistência BB não validada. HTTP ${consultaA.status}`
        );
    }

    console.log("[OK] Transação BB persistida e consultável pelo cliente dono.");

    const consultaB = await axios.get(
        `${baseUrl}/api/v1/transacoes/${encodeURIComponent(idFit)}`,
        {
            headers: {
                "X-FIT-API-Key": apiKey,
                "X-FIT-Cliente-Id": clienteB
            },
            validateStatus: () => true,
            timeout: 20000
        }
    );

    if (consultaB.status !== 404) {
        throw new Error(
            `Isolamento multi-cliente esperava HTTP 404 para cliente B e recebeu ${consultaB.status}`
        );
    }

    console.log("[OK] Cliente B não consegue consultar a cobrança BB do fit-dev.");
    console.log("[OK] O mesmo contrato FIT agora pode rotear cobranças por banco.");
    console.log("API_NEUTRA_BB_V17_OK");
}

main().catch(erro => {
    console.error("TESTE_API_NEUTRA_BB_FALHOU");
    console.error(`Mensagem: ${erro.message}`);
    process.exitCode = 1;
});
