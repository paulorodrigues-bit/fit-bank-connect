require("dotenv").config();

const axios = require("axios");


async function executar() {

    const apiKey =
        process.env.FIT_API_KEY;

    const cliente =
        process.env.FIT_DEV_CLIENTE_ID ||
        "fit-dev";

    const porta =
        process.env.PORT ||
        3001;


    if (!apiKey) {
        throw new Error(
            "FIT_API_KEY não configurada no .env"
        );
    }


    const http =
        axios.create({
            baseURL:
                `http://localhost:${porta}`,
            timeout:
                10000,
            headers: {
                "X-FIT-API-Key":
                    apiKey,
                "X-FIT-Cliente-Id":
                    cliente
            }
        });


    const rotas = [
        "/api/v1/transacoes",
        "/api/v1/conciliacoes",
        "/api/v1/pagamentos"
    ];


    for (
        const rota
        of rotas
    ) {

        const resposta =
            await http.get(
                rota
            );


        console.log(
            JSON.stringify(
                {
                    rota,
                    status:
                        resposta.status,
                    sucesso:
                        resposta.data
                            ?.sucesso ===
                        true,
                    quantidade:
                        resposta.data
                            ?.quantidade ??
                        null
                },
                null,
                2
            )
        );
    }


    console.log(
        "MULTICLIENTE_SMOKE_TEST_OK"
    );
}


executar()
    .catch(
        erro => {

            console.error(
                JSON.stringify(
                    {
                        sucesso:
                            false,
                        status:
                            erro.response
                                ?.status ||
                            null,
                        mensagem:
                            erro.response
                                ?.data
                                ?.mensagem ||
                            erro.message
                    },
                    null,
                    2
                )
            );

            process.exitCode =
                1;
        }
    );
