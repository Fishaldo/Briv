import { router } from "expo-router";
import { LocationStep } from "@/features/location-step";
import { api, type Me } from "@/lib/api";
import { useSession } from "@/lib/session";
import { BackIcon } from "@/ui/icons";
import { RoundButton } from "@/ui/kit";

export default function SetupLocation() {
  const { setMe } = useSession();
  return (
    <LocationStep
      stepLabel="Step 2 of 2"
      header={
        <RoundButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/about-you"))}>
          <BackIcon size={22} />
        </RoundButton>
      }
      onDone={async () => {
        // The last step of setting up: Briv opens Home next.
        const me = await api<Me>("/me", { method: "PATCH", body: { onboarded: true } });
        setMe(me);
      }}
    />
  );
}
