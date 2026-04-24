declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackOutboundClick(url: string, domain: string, recipeId: string, location: string) {
  if (typeof window.gtag === "function") {
    window.gtag("event", "outbound_click", {
      event_category: "source_clickthrough",
      event_label: domain,
      recipe_id: recipeId,
      source_url: url,
      click_location: location,
      transport_type: "beacon",
    });
  }
}
