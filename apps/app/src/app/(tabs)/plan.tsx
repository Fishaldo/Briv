import { ComingNext } from "@/features/coming-next";

export default function Plan() {
  return (
    <ComingNext
      title="Plan"
      line="Plan a spend before you make it, and this pay's budget."
      points={[
        "Two parts at the top: Plan a spend, and Budget.",
        "Plan a spend: pick what, up to 3 quick questions, deals in your town first, then across the UK.",
        "Budget: made from your own pays, never more than your take-home, with savings first.",
        "Only offers a public page actually states.",
      ]}
    />
  );
}
