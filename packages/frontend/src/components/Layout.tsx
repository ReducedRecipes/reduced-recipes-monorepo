import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import TopBar from "./TopBar";
import ScrollToTop from "./ScrollToTop";
import { DietaryOnboarding } from "./DietaryOnboarding";
import { useRecipes } from "../hooks/useRecipes";
import { useTheme } from "../hooks/useTheme";

export default function Layout() {
  const [showDietaryOnboarding, setShowDietaryOnboarding] = useState(false);
  const { data } = useRecipes({ limit: 1 });
  useTheme();

  const recipeCount = data?.pages?.[0]?.items?.length
    ? data.pages.reduce((sum, page) => sum + page.items.length, 0)
    : 0;

  useEffect(() => {
    if (localStorage.getItem("show_dietary_onboarding") === "true") {
      setShowDietaryOnboarding(true);
    }
  }, []);

  const handleDietaryOnboardingClose = () => {
    localStorage.removeItem("show_dietary_onboarding");
    setShowDietaryOnboarding(false);
  };

  return (
    <div className="min-h-screen bg-bg">
      <ScrollToTop />
      <DietaryOnboarding
        isOpen={showDietaryOnboarding}
        onClose={handleDietaryOnboardingClose}
      />
      <TopBar recipeCount={recipeCount} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
