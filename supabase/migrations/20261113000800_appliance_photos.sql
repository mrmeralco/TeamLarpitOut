-- Household Setup: "Snap an appliance" estimates any tap-grid appliance from a photo, not only the aircon.
-- { "<grid type>": { "answers": { ... }, "kwh": <rating> } }. aircon_photo stays for older clients and is
-- still written for the aircon; new code reads appliance_photos.
alter table public.household_setup add column if not exists appliance_photos jsonb;

update public.household_setup
set appliance_photos = jsonb_build_object('aircon', jsonb_build_object('answers', aircon_photo -> 'answers', 'kwh', aircon_photo -> 'kwhPerHour'))
where aircon_photo is not null and appliance_photos is null;
