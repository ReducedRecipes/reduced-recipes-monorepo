import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import TopBar from "./TopBar";
import ScrollToTop from "./ScrollToTop";
import { DietaryOnboarding } from "./DietaryOnboarding";
import { AppSmartBanner } from "./AppSmartBanner";
import { useHealth } from "../hooks/useHealth";
import { useTheme } from "../hooks/useTheme";

export default function Layout() {
  const [showDietaryOnboarding, setShowDietaryOnboarding] = useState(false);
  const { health } = useHealth();
  useTheme();

  const recipeCount = health?.total_recipes ?? 0;

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
      <AppSmartBanner />
      <TopBar recipeCount={recipeCount} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
