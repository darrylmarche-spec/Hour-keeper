-- Seed: the lift-installation task sheet supplied by Darryl
-- ("Hightett Common Building F - Duplex", Total Allowed Hours 193).
--
-- 1. A reusable template with every line on the sheet (0–55, 60–62) and the
--    allowances as default sold hours.
-- 2. A sample draft job built from the sheet as filled in — struck-out lines
--    (16. 8th Rail, 17. 9th Rail) left out.
--
-- The sheet has no phases; lines are grouped into suggested phases a PM can rename.
-- Lines printed as "13."/"14."/"15." on the sheet appear as "16"/"14"/"16" (typos) — numbered 13/14/15 here.

create temporary table seed_lines (
  sort_order int, line_no text, name text, sold numeric, phase text, kind text, struck boolean
) on commit drop;

insert into seed_lines values
  ( 0,'0','Dismantling',0,'Site setup','planned',false),
  ( 1,'1','Induction, ACW, shaft site walk, delivery',8,'Site setup','planned',false),
  ( 2,'2','Installing of hoisting equipment and test hitch point',4,'Site setup','planned',false),
  ( 3,'3','Plumbing and hoistway survey',3,'Site setup','planned',false),
  ( 4,'4','Installing mech pit components, buffers, trimmers',6,'Site setup','planned',false),
  ( 5,'5','1st set rails (first 2 rings)',4,'Rails & car structure','planned',false),
  ( 6,'6','CW tank, fill with required weight',4,'Rails & car structure','planned',false),
  ( 7,'7','All other rails in shaft, bow in',4,'Rails & car structure','planned',false),
  ( 8,'8','Building Car structure as working platform',4,'Rails & car structure','planned',false),
  ( 9,'9','INEX OST, INEX Install & Sign off',4,'Rails & car structure','planned',false),
  (10,'10','2nd Rail (5m) Brackets and guide rails',4,'Rails & car structure','planned',false),
  (11,'11','3rd Rail (5m) Brackets and guide rails',4,'Rails & car structure','planned',false),
  (12,'12','4th Rail (5m) Brackets and guide rails',4,'Rails & car structure','planned',false),
  (13,'13','5th Rail (5m) Brackets and guide rails',4,'Rails & car structure','planned',false),
  (14,'14','6th Rail (5m) Brackets and guide rails',0,'Rails & car structure','planned',false),
  (15,'15','7th Rail (5m) Brackets and guide rails',0,'Rails & car structure','planned',false),
  (16,'16','8th Rail (5m) Brackets and guide rails',0,'Rails & car structure','planned',true),
  (17,'17','9th Rail (5m) Brackets and guide rails',0,'Rails & car structure','planned',true),
  (18,'18','Cut top rails, fit bed plate',5,'Rails & car structure','planned',false),
  (19,'19','Governor',3,'Machine & motor spin','planned',false),
  (20,'20','Install Motor',4,'Machine & motor spin','planned',false),
  (21,'21','Top door frame/controller frame',4,'Machine & motor spin','planned',false),
  (22,'22','Motor spin Fitter - Prepare doors',3,'Machine & motor spin','planned',false),
  (23,'23','Motor spin Fitter - Prepare door frames',3,'Machine & motor spin','planned',false),
  (24,'24','Motor spin Fitter - Prepare interior',2,'Machine & motor spin','planned',false),
  (25,'25','Motor spin Elec - wires headroom - minimum to spin',6,'Machine & motor spin','planned',false),
  (26,'26','Motor spin Elec - wires controller',2,'Machine & motor spin','planned',false),
  (27,'27','Motor Spin Elec - Motor spinning',0,'Machine & motor spin','planned',false),
  (28,'28','Belt Lift Fitter - 2 Installers',8,'Belt lift','planned',false),
  (29,'29','Belt Lift Elec - 2 Installers',8,'Belt lift','planned',false),
  (30,'30','1st Door Frame assembly installation',4,'Door frames','planned',false),
  (31,'31','2nd Door Frame assembly installation',4,'Door frames','planned',false),
  (32,'32','3rd Door Frame assembly installation',4,'Door frames','planned',false),
  (33,'33','4th Door Frame assembly installation',4,'Door frames','planned',false),
  (34,'34','5th Door Frame assembly installation',4,'Door frames','planned',false),
  (35,'35','6th Door Frame assembly installation',4,'Door frames','planned',false),
  (36,'36','7th Door Frame assembly installation',4,'Door frames','planned',false),
  (37,'37','8th Door Frame assembly installation',4,'Door frames','planned',false),
  (38,'38','9th Door Frame assembly installation',0,'Door frames','planned',false),
  (39,'39','10th Door Frame assembly installation',0,'Door frames','planned',false),
  (40,'40','11th Door Frame assembly installation',0,'Door frames','planned',false),
  (41,'41','12th Door Frame assembly installation',0,'Door frames','planned',false),
  (42,'42','Install front of Car door assembly',4,'Car & interior','planned',false),
  (43,'43','Install factory Interior',2,'Car & interior','planned',false),
  (44,'44','Install factory Interior Second Person',2,'Car & interior','planned',false),
  (45,'45','Hoistway wiring (1hr per floor)',9,'Wiring','planned',false),
  (46,'46','Pit Wiring',4,'Wiring','planned',false),
  (47,'47','Headroom wiring',4,'Wiring','planned',false),
  (48,'48','Car Wiring',4,'Wiring','planned',false),
  (49,'49','Buttons and Indicators wiring',8,'Wiring','planned',false),
  (50,'50','Security wiring',10,'Wiring','planned',false),
  (51,'51','Final tasks before commissioning (clean-up/rubbish removal)',0,'Commissioning & testing','planned',false),
  (52,'52','Commissioning Lift',8,'Commissioning & testing','planned',false),
  (53,'53','Tune Doors',8,'Commissioning & testing','planned',false),
  (54,'54','SAIS Testing Tester',8,'Commissioning & testing','planned',false),
  (55,'55','SAIS Testing Tuner',8,'Commissioning & testing','planned',false),
  (60,'60','Other Productive hours (VO, etc)',0,'Other hours','extra_productive',false),
  (61,'61','Other Non-Productive hours (site readiness, etc)',0,'Other hours','extra_non_productive',false),
  (62,'62','Builders Lift Re-tune + Test',0,'Other hours','planned',false);

create temporary table seed_phase_order (phase text, sort_order int) on commit drop;
insert into seed_phase_order values
  ('Site setup',0),('Rails & car structure',1),('Machine & motor spin',2),('Belt lift',3),
  ('Door frames',4),('Car & interior',5),('Wiring',6),('Commissioning & testing',7),('Other hours',8);

-- Template
with t as (
  insert into public.templates (name, job_type)
  values ('Lift Installation — Construction', 'construction')
  returning id
), p as (
  insert into public.template_phases (template_id, name, sort_order)
  select t.id, o.phase, o.sort_order from t cross join seed_phase_order o
  returning id, template_id, name
)
insert into public.template_tasks (template_id, phase_id, line_no, name, sold_hours, kind, sort_order)
select p.template_id, p.id, l.line_no, l.name, l.sold, l.kind, l.sort_order
from seed_lines l join p on p.name = l.phase;

-- Sample job (draft) from the filled-in sheet
with j as (
  insert into public.jobs (name, job_type, status, quoted_total_hours, template_id)
  select 'Hightett Common Building F - Duplex', 'construction', 'draft', 193, id
  from public.templates where name = 'Lift Installation — Construction'
  returning id
), p as (
  insert into public.phases (job_id, name, sort_order)
  select j.id, o.phase, o.sort_order from j cross join seed_phase_order o
  returning id, job_id, name
)
insert into public.tasks (job_id, phase_id, line_no, name, sold_hours, kind, sort_order)
select p.job_id, p.id, l.line_no, l.name, l.sold, l.kind, l.sort_order
from seed_lines l join p on p.name = l.phase
where not l.struck;
