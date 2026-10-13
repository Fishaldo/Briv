import { ComingNext } from "@/features/coming-next";

export default function Offers() {
  return (
    <ComingNext
      title="Offers"
      line="From the shops' own pages. A price, code or end date shows only when the page states it."
      points={[
        "Your shops first, then other shops for the same things.",
        "Near you first, then across the UK.",
        "Bills that could cost less.",
      ]}
    />
  );
}
