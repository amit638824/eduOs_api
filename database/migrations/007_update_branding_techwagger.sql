-- Migration 007: Update legacy branding from Edumatra / Edumantra / Super Computer Academy / TechWagger to Mindsprint
UPDATE organizations 
SET name = 'Mindsprint', 
    slug = 'mindsprint', 
    logo_url = '/img/logo/techwagger-logo.png',
    updated_at = CURRENT_TIMESTAMP(3)
WHERE name LIKE '%Edumatra%' 
   OR name LIKE '%Edumantra%' 
   OR name LIKE '%Super Computer%'
   OR name LIKE '%TechWagger%'
   OR slug LIKE '%eduma%'
   OR slug LIKE '%supercomputer%'
   OR slug LIKE '%techwagger%';
