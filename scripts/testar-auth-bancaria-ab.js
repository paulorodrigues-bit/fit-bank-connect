require("dotenv").config();

const BASE_URL = String(process.env.FIT_BANK_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
const apiKey = String(process.env.FIT_API_KEY || "").trim();

if (!apiKey) {
    console.error("FALHA: FIT_API_KEY não configurada no .env");
    process.exit(1);
}

async function consultar(cliente, id) {
    const resposta = await fetch(`${BASE_URL}/api/v1/boletos/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: {
            "X-FIT-API-Key": apiKey,
            "X-FIT-Cliente-Id": cliente
        }
    });

    let corpo = null;
    try {
        corpo = await resposta.json();
    } catch (_) {
        corpo = null;
    }

    return {
        status: resposta.status,
        corpo
    };
}

async function executar() {
    const aAntes = await consultar("fit-dev", "FIT-20260908-000011");
    console.log(`fit-dev antes -> HTTP ${aAntes.status}`);

    if (aAntes.status !== 200) {
        throw new Error("fit-dev não conseguiu autenticar no Itaú antes do teste B.");
    }

    const b = await consultar("cliente-teste-b", "FIT-20260910-000016");
    console.log(`cliente-teste-b -> HTTP ${b.status}`);

    if (b.status === 200) {
        throw new Error("FALHA DE ISOLAMENTO: Cliente B conseguiu consultar o Itaú com uma credencial deliberadamente inválida.");
    }

    const detalhe = String(b.corpo?.detalhe || b.corpo?.mensagem || "");

    if (detalhe.includes("não possui configuração bancária")) {
        throw new Error("Cliente B não carregou a configuração própria de teste.");
    }

    const aDepois = await consultar("fit-dev", "FIT-20260908-000011");
    console.log(`fit-dev depois -> HTTP ${aDepois.status}`);

    if (aDepois.status !== 200) {
        throw new Error("Credencial do Cliente B interferiu na autenticação do fit-dev.");
    }

    console.log("[OK] Cliente A continuou usando sua própria credencial.");
    console.log("[OK] Cliente B usou uma configuração diferente e falhou isoladamente no Itaú.");
    console.log("[OK] A falha do Cliente B não contaminou o Cliente A.");
    console.log("TESTE_AUTH_BANCARIA_AB_OK");
}

executar()
    .then(() => process.exit(0))
    .catch(erro => {
        console.error("TESTE_FALHOU:", erro.message);
        process.exit(1);
    });
