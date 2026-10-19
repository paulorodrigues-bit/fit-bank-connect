FIT BANK CONNECT - MULTI-CLIENTE V1
===================================

OBJETIVO
--------
Adicionar isolamento por cliente à API e à persistência do FIT Bank Connect sem quebrar o Sandbox atual do Itaú.

O que fica isolado por cliente nesta versão:
- transações / boletos;
- idempotência de recebíveis;
- movimentos bancários;
- conciliações;
- pagamentos recebidos, por vínculo com a transação;
- Contas a Pagar;
- aprovação e eventos de Contas a Pagar;
- histórico e consultas da API;
- contexto usado nas chamadas Cash Management do Itaú.

ARQUIVOS ALTERADOS
------------------
index.js
src/services/transacoes.js
src/services/conciliacao.js
src/services/pagamentosSaida.js
src/banks/itauClient.js
src/banks/itauTokenManager.js

ARQUIVOS NOVOS
--------------
src/services/clientesIntegracao.js
src/services/cryptoCredenciais.js
src/services/credenciaisBancarias.js
migrations/20260909_multicliente_v1.sql
scripts/testar-multicliente.js

ORDEM SEGURA DE INSTALAÇÃO
--------------------------
1. Pare o Node antes de mexer no banco.
2. Faça um backup dos arquivos atuais do projeto.
3. Execute migrations/20260909_multicliente_v1.sql no banco do FIT Bank Connect.
4. Copie o conteúdo deste pacote para a raiz do projeto e permita substituir os arquivos indicados acima.
5. Não altere tokens, client secrets ou certificados no .env.
6. Inicie o Node novamente.
7. Rode: node scripts/testar-multicliente.js

CLIENTE DE DESENVOLVIMENTO
--------------------------
A migration cria o identificador:
fit-dev

Todo o histórico atual do protótipo com cliente_integracao_id nulo é associado a esse cliente.

Em desenvolvimento, se X-FIT-Cliente-Id não for informado, a API assume fit-dev.
Nas chamadas explícitas da API, prefira enviar:
X-FIT-Cliente-Id: fit-dev

A FIT_API_KEY continua sendo lida apenas no backend/cliente de integração. Ela não deve ir para o index.html.

CREDENCIAIS BANCÁRIAS
---------------------
A tabela bank_connect.cliente_bancos prepara credenciais bancárias por cliente.
Segredos bancários não devem ser gravados em texto puro.
Quando essa tabela passar a armazenar credenciais, configure uma chave separada de 32 bytes em FIT_BANK_CREDENTIALS_KEY.
Não reutilize FIT_API_KEY como chave de criptografia.

Nesta primeira instalação, o ambiente de desenvolvimento pode continuar usando o conjunto Itaú já existente no .env como fallback. Assim, os testes que já funcionam no Sandbox continuam funcionando.

PRODUÇÃO
--------
Em produção, cliente sem configuração bancária própria é recusado por padrão.
Token manual Itaú continua bloqueado em produção.
OAuth/mTLS por cliente permanece desabilitado até a homologação oficial do Itaú; nenhuma URL ou scope foi inventado nesta versão.

CONTAS A PAGAR
--------------
O envio bancário permanece sob a proteção já existente. Esta versão não habilita envio automático e não altera ITAU_PAGAMENTOS_SEND_ENABLED.

IMPORTANTE
----------
Esta etapa cria isolamento lógico na aplicação e no banco para o core atual.
Ela não substitui as próximas camadas de produção: autenticação de usuário/sessão, secret manager, TLS validado do PostgreSQL, rotação de chaves, observabilidade e testes automatizados de segurança.
