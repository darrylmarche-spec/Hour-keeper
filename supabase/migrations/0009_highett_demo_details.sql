-- Demo job: details from the Highett lift drawings (job facts only).
update public.jobs
set job_number = '0813190833',
    quotation_number = '303879675',
    site_address = 'Graham Road, Highett VIC 3190',
    stops = 8,
    travel_height_m = 22.92
where name = 'Highett Common Building F - Duplex';
