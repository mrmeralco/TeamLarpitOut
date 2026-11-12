-- Points are now 1 per ₱2 saved (server/src/domain/points.ts), so partner Rewards cost half as many
-- Points: each still takes the same pesos of savings (₱50 load = 250 pts = ₱500 saved).
-- Explicit values, so running this twice changes nothing; db:seed writes the same from domain/rewards.ts.
update public.rewards set points_cost = 250  where id = 'reward-load-50';
update public.rewards set points_cost = 500  where id = 'reward-ewallet-100';
update public.rewards set points_cost = 750  where id = 'reward-voucher-150';
update public.rewards set points_cost = 1250 where id = 'reward-voucher-250';
