# mesa. marketplace
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.0-38B2AC?style=for-the-badge&logo=tailwind-css)
![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?style=for-the-badge&logo=supabase)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker)
![Playwright](https://img.shields.io/badge/Tests-Playwright-2EAD33?style=for-the-badge&logo=playwright)

Um marketplace de pedidos de comida com múltiplos estabelecimentos, desenvolvido com Next.js, TypeScript, Tailwind CSS, Supabase Auth e PostgreSQL.

Os clientes podem combinar produtos de várias lojas em um único carrinho. O checkout gera um pedido separado para cada loja, e cada estabelecimento visualiza apenas os seus próprios pedidos. Os preços estão em EUR e o pagamento é feito na entrega.

---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## Para correr localmente
É necessário ter Docker Desktop e Supabase CLI instalados.

primeira vez:
npm ci
npm run db:setup
npm run dev

---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

website <http://localhost:3000>.
[Supabase Studio](http://127.0.0.1:54323)
[Mailpit](http://127.0.0.1:54324).

---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

`db:setup` inicia o Supabase, aplica as migrações pendentes e adiciona quaisquer dados de teste (fixtures) de desenvolvimento ausentes, sem excluir as contas locais existentes.
Depois dessa vez, `db:start` inicia a base de dados sem apagar nada:
npm run db:start
npm run dev

Para apagar  dados intencionalmente e fazer rebuild:
npm run db:reset
npm run seed:users
npm run db:types

---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## Docker Compose

Para executar a aplicação e o Supabase localmente em conjunto com o Docker Desktop:

docker compose up --build

---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## Arquitetura

- Website Next.js utiliza Supabase, Supabase Auth e PostgreSQL.
- O *Row Level Security* (RLS) do PostgreSQL isola clientes, comerciantes e funcionários.
- Contas privilegiadas exigem email verificado e autenticação de dois fatores (TOTP).
- Transações de base de dados dividem um carrinho com produtos de múltiplas lojas em pedidos independentes por loja.
- Superadministradores gerem comerciantes; administradores de comércios gerem os seus negócios e equipas.
- Funcionários e operadores possuem permissões mais restritas, limitadas às lojas que lhes foram atribuídas.
- Dados de tenant indexados e leituras de catálogo paginadas suportam o crescimento de lojas.
- O website utiliza o SDK do Supabase com RLS.
- O único método de pagamento é o pagamento no ato da entrega.
- Portanto, o sistema foi planeado para ter uma boa escalabilidade entre vários comerciantes utilizando um modelo PostgreSQL com índices específicos para cada tenant e consultas paginadas. Cada solicitação é restrita a um comerciante ou cliente, mantendo o foco das operações de base de dados à medida que o volume de dados aumenta. Os Server Components do Next.js mantêm a aplicação maioritariamente sem estado, permitindo adicionar instâncias sem alterar o modelo de negócios. Restrições, triggers e migrações garantem a consistência dos dados conforme novos users e transações são adicionados.

---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## Novas Features implementadas

- Nodemailer através de um email assinado: as credenciais SMTP permanecem no servidor e todos os emails usam o mesmo padrão visual.
- Docker Compose com Supabase e Mailpit: torna o ambiente local reproduzível e permite testar emails sem enviar mensagens reais.
- next-intl e next-themes: idioma e tema ficam centralizados e persistentes sem duplicar páginas.
- Tabelas de eventos de estado: cada alteração de encomenda fica registada, permitindo auditoria e timelines confiáveis.
- preços em cêntimos inteiros: evita erros de arredondamento monetário.
- Carrinho multi-loja: permitindo produtos de várias lojas na mesma compra.
- Divisão automática da encomenda: cada loja recebe apenas os seus produtos.
- Acompanhamento individual por loja com estados como recebido, preparação e entregue.
- Cancelamento pelo cliente antes da aceitação da loja.
- Candidaturas de comerciantes com aprovação, rejeição e suspensão pelo superadmin.
- Convites de funcionários por email, com atribuição de função e loja.
- 2FA TOTP *obrigatório* para contas administrativas e opcional para clientes.

---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## contas
Estas contas são recursos de desenvolvimento e não devem ser utilizadas em produção.

 password `LocalMesa!2026`.

| Email | função |
| `superadmin@mesa.test` | Super admin |
| `admin@mesa.test` | Bairro  admin |
| `staff@mesa.test` | Bairro staff |
| `operator@mesa.test` | Bairro operador |
| `admin2@mesa.test` | Verde  admin |
| `staff2@mesa.test` | Verde staff |
| `operator2@mesa.test` | Verde operador |
| `pending@mesa.test` | candidatura pra ser comerciante pendente |
| `suspended@mesa.test` | admin suspenso |
| `customer@mesa.test` | cliente |
| `customer2@mesa.test` | cliente |

Contas de administração registam um autenticador durante o primeiro login. 

---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## Testes

npm run lint && npm run typecheck && npm test
npm run test:db && npm run test:e2e
npm run build

Testes unitários e de componentes — Vitest + React Testing Library:
- Validam lógica do carrinho, autenticação, MFA, emails, convites, traduções, permissões de botões e estados de produtos.
Exemplos: Carrinho separado por conta. Produtos indisponíveis mostram “sem stock”. Preços alterados são detetados. Emails têm conteúdo correto e redirecionamentos seguros. Staff não vê ações administrativas.

Testes de base de dados e segurança — PostgreSQL/Supabase
-  Foi testado: Isolamento entre merchants. Permissões de super admin, admin, staff, operator e cliente. Bloqueio de operações sem aal2. Proteção contra alteração de roles via metadata. Carrinho dividido em várias store orders. Totais em cêntimos inteiros. Rejeição de produtos indisponíveis ou repriced. Transições de estados das encomendas. Cancelamento concorrente. Convites expirados, revogados e de uso único. Proteção do último admin. Suspensão de merchants. 

Testes end-to-end — Playwright
- Executam a aplicação, Supabase local e Mailpit, simulando ações reais no browser: Registo e verificação por email. Login com TOTP. Carrinho com produtos de várias lojas. Tracking independente por merchant. Pesquisa enquanto o utilizador escreve. Alteração de idioma, tema e responsividade. Aceitação de convites para staff/operator. Bloqueio de acesso indevido ao dashboard.

Correr `npx playwright install chromium` uma vez antes dos testes de e2e.
