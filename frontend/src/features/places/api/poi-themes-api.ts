import { api } from "@/shared/api/http";
import type { PoiTheme } from "../domain/poi-theme";

interface PoiThemeResponse {
  key: string;
  label: string;
  icon_svg: string;
  color: string;
  soft_color: string;
  priority: number;
  keywords: string[];
  group: string;
}

function toPoiTheme(row: PoiThemeResponse): PoiTheme {
  return {
    key: row.key,
    label: row.label,
    iconSvg: row.icon_svg,
    color: row.color,
    softColor: row.soft_color,
    priority: row.priority,
    keywords: row.keywords,
    group: row.group,
  };
}

export const poiThemesApi = {
  list: async () => (await api<PoiThemeResponse[]>("/maps/poi-themes")).map(toPoiTheme),
};
