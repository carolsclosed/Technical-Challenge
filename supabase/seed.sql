-- Development fixtures only. Auth identities are created through the supported Admin API by seed-users.ts.
insert into public.merchants(id,name,slug,status) values
('10000000-0000-4000-8000-000000000001','Bairro Kitchen','bairro-kitchen','active'),
('10000000-0000-4000-8000-000000000002','Verde & Co.','verde-co','active'),
('10000000-0000-4000-8000-000000000003','The Morning Table','morning-table','pending'),
('10000000-0000-4000-8000-000000000004','Harbour Bites','harbour-bites','suspended');
insert into public.stores(id,merchant_id,name,street,city,state,zip_code,phone,timezone,active) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Bairro — Alfama','Rua dos Remédios 42','Lisboa','Lisboa','1100-448','+351210123456','Europe/Lisbon',true),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Bairro — Campo de Ourique','Rua Ferreira Borges 18','Lisboa','Lisboa','1350-128','+351210123457','Europe/Lisbon',true),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','Verde — Chiado','Rua Garrett 36','Lisboa','Lisboa','1200-204','+351210123458','Europe/Lisbon',true),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','Verde — Príncipe Real','Rua da Escola Politécnica 21','Lisboa','Lisboa','1250-099','+351210123459','Europe/Lisbon',true),
('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','Verde — Riverside','Rua da Cintura 8','Lisboa','Lisboa','1200-109','+351210123450','Europe/Lisbon',false),
('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000004','Harbour — Docks','Rua do Porto 10','Lisboa','Lisboa','1200-110','+351210123451','Europe/Lisbon',true);
insert into public.products(id,merchant_id,store_id,name,description,price_minor,available)
select ('30000000-0000-4000-8000-'||lpad((s.n*10+p.n)::text,12,'0'))::uuid,s.merchant_id,s.id,p.name,p.description,p.price,p.available
from (select id,merchant_id,row_number() over(order by id)::int n from public.stores)s cross join (values
(1,'House bowl','Roasted seasonal vegetables, herbed rice, chickpeas and lemon tahini.',1190,true),
(2,'Burrata & tomatoes','Creamy burrata, ripe tomatoes, basil and sourdough.',1390,true),
(3,'Crispy chicken sandwich','Golden chicken, crunchy slaw and house sauce in a toasted bun.',1290,true),
(4,'Chocolate brownie','Rich dark chocolate brownie with a soft centre.',450,true),
(5,'Fresh lemonade','Lemon, mint and a little sweetness. Made fresh.',350,false)
)p(n,name,description,price,available);
insert into public.products(merchant_id,store_id,name,price_minor,archived_at,available) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Retired seasonal soup',650,now(),false);
