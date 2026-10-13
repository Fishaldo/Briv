import Svg, { Circle, Path } from "react-native-svg";

type IconProps = { size?: number; color?: string; strokeWidth?: number };

function Icon({ size = 24, color = "#17211C", strokeWidth = 1.9, children }: IconProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </Svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M3 10.5 12 3l9 7.5" />
    <Path d="M5 9.5V21h14V9.5" />
  </Icon>
);

export const PlanIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="11" cy="11" r="7" />
    <Path d="m20 20-3.5-3.5" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon strokeWidth={2.2} {...p}>
    <Path d="M12 5v14M5 12h14" />
  </Icon>
);

export const InsightsIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M3 21h18" />
    <Path d="M6 17v-6" />
    <Path d="M11 17V7" />
    <Path d="M16 17v-9" />
  </Icon>
);

export const OffersIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
    <Circle cx="7.5" cy="7.5" r="1.5" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="3" />
    <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Icon>
);

export const BackIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="m15 6-6 6 6 6" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" />
    <Circle cx="12" cy="9" r="2.5" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon strokeWidth={2.4} {...p}>
    <Path d="m5 12 5 5 9-10" />
  </Icon>
);

export const MailIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 6h16v12H4z" />
    <Path d="m4 7 8 6 8-6" />
  </Icon>
);
