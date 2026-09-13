# mesa. marketplace

Um marketplace de pedidos de comida com múltiplos estabelecimentos, desenvolvido com Next.js, TypeScript, Tailwind CSS, Supabase Auth e PostgreSQL.

Os clientes podem combinar produtos de várias lojas em um único carrinho. O checkout gera um pedido separado para cada loja, e cada estabelecimento visualiza apenas os seus próprios pedidos. Os preços estão em EUR e o pagamento é feito na entrega.

## Para correr localmente
primeira vez:
npm ci
npm run db:setup
npm run dev


Abrir <http://localhost:3000>. `db:setup` inicia o Supabase, aplica as migrações pendentes e adiciona quaisquer dados de teste (fixtures) de desenvolvimento ausentes, sem excluir as contas locais existentes.

Depois dessa vez, `db:start` inicia a base de dados sem apagar nada:

npm run db:start
npm run dev

 [Supabase Studio](http://127.0.0.1:54323) e [Mailpit](http://127.0.0.1:54324).
 

Para apagar  dados intencionalmente e fazer rebuild:
npm run db:reset
npm run seed:users
npm run db:types

## Docker Compose

Para executar a aplicação e o Supabase localmente em conjunto com o Docker Desktop:

docker compose up --build

## Arquitetura

- Website Next.js utiliza Supabase Auth e PostgreSQL.
- O recurso de Row Level Security (RLS) do PostgreSQL isola clientes, comerciantes e funcionários.
- Contas privilegiadas exigem e-mail verificado e autenticação de dois fatores (TOTP).
- Transações de base de dados dividem um carrinho com produtos de múltiplas lojas em pedidos independentes por loja.
- Superadministradores gerem comerciantes; administradores de comércios gerem os seus negócios e equipas.
- Funcionários e operadores possuem permissões mais restritas, limitadas às lojas que lhes foram atribuídas.
- Dados de tenant indexados e leituras de catálogo paginadas suportam o crescimento de lojas.
- O website utiliza o SDK do Supabase com RLS.
- O único método de pagamento é o pagamento no ato da entrega.

## justificações

- Nodemailer através de um email assinado: as credenciais SMTP permanecem no servidor e todos os emails usam o mesmo padrão visual.
- Docker Compose com Supabase e Mailpit: torna o ambiente local reproduzível e permite testar emails sem enviar mensagens reais.
- next-intl e next-themes: idioma e tema ficam centralizados e persistentes sem duplicar páginas.
- Tabelas de eventos de estado: cada alteração de encomenda fica registada, permitindo auditoria e timelines confiáveis.
- preços em cêntimos inteiros: evita erros de arredondamento monetário.


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

## Testes

npm run lint && npm run typecheck && npm test
npm run test:db && npm run test:e2e
npm run build

Correr `npx playwright install chromium` uma vez antes dos testes de ponta-a-ponta.
