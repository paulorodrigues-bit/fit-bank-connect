require("dotenv").config();

const http = require("http");

const API_KEY = process.env.FIT_API_KEY;
const HOST = "localhost";
const PORT = Number(process.env.PORT || 3001);

if (!API_KEY) {
    console.error("TESTE_FALHOU: FIT_API_KEY não configurada.");
    process.exit(1);
}

function requisicao({ metodo, caminho, cliente, corpo }) {
    return new Promise((resolve, reject) => {
        const body = corpo ? JSON.stringify(corpo) : null;

        const req = http.request(
            {
                host: HOST,
                port: PORT,
                path: caminho,
                method: metodo,
                headers: {
                    "X-FIT-API-Key": API_KEY,
                    "X-FIT-Cliente-Id": cliente,
                    ...(body
                        ? {
                            "Content-Type": "application/json",
                            "Content-Length": Buffer.byteLength(body)
                        }
                        : {})
                }
            },
            res => {
                let texto = "";

                res.on("data", chunk => {
                    texto += chunk;
                });

                res.on("end", () => {
                    let json = null;

                    try {
                        json = texto ? JSON.parse(texto) : null;
                    } catch (_) {
                        json = null;
                    }

                    resolve({
                        status: res.statusCode,
                        json,
                        texto
                    });
                });
            }
        );

        req.on("error", reject);

        if (body) {
            req.write(body);
        }

        req.end();
    });
}

(async () => {
    const movimento = {
        banco: "itau",
        data_movimento: "2026-09-10",
        tipo: "DEBITO",
        valor: 10.50,
        pagamento_saida_id: "FIT-PAG-20260909-000003",
        id_titulo: "IDEMP-CLIENTES-001",
        documento: "12345678901",
        historico: "TESTE CONCILIACAO CONTAS A PAGAR MULTICLIENTE"
    };

    const a = await requisicao({
        metodo: "POST",
        caminho: "/api/v1/conciliacao/pagamentos/simular",
        cliente: "fit-dev",
        corpo: movimento
    });

    console.log(`fit-dev -> HTTP ${a.status}`);

    if (
        a.status !== 200 ||
        !a.json?.sucesso ||
        a.json?.melhor_match?.pagamento?.id !==
            "FIT-PAG-20260909-000003"
    ) {
        console.error(
            "TESTE_FALHOU: fit-dev não conciliou o próprio pagamento."
        );
        process.exit(1);
    }

    console.log(
        `[OK] fit-dev conciliou o próprio pagamento com score ${a.json.melhor_match.conciliacao.score}.`
    );

    const b = await requisicao({
        metodo: "POST",
        caminho: "/api/v1/conciliacao/pagamentos/simular",
        cliente: "cliente-teste-b",
        corpo: movimento
    });

    console.log(`cliente-teste-b -> HTTP ${b.status}`);

    if (
        b.status !== 200 ||
        b.json?.melhor_match !== null ||
        Number(b.json?.quantidade_candidatos || 0) !== 0
    ) {
        console.error(
            "TESTE_FALHOU: Cliente B conseguiu enxergar candidato do fit-dev."
        );
        process.exit(1);
    }

    console.log(
        "[OK] Cliente B não encontrou o pagamento pertencente ao fit-dev."
    );

    const detalhe = await requisicao({
        metodo: "GET",
        caminho: "/api/v1/pagamentos/FIT-PAG-20260909-000003",
        cliente: "fit-dev"
    });

    if (
        detalhe.status !== 200 ||
        detalhe.json?.pagamento?.status_conciliacao !==
            "SIMULADO_CONCILIADO"
    ) {
        console.error(
            "TESTE_FALHOU: status de conciliação do pagamento não foi atualizado."
        );
        process.exit(1);
    }

    console.log(
        "[OK] Pagamento ficou SIMULADO_CONCILIADO sem alterar o status bancário."
    );
    console.log("TESTE_CONCILIACAO_AP_MULTICLIENTE_OK");
})().catch(erro => {
    console.error(
        "TESTE_FALHOU:",
        erro.message
    );
    process.exit(1);
});
