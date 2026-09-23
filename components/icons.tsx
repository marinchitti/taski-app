/**
 * Drop-in replacement for `@expo/vector-icons`' `Ionicons` / `Feather` icon sets.
 *
 * `@expo/vector-icons` renders icon *fonts* (Ionicons.ttf / Feather.ttf) that
 * have to be downloaded from the Metro dev server at runtime via
 * `ExpoAsset.downloadAsync()`. On Android emulators/VMs (e.g. VirtualBox) the
 * guest often cannot reach the host's LAN IP (`192.168.1.15`), so the download
 * fails with:
 *   "Call to function 'ExpoAsset.downloadAsync' has been rejected.
 *    → Caused by: Unable to download asset from url: http://192.168.1.15:8081/..."
 *
 * Lucide icons are pure inline SVG paths rendered with `react-native-svg` —
 * they are shipped inside the JS bundle, never downloaded at runtime. This
 * component keeps the same `name`/`size`/`color`/`style` API (plus the static
 * `glyphMap`/`loadFont` surface that `@expo/vector-icons` exposed) so existing
 * screens only need to change their import.
 */
import React from "react";
import { Text, View } from "react-native";

import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  Calendar,
  CalendarOff,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleArrowDown,
  CircleCheck,
  Clipboard,
  Clock,
  Eye,
  EyeOff,
  Home,
  Hourglass,
  List,
  LogIn,
  LogOut,
  Mail,
  Plus,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Square,
  SquareCheck,
  SquarePlus,
  Trash2,
  TriangleAlert,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react-native";

type IconRenderProps = {
  size?: number | string;
  color?: any;
  style?: any;
};

type IconComponent = React.ComponentType<IconRenderProps>;

type GoogleLogoProps = IconRenderProps & {
  /** Google-blue used for the "G" glyph by default. */
  color?: any;
};

/**
 * Google "G" brand mark. Lucide deliberately ships no brand icons, so we render
 * a lightweight multi-stop "G" badge instead of the Ionicons `logo-google`.
 */
export function GoogleLogo({
  size = 19,
  color = "#4285F4",
  style,
}: GoogleLogoProps) {
  const glyphSize = Number(size);
  return (
    <View
      style={[
        {
          width: glyphSize,
          height: glyphSize,
          borderRadius: glyphSize / 4,
          backgroundColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Text
        style={{
          fontSize: glyphSize * 0.62,
          fontWeight: "800",
          color,
        }}
      >
        G
      </Text>
    </View>
  );
}

const ICONS: Record<string, IconComponent> = {
  add: Plus,
  "alert-circle": CircleAlert,
  "alert-circle-outline": CircleAlert,
  "arrow-back": ArrowLeft,
  "arrow-down-circle-outline": CircleArrowDown,
  "bar-chart": BarChart3,
  "bar-chart-outline": BarChart3,
  calendar: Calendar,
  "calendar-outline": CalendarOff,
  checkmark: Check,
  "checkmark-circle": CircleCheck,
  "checkmark-circle-outline": CircleCheck,
  checkbox: SquareCheck,
  "checkbox-outline": Square,
  "chevron-back": ChevronLeft,
  "chevron-down": ChevronDown,
  "chevron-forward": ChevronRight,
  "chevron-up": ChevronUp,
  clipboard: Clipboard,
  "clipboard-outline": Clipboard,
  close: X,
  "create-outline": SquarePlus,
  "eye-off-outline": EyeOff,
  "eye-outline": Eye,
  home: Home,
  "home-outline": Home,
  "hourglass-outline": Hourglass,
  list: List,
  "list-outline": List,
  "log-in": LogIn,
  "log-out-outline": LogOut,
  "logo-google": GoogleLogo,
  mail: Mail,
  "mail-outline": Mail,
  "notifications-outline": Bell,
  people: Users,
  "people-outline": Users,
  "person-outline": User,
  plus: Plus,
  "pulse-outline": Activity,
  "search-outline": Search,
  "settings-outline": Settings,
  shield: Shield,
  "shield-checkmark": ShieldCheck,
  "square-outline": Square,
  "time-outline": Clock,
  "trash-outline": Trash2,
  "user-plus": UserPlus,
  users: Users,
  "warning-outline": TriangleAlert,
};

export const GLYPH_MAP: Readonly<Record<string, IconComponent>> = ICONS;

type IconSetProps = {
  name: string;
  size?: number | string;
  color?: any;
  style?: any;
};

function createIconSet(glyphMap: Record<string, IconComponent>) {
  return class IconSet extends React.Component<IconSetProps> {
    static glyphMap: Record<string, IconComponent> = glyphMap;
    static getGlyphMap = () => glyphMap;
    /** Kept for API compatibility with @expo/vector-icons — SVG needs no fonts. */
    static loadFont = async () => undefined;
    static font = glyphMap;
    static Button = undefined;

    render() {
      const { name, size = 24, color = "#000000", style } = this.props;
      const Glyph = glyphMap[name];
      if (!Glyph) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.warn(`IconSet: "${name}" is not a supported icon name.`);
        }
        return null;
      }
      return <Glyph size={size} color={color} style={style} />;
    }
  };
}

/** `Ionicons`-compatible icon set backed by Lucide SVG icons. */
export const Ionicons = createIconSet(ICONS);

/** `Feather`-compatible icon set backed by Lucide SVG icons. */
export const Feather = createIconSet(ICONS);
