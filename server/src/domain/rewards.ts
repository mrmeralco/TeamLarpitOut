/**
 * Sample rewards catalog and redemption rules (GLOSSARY & KuryenteKo §2.6).
 *
 * Rewards are partner-funded (load, e-wallet, vouchers), priced in Points
 * (e.g. ₱50 load = 500 pts).
 * All items in the demo are labelled "sample rewards".
 * Clearly not a Meralco bill discount.
 */

export interface RewardItem {
  id: string;
  name: string;
  category: "load" | "e-wallet" | "voucher";
  partnerName: string;
  pointsCost: number;
  description: string;
  tag: "sample rewards";
  isSampleReward: true;
}

export const SAMPLE_REWARDS_CATALOG: readonly RewardItem[] = [
  {
    id: "reward-load-50",
    name: "₱50 Mobile Load",
    category: "load",
    partnerName: "Partner Telco",
    pointsCost: 500,
    description: "₱50 prepaid load for any network from a partner telco.",
    tag: "sample rewards",
    isSampleReward: true,
  },
  {
    id: "reward-ewallet-100",
    name: "₱100 E-Wallet Credit",
    category: "e-wallet",
    partnerName: "Partner E-Wallet",
    pointsCost: 1000,
    description: "₱100 credit in a partner e-wallet for purchases or payments.",
    tag: "sample rewards",
    isSampleReward: true,
  },
  {
    id: "reward-voucher-150",
    name: "₱150 Supermarket Voucher",
    category: "voucher",
    partnerName: "Partner Supermarket",
    pointsCost: 1500,
    description: "₱150 grocery voucher for partner supermarket branches.",
    tag: "sample rewards",
    isSampleReward: true,
  },
  {
    id: "reward-voucher-250",
    name: "₱250 Convenience Store Voucher",
    category: "voucher",
    partnerName: "Partner Mart",
    pointsCost: 2500,
    description: "₱250 store voucher for food and everyday items.",
    tag: "sample rewards",
    isSampleReward: true,
  },
];

export function findReward(rewardId: string): RewardItem | undefined {
  return SAMPLE_REWARDS_CATALOG.find((r) => r.id === rewardId);
}
