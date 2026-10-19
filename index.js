require("dotenv").config();

const express = require("express");
const crypto = require("crypto");

const {
    testarConexao
} = require("./src/database");

const {
    validarBoleto
} = require("./src/validators/boleto");

const {
    montarBoletoItau
} = require("./src/banks/itau");

const {
    enviarBoletoItau,
    consultarBoletoItau,
    baixarBoletoItau
} = require("./src/banks/itauClient");

const {
    normalizarRespostaBoletoItau
} = require("./src/banks/itauResponse");

const {
    extrairLiquidacoesExtratoItau
} = require("./src/banks/itauExtrato");

const {
    criarTransacao,
    atualizarTransacao,
    buscarPorIdempotencia,
    buscarTransacaoPorId,
    validarMesmoPayload,
    listarTransacoes,
    registrarEvento,
    listarEventos,
    registrarPagamentosRecebidos,
    listarPagamentosRecebidos,
    calcularResumoPagamentos
} = require("./src/services/transacoes");

const {
    processarMovimento,
    listarConciliacoes
} = require("./src/services/conciliacao");

const {
    processarConciliacaoPagamentoSaida,
    listarConciliacoesPagamentosSaida
} = require("./src/services/conciliacaoPagamentosSaida");

const {
    criarPagamentoSaida,
    buscarPagamentoSaidaPorId,
    aprovarPagamentoSaida,
    listarPagamentosSaida,
    listarEventosPagamentoSaida
} = require("./src/services/pagamentosSaida");

const {
    autenticarClienteIntegracao,
    buscarClienteDev
} = require("./src/services/clientesIntegracao");

const {
    emitirCobrancaNeutra
} = require("./src/services/cobrancasNeutras");


const app = express();


/*
=================================
CONFIGURAÇÃO EXPRESS
=================================
*/

app.disable("x-powered-by");

app.use(
    express.json({
        limit: "500kb"
    })
);


/*
=================================
HEADERS DE SEGURANÇA
=================================
*/

app.use(
    (
        req,
        res,
        next
    ) => {

        res.setHeader(
            "X-Content-Type-Options",
            "nosniff"
        );

        res.setHeader(
            "Referrer-Policy",
            "no-referrer"
        );

        if (
            req.path.startsWith(
                "/api/"
            )
        ) {

            res.setHeader(
                "Cache-Control",
                "no-store"
            );

            res.setHeader(
                "Pragma",
                "no-cache"
            );
        }

        next();
    }
);


app.use(
    express.static("public")
);


/*
=================================
UTILITÁRIOS
=================================
*/

function extrairMensagemErro(
    erro
) {

    return (
        erro.response
            ?.data
            ?.mensagem ||

        erro.response
            ?.data
            ?.message ||

        erro.message ||

        "Erro desconhecido"
    );
}


/*
=================================
SEGURANÇA FIT
=================================
*/

async function validarApiKeyFit(
    req,
    res,
    next
) {

    try {

        const ambienteNode =
            String(
                process.env.NODE_ENV ||
                "development"
            )
                .trim()
                .toLowerCase();


        let referenciaCliente =
            req.get(
                "X-FIT-Cliente-Id"
            );


        if (
            !referenciaCliente &&
            ambienteNode !== "production"
        ) {
            referenciaCliente =
                process.env
                    .FIT_DEV_CLIENTE_ID ||
                "fit-dev";
        }


        if (!referenciaCliente) {

            return res
                .status(400)
                .json({
                    sucesso: false,
                    mensagem:
                        "X-FIT-Cliente-Id é obrigatório"
                });
        }


        const chaveRecebida =
            req.get(
                "X-FIT-API-Key"
            );


        const cliente =
            await autenticarClienteIntegracao({
                referencia:
                    referenciaCliente,
                apiKey:
                    chaveRecebida
            });


        req.clienteIntegracao = {
            id:
                cliente.id,
            nome:
                cliente.nome,
            identificador:
                cliente.identificador
        };


        next();


    } catch (erro) {

        if (
            [
                "FIT_CLIENTE_NAO_ENCONTRADO",
                "FIT_CLIENTE_INATIVO"
            ].includes(
                erro.code
            )
        ) {
            return res
                .status(403)
                .json({
                    sucesso: false,
                    mensagem:
                        "Cliente de integração não autorizado"
                });
        }


        if (
            [
                "FIT_CLIENTE_API_KEY_INVALIDA",
                "FIT_CLIENTE_API_KEY_NAO_CONFIGURADA"
            ].includes(
                erro.code
            )
        ) {
            return res
                .status(401)
                .json({
                    sucesso: false,
                    mensagem:
                        "Não autorizado"
                });
        }


        console.error(
            "Erro autenticação cliente:",
            erro.message
        );


        return res
            .status(500)
            .json({
                sucesso: false,
                mensagem:
                    "Falha ao validar contexto do cliente"
            });
    }
}


async function resolverClienteWebDev(
    req,
    res,
    next
) {

    try {

        const cliente =
            await buscarClienteDev();


        req.clienteIntegracao = {
            id:
                cliente.id,
            nome:
                cliente.nome,
            identificador:
                cliente.identificador
        };


        next();


    } catch (erro) {

        console.error(
            "Erro cliente web dev:",
            erro.message
        );


        return res
            .status(500)
            .json({
                sucesso: false,
                mensagem:
                    "Cliente de desenvolvimento não configurado"
            });
    }
}


/*
=================================
PROTEÇÃO DA ROTA WEB
=================================
*/

function bloquearRotaWebEmProducao(
    req,
    res,
    next
) {

    const ambienteNode =
        String(
            process.env.NODE_ENV ||
            ""
        ).toLowerCase();


    if (
        ambienteNode ===
        "production"
    ) {

        return res
            .status(403)
            .json({
                sucesso: false,
                mensagem:
                    "Emissão web desabilitada em produção sem autenticação"
            });
    }


    next();
}


/*
=================================
STATUS DA COBRANÇA
=================================
*/

function extrairSituacaoBoleto(
    respostaBanco
) {

    return (
        respostaBanco
            ?.data
            ?.[0]
            ?.dado_boleto
            ?.dados_individuais_boleto
            ?.[0]
            ?.situacao_geral_boleto ||

        respostaBanco
            ?.data
            ?.dado_boleto
            ?.dados_individuais_boleto
            ?.[0]
            ?.situacao_geral_boleto ||

        respostaBanco
            ?.dado_boleto
            ?.dados_individuais_boleto
            ?.[0]
            ?.situacao_geral_boleto ||

        respostaBanco
            ?.situacao_geral_boleto ||

        null
    );
}


function normalizarStatusCobranca(
    situacao
) {

    if (!situacao) {

        return null;
    }


    const valor =
        String(situacao)
            .trim()
            .toLowerCase();


    if (
        valor === "em aberto"
    ) {

        return "EM_ABERTO";
    }


    if (
        valor ===
            "aguardando confirmação de pagamento" ||

        valor ===
            "aguardando confirmacao de pagamento"
    ) {

        return "AGUARDANDO_CONFIRMACAO";
    }


    if (
        valor === "paga" ||
        valor === "pago"
    ) {

        return "PAGO";
    }


    if (
        valor === "baixada" ||
        valor === "baixado"
    ) {

        return "BAIXADO";
    }


    return String(situacao)
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .replace(
            /[^A-Z0-9]+/g,
            "_"
        )
        .replace(
            /^_+|_+$/g,
            ""
        );
}


/*
=================================
PROTEÇÃO SANDBOX
=================================
*/

function resolverStatusCobranca({
    statusAtual,
    statusRecebido
}) {

    const ambiente =
        String(
            process.env.ITAU_ENV ||
            ""
        ).toLowerCase();


    const resposta = {

        status:
            statusRecebido ||
            statusAtual ||
            null,

        protecaoAplicada:
            false,

        motivo:
            null
    };


    if (
        ambiente !==
        "sandbox"
    ) {

        return resposta;
    }


    /*
    No Sandbox do Itaú, as consultas podem devolver
    dados fixos/simulados que não pertencem ao boleto
    emitido pelo FIT Bank Connect.

    Por segurança, uma consulta Sandbox nunca altera
    o status financeiro local já conhecido.
    */

    resposta.status =
        statusAtual ||
        statusRecebido ||
        null;

    resposta.protecaoAplicada =
        true;

    resposta.motivo =
        "Resposta simulada do Itaú Sandbox não altera o estado financeiro do título FIT";


    return resposta;
}


/*
=================================
PAGAMENTOS RECEBIDOS
=================================
*/

function extrairPagamentosBoleto(
    respostaBanco
) {

    const pagamentos =

        respostaBanco
            ?.data
            ?.[0]
            ?.dado_boleto
            ?.pagamentos_cobranca ||

        respostaBanco
            ?.data
            ?.dado_boleto
            ?.pagamentos_cobranca ||

        respostaBanco
            ?.dado_boleto
            ?.pagamentos_cobranca ||

        [];


    if (
        !Array.isArray(
            pagamentos
        )
    ) {

        return [];
    }


    return pagamentos;
}


function resumirPagamentosConsulta(
    pagamentos
) {

    const lista =
        Array.isArray(
            pagamentos
        )
            ? pagamentos
            : [];


    let valorTotal =
        0;

    let ultimaDataPagamento =
        null;


    for (
        const pagamento
        of lista
    ) {

        const valor =
            Number(
                pagamento
                    ?.valor_pago_total_cobranca ||
                pagamento
                    ?.valor_pago ||
                0
            );


        if (
            Number.isFinite(
                valor
            )
        ) {

            valorTotal +=
                valor;
        }


        const dataPagamento =
            pagamento
                ?.data_inclusao_pagamento ||
            pagamento
                ?.data_pagamento ||
            null;


        if (
            dataPagamento &&
            (
                !ultimaDataPagamento ||
                String(
                    dataPagamento
                ) >
                String(
                    ultimaDataPagamento
                )
            )
        ) {

            ultimaDataPagamento =
                dataPagamento;
        }
    }


    return {

        quantidade_pagamentos:
            lista.length,

        valor_pago_total:
            Number(
                valorTotal.toFixed(
                    2
                )
            ),

        ultima_data_pagamento:
            ultimaDataPagamento
    };
}


/*
=================================
PRÉ-CONCILIAÇÃO
=================================
*/

function analisarPagamento({
    valorTitulo,
    valorPagoTotal,
    quantidadePagamentos,
    ambiente
}) {

    const valorTituloNumero =
        Number(
            valorTitulo ||
            0
        );


    const valorPagoNumero =
        Number(
            valorPagoTotal ||
            0
        );


    const quantidade =
        Number(
            quantidadePagamentos ||
            0
        );


    const diferenca =
        Number(
            (
                valorPagoNumero -
                valorTituloNumero
            ).toFixed(2)
        );


    if (
        ambiente ===
            "sandbox" &&

        quantidade >
            0
    ) {

        return {
            status: "SIMULADO",
            valorTitulo:
                valorTituloNumero,
            valorPago:
                valorPagoNumero,
            diferenca,
            quantidadePagamentos:
                quantidade,
            simulado: true
        };
    }


    if (
        quantidade ===
        0
    ) {

        return {
            status:
                "NAO_INICIADA",
            valorTitulo:
                valorTituloNumero,
            valorPago:
                0,
            diferenca:
                -valorTituloNumero,
            quantidadePagamentos:
                0,
            simulado: false
        };
    }


    if (
        Math.abs(
            diferenca
        ) <= 0.01
    ) {

        return {
            status:
                "PAGAMENTO_IDENTIFICADO",
            valorTitulo:
                valorTituloNumero,
            valorPago:
                valorPagoNumero,
            diferenca,
            quantidadePagamentos:
                quantidade,
            simulado: false
        };
    }


    if (
        valorPagoNumero <
        valorTituloNumero
    ) {

        return {
            status:
                "PAGAMENTO_PARCIAL",
            valorTitulo:
                valorTituloNumero,
            valorPago:
                valorPagoNumero,
            diferenca,
            quantidadePagamentos:
                quantidade,
            simulado: false
        };
    }


    return {
        status:
            "VALOR_DIVERGENTE",
        valorTitulo:
            valorTituloNumero,
        valorPago:
            valorPagoNumero,
        diferenca,
        quantidadePagamentos:
            quantidade,
        simulado: false
    };
}


/*
=================================
RESPOSTA SEGURA
CONTAS A PAGAR
=================================
*/

function formatarPagamentoSaida(
    pagamento
) {

    if (!pagamento) {

        return null;
    }


    return {

        id:
            pagamento.id,

        banco:
            pagamento.banco,

        empresa:
            pagamento.empresa,

        id_titulo:
            pagamento.id_titulo,

        tipo_pagamento:
            pagamento.tipo_pagamento,

        valor:
            Number(
                pagamento.valor ||
                0
            ),

        data_pagamento:
            pagamento.data_pagamento,

        favorecido_nome:
            pagamento.favorecido_nome,

        favorecido_documento_final4:
            pagamento
                .favorecido_documento_final4,

        destino_mascarado:
            pagamento
                .destino_mascarado,

        status:
            pagamento.status,

        status_conciliacao:
            pagamento.status_conciliacao ||
            "NAO_INICIADA",

        movimento_conciliado_id:
            pagamento.movimento_conciliado_id ||
            null,

        conciliado_em:
            pagamento.conciliado_em ||
            null,

        status_banco:
            pagamento.status_banco,

        cod_pagamento_banco:
            pagamento
                .cod_pagamento_banco,

        numero_lote:
            pagamento.numero_lote,

        numero_lancamento:
            pagamento
                .numero_lancamento,

        aprovado_por:
            pagamento.aprovado_por,

        aprovado_em:
            pagamento.aprovado_em,

        enviado_em:
            pagamento.enviado_em,

        concluido_em:
            pagamento.concluido_em,

        erro:
            pagamento.erro,

        criado_em:
            pagamento.criado_em,

        atualizado_em:
            pagamento.atualizado_em
    };
}


/*
=================================
ERROS CONTAS A PAGAR
=================================
*/

function responderErroPagamentoSaida(
    res,
    erro
) {

    if (
        erro.code ===
        "FIT_PAGAMENTO_INVALIDO"
    ) {

        return res
            .status(400)
            .json({
                sucesso: false,
                mensagem:
                    "Pagamento inválido",
                erros:
                    erro.detalhes ||
                    []
            });
    }


    if (
        erro.code ===
            "FIT_IDEMPOTENCY_REQUIRED" ||

        erro.code ===
            "FIT_IDEMPOTENCY_INVALID" ||

        erro.code ===
            "FIT_APROVADOR_INVALIDO"
    ) {

        return res
            .status(400)
            .json({
                sucesso: false,
                mensagem:
                    erro.message
            });
    }


    if (
        erro.code ===
        "FIT_IDEMPOTENCY_CONFLICT"
    ) {

        return res
            .status(409)
            .json({
                sucesso: false,
                mensagem:
                    "Conflito de idempotência"
            });
    }


    if (
        erro.code ===
        "FIT_PAGAMENTO_NOT_FOUND"
    ) {

        return res
            .status(404)
            .json({
                sucesso: false,
                mensagem:
                    "Pagamento não encontrado"
            });
    }


    if (
        erro.code ===
            "FIT_STATUS_INVALIDO" ||

        erro.code ===
            "FIT_STATUS_CONCORRENTE"
    ) {

        return res
            .status(409)
            .json({
                sucesso: false,
                mensagem:
                    erro.message
            });
    }


    console.error(
        "Erro Contas a Pagar:",
        erro.message
    );


    return res
        .status(500)
        .json({
            sucesso: false,
            mensagem:
                "Falha ao processar pagamento"
        });
}


/*
=================================
CONTAS A PAGAR
CRIAR PAGAMENTO

NÃO ENVIA AO BANCO.
=================================
*/

app.post(
    "/api/v1/pagamentos",

    validarApiKeyFit,

    async (
        req,
        res
    ) => {

        try {

            const idempotencyKey =
                req.get(
                    "Idempotency-Key"
                );


            const resultado =
                await criarPagamentoSaida(
                    req.body,
                    idempotencyKey,
                    req.clienteIntegracao.id
                );


            return res
                .status(
                    resultado
                        .idempotente
                        ? 200
                        : 201
                )
                .json({

                    sucesso:
                        true,

                    idempotente:
                        resultado
                            .idempotente,

                    banco_enviado:
                        false,

                    mensagem:
                        resultado
                            .idempotente

                            ? "Pagamento já existente"

                            : "Pagamento criado e aguardando aprovação",

                    pagamento:
                        formatarPagamentoSaida(
                            resultado.pagamento
                        )
                });


        } catch (erro) {

            return responderErroPagamentoSaida(
                res,
                erro
            );
        }
    }
);


/*
=================================
CONTAS A PAGAR
LISTAR
=================================
*/

app.get(
    "/api/v1/pagamentos",

    validarApiKeyFit,

    async (
        req,
        res
    ) => {

        try {

            const pagamentos =
                await listarPagamentosSaida(
                    100,
                    req.clienteIntegracao.id
                );


            return res.json({

                sucesso:
                    true,

                quantidade:
                    pagamentos.length,

                pagamentos:
                    pagamentos.map(
                        formatarPagamentoSaida
                    )
            });


        } catch (erro) {

            console.error(
                "Erro lista pagamentos:",
                erro.message
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    mensagem:
                        "Falha ao carregar pagamentos"
                });
        }
    }
);


/*
=================================
CONTAS A PAGAR
DETALHES
=================================
*/

app.get(
    "/api/v1/pagamentos/:id",

    validarApiKeyFit,

    async (
        req,
        res
    ) => {

        try {

            const pagamento =
                await buscarPagamentoSaidaPorId(
                    req.params.id,
                    req.clienteIntegracao.id
                );


            if (!pagamento) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        mensagem:
                            "Pagamento não encontrado"
                    });
            }


            const eventos =
                await listarEventosPagamentoSaida(
                    pagamento.id,
                    req.clienteIntegracao.id
                );


            return res.json({

                sucesso:
                    true,

                pagamento:
                    formatarPagamentoSaida(
                        pagamento
                    ),

                eventos
            });


        } catch (erro) {

            console.error(
                "Erro detalhe pagamento:",
                erro.message
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    mensagem:
                        "Falha ao consultar pagamento"
                });
        }
    }
);


/*
=================================
CONTAS A PAGAR
APROVAR

AINDA NÃO ENVIA AO ITAÚ.
=================================
*/

app.post(
    "/api/v1/pagamentos/:id/aprovar",

    validarApiKeyFit,

    async (
        req,
        res
    ) => {

        try {

            const aprovadoPor =
                req.body
                    ?.aprovado_por;


            const resultado =
                await aprovarPagamentoSaida(
                    req.params.id,
                    aprovadoPor,
                    req.clienteIntegracao.id
                );


            return res.json({

                sucesso:
                    true,

                idempotente:
                    resultado
                        .idempotente,

                banco_enviado:
                    false,

                mensagem:
                    "Pagamento aprovado e pronto para envio ao banco",

                pagamento:
                    formatarPagamentoSaida(
                        resultado.pagamento
                    )
            });


        } catch (erro) {

            return responderErroPagamentoSaida(
                res,
                erro
            );
        }
    }
);


/*
=================================
HISTÓRICO DE RECEBIMENTOS
=================================
*/

app.get(
    "/api/v1/transacoes",

    validarApiKeyFit,

    async (
        req,
        res
    ) => {

        try {

            const transacoes =
                await listarTransacoes(
                    100,
                    req.clienteIntegracao.id
                );


            return res.json({

                sucesso:
                    true,

                quantidade:
                    transacoes.length,

                transacoes
            });


        } catch (erro) {

            console.error(
                "Erro histórico:",
                erro.message
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    mensagem:
                        "Não foi possível carregar o histórico"
                });
        }
    }
);


/*
=================================
DETALHES DA TRANSAÇÃO
=================================
*/

app.get(
    "/api/v1/transacoes/:id",

    validarApiKeyFit,

    async (
        req,
        res
    ) => {

        try {

            const transacao =
                await buscarTransacaoPorId(
                    req.params.id,
                    req.clienteIntegracao.id
                );


            if (!transacao) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        mensagem:
                            "Transação não encontrada"
                    });
            }


            const eventos =
                await listarEventos(
                    transacao.id,
                    req.clienteIntegracao.id
                );


            const pagamentos =
                await listarPagamentosRecebidos(
                    transacao.id,
                    req.clienteIntegracao.id
                );


            return res.json({

                sucesso:
                    true,

                transacao,

                pagamentos,

                eventos
            });


        } catch (erro) {

            console.error(
                "Erro detalhe transação:",
                erro.message
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    mensagem:
                        "Falha ao consultar transação"
                });
        }
    }
);


/*
=================================
PAGAMENTOS RECEBIDOS DO BOLETO
=================================
*/

app.get(
    "/api/v1/boletos/:idFit/pagamentos",

    validarApiKeyFit,

    async (
        req,
        res
    ) => {

        try {

            const transacao =
                await buscarTransacaoPorId(
                    req.params.idFit,
                    req.clienteIntegracao.id
                );


            if (!transacao) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        mensagem:
                            "Boleto não encontrado"
                    });
            }


            const pagamentos =
                await listarPagamentosRecebidos(
                    transacao.id,
                    req.clienteIntegracao.id
                );


            const resumo =
                await calcularResumoPagamentos(
                    transacao.id,
                    req.clienteIntegracao.id
                );


            const ambiente =
                String(
                    process.env.ITAU_ENV ||
                    "sandbox"
                ).toLowerCase();


            const analise =
                analisarPagamento({

                    valorTitulo:
                        transacao.valor,

                    valorPagoTotal:
                        resumo
                            .valor_pago_total,

                    quantidadePagamentos:
                        resumo
                            .quantidade_pagamentos,

                    ambiente
                });


            return res.json({

                sucesso:
                    true,

                transacao: {

                    id:
                        transacao.id,

                    valor:
                        transacao.valor,

                    status_cobranca:
                        transacao
                            .status_cobranca,

                    status_conciliacao:
                        transacao
                            .status_conciliacao,

                    status_recebimento:
                        transacao
                            .status_recebimento,

                    saldo_restante:
                        transacao
                            .saldo_restante
                },

                resumo: {

                    quantidade_pagamentos:
                        Number(
                            resumo
                                .quantidade_pagamentos ||
                            0
                        ),

                    valor_pago_total:
                        Number(
                            resumo
                                .valor_pago_total ||
                            0
                        ),

                    ultima_data_pagamento:
                        resumo
                            .ultima_data_pagamento,

                    quantidade_simulados:
                        Number(
                            resumo
                                .quantidade_simulados ||
                            0
                        )
                },

                analise,

                pagamentos
            });


        } catch (erro) {

            console.error(
                "Erro pagamentos recebidos:",
                erro.message
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    mensagem:
                        "Falha ao consultar pagamentos"
                });
        }
    }
);


/*
=================================
SIMULAÇÃO MANUAL
CONCILIAÇÃO
=================================
*/

app.post(
    "/api/v1/conciliacao/simular",

    validarApiKeyFit,

    async (
        req,
        res
    ) => {

        try {

            const ambiente =
                String(
                    process.env.ITAU_ENV ||
                    ""
                ).toLowerCase();


            if (
                ambiente !==
                "sandbox"
            ) {

                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        mensagem:
                            "Simulação disponível somente em ambiente Sandbox"
                    });
            }


            const resultado =
                await processarMovimento(
                    {
                        ...req.body,
                        cliente_integracao_id:
                            req.clienteIntegracao.id
                    },
                    "sandbox"
                );


            return res.json({

                sucesso:
                    true,

                ambiente:
                    "sandbox",

                movimento:
                    resultado.movimento,

                melhor_match:
                    resultado
                        .melhor_match,

                quantidade_candidatos:
                    resultado
                        .candidatos
                        ?.length ||
                    0,

                candidatos:
                    resultado
                        .candidatos,

                mensagem:
                    resultado
                        .mensagem ||
                    null
            });


        } catch (erro) {

            if (
                erro.code ===
                "FIT_MOVIMENTO_INVALIDO"
            ) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        mensagem:
                            "Movimento bancário inválido",

                        erros:
                            erro
                                .detalhes ||
                            []
                    });
            }


            console.error(
                "Erro conciliação:",
                erro.message
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    mensagem:
                        "Falha ao processar conciliação"
                });
        }
    }
);


/*
=================================
SIMULAÇÃO EXTRATO ITAÚ
=================================
*/

app.post(
    "/api/v1/extrato-itau/simular",

    validarApiKeyFit,

    async (
        req,
        res
    ) => {

        try {

            const ambiente =
                String(
                    process.env.ITAU_ENV ||
                    ""
                ).toLowerCase();


            if (
                ambiente !==
                "sandbox"
            ) {

                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        mensagem:
                            "Simulação do Extrato Itaú permitida somente em Sandbox"
                    });
            }


            const respostaItau =
                req.body;


            if (
                !respostaItau ||
                !Array.isArray(
                    respostaItau.data
                )
            ) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        mensagem:
                            "Resposta de Extrato Itaú inválida",

                        detalhe:
                            "O campo data deve ser uma lista"
                    });
            }


            const liquidacoes =
                extrairLiquidacoesExtratoItau(
                    respostaItau
                );


            const resultados =
                [];


            for (
                const liquidacao
                of liquidacoes
            ) {

                const resultado =
                    await processarMovimento(
                        {
                            ...liquidacao,
                            cliente_integracao_id:
                                req.clienteIntegracao.id
                        },
                        "sandbox"
                    );


                resultados.push({

                    movimento_normalizado:
                        liquidacao,

                    conciliacao:
                        resultado
                });
            }


            const matchesExatos =
                resultados.filter(
                    item =>
                        item.conciliacao
                            ?.melhor_match
                            ?.conciliacao
                            ?.status ===
                        "SIMULADO_MATCH_EXATO"
                );


            const matchesProvaveis =
                resultados.filter(
                    item =>
                        item.conciliacao
                            ?.melhor_match
                            ?.conciliacao
                            ?.status ===
                        "SIMULADO_MATCH_PROVAVEL"
                );


            const semMatch =
                resultados.filter(
                    item =>
                        !item.conciliacao
                            ?.melhor_match
                );


            return res.json({

                sucesso:
                    true,

                ambiente:
                    "sandbox",

                origem:
                    "itau_extrato_francesa",

                resumo: {

                    itens_recebidos:
                        respostaItau
                            .data
                            .length,

                    liquidacoes_encontradas:
                        liquidacoes.length,

                    liquidacoes_processadas:
                        resultados.length,

                    matches_exatos:
                        matchesExatos.length,

                    matches_provaveis:
                        matchesProvaveis.length,

                    sem_match:
                        semMatch.length
                },

                resultados
            });


        } catch (erro) {

            if (
                erro.code ===
                "FIT_MOVIMENTO_INVALIDO"
            ) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        mensagem:
                            "Movimentação do Extrato Itaú inválida",

                        erros:
                            erro
                                .detalhes ||
                            []
                    });
            }


            console.error(
                "Erro simulação Extrato Itaú:",
                erro.message
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    mensagem:
                        "Falha ao processar Extrato Itaú"
                });
        }
    }
);


/*
=================================
SIMULAÇÃO CONCILIAÇÃO
CONTAS A PAGAR
=================================
*/

app.post(
    "/api/v1/conciliacao/pagamentos/simular",

    validarApiKeyFit,

    async (
        req,
        res
    ) => {

        try {

            const ambiente =
                String(
                    process.env.ITAU_ENV ||
                    ""
                ).toLowerCase();


            if (
                ambiente !==
                "sandbox"
            ) {

                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        mensagem:
                            "Simulação disponível somente em ambiente Sandbox"
                    });
            }


            const resultado =
                await processarConciliacaoPagamentoSaida(
                    {
                        ...req.body,
                        cliente_integracao_id:
                            req.clienteIntegracao.id,
                        tipo:
                            "DEBITO"
                    },
                    "sandbox"
                );


            return res.json({
                sucesso: true,
                ambiente: "sandbox",
                movimento:
                    resultado.movimento,
                melhor_match:
                    resultado.melhor_match,
                quantidade_candidatos:
                    resultado.quantidade_candidatos,
                candidatos:
                    resultado.candidatos,
                ambiguo:
                    resultado.ambiguo,
                mensagem:
                    resultado.mensagem
            });


        } catch (erro) {

            if (
                erro.code ===
                "FIT_CONCILIACAO_AP_INVALIDA" ||
                erro.code ===
                "FIT_MOVIMENTO_INVALIDO"
            ) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        mensagem:
                            "Movimento de Contas a Pagar inválido",
                        erros:
                            erro.detalhes ||
                            []
                    });
            }


            console.error(
                "Erro conciliação Contas a Pagar:",
                erro.message
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    mensagem:
                        "Falha ao processar conciliação de Contas a Pagar"
                });
        }
    }
);


/*
=================================
LISTAR CONCILIAÇÕES
CONTAS A PAGAR
=================================
*/

app.get(
    "/api/v1/conciliacoes/pagamentos",

    validarApiKeyFit,

    async (
        req,
        res
    ) => {

        try {

            const conciliacoes =
                await listarConciliacoesPagamentosSaida(
                    req.clienteIntegracao.id,
                    100
                );


            return res.json({
                sucesso: true,
                quantidade:
                    conciliacoes.length,
                conciliacoes
            });


        } catch (erro) {

            console.error(
                "Erro ao listar conciliações de Contas a Pagar:",
                erro.message
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    mensagem:
                        "Falha ao carregar conciliações de Contas a Pagar"
                });
        }
    }
);


/*
=================================
LISTAR CONCILIAÇÕES
=================================
*/

app.get(
    "/api/v1/conciliacoes",

    validarApiKeyFit,

    async (
        req,
        res
    ) => {

        try {

            const conciliacoes =
                await listarConciliacoes(
                    100,
                    req.clienteIntegracao.id
                );


            return res.json({

                sucesso:
                    true,

                quantidade:
                    conciliacoes.length,

                conciliacoes
            });


        } catch (erro) {

            console.error(
                "Erro ao listar conciliações:",
                erro.message
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    mensagem:
                        "Falha ao carregar conciliações"
                });
        }
    }
);


/*
=================================
API NEUTRA DE COBRANÇAS
=================================
*/

app.post(
    "/api/v1/cobrancas",

    validarApiKeyFit,

    async (
        req,
        res
    ) => {

        try {

            const chaveIdempotencia =
                req.get(
                    "Idempotency-Key"
                );


            if (!chaveIdempotencia) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        mensagem:
                            "Idempotency-Key obrigatória"
                    });
            }


            const resultado =
                await emitirCobrancaNeutra({
                    clienteIntegracaoId:
                        req.clienteIntegracao.id,
                    chaveIdempotencia,
                    entrada:
                        req.body
                });


            return res
                .status(
                    resultado.idempotente
                        ? 200
                        : 201
                )
                .json({
                    versao:
                        "FIT-BANK-V1",
                    sucesso:
                        resultado.transacao
                            ?.status === "PROCESSADO",
                    idempotente:
                        resultado.idempotente,
                    transacao: {
                        id:
                            resultado.transacao.id,
                        banco:
                            resultado.transacao.banco,
                        status:
                            resultado.transacao.status,
                        status_cobranca:
                            resultado.transacao
                                .status_cobranca ||
                            null
                    },
                    resultado:
                        resultado.resultado
                });


        } catch (erro) {

            const status =
                Number(
                    erro.httpStatus ||
                    erro.response?.status ||
                    500
                );


            console.error(
                "Erro API neutra cobrança:",
                erro.code ||
                    "SEM_CODIGO",
                erro.message
            );


            return res
                .status(
                    status >= 400 &&
                    status < 600
                        ? status
                        : 500
                )
                .json({
                    sucesso: false,
                    mensagem:
                        "Falha ao processar cobrança",
                    detalhe:
                        String(
                            erro.message ||
                            "Erro desconhecido"
                        ).slice(0, 500),
                    erros:
                        Array.isArray(
                            erro.detalhes
                        )
                            ? erro.detalhes
                            : undefined
                });
        }
    }
);


/*
=================================
IDEMPOTÊNCIA DE BOLETOS
=================================
*/

function responderTransacaoExistente(
    res,
    existente,
    boleto
) {

    const mesmoPayload =
        validarMesmoPayload(
            existente,
            "itau",
            boleto
        );


    if (!mesmoPayload) {

        return res
            .status(409)
            .json({

                sucesso:
                    false,

                mensagem:
                    "Conflito de idempotência",

                transacao: {

                    id:
                        existente.id,

                    status:
                        existente.status
                }
            });
    }


    return res
        .status(200)
        .json({

            versao:
                "FIT-BANK-V1",

            sucesso:
                existente.status ===
                "PROCESSADO",

            idempotente:
                true,

            transacao: {

                id:
                    existente.id,

                status:
                    existente.status,

                status_cobranca:
                    existente
                        .status_cobranca ||
                    null
            },

            resultado:
                existente.resultado
        });
}


/*
=================================
EMISSÃO DE BOLETO
=================================
*/

async function processarBoleto(
    req,
    res,
    exigirIdempotencia
) {

    let transacaoAtual =
        null;


    let clienteIntegracaoId =
        null;


    try {

        const boleto =
            req.body;


        const validacao =
            validarBoleto(
                boleto
            );


        if (
            !validacao.valido
        ) {

            return res
                .status(400)
                .json({

                    sucesso:
                        false,

                    mensagem:
                        "Dados inválidos",

                    erros:
                        validacao.erros
                });
        }


        let chaveIdempotencia =
            req.get(
                "Idempotency-Key"
            );


        if (
            exigirIdempotencia &&
            !chaveIdempotencia
        ) {

            return res
                .status(400)
                .json({
                    sucesso: false,
                    mensagem:
                        "Idempotency-Key obrigatória"
                });
        }


        if (
            !chaveIdempotencia
        ) {

            chaveIdempotencia =
                `WEB-${crypto.randomUUID()}`;
        }


        if (
            chaveIdempotencia.length >
            120
        ) {

            return res
                .status(400)
                .json({
                    sucesso: false,
                    mensagem:
                        "Idempotency-Key excede o tamanho permitido"
                });
        }


        clienteIntegracaoId =
            req.clienteIntegracao
                ?.id;


        if (!clienteIntegracaoId) {

            return res
                .status(500)
                .json({
                    sucesso: false,
                    mensagem:
                        "Contexto do cliente não disponível"
                });
        }


        const existente =
            await buscarPorIdempotencia(
                chaveIdempotencia,
                clienteIntegracaoId
            );


        if (existente) {

            return responderTransacaoExistente(
                res,
                existente,
                boleto
            );
        }


        try {

            transacaoAtual =
                await criarTransacao(
                    "itau",
                    boleto,
                    chaveIdempotencia,
                    clienteIntegracaoId
                );


        } catch (erro) {

            if (
                erro.code ===
                    "FIT_IDEMPOTENCY_EXISTS" &&
                erro.transacao
            ) {

                return responderTransacaoExistente(
                    res,
                    erro.transacao,
                    boleto
                );
            }


            throw erro;
        }


        const payloadItau =
            montarBoletoItau(
                boleto
            );


        await atualizarTransacao(
            transacaoAtual.id,
            {
                status:
                    "ENVIANDO_AO_BANCO",
                erro:
                    null
            },
            clienteIntegracaoId
        );


        const comunicacaoItau =
            await enviarBoletoItau(
                payloadItau,
                {
                    clienteIntegracaoId
                }
            );


        let respostaNormalizada =
            null;


        if (
            comunicacaoItau.enviado &&
            comunicacaoItau.resposta
        ) {

            respostaNormalizada =
                normalizarRespostaBoletoItau(
                    comunicacaoItau.resposta
                );
        }


        const statusCobranca =
            comunicacaoItau.enviado
                ? "EMITIDO"
                : "PREPARADO";


        await atualizarTransacao(
            transacaoAtual.id,
            {

                status:
                    "PROCESSADO",

                status_banco:
                    comunicacaoItau
                        .status ||
                    null,

                correlation_id:
                    comunicacaoItau
                        .correlationID ||
                    null,

                flow_id:
                    comunicacaoItau
                        .flowID ||
                    null,

                resultado:
                    respostaNormalizada,

                status_cobranca:
                    statusCobranca,

                ultima_resposta_banco:
                    comunicacaoItau
                        .resposta ||
                    null,

                erro:
                    null
            },
            clienteIntegracaoId
        );


        await registrarEvento(

            transacaoAtual.id,

            comunicacaoItau.enviado
                ? "BOLETO_EMITIDO"
                : "BOLETO_PREPARADO",

            {

                status_banco:
                    comunicacaoItau
                        .status,

                correlation_id:
                    comunicacaoItau
                        .correlationID,

                flow_id:
                    comunicacaoItau
                        .flowID,

                resposta:
                    respostaNormalizada
            },
            clienteIntegracaoId
        );


        return res
            .status(201)
            .json({

                versao:
                    "FIT-BANK-V1",

                sucesso:
                    true,

                idempotente:
                    false,

                transacao: {

                    id:
                        transacaoAtual.id,

                    status:
                        "PROCESSADO",

                    status_cobranca:
                        statusCobranca
                },

                resultado:
                    respostaNormalizada
            });


    } catch (erro) {

        const status =
            erro.response
                ?.status ||
            500;


        const mensagem =
            extrairMensagemErro(
                erro
            );


        console.error(
            "Erro emissão:",
            `HTTP ${status}`,
            mensagem
        );


        if (
            transacaoAtual &&
            transacaoAtual.id
        ) {

            try {

                await atualizarTransacao(
                    transacaoAtual.id,
                    {
                        status:
                            "ERRO",
                        status_banco:
                            status,
                        erro:
                            mensagem
                    },
                    clienteIntegracaoId
                );


                await registrarEvento(
                    transacaoAtual.id,
                    "ERRO_EMISSAO",
                    {
                        status_banco:
                            status,
                        erro:
                            mensagem
                    },
                    clienteIntegracaoId
                );


            } catch (
                erroHistorico
            ) {

                console.error(
                    "Erro ao registrar falha:",
                    erroHistorico.message
                );
            }
        }


        return res
            .status(
                status >= 400 &&
                status < 600
                    ? status
                    : 500
            )
            .json({
                sucesso: false,
                mensagem:
                    "Falha ao processar boleto",
                detalhe:
                    mensagem
            });
    }
}


/*
=================================
CONSULTAR BOLETO
=================================
*/

app.get(
    "/api/v1/boletos/:idFit",

    validarApiKeyFit,

    async (
        req,
        res
    ) => {

        let transacao =
            null;


        try {

            transacao =
                await buscarTransacaoPorId(
                    req.params.idFit,
                    req.clienteIntegracao.id
                );


            if (!transacao) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        mensagem:
                            "Boleto não encontrado"
                    });
            }


            const boleto =
                transacao
                    ?.resultado
                    ?.boleto;


            if (!boleto) {

                return res
                    .status(422)
                    .json({
                        sucesso: false,
                        mensagem:
                            "Transação não possui dados de boleto"
                    });
            }


            if (
                !boleto.id_beneficiario ||
                !boleto.codigo_carteira ||
                !boleto.nosso_numero
            ) {

                return res
                    .status(422)
                    .json({
                        sucesso: false,
                        mensagem:
                            "Boleto não possui os dados necessários para consulta no banco"
                    });
            }


            const consulta =
                await consultarBoletoItau({

                    idBeneficiario:
                        boleto
                            .id_beneficiario,

                    codigoCarteira:
                        boleto
                            .codigo_carteira,

                    nossoNumero:
                        boleto
                            .nosso_numero,

                    clienteIntegracaoId:
                        req.clienteIntegracao.id
                });


            const respostaBanco =
                consulta.resposta;


            const situacaoBanco =
                extrairSituacaoBoleto(
                    respostaBanco
                );


            const statusRecebido =
                normalizarStatusCobranca(
                    situacaoBanco
                );


            const ambiente =
                String(
                    process.env.ITAU_ENV ||
                    "sandbox"
                ).toLowerCase();


            const sandbox =
                ambiente ===
                "sandbox";


            const decisaoStatus =
                resolverStatusCobranca({

                    statusAtual:
                        transacao
                            .status_cobranca,

                    statusRecebido
                });


            const statusFinal =
                decisaoStatus.status;


            const pagamentosBanco =
                extrairPagamentosBoleto(
                    respostaBanco
                );


            const resumoConsulta =
                resumirPagamentosConsulta(
                    pagamentosBanco
                );


            let pagamentosRegistrados =
                [];


            /*
            Nunca persiste pagamentos retornados pelo
            mock do Itaú Sandbox. Em produção, o fluxo
            segue normalmente.
            */

            if (
                !sandbox &&
                pagamentosBanco.length >
                0
            ) {

                pagamentosRegistrados =
                    await registrarPagamentosRecebidos(
                        transacao.id,
                        pagamentosBanco,
                        ambiente,
                        req.clienteIntegracao.id
                    );
            }


            let resumoPagamentos = {

                quantidade_pagamentos:
                    0,

                valor_pago_total:
                    0,

                ultima_data_pagamento:
                    null
            };


            if (!sandbox) {

                resumoPagamentos =
                    await calcularResumoPagamentos(
                        transacao.id,
                        req.clienteIntegracao.id
                    );
            }


            const baseAnalise =
                sandbox
                    ? resumoConsulta
                    : resumoPagamentos;


            const analisePagamentoBase =
                analisarPagamento({

                    valorTitulo:
                        transacao.valor,

                    valorPagoTotal:
                        baseAnalise
                            .valor_pago_total,

                    quantidadePagamentos:
                        baseAnalise
                            .quantidade_pagamentos,

                    ambiente
                });


            const analisePagamento =
                sandbox

                    ? {
                        ...analisePagamentoBase,
                        simulado:
                            true,
                        persistido:
                            false
                    }

                    : analisePagamentoBase;


            const statusConciliacaoFinal =
                sandbox

                    ? transacao
                        .status_conciliacao

                    : analisePagamento
                        .status;


            const diagnosticoSandbox =
                sandbox

                    ? {
                        ambiente:
                            "sandbox",

                        mock:
                            true,

                        situacao_banco:
                            situacaoBanco,

                        status_recebido:
                            statusRecebido,

                        quantidade_pagamentos_mock:
                            pagamentosBanco
                                .length,

                        valor_pagamentos_mock:
                            resumoConsulta
                                .valor_pago_total
                    }

                    : null;


            /*
            Em Sandbox atualizamos apenas metadados da
            comunicação. Status financeiro, conciliação
            e valores locais permanecem intactos.
            */

            const atualizacaoConsulta = {

                status_banco:
                    consulta.status,

                consultado_em:
                    new Date(),

                ultima_resposta_banco:
                    sandbox
                        ? diagnosticoSandbox
                        : respostaBanco,

                erro:
                    null
            };


            if (!sandbox) {

                atualizacaoConsulta
                    .status_cobranca =
                        statusFinal;

                atualizacaoConsulta
                    .status_conciliacao =
                        analisePagamento
                            .status;

                atualizacaoConsulta
                    .valor_pago_total =
                        Number(
                            resumoPagamentos
                                .valor_pago_total ||
                            0
                        );

                atualizacaoConsulta
                    .ultima_data_pagamento =
                        resumoPagamentos
                            .ultima_data_pagamento;
            }


            await atualizarTransacao(
                transacao.id,
                atualizacaoConsulta,
                req.clienteIntegracao.id
            );


            await registrarEvento(

                transacao.id,

                sandbox ||
                decisaoStatus
                    .protecaoAplicada

                    ? "BOLETO_CONSULTADO_PROTEGIDO"

                    : "BOLETO_CONSULTADO",

                {

                    status_banco:
                        consulta.status,

                    correlation_id:
                        consulta
                            .correlationID,

                    flow_id:
                        consulta.flowID,

                    resposta:
                        sandbox
                            ? diagnosticoSandbox
                            : respostaBanco
                },
                req.clienteIntegracao.id
            );


            if (
                pagamentosBanco.length >
                0
            ) {

                await registrarEvento(

                    transacao.id,

                    sandbox

                        ? "PAGAMENTO_IDENTIFICADO_SIMULADO"

                        : "PAGAMENTO_IDENTIFICADO",

                    {

                        status_banco:
                            consulta.status,

                        correlation_id:
                            consulta
                                .correlationID,

                        flow_id:
                            consulta.flowID,

                        resposta: {

                            ambiente,

                            persistido:
                                !sandbox,

                            quantidade_pagamentos:
                                sandbox
                                    ? resumoConsulta
                                        .quantidade_pagamentos
                                    : Number(
                                        resumoPagamentos
                                            .quantidade_pagamentos ||
                                        0
                                    ),

                            valor_pago_total:
                                sandbox
                                    ? resumoConsulta
                                        .valor_pago_total
                                    : Number(
                                        resumoPagamentos
                                            .valor_pago_total ||
                                        0
                                    ),

                            status_conciliacao:
                                sandbox
                                    ? transacao
                                        .status_conciliacao
                                    : analisePagamento
                                        .status
                        }
                    },
                    req.clienteIntegracao.id
                );
            }


            return res.json({

                sucesso:
                    true,

                transacao: {

                    id:
                        transacao.id,

                    status:
                        transacao.status,

                    status_cobranca:
                        statusFinal,

                    status_conciliacao:
                        statusConciliacaoFinal
                },

                cobranca: {

                    situacao_banco:
                        situacaoBanco,

                    status_recebido:
                        statusRecebido,

                    status_fit:
                        statusFinal
                },

                pagamentos: {

                    encontrados:
                        pagamentosBanco
                            .length,

                    registrados:
                        pagamentosRegistrados
                            .length,

                    valor_total_encontrado:
                        sandbox
                            ? resumoConsulta
                                .valor_pago_total
                            : Number(
                                resumoPagamentos
                                    .valor_pago_total ||
                                0
                            ),

                    ultima_data_pagamento:
                        sandbox
                            ? resumoConsulta
                                .ultima_data_pagamento
                            : resumoPagamentos
                                .ultima_data_pagamento,

                    simulado:
                        sandbox,

                    persistido:
                        !sandbox
                },

                pre_conciliacao:
                    analisePagamento,

                protecao_sandbox: {

                    aplicada:
                        sandbox ||
                        decisaoStatus
                            .protecaoAplicada,

                    motivo:
                        sandbox
                            ? "Resposta simulada do Itaú Sandbox não altera o estado financeiro do título FIT"
                            : decisaoStatus
                                .motivo
                },

                comunicacao: {

                    banco:
                        "itau",

                    status_itau:
                        consulta.status,

                    correlationID:
                        consulta
                            .correlationID,

                    flowID:
                        consulta.flowID
                },

                resultado:
                    respostaBanco
            });


        } catch (erro) {

            const status =
                erro.response
                    ?.status ||
                500;


            const mensagem =
                extrairMensagemErro(
                    erro
                );


            console.error(
                "Erro consulta:",
                `HTTP ${status}`,
                mensagem
            );


            if (
                transacao &&
                transacao.id
            ) {

                try {

                    await registrarEvento(

                        transacao.id,

                        "ERRO_CONSULTA",

                        {
                            status_banco:
                                status,
                            erro:
                                mensagem
                        },
                        req.clienteIntegracao.id
                    );


                } catch (
                    erroHistorico
                ) {

                    console.error(
                        "Erro ao registrar falha de consulta:",
                        erroHistorico.message
                    );
                }
            }


            return res
                .status(
                    status >= 400 &&
                    status < 600
                        ? status
                        : 500
                )
                .json({
                    sucesso: false,
                    mensagem:
                        "Falha ao consultar boleto",
                    detalhe:
                        mensagem
                });
        }
    }
);


/*
=================================
BAIXAR BOLETO
=================================
*/

app.patch(
    "/api/v1/boletos/:idFit/baixa",

    validarApiKeyFit,

    async (
        req,
        res
    ) => {

        let transacao =
            null;


        try {

            transacao =
                await buscarTransacaoPorId(
                    req.params.idFit,
                    req.clienteIntegracao.id
                );


            if (!transacao) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        mensagem:
                            "Boleto não encontrado"
                    });
            }


            if (
                transacao.status_cobranca ===
                "BAIXA_SOLICITADA"
            ) {

                return res
                    .status(200)
                    .json({
                        sucesso: true,
                        idempotente: true,
                        mensagem:
                            "Baixa já solicitada anteriormente",
                        transacao: {
                            id:
                                transacao.id,
                            status_cobranca:
                                "BAIXA_SOLICITADA"
                        }
                    });
            }


            if (
                transacao.status_cobranca ===
                "BAIXADO"
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        mensagem:
                            "Este boleto já está baixado"
                    });
            }


            if (
                transacao.status_cobranca ===
                "PAGO"
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        mensagem:
                            "Não é possível solicitar baixa de um boleto já pago"
                    });
            }


            const boleto =
                transacao
                    ?.resultado
                    ?.boleto;


            if (!boleto) {

                return res
                    .status(422)
                    .json({
                        sucesso: false,
                        mensagem:
                            "Transação não possui dados de boleto"
                    });
            }


            if (
                !boleto.id_beneficiario ||
                !boleto.codigo_carteira ||
                !boleto.nosso_numero
            ) {

                return res
                    .status(422)
                    .json({
                        sucesso: false,
                        mensagem:
                            "Boleto não possui os dados necessários para baixa"
                    });
            }


            const baixa =
                await baixarBoletoItau({

                    idBeneficiario:
                        boleto
                            .id_beneficiario,

                    codigoCarteira:
                        boleto
                            .codigo_carteira,

                    nossoNumero:
                        boleto
                            .nosso_numero,

                    clienteIntegracaoId:
                        req.clienteIntegracao.id
                });


            /*
            A resposta de sucesso da instrução de baixa
            confirma que o Itaú recebeu a solicitação.

            Ela NÃO comprova, por si só, que o boleto
            já foi efetivamente baixado no banco.

            O estado BAIXADO só deve ser aplicado após
            uma consulta posterior confirmar a situação.
            */

            await atualizarTransacao(
                transacao.id,
                {

                    status_banco:
                        baixa.status,

                    status_cobranca:
                        "BAIXA_SOLICITADA",

                    ultima_resposta_banco:
                        baixa.resposta ||
                        {},

                    erro:
                        null
                },
                req.clienteIntegracao.id
            );


            await registrarEvento(

                transacao.id,

                "BOLETO_BAIXA_SOLICITADA",

                {

                    status_banco:
                        baixa.status,

                    correlation_id:
                        baixa
                            .correlationID,

                    flow_id:
                        baixa.flowID,

                    resposta:
                        baixa.resposta
                },
                req.clienteIntegracao.id
            );


            return res.json({

                sucesso:
                    true,

                idempotente:
                    false,

                mensagem:
                    "Baixa solicitada com sucesso; aguardando confirmação do Itaú",

                transacao: {

                    id:
                        transacao.id,

                    status_cobranca:
                        "BAIXA_SOLICITADA"
                },

                comunicacao: {

                    banco:
                        "itau",

                    status_itau:
                        baixa.status,

                    correlationID:
                        baixa
                            .correlationID,

                    flowID:
                        baixa.flowID
                }
            });


        } catch (erro) {

            const status =
                erro.response
                    ?.status ||
                500;


            const mensagem =
                extrairMensagemErro(
                    erro
                );


            console.error(
                "Erro baixa:",
                `HTTP ${status}`,
                mensagem
            );


            if (
                transacao &&
                transacao.id
            ) {

                try {

                    await registrarEvento(

                        transacao.id,

                        "ERRO_BAIXA",

                        {
                            status_banco:
                                status,
                            erro:
                                mensagem
                        },
                        req.clienteIntegracao.id
                    );


                } catch (
                    erroHistorico
                ) {

                    console.error(
                        "Erro ao registrar falha de baixa:",
                        erroHistorico.message
                    );
                }
            }


            return res
                .status(
                    status >= 400 &&
                    status < 600
                        ? status
                        : 500
                )
                .json({
                    sucesso: false,
                    mensagem:
                        "Falha ao baixar boleto",
                    detalhe:
                        mensagem
                });
        }
    }
);


/*
=================================
ROTAS DE EMISSÃO
=================================
*/

app.post(
    "/boletos",

    bloquearRotaWebEmProducao,

    resolverClienteWebDev,

    async (
        req,
        res
    ) => {

        return processarBoleto(
            req,
            res,
            false
        );
    }
);


app.post(
    "/api/v1/boletos",

    validarApiKeyFit,

    async (
        req,
        res
    ) => {

        return processarBoleto(
            req,
            res,
            true
        );
    }
);


/*
=================================
SERVIDOR
=================================
*/

const PORT =
    Number(
        process.env.PORT ||
        3001
    );


async function iniciarServidor() {

    try {

        await testarConexao();


        console.log("");
        console.log(
            "PostgreSQL / Supabase: CONECTADO"
        );


        app.listen(
            PORT,
            () => {

                console.log("");
                console.log(
                    "================================"
                );

                console.log(
                    "FIT BANK CONNECT"
                );

                console.log(
                    "Versão: FIT-BANK-V1"
                );

                console.log(
                    `Servidor: http://localhost:${PORT}`
                );

                console.log(
                    "Banco: PostgreSQL / Supabase"
                );

                console.log(
                    "--------------------------------"
                );

                console.log(
                    "CONTAS A RECEBER"
                );

                console.log(
                    "Boleto emissão: ATIVO"
                );

                console.log(
                    "Boleto consulta: ATIVO"
                );

                console.log(
                    "Boleto baixa: ATIVO"
                );

                console.log(
                    "Leitura pagamentos: ATIVA"
                );

                console.log(
                    "Motor conciliação: ATIVO"
                );

                console.log(
                    "Extrato Itaú adapter: ATIVO"
                );

                console.log(
                    "--------------------------------"
                );

                console.log(
                    "CONTAS A PAGAR"
                );

                console.log(
                    "Criação pagamento: ATIVA"
                );

                console.log(
                    "Aprovação interna: ATIVA"
                );

                console.log(
                    "Auditoria pagamentos: ATIVA"
                );

                console.log(
                    "Envio SISPAG: BLOQUEADO"
                );

                console.log(
                    "--------------------------------"
                );

                console.log(
                    "Histórico APIs: PROTEGIDO"
                );

                console.log(
                    "Proteção Sandbox: ATIVA"
                );

                console.log(
                    "Idempotência: ATIVA"
                );

                console.log(
                    "Autenticação Protheus: ATIVA"
                );

                console.log(
                    "================================"
                );

                console.log("");
            }
        );


    } catch (erro) {

        console.error(
            "FIT Bank Connect não iniciou."
        );

        console.error(
            erro.message
        );

        process.exit(1);
    }
}


iniciarServidor();