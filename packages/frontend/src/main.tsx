import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import RecipePage from "./pages/RecipePage";
import SearchPage from "./pages/SearchPage";
import TagPage from "./pages/TagPage";
import CuisinePage from "./pages/CuisinePage";
import DomainPage from "./pages/DomainPage";
import RemovePage from "./pages/RemovePage";
import NotFoundPage from "./pages/NotFoundPage";
import LoginCallbackPage from "./pages/LoginCallbackPage";
import ProfilePage from "./pages/ProfilePage";
import UserProfilePage from "./pages/UserProfilePage";
import SettingsPage from "./pages/SettingsPage";
import SavedPage from "./pages/SavedPage";
import CollectionPage from "./pages/CollectionPage";
import ShoppingListsPage from "./pages/ShoppingListsPage";
import ShoppingListPage from "./pages/ShoppingListPage";
import SharedListPage from "./pages/SharedListPage";
import ManifestoPage from "./pages/ManifestoPage";
import IngredientsPage from "./pages/IngredientsPage";
import TransparencyPage from "./pages/TransparencyPage";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/recipe/:id" element={<RecipePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/ingredients" element={<IngredientsPage />} />
            <Route path="/tag/:tag" element={<TagPage />} />
            <Route path="/cuisine/:cuisine" element={<CuisinePage />} />
            <Route path="/site/:domain" element={<DomainPage />} />
            <Route path="/remove" element={<RemovePage />} />
            <Route path="/auth/callback" element={<LoginCallbackPage />} />
            <Route path="/user/:id" element={<UserProfilePage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/saved" element={<SavedPage />} />
            <Route path="/collection/:id" element={<CollectionPage />} />
            <Route path="/shopping-lists" element={<ShoppingListsPage />} />
            <Route path="/shopping-lists/:id" element={<ShoppingListPage />} />
            <Route path="/shared/lists/:token" element={<SharedListPage />} />
            <Route path="/about" element={<ManifestoPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/transparency" element={<TransparencyPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
