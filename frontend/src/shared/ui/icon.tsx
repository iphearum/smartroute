import type { IconType } from "react-icons";
import {
  FiActivity,
  FiAlertTriangle,
  FiBookmark,
  FiBox,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiCreditCard,
  FiDatabase,
  FiEdit3,
  FiGlobe,
  FiGrid,
  FiHeart,
  FiHelpCircle,
  FiHome,
  FiInfo,
  FiMap,
  FiMapPin,
  FiMaximize,
  FiMenu,
  FiMinimize,
  FiNavigation,
  FiPackage,
  FiPhone,
  FiSearch,
  FiStar,
  FiTrendingUp,
  FiTruck,
  FiUser,
  FiX,
  FiZap,
} from "react-icons/fi";

export type IconName =
  | "brand"
  | "home"
  | "locate"
  | "database"
  | "bookmark"
  | "help"
  | "search"
  | "directions"
  | "car"
  | "motorbike"
  | "bike"
  | "walk"
  | "close"
  | "phone"
  | "globe"
  | "clock"
  | "pin"
  | "heart"
  | "edit"
  | "star"
  | "grid"
  | "box"
  | "wallet"
  | "register"
  | "info"
  | "alert"
  | "trending"
  | "menu"
  | "user"
  | "spark"
  | "chevron-left"
  | "chevron-right"
  | "maximize"
  | "minimize";

const icons: Record<IconName, IconType> = {
  brand: FiMap,
  home: FiHome,
  locate: FiNavigation,
  database: FiDatabase,
  bookmark: FiBookmark,
  help: FiHelpCircle,
  search: FiSearch,
  directions: FiNavigation,
  car: FiTruck,
  motorbike: FiZap,
  bike: FiActivity,
  walk: FiUser,
  close: FiX,
  phone: FiPhone,
  globe: FiGlobe,
  clock: FiClock,
  pin: FiMapPin,
  heart: FiHeart,
  edit: FiEdit3,
  star: FiStar,
  grid: FiGrid,
  box: FiBox,
  wallet: FiCreditCard,
  register: FiPackage,
  info: FiInfo,
  alert: FiAlertTriangle,
  trending: FiTrendingUp,
  menu: FiMenu,
  user: FiUser,
  spark: FiZap,
  "chevron-left": FiChevronLeft,
  "chevron-right": FiChevronRight,
  maximize: FiMaximize,
  minimize: FiMinimize,
};

export function Icon({
  name,
  ...props
}: { name: IconName } & React.ComponentProps<IconType>) {
  const Component = icons[name];
  return <Component aria-hidden="true" focusable="false" {...props} />;
}
