import { ComingNext } from "@/features/coming-next";

export default function Plan() {
  return (
    <ComingNext
      title="Plan"
      line="Find places and deals before you spend."
      points={[
        "Pick what you are planning, then up to 3 quick questions.",
        "Deals in your town first, then across the UK.",
        "Only offers a public page actually states.",
      ]}
    />
  );
}
