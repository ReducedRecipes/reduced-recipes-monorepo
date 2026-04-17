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
import SettingsPage from "./pages/SettingsPage";
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
            <Route path="/tag/:tag" element={<TagPage />} />
            <Route path="/cuisine/:cuisine" element={<CuisinePage />} />
            <Route path="/site/:domain" element={<DomainPage />} />
            <Route path="/remove" element={<RemovePage />} />
            <Route path="/auth/callback" element={<LoginCallbackPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
