import { StyleSheet, View } from "react-native";
import type { Payment } from "@/lib/api";
import { Row, T } from "@/ui/kit";
import { font } from "@/ui/theme";
import { categoryColours, initialOf, paymentLine, pounds } from "./money";

export function PaymentRow({ payment }: { payment: Payment }) {
  const tone = categoryColours(payment.category);
  const name = payment.toPerson ? "Paid to a person" : payment.shopName || "Card payment";
  return (
    <Row>
      <View style={[styles.initial, { backgroundColor: tone.tint }]} accessibilityElementsHidden>
        <T style={[styles.initialText, { color: tone.ink }]}>{initialOf(name)}</T>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T kind="strong" numberOfLines={1}>
          {name}
        </T>
        <T kind="small" numberOfLines={1}>
          {paymentLine(payment)}
          {payment.countsAsSpending ? "" : " · not spending"}
        </T>
      </View>
      <T kind="money" style={!payment.countsAsSpending ? { color: tone.ink } : undefined}>
        {pounds(payment.amount)}
      </T>
    </Row>
  );
}

const styles = StyleSheet.create({
  initial: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  initialText: { fontFamily: font.heavy, fontSize: 15 },
});
