import { router } from "expo-router";
import { LocationStep } from "@/features/location-step";
import { useSession } from "@/lib/session";
import { BackIcon } from "@/ui/icons";
import { RoundButton } from "@/ui/kit";

export default function ChangeLocation() {
  const { setMe } = useSession();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/settings"));
  return (
    <LocationStep
      header={
        <RoundButton label="Back" onPress={back}>
          <BackIcon size={22} />
        </RoundButton>
      }
      onDone={(me) => {
        setMe(me);
        back();
      }}
    />
  );
}
