import React from "react";
import Svg, { Path, Rect } from "react-native-svg";

type LogoProps = {
  size?: number;
};

export default function Logo({ size = 100 }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Rect width="100" height="100" rx="30" fill="#1E293B" />
      <Path
        d="M30 50L45 65L75 35"
        stroke="#FF0072"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
