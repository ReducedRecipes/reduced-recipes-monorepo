import { useState, useEffect } from "react";
import { Link, Outlet } from "react-router-dom";
import SearchBar from "./SearchBar";
import { LoginButton } from "./LoginButton";
import NotificationBell from "./NotificationBell";
import { DietaryOnboarding } from "./DietaryOnboarding";
import { useAuth } from "../hooks/useAuth";

export default function Layout() {
  const { isAuthenticated } = useAuth();
  const [showDietaryOnboarding, setShowDietaryOnboarding] = useState(false);

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
    <div className="min-h-screen bg-gray-50">
      <DietaryOnboarding
        isOpen={showDietaryOnboarding}
        onClose={handleDietaryOnboardingClose}
      />
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-xl font-bold text-orange-600">
            ReducedRecipes
          </Link>
          <div className="mx-4 hidden flex-1 sm:block">
            <SearchBar />
          </div>
          <div className="flex items-center gap-3">
            <nav className="flex gap-4 text-sm text-gray-600">
              <Link to="/" className="hover:text-orange-600">
                Home
              </Link>
              <Link to="/remove" className="hover:text-orange-600">
                Opt-out
              </Link>
              {isAuthenticated && (
                <Link to="/saved" className="hover:text-orange-600">
                  Saved
                </Link>
              )}
            </nav>
            <NotificationBell />
            <LoginButton />
          </div>
        </div>
        <div className="px-4 pb-3 sm:hidden">
          <SearchBar />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
