-- Sign-up refuses a mobile number another login has already verified (SignupService.assertPhoneFree).
-- Not unique: unverified, abandoned sign-ups may share a number until one of them verifies it.
create index accounts_verified_phone_idx on public.accounts (phone) where phone_verified;
