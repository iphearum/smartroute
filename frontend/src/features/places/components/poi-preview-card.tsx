import type { Place } from "@/features/routes/domain/types";
import type { PoiTheme } from "../domain/poi-theme";

export function poiImageUrl(metadata: Record<string, unknown>) {
  for (const value of [metadata.image, metadata.wikimedia_commons]) {
    if (typeof value !== "string") continue;
    if (/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/i.test(value)) {
      const name = value.split("/wiki/File:")[1];
      if (name)
        return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(decodeURIComponent(name))}`;
    }
    if (/^https:\/\//i.test(value)) return value;
    if (/^File:/i.test(value))
      return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(value.slice(5).trim())}`;
  }
  return null;
}

export function poiPreviewCard(
  place: Place,
  onAdd: () => void,
  classify: (place: Place) => PoiTheme,
  iconMarkup: (theme: PoiTheme) => string,
  onOpenDetails?: () => void,
) {
  const displayName = place.name,
    metadata = place.metadata || {},
    theme = classify(place),
    icon = iconMarkup(theme),
    card = document.createElement("article"),
    media = document.createElement("div"),
    marker = document.createElement("span"),
    fallback = document.createElement("div");
  card.className = `poi-preview poi-${theme.key}`;
  media.className = "poi-preview-media";
  marker.className = "poi-preview-marker";
  marker.innerHTML = icon;
  fallback.className = "poi-preview-fallback";
  fallback.innerHTML = icon;
  const imageValue = poiImageUrl(metadata);
  if (imageValue) {
    const image = document.createElement("img");
    image.className = "poi-preview-image";
    image.src = imageValue;
    image.alt = `Photo of ${displayName}`;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.replaceWith(fallback));
    media.append(image);
  } else media.append(fallback);
  media.append(marker);
  if (onOpenDetails) {
    media.classList.add("poi-preview-media-clickable");
    media.setAttribute("role", "button");
    media.setAttribute("tabindex", "0");
    media.setAttribute("aria-label", `View details for ${displayName}`);
    media.addEventListener("click", onOpenDetails);
  }
  card.append(media);
  const body = document.createElement("div"),
    heading = document.createElement("div"),
    title = document.createElement("strong"),
    category = document.createElement("span"),
    favorite = document.createElement("button");
  body.className = "poi-preview-body";
  heading.className = "poi-preview-heading";
  title.textContent = displayName;
  if (onOpenDetails) {
    title.classList.add("poi-preview-title-link");
    title.addEventListener("click", onOpenDetails);
  }
  category.textContent = (place.category || "Place").replaceAll("_", " ");
  favorite.className = "poi-preview-favorite";
  favorite.type = "button";
  favorite.setAttribute("aria-label", `Save ${displayName}`);
  favorite.setAttribute("aria-pressed", "false");
  favorite.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>';
  favorite.addEventListener("click", () => {
    const pressed = favorite.getAttribute("aria-pressed") !== "true";
    favorite.setAttribute("aria-pressed", String(pressed));
    favorite.setAttribute(
      "aria-label",
      `${pressed ? "Remove" : "Save"} ${displayName}${pressed ? " from saved places" : ""}`,
    );
  });
  heading.append(title, favorite);
  body.append(heading, category);
  if (place.address) {
    const address = document.createElement("p");
    address.textContent = place.address;
    body.append(address);
  }
  if (typeof metadata.opening_hours === "string") {
    const hours = document.createElement("p");
    hours.className = "poi-preview-hours";
    hours.textContent = `Open hours · ${metadata.opening_hours}`;
    body.append(hours);
  }
  const footer = document.createElement("div"),
    source = document.createElement("small"),
    button = document.createElement("button");
  footer.className = "poi-preview-footer";
  source.textContent = "PsarAI place";
  button.type = "button";
  button.textContent = "＋ Add stop";
  button.addEventListener("click", onAdd);
  footer.append(source, button);
  body.append(footer);
  card.append(body);
  return card;
}
